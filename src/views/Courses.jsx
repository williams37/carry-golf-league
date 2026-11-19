import { useEffect, useState } from 'react';
import { Icon, Sheet, Empty } from '../components/ui.jsx';
import { gsproToSlope, suggestRating } from '../lib/golf.js';
import { uid } from '../lib/seed.js';

const blank = () => ({ id: uid('c_'), name: '', tees: '', gspro: 5.8, slope: 113, rating: 36, par: 36, holes: [4, 4, 3, 5, 4, 4, 3, 5, 4].map((par, i) => ({ par, si: [1, 5, 9, 3, 7, 2, 8, 4, 6][i] })) });

export function SlopeGuide() {
  const rows = [[0, 'Pitch & putt'], [3, 'Very easy'], [5, 'Below average'], [5.8, 'Standard (113)'], [7, 'Tough'], [8.5, 'Championship'], [10, 'Brutal']];
  return (
    <div className="card flat" style={{ background: 'var(--surface-2)' }}>
      <div className="eyebrow">GSPro difficulty → slope</div>
      <p className="t2" style={{ fontSize: 13, margin: '6px 0 10px' }}>Slope = 55 + 10 × difficulty, linear across the official 55–155 range. A 5.8 lands on 113, the "standard" course. Rating defaults to par + (slope − 113) ÷ 13, about one stroke per 13 slope points over nine holes. Use the real 9-hole rating and slope if the course has them.</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
        {rows.map(([d, l]) => (
          <div key={d} style={{ padding: 8, borderRadius: 10, background: 'var(--surface)', textAlign: 'center' }}>
            <div className="display num" style={{ fontSize: 20 }}>{gsproToSlope(d)}</div>
            <div className="muted" style={{ fontSize: 11 }}>{d} · {l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Courses({ ctx }) {
  const { league, isCommissioner, derived } = ctx;
  const [edit, setEdit] = useState(null);
  const usedBy = (id) => derived.weeks.filter((w) => w.courseId === id).map((w) => w.number);
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">A different 9 every week</div><h1 className="page-title">Courses</h1></div>
        {isCommissioner && <button className="btn sm" onClick={() => setEdit(blank())}><Icon name="plus" size={16} /> Add course</button>}
      </div>
      {league.courses.length === 0 && <Empty icon="map" title="No courses yet" action={isCommissioner && <button className="btn primary" onClick={() => setEdit(blank())}>Add a course</button>}>Add the GSPro course you're playing this week: par, stroke index, and its difficulty. Carry works out the slope.</Empty>}
      <div className="grid-3">
        {league.courses.map((c, i) => (
          <button key={c.id} className="card link rise" style={{ textAlign: 'left', animationDelay: `${i * 0.03}s` }} onClick={() => isCommissioner && setEdit(structuredClone(c))}>
            <div className="row spread"><b className="display" style={{ fontSize: 18 }}>{c.name}</b>{usedBy(c.id).length > 0 && <span className="badge final">Wk {usedBy(c.id).join(', ')}</span>}</div>
            <div className="meta" style={{ marginTop: 4 }}>{c.tees && <><span>{c.tees} tees</span>·</>}<span>Par {c.par}</span>·<span>CR {c.rating}</span>·<span>Slope {c.slope}</span></div>
            <div className="strip" style={{ marginTop: 12 }}>{c.holes.map((h, j) => <div key={j} className="cell" style={{ height: 26, fontSize: 12 }}>{h.par}</div>)}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>GSPro {c.gspro ?? '–'}</span>
              <div className="moneybar grow" style={{ height: 5 }}><i style={{ width: `${((c.slope - 55) / 100) * 100}%`, background: 'var(--tracer)' }} /></div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}><SlopeGuide /></div>
      <CourseSheet ctx={ctx} course={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function CourseSheet({ ctx, course, onClose }) {
  const { mutate, toast, league } = ctx;
  const [c, setC] = useState(course);
  const [auto, setAuto] = useState(true);
  useEffect(() => { setC(course); setAuto(true); }, [course?.id]); // eslint-disable-line
  if (!course || !c) return null;
  const exists = league.courses.some((x) => x.id === c.id);
  const par = c.holes.reduce((a, h) => a + (Number(h.par) || 0), 0);
  const sis = c.holes.map((h) => Number(h.si));
  const siOk = [...sis].sort((a, b) => a - b).join() === '1,2,3,4,5,6,7,8,9';
  const setDiff = (d) => {
    const slope = gsproToSlope(d);
    setC({ ...c, gspro: d, slope, rating: auto ? suggestRating(par, slope) : c.rating });
  };
  const setHole = (i, k, v) => {
    const holes = c.holes.map((h, j) => (j === i ? { ...h, [k]: v === '' ? '' : Number(v) } : h));
    const p = holes.reduce((a, h) => a + (Number(h.par) || 0), 0);
    setC({ ...c, holes, par: p, rating: auto ? suggestRating(p, c.slope) : c.rating });
  };
  const save = () => {
    if (!c.name.trim()) return toast('Give the course a name');
    if (!siOk) return toast('Stroke index must use 1–9 once each');
    const clean = { ...c, par, slope: Number(c.slope), rating: Number(c.rating), holes: c.holes.map((h) => ({ par: Number(h.par), si: Number(h.si) })) };
    mutate((l) => { const i = l.courses.findIndex((x) => x.id === c.id); if (i >= 0) l.courses[i] = clean; else l.courses.push(clean); });
    toast(exists ? 'Course updated' : 'Course added'); onClose();
  };
  const del = () => {
    if (ctx.derived.weeks.some((w) => w.courseId === c.id)) return toast('This course is used by a week, so it can\'t be deleted');
    mutate((l) => { l.courses = l.courses.filter((x) => x.id !== c.id); }); onClose();
  };
  return (
    <Sheet open onClose={onClose} wide title={exists ? 'Edit course' : 'New course'}
      footer={<>{exists && <button className="btn danger" onClick={del}><Icon name="trash" size={16} /></button>}<span className="grow" /><button className="btn primary" onClick={save}>Save course</button></>}>
      <div className="stack">
        <div className="grid-2">
          <label className="field"><span>Course name</span><input className="input" value={c.name} placeholder="e.g. Pinecrest — Front Nine" onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
          <label className="field"><span>Tees</span><input className="input" value={c.tees || ''} placeholder="Blue" onChange={(e) => setC({ ...c, tees: e.target.value })} /></label>
        </div>
        <div className="card flat" style={{ background: 'var(--surface-2)' }}>
          <div className="row spread"><span style={{ fontWeight: 650 }}>GSPro difficulty <span className="display num" style={{ fontSize: 20, marginLeft: 6 }}>{Number(c.gspro ?? 5.8).toFixed(1)}</span></span><span className="muted" style={{ fontSize: 12.5 }}>→ slope {c.slope}</span></div>
          <input type="range" min="0" max="10" step="0.1" value={c.gspro ?? 5.8} onChange={(e) => setDiff(Number(e.target.value))} aria-label="GSPro difficulty" />
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8 }}>
            <label className="field"><span>Par</span><input className="input" value={par} readOnly /></label>
            <label className="field"><span>Slope</span><input className="input" inputMode="numeric" value={c.slope} onChange={(e) => setC({ ...c, slope: e.target.value })} /></label>
            <label className="field"><span>Course rating</span><input className="input" inputMode="decimal" value={c.rating} onChange={(e) => { setAuto(false); setC({ ...c, rating: e.target.value }); }} /></label>
          </div>
        </div>
        <div>
          <div className="hole-grid">
            <span className="lab">Hole</span>{c.holes.map((_, i) => <span key={i} className="hd">{i + 1}</span>)}
            <span className="lab">Par</span>{c.holes.map((h, i) => <input key={i} className="input" inputMode="numeric" aria-label={`Par hole ${i + 1}`} value={h.par} onChange={(e) => setHole(i, 'par', e.target.value)} />)}
            <span className="lab">SI</span>{c.holes.map((h, i) => <input key={i} className="input" inputMode="numeric" aria-label={`Stroke index hole ${i + 1}`} value={h.si} style={{ borderColor: siOk ? undefined : 'var(--red)' }} onChange={(e) => setHole(i, 'si', e.target.value)} />)}
          </div>
          <small className="muted" style={{ display: 'block', marginTop: 6 }}>Stroke index 1 = hardest hole, gets the first handicap stroke. Use 1–9 once each. For an 18-hole card's front nine, the odd indexes 1, 3, 5… usually map to 1–9 in order.</small>
        </div>
      </div>
    </Sheet>
  );
}
