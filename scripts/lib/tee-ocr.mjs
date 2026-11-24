// Read the per-tee "rating/slope" header off a GSPro GreenKeeper scorecard image (the template SGT publishes).
// Layout (fractions of the image, identical across card sizes): tee columns start at x≈0.215 with a ≈0.066 pitch,
// the rating/slope row sits at y≈0.178–0.207 and the tee-name row at y≈0.212–0.248.
// Each cell is binarized on its own (the cells have different background colours), then all cells are stacked
// into one image: one line per tee, "<rating/slope>  <NAME>", so a card is a single OCR call.
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export const GEOM = { x0: 0.2155, pitch: 0.0661, cols: 8, cellW: 0.056, inset: 0.003, val: [0.180, 0.205], name: [0.219, 0.244] };

const SCALE_H = 64; // target cell height in px for OCR

function crop(img, x0, y0, x1, y1) {
  const W = img.width, out = { width: x1 - x0, height: y1 - y0, g: new Float32Array((x1 - x0) * (y1 - y0)) };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4; out.g[(y - y0) * out.width + (x - x0)] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  }
  return out;
}
function otsu(g) {
  const h = new Array(256).fill(0); for (const v of g) h[Math.max(0, Math.min(255, v | 0))]++;
  const n = g.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
  let sB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) { wB += h[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * h[i];
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; t = i; } }
  return { t, spread: best / (n * n) };
}
/** Cell → black text on white, scaled to SCALE_H tall. Returns null when the cell is flat (no text). */
function cellBits(c, scaleH = SCALE_H) {
  const { t, spread } = otsu(c.g);
  if (spread < 120) return null; // flat colour: empty cell
  let dark = 0; for (const v of c.g) if (v <= t) dark++;
  const textDark = dark < c.g.length / 2; // minority class is the text
  // a rule line or a cell border is not text: require ink on enough distinct rows AND columns
  const isInk = (v) => (textDark ? v <= t : v > t);
  let inkRows = 0, inkCols = 0;
  for (let y = 0; y < c.height; y++) { let k = 0; for (let x = 0; x < c.width; x++) if (isInk(c.g[y * c.width + x])) k++; if (k > 0 && k < c.width * 0.9) inkRows++; }
  for (let x = 0; x < c.width; x++) { let k = 0; for (let y = 0; y < c.height; y++) if (isInk(c.g[y * c.width + x])) k++; if (k > 0 && k < c.height * 0.9) inkCols++; }
  if (inkRows < c.height * 0.3 || inkCols < c.width * 0.2) return null;
  // bilinear upscale of the grey cell, then threshold: smooth glyph edges (nearest-neighbour turned 5→6, 7→2)
  const H2 = scaleH, s = H2 / c.height, w = Math.round(c.width * s), out = new Uint8Array(w * H2);
  const at = (x, y) => c.g[Math.max(0, Math.min(c.height - 1, y)) * c.width + Math.max(0, Math.min(c.width - 1, x))];
  for (let y = 0; y < H2; y++) for (let x = 0; x < w; x++) {
    const fy = (y + 0.5) / s - 0.5, fx = (x + 0.5) / s - 0.5, y0 = Math.floor(fy), x0 = Math.floor(fx), dy = fy - y0, dx = fx - x0;
    const v = (at(x0, y0) * (1 - dx) + at(x0 + 1, y0) * dx) * (1 - dy) + (at(x0, y0 + 1) * (1 - dx) + at(x0 + 1, y0 + 1) * dx) * dy;
    const isText = textDark ? v <= t : v > t; out[y * w + x] = isText ? 0 : 255;
  }
  return { w, h: H2, px: out };
}

export function decode(buf) { return jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024, formatAsRGBA: true }); }

/** Build the stacked OCR image for a card. Returns { png, lines: number } or null if no tee columns are present. */
export function teeStrip(img, scaleH = SCALE_H) {
  const W = img.width, H = img.height, rows = [];
  for (let k = 0; k < GEOM.cols; k++) {
    const x0 = Math.round((GEOM.x0 + GEOM.inset + k * GEOM.pitch) * W), x1 = Math.round((GEOM.x0 + GEOM.inset + k * GEOM.pitch + GEOM.cellW) * W);
    if (x1 > W * 0.77) break;
    const v = cellBits(crop(img, x0, Math.round(GEOM.val[0] * H), x1, Math.round(GEOM.val[1] * H)), scaleH);
    const n = cellBits(crop(img, x0, Math.round(GEOM.name[0] * H), x1, Math.round(GEOM.name[1] * H)), scaleH);
    if (!n) continue;
    rows.push({ col: k, v, n });
  }
  if (!rows.length) return null;
  const GAP = 40, PAD = 20, LINE = scaleH + 24;
  const width = PAD * 2 + Math.max(...rows.map((r) => (r.v?.w || 0) + GAP + r.n.w)) + GAP;
  const height = PAD * 2 + rows.length * LINE;
  const png = new PNG({ width, height });
  png.data.fill(255);
  const blit = (b, ox, oy) => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v = b.px[y * b.w + x], i = ((oy + y) * width + ox + x) * 4; png.data[i] = png.data[i + 1] = png.data[i + 2] = v; } };
  const vW = Math.max(...rows.map((r) => r.v?.w || 0));
  rows.forEach((r, i) => { const oy = PAD + i * LINE; if (r.v) blit(r.v, PAD, oy); blit(r.n, PAD + vW + GAP, oy); });
  return { png: PNG.sync.write(png), cols: rows.map((r) => r.col) };
}

const KNOWN = ['Black', 'Blue', 'White', 'Yellow', 'Red', 'Green', 'Gold', 'Silver', 'Junior', 'Senior', 'Seniors', 'Ladies', 'Forward', 'Tips', 'Tournament', 'Championship', 'Member', 'Members', 'Orange', 'Purple', 'Copper', 'Bronze', 'Combo', 'Pro', 'Back', 'Middle', 'Front', 'Teal', 'Grey', 'Gray', 'Tan', 'Burgundy', 'Pink', 'Platinum', 'Jade'];
function ed1(a, b) { // edit distance ≤ 1
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return e + (a.length - i) + (b.length - j) <= 1;
}
/** Snap a near-miss OCR word ("Biue") to a common tee name; unknown names pass through. */
export function snapName(n) {
  const k = KNOWN.find((x) => x.toLowerCase() === n.toLowerCase()) || (n.length >= 4 && KNOWN.find((x) => x.length >= 4 && ed1(x.toLowerCase(), n.toLowerCase())))
    || (n.length === 3 && /^(re.|r.d)$/i.test(n) && 'Red'); // "Rep", "Rcd"
  return k || n;
}
const TITLE = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
/** "75.0/142" (OCR'd, maybe with a dropped or misread slash) → { rating, slope } or null. */
export function parseRatingSlope(raw) {
  // Cards always print one decimal ("75.0/142"); OCR sometimes drops the "." or the "/" (never trust both missing).
  const tok = String(raw).replace(/[^0-9./]/g, '');
  const int = tok.match(/^(\d{2})\/(\d{2,3})$/); // some cards print "72/120"
  if (int) { const rating = Number(int[1]), slope = Number(int[2]); return rating >= 20 && rating <= 90 && slope >= 55 && slope <= 155 ? { rating, slope } : null; }
  const m = tok.match(/^(\d{2})(\.?)(\d)(\/?)(\d{2,4})$/);
  if (!m || (!m[2] && !m[4])) return null;
  const rating = Number(`${m[1]}.${m[3]}`);
  let d = m[5];
  if (d.length === 4) { if (m[4] || (d[0] !== '1' && d[0] !== '7')) return null; d = d.slice(1); } // "/" read as 1 or 7
  const slope = Number(d);
  if (!(rating >= 20 && rating <= 90) || !(slope >= 55 && slope <= 155)) return null;
  return { rating, slope };
}
/** One OCR'd line → { name, rating, slope } or null. */
export function parseTeeLine(line) {
  const t = line.trim().split(/\s+/);
  if (t.length < 2) return null;
  const rs = parseRatingSlope(t[0]);
  const name = t.slice(1).join(' ').replace(/[^A-Za-z0-9 ]/g, '').trim();
  if (!rs || !/^[A-Za-z][A-Za-z0-9 ]{1,13}$/.test(name)) return null;
  if (/^pars? ?3$/i.test(name)) return null; // a separate par-3 layout, not a tee of this course
  if (/^junior$/i.test(name) && rs.rating === 72 && rs.slope === 120) return null; // GreenKeeper's unedited placeholder
  const nm = name.split(' ').map((w) => snapName(TITLE(w))).join(' ');
  if (!nm.split(' ').every((w) => KNOWN.includes(w))) return null; // GreenKeeper prints colour names; anything else is a misread
  return { name: nm, ...rs };
}

/** One OCR pass at a given glyph height → [{ name, rating, slope }]. */
async function readOnce(worker, img, scaleH) {
  const s = teeStrip(img, scaleH);
  if (!s) return [];
  const { data } = await worker.recognize(s.png);
  const out = [];
  for (const line of data.text.split('\n')) { const t = parseTeeLine(line); if (t && !out.some((o) => o.name === t.name)) out.push(t); }
  return out;
}
export const SCALES = [48, 64, 96];
/**
 * OCR one card buffer → [{ name, rating, slope }]. Reads the strip at three glyph sizes and keeps a tee only when
 * at least two reads agree on its rating AND slope. A misread digit almost never repeats at a different scale,
 * so a disagreement drops the tee (no number beats a wrong number). Hand-checked sample: 112/112 right, 0 wrong.
 */
export async function readTees(worker, buf) {
  const img = decode(buf);
  const reads = [];
  for (const h of SCALES) reads.push(await readOnce(worker, img, h));
  const names = [...new Set(reads.flat().map((t) => t.name))];
  const order = (n) => Math.min(...reads.map((r) => { const i = r.findIndex((t) => t.name === n); return i < 0 ? 99 : i; }));
  const out = [];
  for (const n of names.sort((a, b) => order(a) - order(b))) {
    const votes = reads.map((r) => r.find((t) => t.name === n)).filter(Boolean);
    const win = votes.find((v) => votes.filter((u) => u.rating === v.rating && u.slope === v.slope).length >= 2);
    if (win) out.push(win);
  }
  return out;
}
export async function makeWorker(langPath) {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('eng', 1, { langPath, gzip: true, cacheMethod: 'none' });
  await w.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '0123456789./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ' });
  return w;
}
