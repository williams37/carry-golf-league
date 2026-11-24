import { useEffect, useRef, useState } from 'react';
import { localStore } from './lib/store/local.js';
import { useLeague, readPrefs, writePrefs } from './lib/useLeague.js';
import { Brand, Icon, BrandMark } from './components/ui.jsx';
import Home from './views/Home.jsx';
import Week from './views/Week.jsx';
import Table from './views/Table.jsx';
import Skins from './views/Skins.jsx';
import Players from './views/Players.jsx';
import Courses from './views/Courses.jsx';
import Rules from './views/Rules.jsx';
import League from './views/League.jsx';
import More from './views/More.jsx';
import TV from './views/TV.jsx';
import Welcome from './views/Welcome.jsx';
import AuthScreen, { NewPassword } from './views/Auth.jsx';
import Join from './views/Join.jsx';
import Admin from './views/Admin.jsx';

const NAV = [
  { id: 'home', label: 'Clubhouse', icon: 'home' },
  { id: 'scores', label: 'Scores', icon: 'card' },
  { id: 'table', label: 'Standings', icon: 'trophy' },
  { id: 'skins', label: 'Skins', icon: 'coin' },
  { id: 'players', label: 'Players', icon: 'users' },
  { id: 'courses', label: 'Courses', icon: 'map' },
  { id: 'rules', label: 'Rules', icon: 'book' },
  { id: 'league', label: 'League', icon: 'gear' },
];
const TABS = ['home', 'scores', 'table', 'skins', 'more'];

function useHashRoute() {
  const parse = () => (window.location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const h = () => { setRoute(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return route;
}
export const go = (path) => { window.location.hash = '/' + path; };

export default function App() {
  const lg = useLeague();
  const route = useHashRoute();
  const [theme, setTheme] = useState(readPrefs().theme || 'dark');
  const [toastMsg, setToast] = useState(null);
  const [welcome, setWelcome] = useState(!readPrefs().onboarded);
  const welcomeOpened = useRef(false); // true when the user asked for the intro (New league)
  useEffect(() => { document.documentElement.dataset.theme = theme; writePrefs({ theme }); document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#07110d' : '#f3efe6'); }, [theme]);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toastMsg]);

  const page = route[0];
  // resume an invite after a magic-link round-trip (the redirect drops the #/join/CODE hash)
  useEffect(() => {
    const pj = localStorage.getItem('carry:pendingJoin');
    if (pj && lg.mode === 'cloud' && lg.authState.status === 'signedIn' && page !== 'join') go(`join/${pj}`);
  }, [lg.authState.status]); // eslint-disable-line
  // a cloud account that already belongs to a league (e.g. joined from an invite) skips the intro
  useEffect(() => {
    if (lg.mode === 'cloud' && lg.leagues.length > 0 && !welcomeOpened.current) { writePrefs({ onboarded: true }); setWelcome(false); }
  }, [lg.mode, lg.leagues.length]);
  const toast = (m) => setToast(m);
  const ctx = { ...lg, route, go, toast, theme, setTheme, openWelcome: () => { welcomeOpened.current = true; setWelcome(true); } };

  if (lg.mode === 'cloud' && lg.authState.recovery && lg.authState.status === 'signedIn') return <NewPassword ctx={ctx} />;
  if (page === 'join') return <Join ctx={ctx} code={route[1]} />;
  if (lg.mode === 'cloud' && lg.authState.status !== 'signedIn') return <AuthScreen ctx={ctx} />;
  if (page === 'tv' && lg.league) return <TV ctx={ctx} />;
  if (page === 'admin' && lg.isAdmin && !lg.league) return <div className="app"><div className="main" style={{ gridColumn: '1 / -1' }}><Admin ctx={ctx} /></div></div>;

  if (welcome && (lg.mode === 'local' || !lg.loading)) {
    return <Welcome ctx={ctx} onDone={() => { writePrefs({ onboarded: true }); welcomeOpened.current = false; setWelcome(false); }} />;
  }

  if (!lg.league) {
    return (
      <div className="welcome"><div className="welcome-inner" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <BrandMark size={56} />
        {lg.loading ? <p className="muted">Loading your league…</p> : (
          <>
            <h3 className="display" style={{ fontSize: 28, margin: 0 }}>No league yet</h3>
            <p className="t2">{lg.error || 'Create a league or join one with an invite code.'}</p>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => setWelcome(true)}>Create a league</button>
              <button className="btn" onClick={() => go('join')}>Join with a code</button>
              <UploadLocal ctx={ctx} />
            </div>
          </>
        )}
      </div></div>
    );
  }

  const View = { home: Home, scores: Week, table: Table, skins: Skins, players: Players, courses: Courses, rules: Rules, league: League, more: More, ...(lg.isAdmin ? { admin: Admin } : {}) }[page] || Home;
  const nav = lg.isAdmin ? [...NAV, { id: 'admin', label: 'Admin', icon: 'shield' }] : NAV;
  const activeTab = TABS.includes(page) ? page : 'more';

  return (
    <div className="app">
      <aside className="sidebar">
        <Brand league={lg.league} />
        {nav.map((n) => (
          <button key={n.id} className={`side-link ${page === n.id || (page === '' && n.id === 'home') ? 'on' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} /> {n.label}
          </button>
        ))}
        <div className="side-foot">
          <button className="btn block" onClick={() => go('tv')}><Icon name="tv" size={18} /> TV board</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Brand league={lg.league} />
          <span className="grow" />
          {lg.syncing && <span className="muted" style={{ fontSize: 12 }}>Saving…</span>}
          {lg.mode === 'cloud' ? <span className="badge live" title="Synced with the cloud"><Icon name="cloud" size={12} />&nbsp;Live</span>
            : lg.league.isDemo ? <button className="badge pending" style={{ border: 0, cursor: 'pointer' }} onClick={() => setWelcome(true)}>Demo</button> : null}
          <button className="icon-btn" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></button>
          <button className="icon-btn hide-sm" aria-label="TV board" onClick={() => go('tv')}><Icon name="tv" size={18} /></button>
        </header>
        <View ctx={ctx} key={page} />
      </div>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => {
          const n = t === 'more' ? { id: 'more', label: 'More', icon: 'more' } : NAV.find((x) => x.id === t);
          return (
            <button key={t} className={`tab ${activeTab === t ? 'on' : ''}`} onClick={() => go(t)} aria-current={activeTab === t}>
              <Icon name={n.icon} size={22} /> {n.label}
            </button>
          );
        })}
      </nav>
      {toastMsg && <div className="toast" role="status"><Icon name="check" size={16} /> {toastMsg}</div>}
    </div>
  );
}

/** After connecting cloud sync: push the league that was on this device so players can join it. */
function UploadLocal({ ctx }) {
  const [list, setList] = useState([]);
  useEffect(() => { if (ctx.mode === 'cloud') localStore.listLeagues().then((l) => setList(l.filter((x) => !x.isDemo))); }, [ctx.mode]);
  if (!list.length) return null;
  return list.map((l) => (
    <button key={l.id} className="btn" onClick={async () => {
      const { league } = await localStore.getLeague(l.id);
      const id = await ctx.store.createLeague(league);
      await ctx.refreshList(); ctx.setActiveId(id); ctx.toast(`${league.name} uploaded`);
    }}><Icon name="upload" size={16} /> Upload “{l.name}”</button>
  ));
}
