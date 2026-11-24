import { lazy, Suspense, useEffect, useState } from "react";
import { Icon, Avatar, Strip, Sheet, fmtIdx, fmtHcp, shortName, Empty, Switch } from '../components/ui.jsx';
import ScorePad from './ScorePad.jsx';
import { PhotoLightbox, PhotoThumb } from './CardPhoto.jsx';
import { CourseSheet, blankCourse } from './Courses.jsx';
import { weekState, fmtDate } from '../lib/helpers.js';
import { teamResults, weekSkins, generateTeams, repeatPartners, sortedWeeks, subKey, strokesOnHole, playerById, teeSetsOf, courseById, settingsOf, subPlayerById } from '../lib/golf.js';
import { PALETTE, uid } from '../lib/seed.js';
import { money } from '../components/ui.jsx';
import { teeColor } from './teeColor.js';
const CoursePicker = lazy(() => import('./CoursePicker.jsx'));

const TEAM_NAMES = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6'];

export default function Week({ ctx }) {
  const { league, derived, route, go, isCommissioner, canEditScore, setScore, deleteScore, removePhoto, photoUrl, mutate, toast, myPlayerId, mode } = ctx;
  const [viewPhoto, setViewPhoto] = useState(null);
  const weeks = derived.weeks;
  const week = weeks.find((w) => w.id === route[1]) || weeks.find((w) => !weekState(league, w, derived.hcp).final) || weeks[weeks.length - 1];
  const [pad, setPad] = useState(null);
  const [subFor, setSubFor] = useState(null);
  const [editCourse, setEditCourse] = useState(null);
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
  const baseCourse = courseById(league, week.courseId);
  const tees = teeSetsOf(baseCourse);
  const setTee = (name) => { mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); if (name) w.tee = name; else delete w.tee; }); toast(name ? `Week ${week.number}: ${name} tees · ${tees.find((t) => t.name === name)?.rating}/${tees.find((t) => t.name === name)?.slope}` : 'Back to the course\'s default tee'); };
  // Skins: legacy weeks (no skinsIn) count everyone with a card; a first tick turns that into an explicit list.
  const skinsList = () => week.skinsIn ?? Object.fromEntries(ents.filter((e) => !e.out).map((e) => [e.key, true]));
  const toggleSkins = (e) => mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); const cur = { ...(w.skinsIn ?? skinsList()) }; if (cur[e.key]) delete cur[e.key]; else cur[e.key] = true; w.skinsIn = cur; });
  const setAllSkins = (on) => { mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); w.skinsIn = on ? Object.fromEntries(ents.filter((e) => !e.out).map((e) => [e.key, true])) : {}; }); toast(on ? 'Everyone playing is in the skins' : 'Skins cleared'); };
  const skinsCount = ents.filter((e) => e.skins && !e.out).length;
  const buyIn = Number(settingsOf(league).skins.buyIn) || 0;
  // Names a scanned card can be matched to: this week's players and subs, then the rest of the league.
  const roster = [...ents.map((e) => ({ id: e.key, name: e.name })), ...league.players.filter((p) => !ents.some((e) => e.name === p.name)).map((p) => ({ id: 'league:' + p.id, name: p.name }))];
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
            <div className="row" style={{ gap: 8 }}>{st.final ? <span className="badge final">Final</span> : <span className="badge live">● Live</span>}<span className="muted" style={{ fontSize: 12.5 }}>{st.done}/{st.playing.length} cards in</span></div>
            <div className="display" style={{ fontSize: 24, fontWeight: 600, marginTop: 6 }}>{course?.name}</div>
            <div className="meta" style={{ marginTop: 4 }}>
              {course?.tees && <><span className="tee-tag"><span className="tee-dot" style={{ width: 10, height: 10, background: teeColor(course.tees) }} />{course.tees} tees</span><span>·</span></>}
              <span>Par {course?.par}</span><span>·</span><span data-testid="week-rating">CR {course?.rating}</span><span>·</span><span data-testid="week-slope">Slope {course?.slope}</span>{course?.gspro != null && <><span>·</span><span>GSPro {course.gspro}</span></>}
            </div>
            {isCommissioner && (
              <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                <label className="field" style={{ minWidth: 220, margin: 0 }}><span>Tees this week</span>
                  {tees.length ? (
                    <select className="input" value={week.tee && tees.some((t) => t.name === week.tee) ? week.tee : ''} onChange={(e) => setTee(e.target.value)} data-testid="week-tee">
                      <option value="">Course default{baseCourse?.tees ? ` (${baseCourse.tees})` : ''} · {baseCourse?.rating}/{baseCourse?.slope}</option>
                      {tees.map((t) => <option key={t.name} value={t.name}>{t.name} · {t.rating}/{t.slope}</option>)}
                    </select>
                  ) : (
                    <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setEditCourse(structuredClone(baseCourse))} data-testid="week-add-tees"><Icon name="plus" size={15} /> Add tee boxes</button>
                  )}
                </label>
                {!tees.length && <span className="muted" style={{ fontSize: 12, maxWidth: 300 }}>No tee ratings on file for this course yet. Add them from the card and each week can pick its tee.</span>}
              </div>
            )}
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

      {isCommissioner && !st.final && st.missing.length > 0 && st.done + st.missing.length > 0 && (
        <div className="banner warn rise" style={{ marginTop: 12 }} data-testid="missing-cards">
          <Icon name="card" size={20} style={{ color: 'var(--gold)', flex: 'none' }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <b>Still waiting on {st.missing.length} card{st.missing.length > 1 ? 's' : ''}</b>
            <div className="missing-list" style={{ marginTop: 6 }}>{st.missing.map((e) => <button key={e.key} className="chip" style={{ height: 28, fontSize: 12 }} onClick={() => canEditScore(e.key) && openPad(e)}>{shortName(e.name)}{e.isSub && <span className="badge sub" style={{ height: 16 }}>Sub</span>}{e.entered > 0 && <span className="muted"> · thru {e.entered}</span>}</button>)}</div>
          </div>
        </div>
      )}

      <div className="row spread wrap" style={{ marginTop: 6 }}>
        <div className="h2" style={{ margin: '18px 0 8px' }}>Teams · lowest combined net wins</div>
        <div className="row wrap" style={{ gap: 6 }} data-testid="skins-summary">
          <span className="muted" style={{ fontSize: 12.5 }}><Icon name="coin" size={14} style={{ verticalAlign: '-2px', color: 'var(--gold)' }} /> Skins: <b className="t2">{skinsCount}</b> in · {money(buyIn * skinsCount)} pot</span>
          {isCommissioner && <><button className="btn xs ghost" onClick={() => setAllSkins(true)}>All in</button><button className="btn xs ghost" onClick={() => setAllSkins(false)}>Clear</button></>}
          <button className="btn xs ghost" onClick={() => go('skins')}>Payout <Icon name="chev" size={13} /></button>
        </div>
      </div>
      <div className="stack">
        {teams.sort((a, b) => a.team - b.team).map((t) => (
          <section key={t.team} className="card team-card rise" style={{ animationDelay: `${t.team * 0.05}s`, borderColor: t.winner ? 'color-mix(in oklab, var(--gold) 50%, transparent)' : undefined }}>
            <div className="team-head">
              <span className="team-no">{TEAM_NAMES[t.team]}</span>
              {t.winner && <span className="badge win">Week winner</span>}
              {t.place && !t.winner && <span className="muted" style={{ fontSize: 12 }}>#{t.place}</span>}
              {t.short && <span className="badge out">Short-handed</span>}
              <span className="team-net num">{t.net ?? '–'}<span className="muted" style={{ fontSize: 11, fontFamily: 'var(--font)', marginLeft: 4 }}>net</span></span>
            </div>
            {t.members.map((e) => (
              <Entrant key={e.key} e={e} course={course} skins={skinHoles[e.key] || []} me={e.regularId === myPlayerId && !e.isSub}
                canEdit={canEditScore(e.key)} isCommissioner={isCommissioner} onSkins={() => toggleSkins(e)}
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
        cloud={mode === 'cloud'} photoUrl={photoUrl} onDelete={isCommissioner ? del : null} roster={roster}
        onRemovePhoto={pad ? () => { removePhoto(week.id, pad.key); toast('Photo removed'); } : null} />
      {viewPhoto && <PhotoLightbox path={viewPhoto.photo} photoUrl={photoUrl} title={`${viewPhoto.name} · Week ${week.number}`} onClose={() => setViewPhoto(null)} />}
      <SubSheet ctx={ctx} week={week} entrant={subFor} onClose={() => setSubFor(null)} />
      <CourseSheet ctx={ctx} course={editCourse} onClose={() => setEditCourse(null)} />
      <WeekSheet ctx={ctx} week={editWeek} onClose={() => setEditWeek(null)} />
      <TeamsSheet ctx={ctx} week={week} open={editTeams} onClose={() => setEditTeams(false)} history={history} />
    </>
  );
}

function Entrant({ e, course, skins, me, canEdit, isCommissioner, onPad, onSub, onApprove, onPhoto, photoUrl, onSkins }) {
  const strokes = course.holes.map((h) => strokesOnHole(e.ph, h.si));
  if (e.out) {
    return (
      <div className="entrant out" data-testid="entrant-out">
        <Avatar name={e.name} color={e.color} />
        <div className="info">
          <div className="name-line"><span className="nm">{e.name}</span><span className="badge out">Out</span>{me && <span className="badge you">You</span>}</div>
          <div className="meta"><span>Not playing this week · no sub</span></div>
        </div>
        <div className="score"><div className="g num muted">–</div><div className="n num">out</div></div>
        <div className="acts">{isCommissioner && <button className="btn sm ghost" onClick={onSub}><Icon name="sub" size={15} /> Out / sub</button>}</div>
      </div>
    );
  }
  return (
    <div className="entrant">
      <Avatar name={e.name} color={e.color} sub={e.isSub} />
      <div className="info">
        <div className="name-line">
          <span className="nm">{e.name}</span>
          {e.isSub && <span className="badge sub">Sub</span>}
          {me && <span className="badge you">You</span>}
          {e.status === 'pending' && <span className="badge pending">Pending</span>}
          {isCommissioner
            ? <button className={`skin-toggle ${e.skins ? 'on' : ''}`} onClick={onSkins} aria-pressed={e.skins} aria-label={`${e.name} in skins`} data-testid="skins-toggle"><span className="box">{e.skins && <Icon name="check" size={10} stroke={3} />}</span>Skins</button>
            : e.skins && <span className="skin-toggle on" style={{ cursor: 'default' }}><span className="box"><Icon name="check" size={10} stroke={3} /></span>Skins</span>}
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
        {isCommissioner && <button className="btn sm ghost" onClick={onSub} aria-label={e.isSub ? 'Edit substitute' : 'Mark out or bring in a sub'}><Icon name="sub" size={15} /> {e.isSub ? 'Sub' : 'Out / sub'}</button>}
      </div>
    </div>
  );
}

function SubSheet({ ctx, week, entrant, onClose }) {
  const { league, mutate, toast, deleteScore, derived } = ctx;
  const regular = entrant ? playerById(league, entrant.regularId) : null;
  const existing = entrant && week.subs?.[entrant.regularId];
  const saved = league.subPlayers || [];
  const [pick, setPick] = useState(''); // saved sub id, or '' for a new one
  const [name, setName] = useState('');
  const key = entrant?.key;
  useEffect(() => { setPick(existing?.playerId || ''); setName(''); }, [key]); // eslint-disable-line
  if (!entrant) return null;
  const rid = entrant.regularId;
  const busy = new Set(Object.entries(week.subs || {}).filter(([r]) => r !== rid).map(([, s]) => s.playerId).filter(Boolean));
  const s = settingsOf(league);
  const hcpOf = (id) => derived.hcp.current[id];
  const dropSubCard = () => { if (week.scores?.[subKey(rid)]) deleteScore(week.id, subKey(rid)).catch(() => {}); };
  const saveSub = () => {
    const nm = name.trim();
    if (!pick && !nm) return toast("Type the sub's name or pick a saved sub");
    if (!pick && saved.some((x) => x.name.toLowerCase() === nm.toLowerCase())) return toast(`${nm} is already saved. Pick them from the list.`);
    const id = pick || uid('s_');
    const subName = pick ? subPlayerById(league, pick)?.name : nm;
    if (existing && existing.playerId !== id) dropSubCard(); // a different person: the old sub's card goes
    mutate((l) => {
      if (!pick) l.subPlayers = [...(l.subPlayers || []), { id, name: nm, color: PALETTE[(l.players.length + (l.subPlayers || []).length) % PALETTE.length], addedAt: new Date().toISOString().slice(0, 10) }];
      const w = l.weeks.find((x) => x.id === week.id);
      w.subs = { ...w.subs, [rid]: { playerId: id, name: subName } };
      if (w.out) delete w.out[rid];
    });
    toast(`${subName} is in for ${shortName(regular.name)}`); onClose();
  };
  const markOut = () => {
    dropSubCard();
    mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); if (w.subs) delete w.subs[rid]; delete w.scores?.[subKey(rid)]; w.out = { ...w.out, [rid]: true }; if (w.skinsIn) { delete w.skinsIn[rid]; delete w.skinsIn[subKey(rid)]; } });
    toast(`${shortName(regular.name)} is out this week`); onClose();
  };
  const backIn = () => {
    dropSubCard();
    mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); if (w.subs) delete w.subs[rid]; if (w.out) delete w.out[rid]; delete w.scores?.[subKey(rid)]; });
    toast(`${shortName(regular.name)} is back in`); onClose();
  };
  const isOutNow = !!week.out?.[rid] && !existing;
  const chosen = pick ? hcpOf(pick) : null;
  return (
    <Sheet open onClose={onClose} title={`${shortName(regular.name)} can't make it?`}
      subtitle="Mark them out, or bring in a sub. Subs play off their own league handicap, never the player they replace."
      footer={<>{(existing || isOutNow) && <button className="btn" onClick={backIn} data-testid="sub-back-in"><Icon name="check" size={16} /> {shortName(regular.name)} is playing</button>}<span className="grow" />
        {!isOutNow && <button className="btn" onClick={markOut} data-testid="sub-mark-out">Out, no sub</button>}
        <button className="btn primary" onClick={saveSub} data-testid="sub-save">{existing ? 'Save sub' : 'Bring in sub'}</button></>}>
      <div className="stack">
        {saved.length > 0 && (
          <div className="field"><span>Saved subs</span>
            <div className="stack" style={{ gap: 6 }}>
              {saved.map((sp) => {
                const h = hcpOf(sp.id);
                const rounds = derived.hcp.log[sp.id]?.length || 0;
                return (
                  <button key={sp.id} disabled={busy.has(sp.id)} className={`tee-opt ${pick === sp.id ? 'on' : ''}`} onClick={() => { setPick(sp.id); setName(''); }} data-testid="sub-saved">
                    <Avatar name={sp.name} color={sp.color} size="sm" sub />
                    <b className="ellipsis">{sp.name}</b><span className="grow" />
                    <span className="muted num" style={{ fontSize: 12 }}>{busy.has(sp.id) ? 'subbing in another slot' : h?.method === 'whs' ? `Idx ${fmtIdx(h.index)} · ${rounds} rds` : rounds ? `${rounds} rd${rounds > 1 ? 's' : ''} · building` : 'No handicap yet'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <label className="field"><span>{saved.length ? 'Or a new sub' : "Sub's name"}</span><input className="input" value={name} onChange={(e) => { setName(e.target.value); if (e.target.value) setPick(''); }} placeholder="e.g. Rick Alvarez" data-testid="sub-name" /></label>
        <div className="banner"><Icon name="info" size={18} style={{ flex: 'none', color: 'var(--aqua)' }} /><span className="t2">
          {chosen ? <>{subPlayerById(league, pick)?.name} plays off <b>{fmtIdx(chosen.index)}</b>{chosen.method === 'whs' ? ', their own league index.' : <> (no handicap yet). After {Math.max(3, s.minRounds)} rounds they get a league index of their own.</>}</>
            : <>A new sub starts with <b>no handicap</b> (plays off 0) and is saved to the league. Every round they play builds their own handicap.</>}
          {' '}The sub counts for {shortName(regular.name)}'s team this week; {shortName(regular.name)} takes an absence in the standings. Subs never appear in the standings.</span></div>
      </div>
    </Sheet>
  );
}

function WeekSheet({ ctx, week, onClose }) {
  const { league, mutate, toast, go, deleteWeekData } = ctx;
  const [f, setF] = useState(null);
  const [find, setFind] = useState(false);
  const [editCourse, setEditCourse] = useState(null);
  useEffect(() => setF(week ? { date: week.date, courseId: week.courseId, tee: week.tee || '' } : null), [week?.id]); // eslint-disable-line
  if (!week || !f) return null;
  const del = () => {
    if (!confirm(`Delete week ${week.number} and all its scores?`)) return;
    deleteWeekData(week.id).catch(() => {}); // score rows + card photos
    mutate((l) => { l.weeks = l.weeks.filter((w) => w.id !== week.id); });
    onClose(); go('scores'); toast('Week deleted');
  };
  return (
    <Sheet open onClose={onClose} title={`Week ${week.number}`}
      footer={<><button className="btn danger" onClick={del}><Icon name="trash" size={16} /> Delete</button><span className="grow" /><button className="btn primary" onClick={() => {
        mutate((l) => { const w = l.weeks.find((x) => x.id === week.id); w.date = f.date; w.courseId = f.courseId; const ok = teeSetsOf(l.courses.find((c) => c.id === f.courseId)).some((t) => t.name === f.tee); if (f.tee && ok) w.tee = f.tee; else delete w.tee; });
        toast('Week updated'); onClose(); }}>Save</button></>}>
      <div className="stack">
        <label className="field"><span>Date</span><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field"><span>Course</span>
          <select className="input" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
            {league.courses.map((c) => <option key={c.id} value={c.id}>{c.name} · par {c.par} · {c.rating}/{c.slope}</option>)}
          </select></label>
        {(() => {
          const c = league.courses.find((x) => x.id === f.courseId); const ts = teeSetsOf(c);
          return ts.length ? (
            <label className="field"><span>Tees</span>
              <select className="input" value={ts.some((t) => t.name === f.tee) ? f.tee : ''} onChange={(e) => setF({ ...f, tee: e.target.value })} data-testid="weeksheet-tee">
                <option value="">{c.tees ? `${c.tees} (course default)` : 'Course default'} · {c.rating}/{c.slope}</option>
                {ts.map((t) => <option key={t.name} value={t.name}>{t.name} · {t.rating}/{t.slope}</option>)}
              </select><small>Sets this week's rating and slope. The course itself isn't changed.</small></label>
          ) : <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>No tee boxes saved for this course. Add them in Courses to pick a tee per week.</p>;
        })()}
        <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setFind(true)} data-testid="week-find-course"><Icon name="search" size={15} /> Find a GSPro course</button>
        {find && <Suspense fallback={null}><CoursePicker open saved={league.courses} onClose={() => setFind(false)}
          onManual={() => { setFind(false); setEditCourse(blankCourse()); }}
          onPick={(c) => { setFind(false); if (c._existing) setF((x) => ({ ...x, courseId: c.id })); else setEditCourse(c); }} /></Suspense>}
        <CourseSheet ctx={ctx} course={editCourse} onClose={() => setEditCourse(null)} onSaved={(c) => setF((x) => ({ ...x, courseId: c.id }))} />
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
  // skinsIn: {} → nobody is in the skins until the commissioner ticks who paid this week
  mutate((l) => { l.weeks.push({ id, number, date, courseId: course.id, teams, subs: {}, out: {}, skinsIn: {}, scores: {} }); });
  toast(`Week ${number} scheduled on ${course.name}`);
  setTimeout(() => go(`scores/${id}`), 30);
}
