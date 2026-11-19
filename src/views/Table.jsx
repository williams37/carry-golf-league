import { useEffect, useRef, useState } from 'react';
import { Icon, Avatar, Sparkline, Seg, useFlip, shortName, Empty } from '../components/ui.jsx';
import { standingsWithMovement, finalWeekNumbers, weekState } from '../lib/helpers.js';
import { teamResults, partnerCounts, settingsOf } from '../lib/golf.js';

const ABSENCE = { fieldMaxPlus1: 'missed weeks count as the week’s worst regular net + 1', average: 'missed weeks count as your average net', skip: 'missed weeks are skipped (most rounds ranks first)' };

export default function Table({ ctx }) {
  const [tab, setTab] = useState('ind');
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">{ctx.league.season}</div><h1 className="page-title">Standings</h1></div>
        <Seg value={tab} onChange={setTab} options={[{ value: 'ind', label: 'Individual' }, { value: 'team', label: 'Teams' }]} />
      </div>
      {tab === 'ind' ? <Individual ctx={ctx} /> : <Teams ctx={ctx} />}
    </>
  );
}

function Individual({ ctx }) {
  const { league, derived, go } = ctx;
  const finals = finalWeekNumbers(league, derived.hcp);
  const [through, setThrough] = useState(finals[finals.length - 1] || 0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(null);
  const ref = useRef();
  const rows = through ? standingsWithMovement(league, through, derived.hcp) : [];
  useFlip(ref, [through]);
  useEffect(() => {
    if (!playing) return;
    const i = finals.indexOf(through);
    if (i >= finals.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setThrough(finals[i + 1]), through === finals[0] ? 700 : 1300);
    return () => clearTimeout(t);
  }, [playing, through]); // eslint-disable-line
  if (!finals.length) return <Empty icon="trophy" title="No final weeks yet">The table appears once a week is final, either when every card is in or when the commissioner closes it.</Empty>;
  const s = settingsOf(league);
  const leaderTotal = rows[0]?.total;

  return (
    <>
      <div className="card flat" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button className="icon-btn" aria-label={playing ? 'Pause' : 'Replay the season'} onClick={() => { if (!playing) setThrough(finals[0]); setPlaying(!playing); }} style={{ color: 'var(--accent)' }}>
          <Icon name={playing ? 'x' : 'play'} size={18} />
        </button>
        <div className="grow" style={{ minWidth: 180 }}>
          <div className="row spread"><span style={{ fontWeight: 650 }}>Through week {through}</span><span className="muted" style={{ fontSize: 12 }}>{playing ? 'Replaying season…' : 'Drag to time-travel'}</span></div>
          <input type="range" min={0} max={finals.length - 1} step={1} value={finals.indexOf(through)} onChange={(e) => { setPlaying(false); setThrough(finals[+e.target.value]); }} aria-label="Through week" />
        </div>
      </div>

      <section className="card pad-0" style={{ marginTop: 12 }}>
        <div className="lb" ref={ref}>
          {rows.map((r) => (
            <div key={r.id} data-flip={r.id}>
              <button className={`lb-row ${r.place === 1 ? 'leader' : ''}`} style={{ width: '100%', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left' }} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <div className="pos num">{r.place}</div>
                <div className={`mv ${r.move > 0 ? 'up' : r.move < 0 ? 'down' : 'same'}`}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : '–'}</div>
                <Avatar name={r.name} color={r.color} />
                <div style={{ minWidth: 0 }}>
                  <div className="lb-name ellipsis"><span className="hide-sm">{r.name}</span><span className="show-sm">{shortName(r.name)}</span></div>
                  <div className="lb-sub">{r.played} rds{r.absences ? ` · ${r.absences} missed` : ''} · {r.place === 1 ? 'leader' : `+${r.total - leaderTotal} back`}</div>
                </div>
                <div className="row" style={{ gap: 22 }}>
                  <div className="hide-sm lb-stat"><b className="num">{r.avg ?? '–'}</b><span>avg</span></div>
                  <div className="hide-sm lb-stat"><b className="num">{r.best ?? '–'}</b><span>best</span></div>
                  <Sparkline values={r.rounds.map((x) => x.net)} color={r.color} />
                </div>
                <div className="tot num">{r.total}</div>
              </button>
              {open === r.id && (
                <div style={{ padding: '10px 14px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }} className="rise">
                  <div className="row wrap" style={{ gap: 6 }}>
                    {r.rounds.map((x) => (
                      <div key={x.week} style={{ padding: '6px 10px', borderRadius: 10, background: 'var(--surface)', border: `1px solid ${x.absent ? 'color-mix(in oklab, var(--red) 40%, transparent)' : 'var(--line)'}`, textAlign: 'center', minWidth: 52 }}>
                        <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>W{x.week}</div>
                        <div className="display num" style={{ fontSize: 18 }}>{x.net ?? '–'}</div>
                        {x.absent && <div style={{ fontSize: 9.5, color: 'var(--red)', fontWeight: 700 }}>ABSENT</div>}
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    <span className="muted" style={{ fontSize: 12.5 }}>Best {r.best ?? '–'} · Avg {r.avg ?? '–'}</span><span className="grow" />
                    <button className="btn xs" onClick={() => go(`players/${r.id}`)}>Handicap details</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Lowest cumulative net wins. Regulars only; subs never appear here. Live weeks don't count until final. Absences: {ABSENCE[s.absencePolicy]}.</p>
    </>
  );
}

function Teams({ ctx }) {
  const { league, derived, go } = ctx;
  const weeks = [...derived.weeks].reverse();
  const pc = partnerCounts(derived.weeks.map((w) => w.teams || []));
  const players = league.players;
  const wins = {};
  const results = weeks.map((w) => {
    const st = weekState(league, w, derived.hcp);
    const t = teamResults(league, w, st.ents);
    if (st.final) t.filter((x) => x.winner).forEach((x) => x.members.forEach((m) => { if (!m.isSub) wins[m.regularId] = (wins[m.regularId] || 0) + 1; }));
    return { w, st, t };
  });
  if (!weeks.length) return <Empty icon="users" title="No weeks yet">Team results show up here week by week.</Empty>;
  return (
    <>
      <div className="grid-2">
        {results.map(({ w, st, t }, i) => (
          <section key={w.id} className="card pad-0 rise" style={{ animationDelay: `${i * 0.04}s` }}>
            <button className="row" style={{ width: '100%', border: 0, background: 'var(--surface-2)', padding: '10px 14px', borderBottom: '1px solid var(--line)' }} onClick={() => go(`scores/${w.id}`)}>
              <b className="display" style={{ fontSize: 16 }}>Week {w.number}</b>
              <span className="muted ellipsis grow" style={{ fontSize: 12.5, textAlign: 'left' }}>{st.course?.name}</span>
              {st.final ? <span className="badge final">Final</span> : <span className="badge live">Live</span>}
            </button>
            {t.map((x) => (
              <div key={x.team} className="row" style={{ padding: '9px 14px', borderBottom: '1px solid var(--line)', background: x.winner ? 'color-mix(in oklab, var(--gold) 9%, transparent)' : undefined }}>
                <span className="display num" style={{ width: 20, color: x.winner ? 'var(--gold)' : 'var(--muted)' }}>{x.place ?? '·'}</span>
                <span className="grow ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>
                  {x.members.map((m, j) => <span key={m.key}>{j ? ' & ' : ''}{shortName(m.name)}{m.isSub && <span className="badge sub" style={{ marginLeft: 4, height: 16, fontSize: 9 }}>Sub</span>}</span>)}
                </span>
                {x.winner && <Icon name="trophy" size={16} style={{ color: 'var(--gold)' }} />}
                <span className="display num" style={{ fontSize: 20, minWidth: 34, textAlign: 'right' }}>{x.net ?? '–'}</span>
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="h2">Partner matrix</div>
      <div className="card">
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>How often each pair has been teamed. Auto-rotate keeps this even. Team-win tally on the right.</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ fontSize: 12, minWidth: 420 }}>
            <thead><tr><th></th>{players.map((p) => <th key={p.id} className="c" title={p.name}><Avatar name={p.name} color={p.color} size="sm" /></th>)}<th className="r">Wins</th></tr></thead>
            <tbody>
              {players.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{shortName(a.name)}</td>
                  {players.map((b) => {
                    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
                    const n = a.id === b.id ? null : pc[k] || 0;
                    return <td key={b.id} className="c"><span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8, fontWeight: 700, background: n == null ? 'transparent' : n === 0 ? 'var(--surface-2)' : `color-mix(in oklab, var(--aqua) ${Math.min(80, n * 30)}%, var(--surface-2))`, color: n ? 'var(--text)' : 'var(--muted)' }}>{n == null ? '' : n}</span></td>;
                  })}
                  <td className="r"><b className="display" style={{ fontSize: 16 }}>{wins[a.id] || 0}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
