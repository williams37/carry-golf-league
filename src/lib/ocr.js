// Browser OCR pipeline for GSPro-style scorecard photos. Everything runs on-device; Tesseract is
// lazy-loaded from self-hosted assets (public/ocr) the first time someone scans a card.
import { findHeader, layoutRows, assemble, parseText, flattenBlocks, numericToken, HOLES } from './scorecard.js';

const CDN = { worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js', core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0', lang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int' };
function assetPaths() {
  if (import.meta.env.MODE === 'single') return { workerPath: CDN.worker, corePath: CDN.core, langPath: CDN.lang };
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href.replace(/\/$/, '');
  return { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base };
}

let workerP = null;
let progressCb = null;
export function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', 1, {
        ...assetPaths(),
        logger: (m) => progressCb?.(m),
        errorHandler: (e) => console.warn('[ocr]', e),
      });
    })().catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}
export const warmUp = () => getWorker().catch(() => {});

/** Decode a File/Blob into a drawable, honoring EXIF orientation. */
export async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode(); return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
const dims = (img) => ({ w: img.width || img.naturalWidth, h: img.height || img.naturalHeight });

/** Rotated (90° steps) + cropped (normalized rect in rotated space) view, scaled so the long edge ≈ target. */
export function renderView(img, { rotate = 0, crop = null, target = 2000, maxUpscale = 4 } = {}) {
  const { w, h } = dims(img);
  const r = ((rotate % 360) + 360) % 360;
  const rw = r % 180 ? h : w, rh = r % 180 ? w : h;
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  const sx = c.x * rw, sy = c.y * rh, sw = Math.max(8, c.w * rw), sh = Math.max(8, c.h * rh);
  const scale = Math.min(maxUpscale, target / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.round(sw * scale); out.height = Math.round(sh * scale);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  ctx.translate(-sx, -sy);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  return out;
}

/** Luma + percentile stretch. Returns { gray: Uint8ClampedArray, w, h, dark } */
export function toGray(canvas) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const g = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) { const v = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000; g[j] = v; hist[g[j]]++; }
  const pct = (p) => { let acc = 0; const t = g.length * p; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
  const lo = pct(0.01), hi = Math.max(lo + 1, pct(0.99)), med = pct(0.5);
  const k = 255 / (hi - lo);
  for (let j = 0; j < g.length; j++) g[j] = (g[j] - lo) * k;
  return { gray: g, w, h, dark: med < 110 };
}

function grayCanvas({ gray, w, h }, { invert = false, blur = 0 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  for (let j = 0, i = 0; j < gray.length; j++, i += 4) { const v = invert ? 255 - gray[j] : gray[j]; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  if (!blur) return c;
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bx = b.getContext('2d'); bx.filter = `blur(${blur}px)`; bx.drawImage(c, 0, 0); return b;
}

/** Polarity-agnostic ink map: |pixel − local mean| (integral image), thresholded, ink=black on white. */
export function adaptiveInk({ gray, w, h }, win) {
  const r = Math.max(4, win | 0);
  const W = w + 1; const ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row; } }
  const dev = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0];
      const m = s / ((y1 - y0) * (x1 - x0));
      const d = Math.min(255, Math.abs(gray[y * w + x] - m) * 2); dev[y * w + x] = d; hist[d | 0]++;
    }
  }
  const t = Math.max(40, otsu(hist, w * h));
  const out = new Uint8ClampedArray(w * h);
  for (let j = 0; j < out.length; j++) out[j] = dev[j] > t ? 0 : 255;
  return { gray: out, w, h };
}

function otsu(hist, total) {
  let sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += i * hist[i]; const mB = sumB / wB, mF = (sumAll - sumB) / wF; const v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; t = i; }
  }
  return t;
}

async function recognize(canvas, params) {
  const worker = await getWorker();
  await worker.setParameters({ tessedit_char_whitelist: '', preserve_interword_spaces: '0', ...params });
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  return data;
}

/** Cut a cell (rotated to the header's angle) out of the gray image. */
function cutCell(src, cx, cy, w, h, angle) {
  const cw = Math.max(8, Math.round(w)), ch = Math.max(8, Math.round(h));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, cw, ch);
  ctx.translate(cw / 2, ch / 2); ctx.rotate(-angle); ctx.drawImage(src, -cx, -cy);
  const px = ctx.getImageData(0, 0, cw, ch).data; const g = new Uint8ClampedArray(cw * ch);
  for (let j = 0, i = 0; j < g.length; j++, i += 4) g[j] = px[i];
  return { gray: g, w: cw, h: ch };
}

/**
 * Per-cell ink: the background is whatever sits just above/below the glyph *inside* its cell (box colour,
 * card colour…), so white-on-red, black-on-white and white-on-dark all binarize the same way.
 */
export function cellInk({ gray, w, h }, charH, ring = 0.69) {
  const cx = w / 2, cy = h / 2, samples = [];
  for (const dy of [-ring - 0.03, -ring + 0.03, ring - 0.03, ring + 0.03]) {
    const y = Math.round(cy + dy * charH); if (y < 0 || y >= h) continue;
    for (let x = Math.round(cx - 0.55 * charH); x <= Math.round(cx + 0.55 * charH); x++) if (x >= 0 && x < w) samples.push(gray[y * w + x]);
  }
  samples.sort((a, b) => a - b);
  const bg = samples.length ? samples[samples.length >> 1] : 128;
  const hist = new Uint32Array(256); let n = 0;
  const x0 = Math.max(0, Math.round(cx - 1.3 * charH)), x1 = Math.min(w, Math.round(cx + 1.3 * charH));
  const y0 = Math.max(0, Math.round(cy - 0.6 * charH)), y1 = Math.min(h, Math.round(cy + 0.6 * charH));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[Math.min(255, Math.abs(gray[y * w + x] - bg))]++; n++; }
  let acc = 0, peak = 255; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.03) { peak = v; break; } }
  const t = Math.max(38, otsu(hist, n), peak * 0.5); // blur spreads ink: cut at half the stroke contrast
  const out = new Uint8ClampedArray(w * h);
  const soft = new Uint8ClampedArray(w * h);
  for (let j = 0; j < out.length; j++) { const d = Math.abs(gray[j] - bg); out[j] = d > t ? 0 : 255; soft[j] = 255 - Math.min(255, Math.max(0, ((d - t * 0.6) / Math.max(1, peak - t * 0.6)) * 255)); }
  return { gray: out, soft, w, h };
}

/** Connected components on an ink map (0 = ink). Keeps glyph-like blobs, drops frames/rings/specks/edges. */
export function glyphs(ink, charH) {
  const { gray, w, h } = ink; const lab = new Int32Array(w * h).fill(-1); const comps = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (gray[s] !== 0 || lab[s] !== -1) continue;
    const id = comps.length; const c = { x0: w, y0: h, x1: 0, y1: 0, n: 0, px: [] };
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop(); const x = p % w, y = (p / w) | 0; c.n++; c.px.push(p);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx; if (gray[q] === 0 && lab[q] === -1) { lab[q] = id; stack.push(q); }
      }
    }
    comps.push(c);
  }
  const touches = (c) => c.x0 <= 0 || c.y0 <= 0 || c.x1 >= w - 1 || c.y1 >= h - 1;
  const contains = (a, b) => a !== b && a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;
  let keep = comps.filter((c) => c.n >= Math.max(6, charH * charH * 0.03) && !touches(c));
  // A frame (box/ring) encloses a real glyph; a digit may enclose a speck. Only drop the former.
  keep = keep.filter((a) => !keep.some((b) => contains(a, b) && (b.y1 - b.y0) >= charH * 0.4 && b.n >= a.n * 0.12 && (a.y1 - a.y0) > (b.y1 - b.y0) * 1.25));
  keep = keep.filter((c) => { const ch = c.y1 - c.y0 + 1, cw = c.x1 - c.x0 + 1; return ch >= charH * 0.45 && ch <= charH * 1.9 && cw <= charH * 1.6; });
  if (!keep.length) return null;
  // Digits of one number share a baseline — drop blobs far from the tallest one's band.
  const ref = keep.reduce((a, b) => ((b.y1 - b.y0) > (a.y1 - a.y0) ? b : a));
  const midR = (ref.y0 + ref.y1) / 2;
  keep = keep.filter((c) => Math.abs((c.y0 + c.y1) / 2 - midR) < charH * 0.5);
  // nearest-to-center group (max 2 digits, adjacent)
  keep.sort((a, b) => a.x0 - b.x0);
  const cx = w / 2;
  const groups = []; for (const c of keep) { const g = groups[groups.length - 1]; if (g && c.x0 - g[g.length - 1].x1 < charH * 0.45) g.push(c); else groups.push([c]); }
  const dist = (g) => Math.abs((g[0].x0 + g[g.length - 1].x1) / 2 - cx);
  const best = groups.sort((a, b) => dist(a) - dist(b))[0];
  if (dist(best) > w * 0.38) return null;
  const span = best[best.length - 1].x1 - best[0].x0;
  return span <= charH * 2.8 ? best : null;
}

function glyphScore(comps, ink, charH) {
  const x0 = Math.min(...comps.map((c) => c.x0)), y0 = Math.min(...comps.map((c) => c.y0));
  const x1 = Math.max(...comps.map((c) => c.x1)), y1 = Math.max(...comps.map((c) => c.y1));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = comps.reduce((a, c) => a + c.n, 0) / (bw * bh);
  const off = Math.abs((x0 + x1) / 2 - ink.w / 2) / ink.w + Math.abs((y0 + y1) / 2 - ink.h / 2) / ink.h;
  const aspect = bw / bh / comps.length; // per digit ≈ 0.5–0.8
  return (fill > 0.15 && fill < 0.62 ? 2 : 0) + (aspect > 0.3 && aspect < 0.95 ? 1.5 : 0) + (bh < charH * 1.25 ? 1 : 0) - off * 4;
}

/** Paint glyph blobs as crisp black-on-white at a normalized height into ctx at (ox, oy). */
function paintGlyphs(ctx, ink, comps, ox, oy, targetH) {
  const x0 = Math.min(...comps.map((c) => c.x0)), y0 = Math.min(...comps.map((c) => c.y0));
  const x1 = Math.max(...comps.map((c) => c.x1)), y1 = Math.max(...comps.map((c) => c.y1));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1; const s = targetH / bh;
  const tmp = document.createElement('canvas'); tmp.width = bw; tmp.height = bh;
  const t = tmp.getContext('2d'); const id = t.createImageData(bw, bh); id.data.fill(255);
  // Soft edges (from the contrast map) inside a 1px-dilated component mask keep blurred digits legible.
  const mask = new Uint8Array(bw * bh);
  for (const c of comps) for (const p of c.px) { const x = (p % ink.w) - x0, y = ((p / ink.w) | 0) - y0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < bw && Y < bh) mask[Y * bw + X] = 1; } }
  let lo = 255; if (ink.soft) for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (mask[y * bw + x]) lo = Math.min(lo, ink.soft[(y + y0) * ink.w + x + x0]);
  const k = 255 / Math.max(1, 255 - lo);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (!mask[y * bw + x]) continue;
    const v = ink.soft ? (ink.soft[(y + y0) * ink.w + x + x0] - lo) * k : 0; const i = (y * bw + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
  }
  t.putImageData(id, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, ox - (bw * s) / 2, oy - targetH / 2, bw * s, targetH);
}

const letters = (s) => (String(s).match(/[a-z]/gi) || []).length / Math.max(1, String(s).replace(/\s/g, '').length);
const labelScore = (s) => (s ? letters(s) * 10 + Math.min(String(s).length, 14) / 2 + (/^[A-Z][a-z]+(\s[A-Z][a-z'"]+)*$/.test(s) ? 6 : 0) : -1);
/** Combine readings of the same table from several layout passes: best label, most confident cell. */
function mergeGrids(grids, charH) {
  const base = grids.reduce((a, b) => (b.length > a.length ? b : a));
  return base.map((row) => {
    const twins = grids.map((g) => g.find((r) => Math.abs(r.down - row.down) < charH)).filter(Boolean);
    const pickCell = (get, isTotal = false) => {
      let vals = twins.map(get).filter(Boolean);
      if (!isTotal) { const ok = vals.filter((v) => v.value >= 1 && v.value <= 15); if (ok.length) vals = ok; }
      if (!vals.length) return null;
      const votes = new Map(); for (const v of vals) votes.set(v.value, (votes.get(v.value) || 0) + 1);
      return vals.map((v) => ({ ...v, conf: Math.min(99, v.conf + (votes.get(v.value) - 1) * 8) })).sort((a, b) => b.conf - a.conf)[0];
    };
    const label = twins.map((t) => t.label).sort((a, b) => labelScore(b) - labelScore(a))[0] || '';
    const kinds = twins.map((t) => t.kind);
    const kind = ['par', 'skip', 'header'].find((k) => kinds.includes(k)) || (kinds.includes('player') ? 'player' : row.kind);
    return { label, kind, down: row.down, holes: row.holes.map((_, k) => pickCell((t) => t.holes[k])), total: pickCell((t) => t.total, true) };
  });
}

const SLOT_W = 150, SLOT_H = 110, GLYPH_H = 52;

/**
 * Read the grid: cut every cell, extract its glyphs, re-render a clean table, OCR it once (digits only).
 * Returns rows [{label, kind, holes:[{value,conf}], total:{value,conf}|null}] plus the clean canvas.
 */
async function readGrid(view, gray, header, rows) {
  const angle = Math.atan2(header.dir.y, header.dir.x);
  const charH = header.charH;
  const cols = HOLES + 1;
  const sheet = document.createElement('canvas'); sheet.width = SLOT_W * cols + 40; sheet.height = SLOT_H * rows.length + 40;
  const sx = sheet.getContext('2d'); sx.fillStyle = '#fff'; sx.fillRect(0, 0, sheet.width, sheet.height);
  const src = grayCanvas(gray);
  const present = rows.map(() => Array(cols).fill(false));
  const extract = (p, ci, r) => {
    const wide = ci === HOLES ? 1.25 : 1;
    const cell = cutCell(src, p.x, p.y, Math.min(r.w * wide, charH * 3.4 * wide), Math.min(r.h, charH * 2.3), angle);
    // Several background hypotheses (glyph inside a small box vs. on open card); keep the most digit-like.
    let ink = null, g = null, bestS = -Infinity;
    for (const ring of [0.69, 0.52, 0.4, 0.88]) {
      const k = cellInk(cell, charH, ring); const gg = glyphs(k, charH); if (!gg) continue;
      const sc = glyphScore(gg, k, charH); if (sc > bestS) { bestS = sc; ink = k; g = gg; }
    }
    if (!g) return null;
    const cy = (Math.min(...g.map((c) => c.y0)) + Math.max(...g.map((c) => c.y1))) / 2 - ink.h / 2;
    return { ink, g, dy: cy };
  };
  rows.forEach((r, ri) => {
    let pts = [...r.cells, r.total];
    let got = pts.map((p, ci) => extract(p, ci, r));
    // Re-centre the row on its glyphs (row positions from labels drift a few px), then read again.
    const dys = got.filter(Boolean).map((x) => x.dy).sort((a, b) => a - b);
    const shift = dys.length >= 4 ? dys[dys.length >> 1] : 0;
    if (Math.abs(shift) > charH * 0.1) {
      const nx = -Math.sin(angle) * shift, ny = Math.cos(angle) * shift;
      pts = pts.map((p) => ({ x: p.x + nx, y: p.y + ny }));
      const again = pts.map((p, ci) => extract(p, ci, r));
      got = got.map((g0, ci) => again[ci] || g0);
    }
    got.forEach((x, ci) => {
      if (!x) return;
      present[ri][ci] = true;
      paintGlyphs(sx, x.ink, x.g, 20 + SLOT_W * ci + SLOT_W / 2, 20 + SLOT_H * ri + SLOT_H / 2, GLYPH_H);
    });
  });
  const data = await recognize(sheet, { tessedit_pageseg_mode: '6', tessedit_char_whitelist: '0123456789' });
  const out = rows.map((r) => ({ label: r.label, kind: r.kind, holes: Array(HOLES).fill(null), total: null }));
  for (const l of flattenBlocks(data.blocks)) for (const w of l.words) for (const s of splitWord(w)) {
    const cx = (s.bbox.x0 + s.bbox.x1) / 2 - 20, cy = (s.bbox.y0 + s.bbox.y1) / 2 - 20;
    const ci = Math.floor(cx / SLOT_W), ri = Math.floor(cy / SLOT_H);
    if (ri < 0 || ri >= rows.length || ci < 0 || ci >= cols) continue;
    const n = numericToken(s.text); if (!n) continue;
    const cell = { value: +n, conf: s.conf };
    const prev = ci === HOLES ? out[ri].total : out[ri].holes[ci];
    const merged = prev ? { value: +(String(prev.value) + n), conf: Math.min(prev.conf, s.conf) } : cell;
    if (ci === HOLES) out[ri].total = merged; else out[ri].holes[ci] = merged;
  }
  // Retry cells that had ink but no reading, one at a time (single-word mode).
  for (let ri = 0; ri < rows.length; ri++) for (let ci = 0; ci < cols; ci++) {
    const have = ci === HOLES ? out[ri].total : out[ri].holes[ci];
    if (have || !present[ri][ci]) continue;
    const one = document.createElement('canvas'); one.width = SLOT_W + 40; one.height = SLOT_H + 40;
    const ox = one.getContext('2d'); ox.fillStyle = '#fff'; ox.fillRect(0, 0, one.width, one.height);
    ox.drawImage(sheet, 20 + SLOT_W * ci, 20 + SLOT_H * ri, SLOT_W, SLOT_H, 20, 20, SLOT_W, SLOT_H);
    const d = await recognize(one, { tessedit_pageseg_mode: '8', tessedit_char_whitelist: '0123456789' });
    const n = numericToken((d.text || '').trim());
    if (n) { const v = { value: +n, conf: (d.confidence || 50) * 0.9 }; if (ci === HOLES) out[ri].total = v; else out[ri].holes[ci] = v; }
  }
  return { rows: out, sheet };
}

// A word spanning two slots (Tesseract joined neighbours) → per-symbol pieces.
function splitWord(w) {
  if (!w.symbols?.length || w.symbols.length === 1) return [{ text: w.text, conf: w.conf, bbox: w.bbox }];
  const span = w.bbox.x1 - w.bbox.x0;
  if (span < SLOT_W * 0.8) return [{ text: w.text, conf: w.conf, bbox: w.bbox }];
  return w.symbols.map((s) => ({ text: s.text, conf: s.conf, bbox: s.bbox }));
}

/**
 * Full scan. opts: { rotate, crop, coursePar, onProgress(stage, pct) }
 * Returns { players, par, method, preview: dataURL of the clean re-render, ms }
 */
export async function scanScorecard(img, opts = {}) {
  const { rotate = 0, crop = null, coursePar = null, onProgress } = opts;
  const t0 = performance.now();
  const step = (stage, pct) => onProgress?.(stage, pct);
  progressCb = (m) => { if (m.status === 'loading language traineddata' || m.status === 'loading tesseract core') step('Loading reader', Math.round((m.progress || 0) * 30)); };
  step('Loading reader', 2);
  await getWorker();
  step('Preparing photo', 32);
  const view = renderView(img, { rotate, crop });
  const gray = toGray(view);
  const attempts = [
    () => grayCanvas(gray, { invert: gray.dark }),
    () => grayCanvas(gray, { invert: gray.dark, blur: 1.2 }),
    () => grayCanvas(adaptiveInk(gray, Math.max(8, Math.min(gray.w, gray.h) / 60))),
    () => grayCanvas(gray, { invert: gray.dark, blur: 2.4 }),
  ];
  let best = null;
  const grids = [];
  const debug = [];
  for (let a = 0; a < attempts.length; a++) {
    step('Finding the scorecard', 38 + a * 14);
    const data = await recognize(attempts[a](), { tessedit_pageseg_mode: '6' });
    const lines = flattenBlocks(data.blocks);
    const header = findHeader(lines);
    debug.push({ attempt: a, header: header && { found: header.found, spacing: Math.round(header.spacing), charH: Math.round(header.charH), cols: header.cols.map((c) => [Math.round(c.x), Math.round(c.y)]) }, text: data.text });
    if (header) {
      const rows = layoutRows(lines, header).filter((r) => r.kind !== 'header');
      if (rows.length) {
        step('Reading scores', 80);
        const grid = await readGrid(view, gray, header, rows);
        grids.push(grid.rows.map((r, k) => ({ ...r, down: rows[k].down })));
        const res = assemble(mergeGrids(grids, header.charH), { coursePar });
        debug[debug.length - 1].rows = rows.map((r) => ({ label: r.label, kind: r.kind, down: Math.round(r.down) }));
        debug[debug.length - 1].grid = grid.rows.map((r) => r.holes.map((h) => h?.value ?? '·').join(',') + ' | ' + (r.total?.value ?? '·'));
        const q = res.players.length ? Math.max(...res.players.map((p) => p.quality)) : 0;
        best = { ...res, method: 'grid', quality: q, preview: grid.sheet, table: tableCorners(header, rows) }; // merged result supersedes earlier passes
        const missing = res.players.some((p) => p.flags.some(Boolean)) || res.players.some((p) => p.totalOk === null);
        if (q >= 80 && !missing) break;
        continue;
      }
    }
    if (best?.method === 'grid') continue;
    const res = parseText(lines.map((l) => ({ text: l.text, words: l.words.map((w) => ({ text: w.text, conf: w.conf })) })), { coursePar });
    const q = res.players.length ? Math.max(...res.players.map((p) => p.quality)) * 0.85 : 0;
    if (!best || q > best.quality) best = { ...res, method: 'text', quality: q, preview: null };
  }
  // Auto-zoom: if the table is small in the frame, re-read just that region at higher resolution.
  if (!opts._zoomed && best?.table) {
    const z = zoomCrop(best.table, view, crop);
    if (z) {
      step('Zooming in', 86);
      const again = await scanScorecard(img, { ...opts, crop: z, _zoomed: true, onProgress: (st, pc) => step(st, Math.min(99, 86 + pc / 8)) });
      debug.push({ zoom: z, zoomQuality: again.quality, baseQuality: best.quality, zoomPlayers: again.players.length, zoomDebug: again.debug.map(({ text, ...r }) => r) });
      if (evidence(again) >= evidence(best)) { again.debug = [...debug, ...again.debug]; again.zoom = z; again.ms = Math.round(performance.now() - t0); return again; }
    }
  }
  step('Done', 100);
  progressCb = null;
  return { ...(best || { players: [], par: null, method: 'none', quality: 0 }), ms: Math.round(performance.now() - t0), debug };
}

/** Structural evidence a read is right: cells read, OUT checksums that match, few flags. */
const evidence = (r) => (r?.players || []).reduce((a, p) => a + p.holes.filter((v) => v != null).length + (p.totalOk ? 6 : p.totalOk === false ? -1 : 0) - p.flags.filter(Boolean).length * 0.5, 0);

function tableCorners(header, rows) {
  const { cols, spacing, dir, charH, out } = header; const last = rows[rows.length - 1];
  const down = (last?.down || charH * 3) + charH * 3, n = { x: -dir.y, y: dir.x };
  const left = { x: cols[0].x - dir.x * spacing * 4.6, y: cols[0].y - dir.y * spacing * 4.6 };
  const right = { x: out.x + dir.x * spacing * 1.6, y: out.y + dir.y * spacing * 1.6 };
  const up = charH * 3;
  return [left, right].flatMap((p) => [{ x: p.x - n.x * up, y: p.y - n.y * up }, { x: p.x + n.x * down, y: p.y + n.y * down }]);
}

/** Normalized crop (in rotated-image space) around the detected table, or null if already tight. */
function zoomCrop(t, view, crop) {
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  const xs = t.map((p) => p.x), ys = t.map((p) => p.y);
  let x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(view.width, Math.max(...xs));
  let y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(view.height, Math.max(...ys));
  if ((x1 - x0) / view.width > 0.72 && (y1 - y0) / view.height > 0.6) return null;
  return { x: c.x + (x0 / view.width) * c.w, y: c.y + (y0 / view.height) * c.h, w: ((x1 - x0) / view.width) * c.w, h: ((y1 - y0) / view.height) * c.h };
}

/** Compress a photo for storage: long edge ≤ maxEdge, WebP (JPEG fallback), stepping quality to fit ~maxBytes. */
export async function compressPhoto(img, { rotate = 0, maxEdge = 1600, maxBytes = 160_000 } = {}) {
  const { w, h } = dims(img);
  const long = (rotate % 180 ? h : w) > (rotate % 180 ? w : h) ? Math.max(w, h) : Math.max(w, h);
  const c = renderView(img, { rotate, target: Math.min(maxEdge, long), maxUpscale: 1 });
  const toBlob = (type, q) => new Promise((res) => c.toBlob(res, type, q));
  let type = 'image/webp';
  let blob = await toBlob(type, 0.8);
  if (!blob || blob.type !== 'image/webp') { type = 'image/jpeg'; blob = await toBlob(type, 0.8); }
  for (const q of [0.7, 0.6, 0.5, 0.42]) { if (blob.size <= maxBytes) break; blob = await toBlob(type, q); }
  if (blob.size > maxBytes * 1.6) { // very detailed photo: shrink further
    const s = document.createElement('canvas'); s.width = Math.round(c.width * 0.75); s.height = Math.round(c.height * 0.75);
    s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
    blob = await new Promise((res) => s.toBlob(res, type, 0.6));
  }
  return blob;
}
