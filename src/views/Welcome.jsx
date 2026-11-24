import { lazy, Suspense, useState } from 'react';
import { Icon, BrandMark, Avatar } from '../components/ui.jsx';
import { blankLeague, demoLeague, makeCourse, PALETTE } from '../lib/seed.js';
import { generateTeams, gsproToSlope, suggestRating } from '../lib/golf.js';

const PRESETS = demoLeague().courses;
const CoursePicker = lazy(() => import('./CoursePicker.jsx'));

export default function Welcome({ ctx, onDone }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [season, setSeason] = useState(`Winter ${new Date().getFullYear()}`);
  const [players, setPlayers] = useState(Array(8).fill(''));
  const [courseIdx, setCourseIdx] = useState(0);
  const [custom, setCustom] = useState({ name: '', gspro: 5.8 });
  const [busy, setBusy] = useState(false);
  const [findCourse, setFindCourse] = useState(false);
  const [pickedCourse, setPickedCourse] = useState(null);
  const hasOwn = ctx.leagues.some((l) => !l.isDemo);

  const explore = async () => {
    const demo = ctx.leagues.find((l) => l.isDemo);
    if (demo) ctx.setActiveId(demo.id);
    onDone();
  };
  const create = async () => {
    setBusy(true);
    try {
      const names = players.map((p) => p.trim()).filter(Boolean);
      const lg = blankLeague(name.trim() || 'My League', names);
      lg.season = season;
      const course = courseIdx === -2 && pickedCourse ? structuredClone(pickedCourse) : courseIdx === -1
        ? makeCourse(custom.name || 'Week 1 course', [4, 4, 3, 5, 4, 4, 3, 5, 4], [1, 5, 9, 3, 7, 2, 8, 4, 6], custom.gspro)
        : structuredClone(PRESETS[courseIdx]);
      lg.courses = [course];
      const ids = lg.players.map((p) => p.id);
      lg.weeks = [{ id: 'w1', number: 1, date: new Date().toISOString().slice(0, 10), courseId: course.id, teams: ids.length % 2 === 0 ? generateTeams(ids, [], { seed: Date.now() % 1000 }) : [], subs: {}, out: {}, skinsIn: {}, scores: {} }];
      const id = await ctx.store.createLeague(lg);
      await ctx.refreshList();
      ctx.setActiveId(id || lg.id);
      onDone();
      ctx.go('scores');
      ctx.toast(`${lg.name} is ready. Week 1 teams are drawn.`);
    } catch (e) { ctx.toast(e.message); } finally { setBusy(false); }
  };
  const valid = players.filter((p) => p.trim()).length;

  return (
    <div className="welcome">
      <div className="welcome-inner">
        {step === 0 && (
          <>
            <div className="rise"><BrandMark size={56} /></div>
            <h1 className="rise rise-1">Your league,<br /><span style={{ background: 'var(--tracer)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>on the card.</span></h1>
            <p className="lede rise rise-2">Carry runs a 9-hole sim league for you: handicaps, rotating teams, skins with carryovers, subs, and a TV leaderboard. Everyone enters their own scores.</p>
            {ctx.mode === 'local' && <button className="choice primary rise rise-2" onClick={explore}>
              <span className="ic"><Icon name="play" size={22} /></span>
              <span className="grow"><b>Explore the demo league</b><small>8 players, 7 weeks, real handicap math. Nothing to set up.</small></span><Icon name="chev" />
            </button>}
            {ctx.mode === 'cloud' && <button className="choice rise rise-4" onClick={() => { ctx.setMode('local'); location.hash = '/home'; location.reload(); }}>
              <span className="ic"><Icon name="play" size={22} /></span>
              <span className="grow"><b>Explore the demo league</b><small>Offline, on this device. Switch back to your account any time from League.</small></span><Icon name="chev" />
            </button>}
            <button className="choice rise rise-3" onClick={() => setStep(1)}>
              <span className="ic"><Icon name="plus" size={22} /></span>
              <span className="grow"><b>Start my own league</b><small>About a minute: name, players, first course.</small></span><Icon name="chev" />
            </button>
            <button className="choice rise rise-4" onClick={() => ctx.go('join')}>
              <span className="ic"><Icon name="mail" size={22} /></span>
              <span className="grow"><b>I have an invite code</b><small>Join a league your commissioner set up.</small></span><Icon name="chev" />
            </button>
            {hasOwn && <button className="btn ghost" onClick={onDone}>Back to my league</button>}
          </>
        )}

        {step > 0 && (
          <div className="steps" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={step >= n ? 'on' : ''} />)}</div>
        )}

        {step === 1 && (
          <div className="stack rise">
            <div className="eyebrow">Step 1 of 3</div>
            <h2 className="display" style={{ fontSize: 34, margin: 0, fontWeight: 600 }}>Name your league</h2>
            <label className="field"><span>League name</span><input className="input" autoFocus placeholder="Thursday Night Sim League" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field"><span>Season</span><input className="input" value={season} onChange={(e) => setSeason(e.target.value)} /></label>
            <div className="row"><button className="btn ghost" onClick={() => setStep(0)}>Back</button><span className="grow" /><button className="btn primary" onClick={() => setStep(2)}>Next <Icon name="chev" size={16} /></button></div>
          </div>
        )}

        {step === 2 && (
          <div className="stack rise">
            <div className="eyebrow">Step 2 of 3</div>
            <h2 className="display" style={{ fontSize: 34, margin: 0, fontWeight: 600 }}>Who's playing?</h2>
            <p className="t2" style={{ margin: 0 }}>Your regulars. Use an even number for 2-player teams. Subs are added week by week, so leave them out.</p>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {players.map((p, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <Avatar name={p || String(i + 1)} color={PALETTE[i % PALETTE.length]} size="sm" />
                  <input className="input" style={{ height: 40 }} placeholder={`Player ${i + 1}`} value={p} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn sm ghost" onClick={() => setPlayers([...players, '', ''])}><Icon name="plus" size={15} /> 2 more</button>
              {players.length > 4 && <button className="btn sm ghost" onClick={() => setPlayers(players.slice(0, -2))}>Remove 2</button>}
            </div>
            <div className="row"><button className="btn ghost" onClick={() => setStep(1)}>Back</button><span className="grow" /><span className="muted" style={{ fontSize: 12.5 }}>{valid} players</span><button className="btn primary" disabled={valid < 2} onClick={() => setStep(3)}>Next <Icon name="chev" size={16} /></button></div>
          </div>
        )}

        {step === 3 && (
          <div className="stack rise">
            <div className="eyebrow">Step 3 of 3</div>
            <h2 className="display" style={{ fontSize: 34, margin: 0, fontWeight: 600 }}>Week 1 course</h2>
            <div className="stack" style={{ maxHeight: 300, overflow: 'auto', paddingRight: 4 }}>
              <button className={`choice ${courseIdx === -2 ? 'primary' : ''}`} style={{ padding: 12 }} data-testid="wizard-find-course" onClick={() => setFindCourse(true)}>
                <span className="grow"><b style={{ fontSize: 15 }}>{pickedCourse ? pickedCourse.name : 'Find a GSPro course'}</b><small>{pickedCourse ? `${pickedCourse.tees ? `${pickedCourse.tees} tees · ` : ''}Par ${pickedCourse.par} · CR ${pickedCourse.rating} · Slope ${pickedCourse.slope}${pickedCourse.teeSets?.length > 1 ? ` · ${pickedCourse.teeSets.length} tee boxes` : ''}` : 'Search 3,000+ GSPro courses, rating and slope from the card'}</small></span>
                {courseIdx === -2 ? <Icon name="check" style={{ color: 'var(--accent)' }} /> : <Icon name="search" />}
              </button>
              {PRESETS.map((c, i) => (
                <button key={c.id} className={`choice ${courseIdx === i ? 'primary' : ''}`} style={{ padding: 12 }} onClick={() => setCourseIdx(i)}>
                  <span className="grow"><b style={{ fontSize: 15 }}>{c.name}</b><small>Par {c.par} · CR {c.rating} · Slope {c.slope} · GSPro {c.gspro}</small></span>
                  {courseIdx === i && <Icon name="check" style={{ color: 'var(--accent)' }} />}
                </button>
              ))}
              <div className={`choice ${courseIdx === -1 ? 'primary' : ''}`} style={{ padding: 12, display: 'grid', gap: 8 }} onClick={() => setCourseIdx(-1)}>
                <b style={{ fontSize: 15 }}>Another GSPro course</b>
                <input className="input" placeholder="Course name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
                <div className="row"><span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>Difficulty {custom.gspro.toFixed(1)}</span><input type="range" min="0" max="10" step=".1" value={custom.gspro} onChange={(e) => setCustom({ ...custom, gspro: +e.target.value })} /><span className="muted num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>Slope {gsproToSlope(custom.gspro)} · CR {suggestRating(36, gsproToSlope(custom.gspro))}</span></div>
              </div>
            </div>
            {findCourse && <Suspense fallback={null}><CoursePicker open onClose={() => setFindCourse(false)} onManual={() => { setFindCourse(false); setCourseIdx(-1); }}
              onPick={(c) => { setPickedCourse(c); setCourseIdx(-2); setFindCourse(false); }} /></Suspense>}
            <div className="row"><button className="btn ghost" onClick={() => setStep(2)}>Back</button><span className="grow" /><button className="btn tracer" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create league'} <Icon name="check" size={16} /></button></div>
          </div>
        )}
      </div>
    </div>
  );
}
