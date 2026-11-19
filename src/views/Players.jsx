import { useEffect, useState } from 'react';
import { Icon, Avatar, Sparkline, Sheet, fmtIdx, shortName } from '../components/ui.jsx';
import { indexTrend } from '../lib/helpers.js';
import { settingsOf, courseHandicap, sortedWeeks, courseById } from '../lib/golf.js';
import { PALETTE, uid } from '../lib/seed.js';

const METHOD = {
  whs: 'Calculated (WHS method)',
  starting: 'Starting index',
  manual: 'Set by the commissioner',
};

export default function Players({ ctx }) {
  const { league, derived, route, go, isCommissioner, mutate, myPlayerId } = ctx;
  const sel = route[1];
  const s = settingsOf(league);
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">{league.players.length} regulars · handicaps kick in after {s.minRounds} rounds</div><h1 className="page-title">Players</h1></div>
        {isCommissioner && <button className="btn sm" onClick={() => { const id = uid('p_'); mutate((l) => l.players.push({ id, name: 'New player', color: PALETTE[l.players.length % PALETTE.length], startIndex: 0, manualIndex: null })); go(`players/${id}`); }}><Icon name="plus" size={16} /> Add</button>}
      </div>
      <div className="grid-3">
        {league.players.map((p, i) => {
          const c = derived.hcp.current[p.id];
          const log = derived.hcp.log[p.id];
          return (
            <button key={p.id} className="card link rise" style={{ textAlign: 'left', animationDelay: `${i * 0.03}s` }} onClick={() => go(`players/${p.id}`)}>
              <div className="row">
                <Avatar name={p.name} color={p.color} size="lg" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}><b className="ellipsis">{p.name}</b>{p.id === myPlayerId && <span className="badge you">You</span>}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{METHOD[c.method]}</div>
                </div>
              </div>
              <div className="row spread" style={{ marginTop: 14, alignItems: 'flex-end' }}>
                <div>
                  <div className="display num" style={{ fontSize: 40, lineHeight: .9 }}>{fmtIdx(c.index)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>League index · {log.length} rounds</div>
                </div>
                <Sparkline values={indexTrend(league, derived.hcp, p.id)} width={110} height={40} color={p.color} />
              </div>
            </button>
          );
        })}
      </div>
      <PlayerSheet ctx={ctx} pid={sel} onClose={() => go('players')} />
    </>
  );
}

function PlayerSheet({ ctx, pid, onClose }) {
  const { league, derived, isCommissioner, mutate, toast } = ctx;
  const p = league.players.find((x) => x.id === pid);
  const [f, setF] = useState(null);
  useEffect(() => { if (p) setF({ name: p.name, startIndex: p.startIndex ?? 0, manualIndex: p.manualIndex ?? '', color: p.color }); }, [pid]); // eslint-disable-line
  if (!p || !f) return null;
  const s = settingsOf(league);
  const c = derived.hcp.current[p.id];
  const log = derived.hcp.log[p.id];
  const nextCourse = (() => { const ws = sortedWeeks(league); const w = ws[ws.length - 1]; return w ? courseById(league, w.courseId) : league.courses[0]; })();
  const ch = nextCourse ? courseHandicap(c.index, nextCourse, s) : null;
  const usedDiffs = log.filter((r) => r.used).map((r) => r.diff);
  const save = () => {
    mutate((l) => {
      const x = l.players.find((y) => y.id === p.id);
      x.name = f.name.trim() || x.name; x.color = f.color;
      x.startIndex = Number(f.startIndex) || 0;
      x.manualIndex = f.manualIndex === '' || f.manualIndex == null ? null : Number(f.manualIndex);
    });
    toast('Player saved'); onClose();
  };
  const remove = () => {
    if (!confirm(`Remove ${p.name}? Their past cards stay in old weeks but won't show.`)) return;
    mutate((l) => { l.players = l.players.filter((x) => x.id !== p.id); }); onClose();
  };

  return (
    <Sheet open onClose={onClose} wide title={<span className="row"><Avatar name={p.name} color={p.color} />{p.name}</span>}
      footer={isCommissioner ? <><button className="btn danger" onClick={remove}><Icon name="trash" size={16} /></button><span className="grow" /><button className="btn ghost" onClick={onClose}>Close</button><button className="btn primary" onClick={save}>Save</button></> : null}>
      <div className="grid-2">
        <div className="card flat" style={{ background: 'var(--surface-2)' }}>
          <div className="eyebrow">League index</div>
          <div className="row spread" style={{ alignItems: 'flex-end' }}>
            <div className="display num" style={{ fontSize: 56, lineHeight: 1 }}>{fmtIdx(c.index)}</div>
            <Sparkline values={indexTrend(league, derived.hcp, p.id)} width={140} height={54} color={p.color} />
          </div>
          <div className="t2" style={{ fontSize: 13.5, marginTop: 8 }}>
            {c.method === 'whs' && <>Average of the best <b>{c.detail.best}</b> of the last <b>{c.detail.window}</b> differentials ({usedDiffs.join(', ')}) = {c.detail.avg}{c.detail.adj ? <>, adjusted {c.detail.adj} for a short record</> : null}{c.index === s.maxIndex ? `, capped at ${s.maxIndex}` : ''}.</>}
            {c.method === 'starting' && <>Using the starting index of {fmtIdx(c.index)} until {Math.max(3, s.minRounds)} rounds are in ({c.rounds} so far). After that it updates every week.</>}
            {c.method === 'manual' && <>Locked at {fmtIdx(c.index)} by the commissioner. Clear the override to go back to the calculated index.</>}
          </div>
          {nextCourse && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>On {nextCourse.name}: course handicap <b className="t2">{ch}</b> = {c.index} × {nextCourse.slope}/113 + ({nextCourse.rating} − {nextCourse.par})</div>}
        </div>
        <div className="card flat" style={{ background: 'var(--surface-2)' }}>
          <div className="eyebrow">How it's calculated</div>
          <ol className="t2" style={{ fontSize: 13.5, paddingLeft: 18, margin: '8px 0 0', display: 'grid', gap: 6 }}>
            <li>Each hole is capped at <b>net double bogey</b> (par + 2 + strokes received), or par + 5 before an index exists. That gives the Adjusted Gross Score (AGS).</li>
            <li>9-hole differential = 113 ÷ Slope × (AGS − Course Rating).</li>
            <li>Index = best N of the last 20 differentials (WHS table). Updates weekly, max {s.maxIndex}.</li>
          </ol>
        </div>
      </div>

      <div className="h2">Differentials</div>
      {log.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Wk</th><th>Course</th><th className="r">Gross</th><th className="r">AGS</th><th className="r">CR / Slope</th><th className="r">Diff</th><th className="c">Counts</th></tr></thead>
            <tbody>
              {[...log].reverse().map((r) => (
                <tr key={r.weekId} className={r.used ? 'used' : !r.inWindow ? 'dim' : ''}>
                  <td>{r.weekNumber}</td><td className="ellipsis" style={{ maxWidth: 180 }}>{r.courseName}</td>
                  <td className="r">{r.gross}</td>
                  <td className="r">{r.ags}{r.capped > 0 && <span style={{ color: 'var(--red)', fontSize: 11 }}> −{r.capped}</span>}</td>
                  <td className="r muted">{r.rating} / {r.slope}</td><td className="r"><b>{r.diff.toFixed(1)}</b></td>
                  <td className="c">{r.used ? <Icon name="check" size={16} style={{ color: 'var(--lime)' }} /> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No rounds yet.</p>}

      {isCommissioner && (
        <>
          <div className="h2">Edit player</div>
          <div className="grid-2">
            <label className="field"><span>Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <div className="field"><span>Color</span><div className="row wrap" style={{ gap: 6 }}>{PALETTE.map((col) => <button key={col} aria-label={col} onClick={() => setF({ ...f, color: col })} style={{ width: 30, height: 30, borderRadius: 10, background: col, border: f.color === col ? '3px solid var(--text)' : '1px solid var(--line)' }} />)}</div></div>
            <label className="field"><span>Starting index</span><input className="input" inputMode="decimal" value={f.startIndex} onChange={(e) => setF({ ...f, startIndex: e.target.value })} /><small>Used until {Math.max(3, s.minRounds)} rounds are in. Default 0.</small></label>
            <label className="field"><span>Manual override</span><input className="input" inputMode="decimal" value={f.manualIndex} placeholder="Leave blank to calculate" onChange={(e) => setF({ ...f, manualIndex: e.target.value })} /><small>Locks the index at this value. Use for sandbaggers or known players.</small></label>
          </div>
        </>
      )}
    </Sheet>
  );
}
