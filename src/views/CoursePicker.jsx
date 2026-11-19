import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Sheet, Seg } from '../components/ui.jsx';
import { loadLibrary, searchCourses, scorecardImage, defaultPars, ninePar, nineFrom18, estimateFromDifficulty, courseFromLibrary, SGT_URL } from '../lib/courseLibrary.js';
import { uid } from '../lib/seed.js';

/** Card stroke indexes (1–18 or 1–9) for the chosen nine → 1–9 by difficulty order. */
export function rankIndexes(idx) {
  const v = idx.map((x, i) => [Number(x), i]);
  if (v.some(([x]) => !Number.isFinite(x) || x < 1)) return null;
  const out = Array(9); [...v].sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([, i], r) => { out[i] = r + 1; });
  return out;
}
const DEFAULT_SI = [1, 5, 9, 3, 7, 2, 8, 4, 6];
const DIFF = [{ value: 'any', label: 'Any' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Mid' }, { value: 'hard', label: 'Hard' }];
const HOLES = [{ value: 'any', label: 'All' }, { value: '18', label: '18-hole' }, { value: '9', label: '9-hole' }];

export const Credit = () => (
  <p className="muted course-credit" data-testid="course-credit">
    Course list courtesy of <a href={SGT_URL} target="_blank" rel="noopener">Simulator Golf Tour</a>. Styles and private-server courses from <a href="https://pakgolfstudios.com/gspro-course-list/" target="_blank" rel="noopener">PakGolf Studios</a>. Updated weekly.
  </p>
);

/**
 * Search the GSPro library, then set up one nine: pars, index, and rating/slope (estimated or from the card).
 * onPick(course) hands a ready league course to the course editor. Saved league courses with the same library id are offered first.
 */
export default function CoursePicker({ open, onClose, onPick, onManual, saved = [] }) {
  const [lib, setLib] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ holes: 'any', diff: 'any', kind: 'any' });
  const [sel, setSel] = useState(null);
  const input = useRef();
  useEffect(() => { if (!open) return; setSel(null); loadLibrary().then(setLib, (e) => setErr(e.message)); setTimeout(() => input.current?.focus(), 80); }, [open]);
  const res = useMemo(() => (lib ? searchCourses(lib, q, f, 60) : null), [lib, q, f]);
  if (!open) return null;
  if (sel) return <NineSetup course={sel} saved={saved} onBack={() => setSel(null)} onClose={onClose} onPick={onPick} />;
  return (
    <Sheet open onClose={onClose} wide title="Find a GSPro course" subtitle={lib ? `${lib.courses.length.toLocaleString()} courses · search name, place or designer` : 'Loading the course list…'}
      footer={<><button className="btn ghost" onClick={onManual} data-testid="course-manual"><Icon name="edit" size={16} /> Enter manually</button><span className="grow" /></>}>
      <div className="stack course-picker" data-testid="course-picker">
        <label className="search-box">
          <Icon name="search" size={17} />
          <input ref={input} className="input" type="search" placeholder="e.g. Pinehurst, Scotland, Tekbud" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search courses" data-testid="course-search" enterKeyHint="search" autoComplete="off" />
        </label>
        <div className="course-filters">
          <Seg options={HOLES} value={f.holes} onChange={(v) => setF({ ...f, holes: v })} />
          <Seg options={DIFF} value={f.diff} onChange={(v) => setF({ ...f, diff: v })} />
          <button className={`chip ${f.kind === 'real' ? 'on' : ''}`} onClick={() => setF({ ...f, kind: f.kind === 'real' ? 'any' : 'real' })} aria-pressed={f.kind === 'real'}>Real courses only</button>
        </div>
        {err && <div className="card flat warn-card">Couldn't load the course list ({err}). You can still <button className="linkish" onClick={onManual}>enter a course manually</button>.</div>}
        {!lib && !err && <div className="course-skel">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" />)}</div>}
        {res && <div className="muted" style={{ fontSize: 12 }} data-testid="course-count">{res.total ? `${res.total.toLocaleString()} match${res.total === 1 ? '' : 'es'}${res.total > res.results.length ? ` · top ${res.results.length}` : ''}${q ? '' : ' · most played first'}` : 'No courses match. Try fewer words, or check the spelling.'}</div>}
        {res && (
          <ul className="course-results" role="list">
            {res.results.map((c) => {
              const mine = saved.filter((s) => s.lib?.id === c.id);
              return (
                <li key={c.id}>
                  <button className="course-row" onClick={() => setSel(c)} data-testid="course-result">
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="cr-name ellipsis">{c.name}</div>
                      <div className="cr-meta ellipsis">{[c.loc, c.designer && `by ${c.designer}`].filter(Boolean).join(' · ')}</div>
                      <div className="cr-tags">
                        {c.nine && <span className="tag">9 holes</span>}
                        {c.fictional && <span className="tag">Fictional</span>}
                        {c.server && <span className="tag priv" title="Not on the public GSPro server">{c.server}</span>}
                        {c.styles.filter((s) => s !== 'fantasy').slice(0, 2).map((s) => <span key={s} className="tag">{s}</span>)}
                        {mine.length > 0 && <span className="tag mine"><Icon name="check" size={11} /> In your league</span>}
                      </div>
                    </div>
                    <div className="cr-num">
                      <div className="num"><span className="muted">Par</span> {c.par ?? '–'}</div>
                      <div className="cr-diff" title="GSPro difficulty (0–10)">{c.diff != null ? c.diff.toFixed(1) : '–'}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Credit />
      </div>
    </Sheet>
  );
}

function NineSetup({ course: c, saved, onBack, onClose, onPick }) {
  const [nine, setNine] = useState('front');
  const [par18, setPar18] = useState(c.par ?? 72);
  const p9 = c.nine ? (c.par ?? 36) : ninePar({ ...c, par: Number(par18) || c.par }, nine);
  const [pars, setPars] = useState(() => defaultPars(p9));
  const [idx, setIdx] = useState(DEFAULT_SI);
  const [source, setSource] = useState('estimated');
  const [tees, setTees] = useState('');
  const [r18, setR18] = useState('');
  const [s18, setS18] = useState('');
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => { setPars(defaultPars(p9)); }, [nine]); // eslint-disable-line
  const already = saved.find((s) => s.lib?.id === c.id && (s.lib.nine === nine || c.nine));
  const parSum = pars.reduce((a, b) => a + (Number(b) || 0), 0);
  const parsOk = pars.every((p) => Number(p) >= 3 && Number(p) <= 6);
  const si = rankIndexes(idx);
  const real = source === 'scorecard' ? nineFrom18({ rating18: r18, slope18: s18, par18, par9: parSum }) : null;
  const est = estimateFromDifficulty(c.diff, parSum);
  const v = real || est;
  const img = scorecardImage(c.id);
  const use = () => {
    const holes = pars.map((p, i) => ({ par: Number(p), si: si ? si[i] : DEFAULT_SI[i] }));
    onPick(courseFromLibrary(c, { nine, holes, tees, source: real ? 'scorecard' : 'estimated', rating18: r18, slope18: s18, par18, id: uid('c_') }));
  };
  const setAt = (arr, set, i, val) => { const x = arr.slice(); x[i] = val.replace(/\D/g, '').slice(0, 2); set(x); };
  const offset = nine === 'back' && !c.nine ? 9 : 0;
  return (
    <Sheet open onClose={onClose} wide title={c.name} subtitle={[c.loc, c.designer && `by ${c.designer}`].filter(Boolean).join(' · ')}
      footer={<><button className="btn" onClick={onBack}><Icon name="chev" size={16} style={{ transform: 'rotate(180deg)' }} /> Back</button><span className="grow" />
        <button className="btn primary" disabled={!parsOk || (source === 'scorecard' && !real)} onClick={use} data-testid="course-use"><Icon name="check" size={17} /> Use this course</button></>}>
      <div className="stack" data-testid="course-setup">
        {already && <div className="card flat note-card" data-testid="course-saved">
          <b>Already in your league:</b> {already.name} ({already.rating}/{already.slope}).
          <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => onPick({ ...already, _existing: true })}>Use the saved one</button>
        </div>}
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="tag">Par {c.par ?? '?'}</span><span className="tag">GSPro difficulty {c.diff ?? '?'}</span>
          {c.updated && <span className="tag">Updated {c.updated}</span>}{c.server && <span className="tag priv">{c.server} server</span>}
        </div>
        {img && imgOk && (
          <a className="sc-image" href={img} target="_blank" rel="noopener" data-testid="course-scorecard">
            <img src={img} alt={`${c.name} scorecard from Simulator Golf Tour`} loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
            <span className="sc-hint"><Icon name="search" size={13} /> Tap to zoom. Copy the par, index and your tee's rating / slope</span>
          </a>
        )}
        {(!img || !imgOk) && <div className="card flat muted" style={{ fontSize: 13 }}>No scorecard image for this course. Check the card in GSPro.</div>}

        {!c.nine && <div className="row spread wrap" style={{ gap: 8 }}>
          <span style={{ fontWeight: 650 }}>Which nine?</span>
          <Seg options={[{ value: 'front', label: 'Front 9' }, { value: 'back', label: 'Back 9' }]} value={nine} onChange={setNine} />
        </div>}

        <div>
          <div className="hole-grid">
            <span className="lab">Hole</span>{pars.map((_, i) => <span key={i} className="hd">{i + 1 + offset}</span>)}
            <span className="lab">Par</span>{pars.map((p, i) => <input key={i} className="input" inputMode="numeric" aria-label={`Par hole ${i + 1 + offset}`} value={p} onChange={(e) => setAt(pars, setPars, i, e.target.value)} style={{ borderColor: Number(p) >= 3 && Number(p) <= 6 ? undefined : 'var(--red)' }} />)}
            <span className="lab">Index</span>{idx.map((x, i) => <input key={i} className="input" inputMode="numeric" aria-label={`Card index hole ${i + 1 + offset}`} value={x} onChange={(e) => setAt(idx, setIdx, i, e.target.value)} />)}
          </div>
          <small className="muted" style={{ display: 'block', marginTop: 6 }}>
            Nine par <b className="num">{parSum}</b>{!c.nine && c.par ? ` of ${par18}` : ''}. Pars are a starting guess: copy them from the card. Type the card's <b>INDEX</b> as printed (1–18 is fine). Carry ranks it 1–9 for handicap strokes{si ? `: ${si.join(' ')}` : ''}.
          </small>
        </div>

        <div className="card flat" style={{ background: 'var(--surface-2)' }}>
          <Seg options={[{ value: 'estimated', label: 'Estimate' }, { value: 'scorecard', label: 'From the card' }]} value={source} onChange={setSource} />
          {source === 'estimated' ? (
            <p className="t2" style={{ fontSize: 13, margin: '10px 0 0' }} data-testid="course-estimate">
              <b>Estimated from GSPro difficulty</b> {c.diff ?? '5.8 (default)'}: slope <b className="num">{est.slope}</b>, rating <b className="num">{est.rating}</b>. Fine to start. Enter the real numbers from the card for fairer handicaps.
            </p>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
                <label className="field"><span>Tee</span><input className="input" value={tees} placeholder="Blue" onChange={(e) => setTees(e.target.value)} /></label>
                <label className="field"><span>18-hole rating</span><input className="input" inputMode="decimal" placeholder="75.0" value={r18} onChange={(e) => setR18(e.target.value)} data-testid="course-r18" /></label>
                <label className="field"><span>Slope</span><input className="input" inputMode="numeric" placeholder="139" value={s18} onChange={(e) => setS18(e.target.value)} data-testid="course-s18" /></label>
                {!c.nine && <label className="field"><span>18-hole par</span><input className="input" inputMode="numeric" value={par18} onChange={(e) => setPar18(e.target.value.replace(/\D/g, ''))} /></label>}
              </div>
              <p className="t2" style={{ fontSize: 12.5, margin: '8px 0 0' }} data-testid="course-nine-values">
                {real ? <>9-hole (WHS): rating <b className="num">{real.rating}</b> = {parSum} + ({r18} − {par18}) ÷ 2 · slope <b className="num">{real.slope}</b> (same as 18).</> : 'GSPro cards print rating / slope per tee, like 75.0/139.'}
              </p>
            </div>
          )}
        </div>
        <div className="row spread" style={{ fontSize: 13 }}><span className="muted">This nine will be saved as</span><b className="num">Par {parSum} · {v.rating} / {v.slope}</b></div>
        <Credit />
      </div>
    </Sheet>
  );
}
