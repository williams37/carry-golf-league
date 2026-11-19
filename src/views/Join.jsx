import { useEffect, useState } from 'react';
import { Icon, BrandMark } from '../components/ui.jsx';
import { saveCloudConfig, cloudConfig } from '../config.js';
import AuthScreen from './Auth.jsx';
import { ClaimInline } from './League.jsx';
import { writePrefs } from '../lib/useLeague.js';

/** #/join/CODE[?u=url&k=anonKey] — works from a cold start on a brand-new phone. */
export default function Join({ ctx, code: codeIn }) {
  const raw = (codeIn || '').split('?')[0];
  const params = new URLSearchParams((window.location.hash.split('?')[1]) || '');
  const [code, setCode] = useState(raw || localStorage.getItem('carry:pendingJoin') || '');
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const u = params.get('u'), k = params.get('k');
    if (u && k && cloudConfig()?.url !== u) { saveCloudConfig({ url: u, key: k }); }
    if (raw) localStorage.setItem('carry:pendingJoin', raw.toUpperCase());
    if ((u && k) && ctx.mode !== 'cloud') { ctx.setMode('cloud'); location.reload(); }
  }, []); // eslint-disable-line

  if (!cloudConfig()) {
    return (
      <div className="welcome"><div className="welcome-inner">
        <BrandMark size={48} />
        <h1 style={{ fontSize: 44 }}>Invites need the cloud</h1>
        <p className="lede">This copy of Carry isn't connected to a league server yet. Ask your commissioner for the full invite link (it includes the server address), or set up cloud sync under League.</p>
        <button className="btn primary" onClick={() => ctx.go('league')}>Go to League settings</button>
      </div></div>
    );
  }
  if (ctx.mode !== 'cloud') { ctx.setMode('cloud'); location.reload(); return null; }
  if (ctx.authState.status !== 'signedIn') return <AuthScreen ctx={ctx} joining={code} />;

  const join = async () => {
    setErr(null);
    try {
      const id = await ctx.store.join(code, name);
      localStorage.removeItem('carry:pendingJoin');
      writePrefs({ onboarded: true });
      await ctx.refreshList();
      ctx.setActiveId(id);
      setJoined(true);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="welcome"><div className="welcome-inner">
      <BrandMark size={48} />
      {!joined ? (
        <>
          <h1 style={{ fontSize: 44 }}>Join a league</h1>
          <label className="field"><span>Invite code</span><input className="input code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" /></label>
          <label className="field"><span>Your name (shown to the commissioner)</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dee Okafor" /></label>
          {err && <div className="banner err"><Icon name="info" size={18} />{err}</div>}
          <button className="btn primary block" disabled={code.length < 6} onClick={join}>Join league</button>
          <button className="btn ghost" onClick={() => ctx.go('home')}>Cancel</button>
        </>
      ) : ctx.league ? (
        <>
          <h1 style={{ fontSize: 40 }}>You're in. Which player are you?</h1>
          <p className="lede">Claim your spot so you can enter your own cards and follow your handicap.</p>
          <ClaimInline ctx={{ ...ctx, reload: async () => { await ctx.reload(); ctx.go('home'); } }} claimed={new Set((ctx.league.members || []).map((m) => m.player_id).filter(Boolean))} />
          <button className="btn ghost" onClick={() => ctx.go('home')}>Skip for now</button>
        </>
      ) : <p className="muted">Loading league…</p>}
    </div></div>
  );
}
