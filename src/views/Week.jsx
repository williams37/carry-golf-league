import { useEffect, useState } from "react";
import { Icon, Avatar, Strip, Sheet, fmtIdx, fmtHcp, shortName, Empty, Switch } from '../components/ui.jsx';
import ScorePad from './ScorePad.jsx';
import { PhotoLightbox, PhotoThumb } from './CardPhoto.jsx';
import { weekState, fmtDate } from '../lib/helpers.js';
import { teamResults, weekSkins, generateTeams, repeatPartners, sortedWeeks, subKey, strokesOnHole, playerById } from '../lib/golf.js';

const TEAM_NAMES = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6'];

export default function Week({ ctx }) {
  const { league, derived, route, go, isCommissioner, canEditScore, setScore, deleteScore, removePhoto, photoUrl, mutate, toast, myPlayerId, mode } = ctx;
  const [viewPhoto, setViewPhoto] = useState(null);
  const weeks = derived.weeks;
  const week = weeks.find((w) => w.id === route[1]) || weeks.find((w) => !weekState(league, w, derived.hcp).final) || weeks[weeks.length - 1];
  const [pad, setPad] = useState(null);
  const [subFor, setSubFor] = useState(null);
  const [editWeek, setEditWeek] = useState(null);
  const [editTeams, setEditTeams] = useState(false);

  if (!week) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Scores</h1></div>
        {league.courses.length === 0
          ? <Empty icon="map" title="Add your first course" action={<button className="btn primary" onClick={() => go('courses')}>Add a course</button>}>Every week is played on a 9-hole course with its own rating and slope. Set one up first.</Empty>
          : <Empty icon="calendar" title="Schedule week 1" action={isCommissioner && <button className="btn primary" onClick={() => addWeek(ctx)}><Icon name="plus" size={18} /> Create week 1</button>}>Carry will draw the first teams at random. After that it rotates partners so nobody repeats until everyone has played together.</Empty>}
      </>
    );
  }

  const st = weekState(league, week, derived.hcp);
  const { ents, course } = st;
  const teams = teamResults(league, week, ents);
  const skins = weekSkins(league, week, ents);
  const skinHoles = {};
  skins.holes.forEach((h, i) => { if (h.winner) (skinHoles[h.winner] ||= []).push(i); });
  const history = weeks.filter((w) => w.number < week.number).map((w) => w.teams);
  const repeats = repeatPartners(week.teams || [], history);

  const openPad = (e) => setPad(e);
  const save = async (holes, photo) => {
    const who = pad; setPad(null);
    try {
      await setScore(week.id, who.key, holes, undefined, photo || undefined);
      toast(holes.every((x) => x > 0) ? `${shortName(who.name)}: ${holes.reduce((a, b) => a + b, 0)} saved${photo ? ' with photo' : ''}` : 'Card saved');
    } catch (e) { toast(e.message || 'Could not save the card'); }
  };
  const del = async () => {
    const who = pad; setPad(null);
    try { await deleteScore(week.id, who.key); toast(`${shortName(who.name)}'s card deleted`); } catch (e) { toast(e.message || 'Could not delete the card'); }
  };

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Week {week.number} · {fmtDate(week.date, { weekday: 'long', month: 'short', day: 'numeric' })}</div><h1 className="page-title">Scores</h1></div>
        {isCommissioner && <button className="btn sm" onClick={() => addWeek(ctx)}><Icon name="plus" size={16} /> New week</button>}
      </div>

      <div className="chips" role="tablist" aria-label="Weeks">
        {weeks.map((w) => {
          const s = weekState(league, w, derived.hcp);
          return (
            <button key={w.id} className={`chip ${w.id === week.id ? 'on' : ''}`} onClick={() => go(`scores/${w.id}`)}>
              {!s.final && <span className="dot" />}W{w.number} <span style={{ opacity: .6, fontWeight: 500 }}>{fmtDate(w.date)}</span>
            </button>
          );
        })}
      </div>

      <section className="card rise" style={{ marginTop: 8 }}>
        <div className="row spread wrap" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>{st.final ? <span className="badge final">Final</span> : <span className="badge live">● Live</span>}<span className="muted" style={{ fontSize: 12.5 }}>{st.done}/{ents.length} cards in</span></div>
            <div className="display" style={{ fontSize: 24, fontWeight: 600, marginTop: 6 }}>{course?.name}</div>
            <div className="meta" style={{ marginTop: 4 }}>
              <span>Par {course?.par}</span><span>·</span><span>CR {course?.rating}</span><span>·</span><span>Slope {course?.slope}</span>{course?.gspro != null && <><span>·</span><span>GSPro {course.gspro}</span></>}
            </div>
          </div>
          {isCommissioner && (
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => setEditTeams(true)}><Icon name="swap" size={16} /> Teams</button>
              <button className="btn sm" onClick={() => setEditWeek(week)}><Icon name="edit" size={16} /> Week</button>
            </div>
          )}
        </div>
        <div className="strip" style={{ marginTop: 14 }}>
          {course?.holes.map((h, i) => (
            <div key={i} className="cell" style={{ height: 40, display: 'grid', alignContent: 'center', gap: 0, lineHeight: 1.1 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{i + 1}</span><span>{h.par}</span>
            </div>
          ))}
        </div>
        {repeats.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Repeat partners this week: {repeats.map((r) => `${shortName(playerById(league, r.a).name)} & ${shortName(playerById(league, r.b).name)}`).join(', ')}</div>}
      </section>

      <div className="h2">Teams · lowest combined net wins</div>
      <div className="stack">
        {teams.sort((a, b) => a.team - b.team).map((t) => (
          <section key={t.team} className="card team-card rise" style={{ animationDelay: `${t.team * 0.05}s`, borderColor: t.winner ? 'color-mix(in oklab, var(--gold) 50%, transparent)' : undefined }}>
            <div className="team-head">
              <span className="team-no">{TEAM_NAMES[t.team]}</span>
              {t.winner && <span className="badge win">Week winner</span>}
              {t.place && !t.winner && <span className="muted" style={{ fontSize: 12 }}>#{t.place}</span>}
              <span className="team-net num">{t.net ?? '–'}<span className="muted" style={{ fontSize: 11, fontFamily: 'var(--font)', marginLeft: 4 }}>net</span></span>
            </div>
            {t.members.map((e) => (
              <Entrant key={e.key} e={e} course={course} skins={skinHoles[e.key] || []} me={e.regularId === myPlayerId && !e.isSub}
                canEdit={canEditScore(e.key)} isCommissioner={isCommissioner}
                onPad={() => openPad(e)} onSub={() => setSubFor(e)} photoUrl={photoUrl} onPhoto={() => setViewPhoto(e)}
                onApprove={() => { setScore(week.id, e.key, e.holes, 'approved'); toast('Card approved'); }} />
            ))}
          </section>
        ))}
      </div>

      {isCommissioner && (
        <div className="card flat" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="grow"><div style={{ fontWeight: 650 }}>Close the week</div><div className="muted" style={{ fontSize: 12.5 }}>Weeks finalize on their own once every card is in. Close it early if someone didn't play. Missing regulars then take the absence score.</div></div>
          <Switch on={!!week.final} label="Final" onChange={(v) => mutate((l) => { l.weeks.find((w) => w.id === week.id).final = v; })} />
        </div>
      )}

      <ScorePad open={!!pad} entrant={pad && (ents.find((x) => x.key === pad.key) || pad)} course={course} onClose={() => setPad(null)} onSave={save} readOnly={pad && !canEditScore(pad.key)}
        cloud={mode === 'cloud'} photoUrl={photoUrl} onDelete={isCommissioner ? del : null}
        onRemovePhoto={pad ? () => { removePhoto(week.id, pad.key); toast('Photo removed'); } : null} />
      {viewPhoto && <PhotoLightbox path={viewPhoto.photo} photoUrl={photoUrl} title={`${viewPhoto.name} · Week ${week.number}`} onClose={() => setViewPhoto(null)} />}
      <SubSheet ctx={ctx} week={week} entrant={subFor} onClose={() => setSubFor(null)} />
      <WeekSheet ctx={ctx} week={editWeek} onClose={() => setEditWeek(null)} />
      <TeamsSheet ctx={ctx} week={week} open={editTeams} onClose={() => setEditTeams(false)} history={history} />
    </>
  );
}

function Entrant({ e, course, skins, me, canEdit, isCommissioner, onPad, onSub, onApprove, onPhoto, photoUrl }) {
  const strokes = course.holes.map((h) => strokesOnHole(e.ph, h.si));
  return (
    <div className="entrant">
      <Avatar name={e.name} color={e.color} sub={e.isSub} />
      <div className="info">
        <div className="name-line">
          <span className="nm">{e.name}</span>
          {e.isSub && <span className="badge sub">Sub</span>}
          {me && <span className="badge you">You</span>}
          {e.status === 'pending' && <span className="badge pending">Pending</span>}
        </div>
        <div className="meta"><span>Idx {fmtIdx(e.index)}</span><span>CH {fmtHcp(e.ch)}</span><span>{e.entered}/9</span>{skins.length > 0 && <span style={{ color: 'var(--gold)', fontWeight: 650 }}>● {skins.length} skin{skins.length > 1 ? 's' : ''}</span>}</div>
      </div>
      <div className="score">
        <div className="g num">{e.gross ?? (e.entered ? e.holes.filter((x) => x > 0).reduce((a, b) => a + b, 0) : '–')}</div>
        <div className="n num">{e.net != null ? `net ${e.net}` : e.entered ? 'thru ' + e.entered : 'no card'}</div>
      </div>
      <div className="holes"><Strip holes={e.holes} course={course} skins={skins} strokes={strokes} /></div>
      <div className="acts">
        <button className={`btn sm ${canEdit && !e.complete ? 'primary' : ''}`} onClick={onPad}>
          <Icon name={canEdit ? 'edit' : 'card'} size={15} /> {canEdit ? (e.entered ? 'Edit card' : 'Enter card') : 'View'}
        </button>
        {e.photo && <button className="btn sm photo-btn" onClick={onPhoto} aria-label={`View ${e.name}'s card photo`} data-testid="entrant-photo"><PhotoThumb path={e.photo} photoUrl={photoUrl} size={22} /> Card</button>}
        {isCommissioner && e.status === 'pending' && <button className="btn sm" onClick={onApprove}><Icon name="check" size={15} /> Approve</button>}
        {isCommissioner && <button className="btn sm ghost" onClick={onSub} aria-label={e.isSub ? 'Edit substitute' : 'Bring in a substitute'}><Icon name="sub" size={15} /> {e.isSub ? 'Sub' : 'Sub in'}</button>}
      </div>
    </div>
  );
}

function SubSheet({ ctx, week, entrant, onClose }) {
  const { league, mutate, toast, deleteScore } = ctx;
  const regular = entrant ? playerById(league, entrant.regularId) : null;
  const existing = entrant && week.subs?.[entrant.regularId];
  const [name, setName] = useState('');
  const [index, setIndex] = useState('');
  const key = entrant?.key;
  useEffect(() => { setName(existing?.name || ''); setIndex(existing?.index ?? ''); }, [key]); // eslint-disable-line
  if (!entrant) return null;
  const save = () => {
    mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); w.subs = { ...w.subs, [entrant.regularId]: { name: name.trim() || 'Substitute', index: Number(index) || 0 } }; });
    toast(`${name || 'Sub'} is in for ${shortName(regular.name)}`); onClose();
  };
  const remove = () => {
    if (week.scores?.[subKey(entrant.regularId)]) deleteScore(week.id, subKey(entrant.regularId)).catch(() => {}); // card + photo
    mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); delete w.subs[entrant.regularId]; delete w.scores?.[subKey(entrant.regularId)]; });
    toast(`${shortName(regular.name)} is back in`); onClose();
  };
  return (
    <Sheet open onClose={onClose} title={existing ? 'Substitute' : `Sub in for ${shortName(regular.name)}`}
      subtitle="Subs count fully for the team this week. They never appear in season standings and don't affect anyone's handicap."
      footer={<>{existing && <button className="btn danger" onClick={remove}><Icon name="trash" size={16} /> Remove sub</button>}<span className="grow" /><button className="btn primary" onClick={save}>{existing ? 'Save' : 'Bring in sub'}</button></>}>
      <div className="stack">
        <label className="field"><span>Sub's name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rick Alvarez" autoFocus /></label>
        <label className="field"><span>Temporary handicap index (9-hole)</span><input className="input" inputMode="decimal" value={index} onChange={(e) => setIndex(e.target.value)} placeholder="e.g. 8.0" />
          <small>Use their league or WHS index if they have one. A WHS 18-hole index halves to about the 9-hole value.</small></label>
        <div className="banner"><Icon name="info" size={18} style={{ flex: 'none', color: 'var(--aqua)' }} /><span className="t2">After saving, use <b>Enter card</b> on the sub's row to record their hole scores. {shortName(regular.name)} takes an absence for this week.</span></div>
      </div>
    </Sheet>
  );
}

function WeekSheet({ ctx, week, onClose }) {
  const { league, mutate, toast, go, deleteWeekData } = ctx;
  const [f, setF] = useState(null);
  useEffect(() => setF(week ? { date: week.date, courseId: week.courseId } : null), [week?.id]); // eslint-disable-line
  if (!week || !f) return null;
  const del = () => {
    if (!confirm(`Delete week ${week.number} and all its scores?`)) return;
    deleteWeekData(week.id).catch(() => {}); // score rows + card photos
    mutate((l) => { l.weeks = l.weeks.filter((w) => w.id !== week.id); });
    onClose(); go('scores'); toast('Week deleted');
  };
  return (
    <Sheet open onClose={onClose} title={`Week ${week.number}`}
      footer={<><button className="btn danger" onClick={del}><Icon name="trash" size={16} /> Delete</button><span className="grow" /><button className="btn primary" onClick={() => { mutate((l) => Object.assign(l.weeks.find((w) => w.id === week.id), f)); toast('Week updated'); onClose(); }}>Save</button></>}>
      <div className="stack">
        <label className="field"><span>Date</span><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field"><span>Course</span>
          <select className="input" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
            {league.courses.map((c) => <option key={c.id} value={c.id}>{c.name} · par {c.par} · {c.rating}/{c.slope}</option>)}
          </select></label>
      </div>
    </Sheet>
  );
}

function TeamsSheet({ ctx, week, open, onClose, history }) {
  const { league, mutate, toast, derived } = ctx;
  const [teams, setTeams] = useState(week.teams);
  const [sel, setSel] = useState(null);
  const [seed, setSeed] = useState(1);
  useEffect(() => { setTeams(week.teams); setSel(null); }, [open, week.id]); // eslint-disable-line
  if (!open) return null;
  const ids = league.players.map((p) => p.id);
  const idx = Object.fromEntries(ids.map((id) => [id, derived.hcp.byWeek[week.id]?.[id]?.index ?? 0]));
  const reps = repeatPartners(teams, history);
  const tap = (ti, pi) => {
    if (!sel) return setSel([ti, pi]);
    const t = teams.map((x) => x.slice());
    const [a, b] = sel;
    [t[a][b], t[ti][pi]] = [t[ti][pi], t[a][b]];
    setTeams(t); setSel(null);
  };
  return (
    <Sheet open onClose={onClose} title="Week teams" subtitle="Tap two players to swap them. Auto-rotate avoids repeat partners, then balances handicaps."
      footer={<><button className="btn" onClick={() => { const s = seed + 1; setSeed(s); setTeams(generateTeams(ids, history, { indexes: idx, seed: s * 97 + week.number })); }}><Icon name="shuffle" size={16} /> Auto-rotate</button><span className="grow" /><button className="btn primary" onClick={() => { mutate((l) => { l.weeks.find((w) => w.id === week.id).teams = teams; }); toast('Teams saved'); onClose(); }}>Save teams</button></>}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {teams.map((t, ti) => (
          <div key={ti} className="card flat" style={{ padding: 12, background: 'var(--surface-2)' }}>
            <div className="row spread"><b className="display">{TEAM_NAMES[ti]}</b><span className="muted num" style={{ fontSize: 12 }}>Σ idx {fmtIdx(t.reduce((a, id) => a + idx[id], 0))}</span></div>
            {t.map((pid, pi) => {
              const p = playerById(league, pid);
              const on = sel && sel[0] === ti && sel[1] === pi;
              const isRep = reps.some((r) => r.a === pid || r.b === pid) && reps.some((r) => t.includes(r.a) && t.includes(r.b));
              return (
                <button key={pid} onClick={() => tap(ti, pi)} className="row" style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 10, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'var(--surface)', textAlign: 'left' }}>
                  <Avatar name={p.name} color={p.color} size="sm" />
                  <span className="grow ellipsis" style={{ fontWeight: 600 }}>{shortName(p.name)}</span>
                  {week.subs?.[pid] && <span className="badge sub">Sub</span>}
                  {isRep && <span className="badge pending">Repeat</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function addWeek(ctx) {
  const { league, mutate, go, toast, derived } = ctx;
  if (!league.courses.length) { go('courses'); toast('Add a course first'); return; }
  const ws = sortedWeeks(league);
  const last = ws[ws.length - 1];
  const number = (last?.number || 0) + 1;
  const used = new Set(ws.map((w) => w.courseId));
  const course = league.courses.find((c) => !used.has(c.id)) || league.courses[(number - 1) % league.courses.length];
  const date = last ? new Date(new Date(last.date + 'T12:00:00').getTime() + 7 * 864e5).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const ids = league.players.map((p) => p.id);
  const indexes = Object.fromEntries(ids.map((id) => [id, derived.hcp.current[id]?.index ?? 0]));
  const teams = ids.length % 2 === 0 ? generateTeams(ids, ws.map((w) => w.teams), { indexes, seed: number * 31 }) : [];
  const id = 'w' + Math.random().toString(36).slice(2, 8);
  mutate((l) => { l.weeks.push({ id, number, date, courseId: course.id, teams, subs: {}, scores: {} }); });
  toast(`Week ${number} scheduled on ${course.name}`);
  setTimeout(() => go(`scores/${id}`), 30);
}
