import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui.jsx';
import { pickRow, HOLES } from '../lib/scorecard.js';

const FULL = { x: 0, y: 0, w: 1, h: 1 };
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);

/**
 * Scorecard photo → scores. Lives inside the ScorePad sheet (no nested sheets).
 * Steps: pick → adjust (rotate/crop) → reading → review. Nothing is saved here: "Use these scores"
 * hands the holes (and the compressed photo) back to the pad, where the player still taps Save.
 */
/** Roster name when matched, a clean OCR name otherwise, else "Row N". Never raw OCR noise. */
const rowName = (r, k) => r.display || `Row ${k + 1}`;

export default function ScanFlow({ entrant, course, cloud, roster = [], onUse, onCancel }) {
  const [step, setStep] = useState('pick');
  const [file, setFile] = useState(null);
  const [img, setImg] = useState(null);
  const [rotate, setRotate] = useState(0);
  const [crop, setCrop] = useState(FULL);
  const [preview, setPreview] = useState(null); // dataURL of rotated view (for the cropper)
  const [progress, setProgress] = useState({ stage: '', pct: 0 });
  const [result, setResult] = useState(null);
  const [row, setRow] = useState(-1);
  const [cells, setCells] = useState(Array(HOLES).fill(null));
  const [attach, setAttach] = useState(true);
  const [error, setError] = useState(null);
  const ocr = useRef(null);
  const cam = useRef(), gal = useRef();
  const coursePar = course.holes.map((h) => h.par);

  const lib = () => (ocr.current ||= import('../lib/ocr.js'));

  const onFile = async (f) => {
    if (!f) return;
    setError(null);
    try {
      const m = await lib();
      m.warmUp(); // start fetching the reader while the user frames the card
      const im = await m.loadImage(f);
      setFile(f); setImg(im); setRotate(0); setCrop(FULL); setStep('adjust');
    } catch (e) { setError("That file couldn't be opened as a photo. Try a JPG or PNG."); }
  };

  useEffect(() => {
    if (!img) return;
    let off = false;
    lib().then((m) => { if (off) return; const c = m.renderView(img, { rotate, target: 1100, maxUpscale: 1 }); setPreview(c.toDataURL('image/jpeg', 0.85)); });
    return () => { off = true; };
  }, [img, rotate]);

  const read = async () => {
    setStep('reading'); setProgress({ stage: 'Loading reader', pct: 2 });
    try {
      const m = await lib();
      const r = await m.scanScorecard(img, { rotate, crop: isFull(crop) ? null : crop, coursePar, roster, onProgress: (stage, pct) => setProgress({ stage, pct }) });
      if (!r.players.length) { setError('nothing'); setStep('error'); return; }
      setResult(r);
      const k = pickRow(r.players, entrant.name, entrant.key);
      choose(r, k);
      setStep('review');
    } catch (e) {
      console.error(e);
      setError(navigator.onLine === false ? 'offline' : 'failed'); setStep('error');
    }
  };
  const choose = (r, k) => { setRow(k); setCells(k >= 0 ? r.players[k].holes.slice() : Array(HOLES).fill(null)); };

  const use = async () => {
    let blob = null;
    if (attach && img) { try { blob = await (await lib()).compressPhoto(img, { rotate }); } catch {} }
    onUse(cells.map((v) => (v >= 1 && v <= 15 ? v : null)), blob);
  };

  // ---------- render ----------
  if (step === 'pick') return (
    <div className="scan" data-testid="scan-pick">
      <div className="scan-drop">
        <div className="scan-art" aria-hidden><Icon name="scan" size={34} /></div>
        <div className="scan-title">Snap the bay screen</div>
        <p className="muted">Take a photo of the scorecard at the end of your round. Carry reads the hole-by-hole scores on your phone and fills in your card.</p>
        <div className="scan-btns">
          <button className="btn primary" onClick={() => cam.current.click()}><Icon name="camera" size={18} /> Take photo</button>
          <button className="btn" onClick={() => gal.current.click()}><Icon name="image" size={18} /> Choose photo</button>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files[0])} data-testid="scan-camera" />
        <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files[0])} data-testid="scan-file" />
      </div>
      {error && <div className="banner err" style={{ marginTop: 10 }}><Icon name="info" size={18} /><span>{error}</span></div>}
      <ul className="scan-tips">
        <li><b>Fill the frame</b> with the scorecard, straight on if you can</li>
        <li><b>Tilt a little</b> to dodge glare from the projector or lights</li>
        <li><b>Hold steady</b>: a sharp photo reads best</li>
      </ul>
      <p className="muted scan-privacy"><Icon name="lock" size={13} /> Read on your phone, nothing is sent anywhere to read it. {cloud ? 'If you attach the photo, it is stored privately for your league.' : 'An attached photo stays on this device.'}</p>
      <button className="btn ghost block" onClick={onCancel}>Enter scores manually</button>
    </div>
  );

  if (step === 'adjust') return (
    <div className="scan" data-testid="scan-adjust">
      <div className="row spread" style={{ marginBottom: 8 }}>
        <div className="eyebrow">Frame the scorecard</div>
        <div className="row" style={{ gap: 6 }}>
          {!isFull(crop) && <button className="btn xs ghost" onClick={() => setCrop(FULL)}>Reset</button>}
          <button className="btn xs" onClick={() => { setRotate((r) => (r + 90) % 360); setCrop(FULL); }} aria-label="Rotate 90°"><Icon name="rotate" size={15} /> Rotate</button>
        </div>
      </div>
      {preview ? <Cropper src={preview} crop={crop} onChange={setCrop} /> : <div className="scan-stage skeleton" />}
      <p className="muted" style={{ fontSize: 12, margin: '8px 2px 12px' }}>Drag the corners around the score table. Optional: Carry finds the table by itself, but a tight frame helps with busy photos.</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => { setStep('pick'); setImg(null); setPreview(null); }}><Icon name="camera" size={16} /> Retake</button>
        <button className="btn primary grow" onClick={read} data-testid="scan-read"><Icon name="scan" size={18} /> Read scores</button>
      </div>
    </div>
  );

  if (step === 'reading') return (
    <div className="scan" data-testid="scan-reading">
      <div className="scan-stage reading">
        {preview && <img src={preview} alt="" style={cropStyle(crop)} />}
        <div className="scan-beam" />
      </div>
      <div className="scan-progress"><i style={{ width: `${Math.max(4, progress.pct)}%` }} /></div>
      <div className="row spread" style={{ marginTop: 8 }}>
        <span className="t2" style={{ fontSize: 13, fontWeight: 600 }}>{progress.stage}…</span>
        <span className="muted num" style={{ fontSize: 12 }}>{Math.round(progress.pct)}%</span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>The first scan downloads the reader (about 7 MB). After that it works offline.</p>
    </div>
  );

  if (step === 'error') return (
    <div className="scan" data-testid="scan-error">
      <div className="scan-drop" style={{ borderStyle: 'solid' }}>
        <div className="scan-art warn" aria-hidden><Icon name="info" size={30} /></div>
        <div className="scan-title">{error === 'offline' ? "You're offline" : "Couldn't read that card"}</div>
        <p className="muted">{error === 'offline'
          ? 'The first scan needs a connection to download the reader. Enter your scores by hand for now.'
          : 'Carry looks for the HOLE 1–9 row and the score rows under it. Try a straighter, closer photo with less glare, or frame just the table.'}</p>
        <div className="scan-btns">
          <button className="btn" onClick={() => setStep(img ? 'adjust' : 'pick')}><Icon name="scan" size={16} /> Adjust & retry</button>
          <button className="btn" onClick={() => { setStep('pick'); setImg(null); }}><Icon name="camera" size={16} /> New photo</button>
        </div>
      </div>
      <button className="btn ghost block" style={{ marginTop: 10 }} onClick={onCancel}>Enter scores manually</button>
    </div>
  );

  // review
  const p = row >= 0 ? result.players[row] : null;
  const total = sum(cells);
  const complete = cells.every((v) => v >= 1);
  const out = p?.total ?? null;
  const parRead = result.par && result.par.every(Boolean) ? sum(result.par) : null;
  // One misread par digit isn't worth a warning; a different total or 2+ holes off is.
  const parOff = result.par ? result.par.filter((v, k) => v && v !== coursePar[k]).length : 0;
  const parMismatch = parOff >= 2 || (parRead != null && parRead !== sum(coursePar));
  const flagged = p ? p.flags.filter(Boolean).length : 0;
  return (
    <div className="scan" data-testid="scan-review">
      <div className="scan-head">
        <div className="scan-thumb">{preview && <img src={preview} alt="Your scorecard photo" style={cropStyle(crop)} />}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="eyebrow">{result.players.length > 1 ? `${result.players.length} rows found` : 'Card read'}</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{p ? rowName(p, row) : 'Whose row is yours?'}</div>
          <div className="muted" style={{ fontSize: 12 }}>{p ? (flagged ? `${flagged} hole${flagged > 1 ? 's' : ''} to double-check` : 'Everything looks right, but check it anyway') : 'Tap your name below'}</div>
        </div>
      </div>

      {result.players.length > 1 && (
        <div className="chips scan-rows" role="tablist" aria-label="Rows on the card">
          {result.players.map((r, k) => (
            <button key={k} className={`chip ${k === row ? 'on' : ''}`} onClick={() => choose(result, k)} data-testid="scan-row">
              <span className="chip-name">{rowName(r, k)}</span>{sum(r.holes) ? <span className="num chip-total"> · {sum(r.holes)}</span> : null}
            </button>
          ))}
        </div>
      )}

      <div className="scan-cells" data-testid="scan-cells">
        {cells.map((v, k) => {
          const f = p?.flags[k];
          const d = v - coursePar[k];
          return (
            <label key={k} className={`scan-cell ${f ? 'flag ' + f : ''} ${v >= 1 ? (d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'dbl') : ''}`}>
              <span className="hn">{k + 1}</span>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={2} value={v ?? ''} aria-label={`Hole ${k + 1}`}
                onFocus={(e) => e.target.select()}
                onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setCells((c) => { const x = c.slice(); x[k] = Number.isFinite(n) && n > 0 ? Math.min(15, n) : null; return x; }); }} />
              <span className="hn">P{coursePar[k]}</span>
            </label>
          );
        })}
      </div>

      <div className="scan-check">
        <div><div className="display num" style={{ fontSize: 22 }}>{complete ? total : `${cells.filter(Boolean).length}/9`}</div><div className="muted" style={{ fontSize: 11 }}>{complete ? 'Total' : 'Holes read'}</div></div>
        <div className="grow t2" style={{ fontSize: 12.5 }}>
          {out != null && complete && (out === total
            ? <span className="ok"><Icon name="check" size={14} /> Matches the card's OUT total ({out})</span>
            : <span className="warn"><Icon name="info" size={14} /> The card's OUT total says {out}. Check the highlighted holes.</span>)}
          {out == null && complete && <span>Compare with the total on the screen before you use it.</span>}
          {!complete && <span className="warn">Fill in the empty holes by hand.</span>}
          {parMismatch && <div className="scan-note" data-testid="par-note"><Icon name="info" size={13} /> Heads up: this card shows par {parRead ?? '—'}, and {course.name} is set to par {sum(coursePar)}. Your scores are fine either way. If the card is from another course, check you picked the right week.</div>}
        </div>
      </div>

      <label className="scan-attach">
        <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
        <span><b>Attach the photo</b> as proof. {cloud ? 'Only your league can see it.' : 'Kept on this device.'}</span>
      </label>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={() => setStep('adjust')}><Icon name="scan" size={16} /> Re-read</button>
        <button className="btn primary grow" disabled={!cells.some(Boolean)} onClick={use} data-testid="scan-use"><Icon name="check" size={18} /> Use these scores</button>
      </div>
      <button className="btn ghost block" style={{ marginTop: 6 }} onClick={onCancel}>Enter manually instead</button>
    </div>
  );
}

const isFull = (c) => c.x <= 0.001 && c.y <= 0.001 && c.w >= 0.999 && c.h >= 0.999;
// Show only the cropped region of an image inside an overflow:hidden box.
const cropStyle = (c) => (isFull(c) ? { width: '100%', height: '100%', objectFit: 'cover' } : {
  position: 'absolute', width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%`, maxWidth: 'none',
});

/** Drag-to-crop: move the frame, or pull any corner. Coordinates are 0..1 of the (rotated) photo. */
function Cropper({ src, crop, onChange }) {
  const box = useRef();
  const drag = useRef(null);
  const down = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: crop };
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const r = box.current.getBoundingClientRect();
    const dx = (e.clientX - d.x) / r.width, dy = (e.clientY - d.y) / r.height;
    let { x, y, w, h } = d.start; const min = 0.08;
    if (d.mode === 'move') { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h); }
    else {
      if (d.mode.includes('l')) { const nx = clamp(x + dx, 0, x + w - min); w += x - nx; x = nx; }
      if (d.mode.includes('r')) w = clamp(w + dx, min, 1 - x);
      if (d.mode.includes('t')) { const ny = clamp(y + dy, 0, y + h - min); h += y - ny; y = ny; }
      if (d.mode.includes('b')) h = clamp(h + dy, min, 1 - y);
    }
    onChange({ x, y, w, h });
  };
  const up = () => { drag.current = null; };
  const pct = (v) => `${v * 100}%`;
  return (
    <div className="cropper" ref={box} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="cropper">
      <img src={src} alt="Scorecard photo" draggable={false} />
      <div className="crop-frame" style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }} onPointerDown={down('move')}>
        {['tl', 'tr', 'bl', 'br'].map((m) => <span key={m} className={`crop-h ${m}`} onPointerDown={down(m)} />)}
        <i className="crop-grid" />
      </div>
    </div>
  );
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

