import { useEffect, useState } from 'react';
import { Icon, Avatar, BrandMark, shortName, money, Strip, Sparkline } from '../components/ui.jsx';
import { currentWeek, weekState, standingsWithMovement, finalWeekNumbers } from '../lib/helpers.js';
import { teamResults, weekSkins, weekHighlights, seasonSkins } from '../lib/golf.js';
import { CarryTrack } from './Skins.jsx';

/** Big-screen board for the sim room. Rotates panels; Esc or tap ✕ to exit. */
export default function TV({ ctx }) {
  const { league, derived, go } = ctx;
  const [now, setNow] = useState(new Date());
  const [panel, setPanel] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setPanel((p) => (p + 1) % 2), 14000); return () => clearInterval(t); }, []);
  useEffect(() => { const k = (e) => e.key === 'Escape' && go('home'); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [go]);
  const hcp = derived.hcp;
  const wk = currentWeek(league, hcp);
  const st = wk ? weekState(league, wk, hcp) : null;
  const finals = finalWeekNumbers(league, hcp);
  const table = finals.length ? standingsWithMovement(league, finals[finals.length - 1], hcp) : [];
  const teams = wk ? teamResults(league, wk, st.ents) : [];
  const sk = wk ? weekSkins(league, wk, st.ents) : null;
  const hl = wk ? weekHighlights(league, wk, st.ents) : null;
  const season = seasonSkins(league, hcp).slice(0, 5);
  const live = st ? st.ents.filter((e) => !e.out).sort((a, b) => (b.entered - a.entered) || ((a.net ?? 99) - (b.net ?? 99))) : [];

  // React elements (not HTML strings) so player-entered names can never inject markup
  const ticker = [
    hl && <>Low net tonight <b>{hl.lowNetScore}</b> {hl.lowNet.map((e) => shortName(e.name)).join(' & ')}</>,
    hl && <>Low gross <b>{hl.lowGrossScore}</b> {hl.lowGross.map((e) => shortName(e.name)).join(' & ')}</>,
    hl && <><b>{hl.birdies}</b> birdies · <b>{hl.eagles}</b> eagles so far</>,
    sk && sk.pot ? <>Skins pot <b>{money(sk.pot)}</b></> : null,
    table[0] && <>Season leader <b>{shortName(table[0].name)}</b> at {table[0].total}</>,
    ...season.slice(0, 3).map((t, i) => <>Skins #{i + 1} <b>{shortName(t.name)}</b> {money(t.money)}</>),
  ].filter(Boolean);

  return (
    <div className="tv" data-theme="dark">
      <div className="tv-top">
        <BrandMark size={52} />
        <div>
          <div className="tv-title">{league.name}</div>
          <div style={{ color: '#6f877b', fontWeight: 600 }}>{wk ? `Week ${wk.number} · ${st.course?.name}${st.course?.tees ? ` (${st.course.tees})` : ''} · Par ${st.course?.par} · Slope ${st.course?.slope}` : league.season}</div>
        </div>
        <div className="tv-clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        <button className="icon-btn" style={{ background: 'transparent', color: '#a9bdb2' }} onClick={() => go('home')} aria-label="Exit TV board"><Icon name="x" /></button>
      </div>
      <div className="tv-body">
        <div className="tv-panel">
          <h3><Icon name="trophy" size={16} /> Season standings · through week {finals[finals.length - 1] ?? '–'}</h3>
          {table.map((r, i) => (
            <div key={r.id} className="tv-row tv-fade" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="pos" style={{ color: r.place === 1 ? '#f6c453' : undefined }}>{r.place}</div>
              <Avatar name={r.name} color={r.color} />
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 650 }} className="ellipsis">{r.name}</div><div style={{ fontSize: '.65em', color: '#6f877b' }}>{r.played} rounds · avg {r.avg ?? '–'}</div></div>
              <div className="row" style={{ gap: '.6em' }}>
                <span className={`mv ${r.move > 0 ? 'up' : r.move < 0 ? 'down' : 'same'}`} style={{ fontSize: '.6em', width: '2.2em' }}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : ''}</span>
                <Sparkline values={r.rounds.map((x) => x.net)} width={120} height={34} color={r.color} className="" />
              </div>
              <div className="tot">{r.total}</div>
            </div>
          ))}
        </div>
        <div className="tv-panel" key={panel}>
          {panel === 0 ? (
            <div className="tv-fade">
              <h3><span className="chip" style={{ height: 'auto', padding: '2px 8px', background: 'transparent', border: 0 }}><span className="dot" /></span> Tonight · teams</h3>
              {teams.map((t) => (
                <div key={t.team} className="tv-row" style={{ gridTemplateColumns: '2em 1fr auto', fontSize: '1.15em' }}>
                  <div className="pos" style={{ color: t.winner ? '#f6c453' : undefined }}>{t.place ?? '·'}</div>
                  <div className="ellipsis">{t.members.map((m) => shortName(m.name) + (m.isSub ? ' (sub)' : '')).join(' & ')}</div>
                  <div className="tot">{t.net ?? <span style={{ fontSize: '.6em', color: '#6f877b', fontFamily: 'var(--font)' }}>thru {t.members.reduce((a, m) => a + m.entered, 0)}/18</span>}</div>
                </div>
              ))}
              <h3 style={{ marginTop: '1.2em' }}>On the course</h3>
              <div style={{ display: 'grid', gap: '.5em' }}>
                {live.slice(0, 4).map((e) => (
                  <div key={e.key} style={{ display: 'grid', gridTemplateColumns: '9em 1fr', gap: '.8em', alignItems: 'center' }}>
                    <div className="ellipsis" style={{ fontWeight: 600 }}>{shortName(e.name)}</div>
                    <Strip holes={e.holes} course={st.course} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="tv-fade">
              <h3><Icon name="coin" size={16} /> Skins · {money(sk?.pot || 0)} pot {st && !st.final ? '· provisional' : ''}</h3>
              {sk?.holes.length ? <CarryTrack skins={sk} ents={st.ents} big /> : <p style={{ color: '#6f877b' }}>Waiting for cards…</p>}
              <h3 style={{ marginTop: '1.4em' }}>Season skins money</h3>
              {season.map((t, i) => (
                <div key={t.id} className="tv-row" style={{ gridTemplateColumns: '2em 1fr auto' }}>
                  <div className="pos">{i + 1}</div><div className="ellipsis">{t.name}{t.isSub ? ' (sub)' : ''}</div><div className="tot" style={{ color: '#f6c453' }}>{money(t.money)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="tv-ticker"><div>{ticker.map((t, i) => <span key={i}>{i > 0 && <span style={{ margin: '0 1.2em', opacity: .4 }}>◆</span>}{t}</span>)}</div></div>
    </div>
  );
}
