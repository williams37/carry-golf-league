import { lazy, Suspense, useEffect, useState } from 'react';
import { Sheet, Icon, scoreClass, scoreWord, haptic, fmtHcp } from '../components/ui.jsx';
import { strokesOnHole, HOLES } from '../lib/golf.js';
import { PhotoLightbox, PhotoThumb } from './CardPhoto.jsx';

const ScanFlow = lazy(() => import('./ScanCard.jsx'));

/** Thumb-friendly hole-by-hole entry. Tap a score → auto-advance. Keyboard digits work too. */
export default function ScorePad({ open, onClose, entrant, course, onSave, readOnly, cloud, photoUrl, onDelete, onRemovePhoto, roster }) {
  const [holes, setHoles] = useState(() => entrant?.holes?.slice() || Array(HOLES).fill(null));
  const [cur, setCur] = useState(0);
  const [bump, setBump] = useState(0);
  const [scan, setScan] = useState(false);
  const [photo, setPhoto] = useState(null); // freshly scanned photo waiting for Save
  const [photoPrev, setPhotoPrev] = useState(null);
  const [viewing, setViewing] = useState(false);
  const [fromScan, setFromScan] = useState(false);
  useEffect(() => {
    if (!open || !entrant) return;
    const h = entrant.holes?.slice() || Array(HOLES).fill(null);
    setHoles(h);
    const firstEmpty = h.findIndex((x) => !(x > 0));
    setCur(firstEmpty === -1 ? 0 : firstEmpty);
    setScan(false); setPhoto(null); setFromScan(false); setViewing(false);
  }, [open, entrant?.key]); // eslint-disable-line
  useEffect(() => {
    if (!photo) { setPhotoPrev(null); return; }
    const u = URL.createObjectURL(photo); setPhotoPrev(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const setScore = (n) => {
    if (readOnly || scan) return;
    haptic();
    setHoles((h) => { const c = h.slice(); c[cur] = n; return c; });
    setBump((b) => b + 1);
    if (n != null) setTimeout(() => setCur((c) => Math.min(HOLES - 1, c + 1)), 140);
  };
  useEffect(() => {
    if (!open) return;
    const k = (e) => {
      if (scan || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) return;
      if (/^[1-9]$/.test(e.key)) setScore(Number(e.key));
      else if (e.key === '0') setScore(10);
      else if (e.key === 'Backspace') setScore(null);
      else if (e.key === 'ArrowRight') setCur((c) => Math.min(HOLES - 1, c + 1));
      else if (e.key === 'ArrowLeft') setCur((c) => Math.max(0, c - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line

  if (!entrant || !course) return null;
  const h = course.holes[cur];
  const strokes = course.holes.map((x) => strokesOnHole(entrant.ph, x.si));
  const filled = holes.filter((x) => x > 0);
  const gross = filled.reduce((a, b) => a + b, 0);
  const parSoFar = course.holes.reduce((a, x, i) => a + (holes[i] > 0 ? x.par : 0), 0);
  const toPar = gross - parSoFar;
  const complete = filled.length === HOLES;
  const val = holes[cur];
  const keys = Array.from({ length: 11 }, (_, i) => i + 1);

  const useScan = (h, blob) => {
    setHoles(h); setPhoto(blob); setScan(false); setFromScan(true);
    const firstEmpty = h.findIndex((x) => !(x > 0)); setCur(firstEmpty === -1 ? 0 : firstEmpty);
  };
  const title = <span className="row" style={{ gap: 8 }}>{entrant.name}{entrant.isSub && <span className="badge sub">Sub</span>}</span>;

  if (scan) return (
    <Sheet open={open} onClose={() => setScan(false)} title={<span className="row" style={{ gap: 8, minWidth: 0 }}><Icon name="scan" size={18} style={{ flex: 'none' }} /><span className="ellipsis">Scan card · {entrant.name}</span></span>} subtitle={`${course.name} · par ${course.holes.reduce((a, x) => a + x.par, 0)}`}>
      <Suspense fallback={<div className="scan-stage skeleton" />}>
        <ScanFlow entrant={entrant} course={course} cloud={cloud} roster={roster} onUse={useScan} onCancel={() => setScan(false)} />
      </Suspense>
    </Sheet>
  );

  return (
    <Sheet open={open} onClose={onClose}
      title={title}
      subtitle={`${course.name} · Playing handicap ${fmtHcp(entrant.ph)} (dots = strokes received)`}
      footer={readOnly ? <button className="btn block" onClick={onClose}>Close</button> : (
        <>
          {onDelete && entrant.entered > 0 ? <button className="btn ghost danger" aria-label="Delete card" onClick={() => { if (confirm(`Delete ${entrant.name}'s card${entrant.photo ? ' and its photo' : ''}?`)) onDelete(); }}><Icon name="trash" size={17} /></button>
            : <button className="btn ghost" onClick={onClose}>Cancel</button>}
          <button className="btn primary grow" onClick={() => onSave(holes, photo)} data-testid="pad-save">
            <Icon name="check" size={18} /> {complete ? `Save card · ${gross}` : `Save ${filled.length}/9 holes`}
          </button>
        </>
      )}>
      {(!readOnly || entrant.photo) && (
        <div className="pad-photo">
          {!readOnly && !photo && (
            <button className="scan-cta" onClick={() => setScan(true)} data-testid="scan-open">
              <span className="scan-cta-ic"><Icon name="camera" size={18} /></span>
              <span className="grow"><b>Scan the scorecard</b><small>Snap the bay screen, we'll fill in the holes</small></span>
              <Icon name="chev" size={16} />
            </button>
          )}
          {photo && (
            <div className="photo-pill" data-testid="photo-attached">
              {photoPrev && <img src={photoPrev} alt="" />}
              <span className="grow"><b>Photo attached</b><small>{fromScan ? 'Scores filled from the photo. Check them, then save.' : 'Saved with the card'}</small></span>
              <button className="icon-btn" onClick={() => setPhoto(null)} aria-label="Remove photo"><Icon name="x" size={16} /></button>
            </div>
          )}
          {!photo && entrant.photo && (
            <button className="photo-pill as-btn" onClick={() => setViewing(true)} data-testid="view-card">
              <PhotoThumb path={entrant.photo} photoUrl={photoUrl} size={40} />
              <span className="grow"><b>View card photo</b><small>{readOnly ? 'Proof of the round' : 'Attached to this card'}</small></span>
              <Icon name="chev" size={16} />
            </button>
          )}
        </div>
      )}
      {fromScan && <div className="scan-note"><Icon name="info" size={14} /> Filled from your photo. Tap any hole to fix it.</div>}
      <div className="pad-holes">
        {course.holes.map((x, i) => (
          <button key={i} className={`pad-hole ${i === cur ? 'on' : ''}`} onClick={() => setCur(i)} aria-label={`Hole ${i + 1}`}>
            {strokes[i] > 0 && <span className="strokes">{Array.from({ length: strokes[i] }).map((_, j) => <i key={j} />)}</span>}
            <span className="hn">{i + 1}</span>
            <span className={`hs cell ${scoreClass(holes[i], x.par)}`} style={{ height: 26, width: 26, background: 'transparent', fontSize: 15 }}>{holes[i] > 0 ? holes[i] : ''}</span>
            <span className="hn" style={{ fontWeight: 600 }}>P{x.par}</span>
          </button>
        ))}
      </div>

      <div className="pad-focus">
        <div>
          <div className="eyebrow">Hole {cur + 1} · Par {h.par} · SI {h.si}</div>
          <div className="t2" style={{ fontSize: 13, marginTop: 4 }}>
            {strokes[cur] > 0 ? `Gets ${strokes[cur]} stroke${strokes[cur] > 1 ? 's' : ''} here` : strokes[cur] < 0 ? 'Gives a stroke back here' : 'No stroke on this hole'}
          </div>
          <div className="row" style={{ marginTop: 10, gap: 14 }}>
            <div><div className="display num" style={{ fontSize: 22 }}>{gross || '–'}</div><div className="muted" style={{ fontSize: 11 }}>Gross</div></div>
            <div><div className="display num" style={{ fontSize: 22, color: toPar < 0 ? 'var(--birdie)' : undefined }}>{filled.length ? (toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar) : '–'}</div><div className="muted" style={{ fontSize: 11 }}>To par</div></div>
            <div><div className="display num" style={{ fontSize: 22 }}>{complete ? gross - entrant.ph : '–'}</div><div className="muted" style={{ fontSize: 11 }}>Net</div></div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div key={bump} className={`pad-big num ${bump ? 'pop' : ''}`}>{val > 0 ? val : '–'}</div>
          <div className="eyebrow" style={{ marginTop: 6, color: val > 0 && val - h.par < 0 ? 'var(--birdie)' : undefined }}>{val > 0 ? (val === 1 ? 'Ace!' : scoreWord(val - h.par)) : 'Tap a score'}</div>
        </div>
      </div>

      {!readOnly && (
        <div className="pad-keys">
          {keys.map((n) => {
            const d = n - h.par;
            const cls = d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : '';
            return (
              <button key={n} className={`key ${cls} ${val === n ? 'sel' : ''}`} onClick={() => setScore(n)}>
                <span className="kn num">{n}</span>
                <span className="kl">{n === 1 ? 'Ace' : Math.abs(d) <= 3 ? scoreWord(d) : `+${d}`}</span>
              </button>
            );
          })}
          <button className="key" onClick={() => setScore(null)} aria-label="Clear hole"><span className="kn"><Icon name="x" size={20} /></span><span className="kl">Clear</span></button>
        </div>
      )}
      <div className="row spread" style={{ marginTop: 12 }}>
        <button className="btn ghost sm" disabled={cur === 0} onClick={() => setCur(cur - 1)}><Icon name="chevL" size={16} /> Prev</button>
        <span className="muted num" style={{ fontSize: 12 }}>Hole {cur + 1} of 9</span>
        <button className="btn ghost sm" disabled={cur === HOLES - 1} onClick={() => setCur(cur + 1)}>Next <Icon name="chev" size={16} /></button>
      </div>
      <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', margin: '10px 0 0' }}>Your real score always counts for the league. Only your handicap caps a blow-up hole at net double bogey.</p>
      {viewing && <PhotoLightbox path={entrant.photo} photoUrl={photoUrl} title={entrant.name} onClose={() => setViewing(false)}
        onRemove={onRemovePhoto && !readOnly ? () => { if (confirm('Remove the photo from this card?')) { onRemovePhoto(); setViewing(false); } } : null} />}
    </Sheet>
  );
}
