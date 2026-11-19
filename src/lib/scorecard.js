// Scorecard photo → hole-by-hole scores. Pure logic (no DOM): layout geometry, row classification,
// a text fallback parser, and plausibility checks. The browser side (src/lib/ocr.js) feeds it Tesseract output.

export const HOLES = 9;
const SKIP_LABEL = /^(hcp|hdcp|handicap|hdc|si|s\.?i\.?|stroke|index|yds|yards?|yardage|tees?|meters|m|dist|distance|rank)$/i;
const PAR_LABEL = /^p[a@4]r$/i;
const HOLE_LABEL = /^(h[o0]le|h[o0]les|#)$/i;
const TOTAL_LABEL = /^(out|in|t[o0]t|total|gross|net|score)$/i;

// Characters Tesseract commonly confuses with digits on screen fonts.
const DIGIT_MAP = { O: '0', o: '0', D: '0', Q: '0', U: '0', l: '1', I: '1', '|': '1', i: '1', '!': '1', j: '1', L: '1', ']': '1', '[': '1', Z: '2', z: '2', S: '5', s: '5', $: '5', B: '8', G: '6', b: '6', q: '9', g: '9', A: '4', T: '7', '?': '7' };
export const mapDigit = (ch) => (/[0-9]/.test(ch) ? ch : DIGIT_MAP[ch] ?? null);

/** Normalize a token that should be a number. Returns digit string or null. */
export function numericToken(tok) {
  const t = String(tok).trim().replace(/^[[(@{<]+|[\])}>.,:;'"`]+$/g, '');
  if (!t || /^[+-]/.test(t)) return null; // "+3" / "-1" are to-par, not strokes
  const realDigits = (t.match(/[0-9]/g) || []).length;
  if (realDigits === 0 && t.length > 1) return null; // "SI", "Bob" — words, not numbers
  let out = '';
  for (const ch of t) {
    const d = mapDigit(ch);
    if (d == null) return null;
    // "5s", "4b": a stray lowercase letter glued to a real digit is noise, not another digit
    if (realDigits && !/[0-9]/.test(ch) && /[a-z$]/.test(ch) && !'loi'.includes(ch)) continue;
    out += d;
  }
  return out || null;
}

const center = (b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0 });
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
function linfit(xs, ys) {
  const n = xs.length, mx = sum(xs) / n, my = sum(ys) / n;
  let sxx = 0, sxy = 0; for (let k = 0; k < n; k++) { sxx += (xs[k] - mx) ** 2; sxy += (xs[k] - mx) * (ys[k] - my); }
  const b = sxx ? sxy / sxx : 0; return { a: my - b * mx, b };
}

/** Flatten Tesseract `blocks` output into lines of words with symbol boxes. */
export function flattenBlocks(blocks) {
  const lines = [];
  for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const words = (l.words || []).map((w) => ({ text: w.text, conf: w.confidence, bbox: w.bbox, symbols: (w.symbols || []).map((s) => ({ text: s.text, conf: s.confidence, bbox: s.bbox })) }));
    if (words.length) lines.push({ text: l.text, bbox: l.bbox, words });
  }
  return lines;
}

/**
 * Find the HOLE header (1..9 left→right, roughly collinear, evenly spaced).
 * Returns { cols: [{x,y}] × 9, spacing, dir:{x,y}, charH, out?:{x,y} } or null.
 */
export function findHeader(lines) {
  const cands = [];
  for (const l of lines) for (const w of l.words) {
    const n = numericToken(w.text);
    if (n && n.length === 1 && n !== '0') cands.push({ v: +n, ...center(w.bbox) });
    else if (n && n.length > 1 && n.length <= 9 && w.symbols?.length === n.length && /^1?2?3?4?5?6?7?8?9?$/.test(n)) {
      // merged run like "123" — use per-symbol boxes
      w.symbols.forEach((s, k) => cands.push({ v: +n[k], ...center(s.bbox), merged: true }));
    }
  }
  if (cands.length < 5) return null;
  let best = null;
  for (const start of cands) {
    if (start.v > 3) continue;
    const chain = [start];
    let prev = start, gap = null;
    for (let v = start.v + 1; v <= 9; v++) {
      const exp = gap ? { x: prev.x + gap.x * (v - prev.v), y: prev.y + gap.y * (v - prev.v) } : null;
      const opts = cands.filter((c) => c.v === v && c.x > prev.x && Math.abs(c.y - (exp ? exp.y : prev.y)) < Math.max(prev.h, 8) * (exp ? 0.9 : 0.7) + (exp ? 0 : (c.x - prev.x) * 0.12));
      let pick = null, pickErr = Infinity;
      for (const o of opts) {
        const dx = o.x - prev.x;
        if (!gap && (dx < prev.h * 0.8 || dx > prev.h * 8)) continue;
        const err = exp ? Math.hypot(o.x - exp.x, o.y - exp.y) : dx;
        if (exp && err > Math.hypot(gap.x, gap.y) * 0.45) continue;
        if (err < pickErr) { pick = o; pickErr = err; }
      }
      if (pick) {
        const steps = pick.v - prev.v;
        gap = gap ? { x: (gap.x + (pick.x - prev.x) / steps) / 2, y: (gap.y + (pick.y - prev.y) / steps) / 2 } : { x: (pick.x - prev.x) / steps, y: (pick.y - prev.y) / steps };
        chain.push(pick); prev = pick;
      }
    }
    if (chain.length < 5) continue;
    const fx = linfit(chain.map((c) => c.v), chain.map((c) => c.x));
    const fy = linfit(chain.map((c) => c.v), chain.map((c) => c.y));
    const resid = median(chain.map((c) => Math.hypot(c.x - (fx.a + fx.b * c.v), c.y - (fy.a + fy.b * c.v))));
    const score = chain.length * 10 - resid / Math.max(1, fx.b) * 10;
    if (!best || score > best.score) best = { score, chain, fx, fy };
  }
  if (!best) return null;
  const { fx, fy, chain } = best;
  const cols = Array.from({ length: HOLES }, (_, k) => ({ x: fx.a + fx.b * (k + 1), y: fy.a + fy.b * (k + 1) }));
  const spacing = Math.hypot(fx.b, fy.b);
  const dir = { x: fx.b / spacing, y: fy.b / spacing };
  const charH = median(chain.map((c) => c.h));
  // Total column: an "OUT"/"TOT" word just right of hole 9, else one step further.
  let out = { x: cols[8].x + fx.b * 1.1, y: cols[8].y + fy.b * 1.1 };
  for (const l of lines) for (const w of l.words) {
    if (!TOTAL_LABEL.test(w.text.replace(/[^a-z]/gi, ''))) continue;
    const c = center(w.bbox); const along = (c.x - cols[8].x) * dir.x + (c.y - cols[8].y) * dir.y; const across = Math.abs(-(c.x - cols[8].x) * dir.y + (c.y - cols[8].y) * dir.x);
    if (along > spacing * 0.4 && along < spacing * 2.2 && across < charH * 1.5) { out = { x: c.x, y: c.y }; break; }
  }
  return { cols, spacing, dir, charH, out, found: chain.length };
}

/** Signed distance of point p below the header line (in px), and position along it. */
function project(p, header) {
  const o = header.cols[0], d = header.dir;
  const dx = p.x - o.x, dy = p.y - o.y;
  return { along: dx * d.x + dy * d.y, down: -dx * d.y + dy * d.x };
}

/**
 * Locate table rows below the header using left-hand labels and clusters of numbers.
 * Returns rows [{ label, kind, down, cells:[{x,y}] × 9, total:{x,y}, w, h }].
 */
export function layoutRows(lines, header) {
  const { spacing, charH, dir } = header;
  const items = []; // {down, label?, numeric?}
  for (const l of lines) {
    const labelWords = [];
    for (const w of l.words) {
      const c = center(w.bbox); const pr = project(c, header);
      if (pr.down < charH * 0.9) continue; // header or above
      if (pr.along < -spacing * 0.55) { if (/[a-z]{2,}/i.test(w.text) || PAR_LABEL.test(w.text)) labelWords.push({ w, pr }); continue; }
      if (pr.along > spacing * (HOLES - 1) + spacing * 0.6) continue; // totals / to-par column
      if (numericToken(w.text)) items.push({ down: pr.down, numeric: true });
    }
    if (labelWords.length) items.push({ down: median(labelWords.map((x) => x.pr.down)), label: labelWords.map((x) => x.w.text).join(' ').trim(), from: Math.min(...labelWords.map((x) => x.pr.along)) });
  }
  items.sort((a, b) => a.down - b.down);
  // cluster by vertical position
  const tol = Math.max(charH * 0.75, 6);
  const clusters = [];
  for (const it of items) {
    const c = clusters[clusters.length - 1];
    if (c && it.down - c.last < tol) { c.items.push(it); c.last = it.down; } else clusters.push({ items: [it], last: it.down });
  }
  let rows = clusters.map((c) => {
    const labels = c.items.filter((i) => i.label).map((i) => i.label);
    const nums = c.items.filter((i) => i.numeric).length;
    const froms = c.items.filter((i) => i.label).map((i) => i.from);
    return { down: median(c.items.map((i) => i.down)), label: labels.join(' ').replace(/\s+/g, ' ').trim(), nums, from: froms.length ? Math.min(...froms) : null };
  }).filter((r) => r.label || r.nums >= 3);
  // merge rows that are suspiciously close (label and numbers split by perspective)
  const merged = [];
  for (const r of rows) {
    const p = merged[merged.length - 1];
    if (p && r.down - p.down < charH * 1.05) { p.label = p.label || r.label; p.from = p.from ?? r.from; p.nums += r.nums; p.down = r.label ? r.down : p.down; } else merged.push({ ...r });
  }
  rows = merged;
  if (!rows.length) return [];
  const gaps = rows.map((r, k) => (k ? r.down - rows[k - 1].down : r.down)).filter((g) => g > charH);
  const rowH = Math.max(charH * 1.4, median(gaps) || charH * 2);
  return rows.map((r) => {
    const kind = classifyLabel(r.label);
    const cells = header.cols.map((c) => ({ x: c.x - dir.y * r.down, y: c.y + dir.x * r.down }));
    const total = { x: header.out.x - dir.y * r.down, y: header.out.y + dir.x * r.down };
    return { label: r.label, kind, down: r.down, labelFrom: r.from, cells, total, w: spacing * 0.92, h: Math.min(rowH * 0.92, spacing * 1.2) };
  });
}

const STRUCT = { par: ['PAR'], header: ['HOLE', 'HOLES'], skip: ['INDEX', 'HCP', 'HDCP', 'HANDICAP', 'DISTANCE', 'YARDS', 'YARDAGE', 'YDS', 'METERS', 'STROKEINDEX', 'SI', 'TEE', 'TEES'] };
export function classifyLabel(label) {
  const t = (label || '').trim();
  const first = (t.split(/\s+/)[0] || '').replace(/[^a-z0-9]+$/i, '');
  if (!t) return 'unknown';
  if (PAR_LABEL.test(first)) return 'par';
  if (HOLE_LABEL.test(first)) return 'header';
  const bare = first.replace(/[^a-z.]/gi, '');
  if (SKIP_LABEL.test(bare)) return 'skip';
  if (/^(h?[ceo]p|h.p|hc|hd.?p|h[o0]t)$/i.test(bare)) return 'skip'; // OCR-mangled "HCP"
  // fuzzy: "RAR"→PAR, "1NDEX"/"INDFX"→INDEX, "DlSTANCE"→DISTANCE (whole label, letters only)
  const L = t.toUpperCase().replace(/[^A-Z]/g, '');
  if (L.length >= 3) {
    for (const [kind, words] of Object.entries(STRUCT)) for (const w of words) {
      if (w.length < 5 && !(w === 'PAR' && /^[A-Z]AR$|^PA[A-Z]$/.test(t.toUpperCase()) && t === t.toUpperCase())) continue; // "Dee"≠TEE, but caps "RAR"→PAR
      const tol = w.length <= 5 ? 1 : 2;
      if (Math.abs(L.length - w.length) <= tol && lev(L, w) <= tol) return kind;
    }
  }
  if (bare.length < 3 && t.split(/\s+/).length === 1) return 'unknown';
  return 'player';
}

/**
 * Turn per-row cell readings into classified candidate rows.
 * rows: [{ label, kind, holes:[{value,conf}] × 9, total:{value,conf}|null }]
 * Returns { par:number[]|null, players:[{label, holes, conf, total, totalOk, quality, flags}] }
 */
export function assemble(rows, { coursePar } = {}) {
  let par = null;
  const players = [];
  const filled = (r) => r.holes.filter((h) => h && Number.isFinite(h.value)).length;
  for (const [ri, r] of rows.entries()) {
    const vals = r.holes.map((h) => (h && Number.isFinite(h.value) ? h.value : null));
    const known = vals.filter((v) => v != null);
    if (known.length < 5) continue;
    const moreBelow = rows.slice(ri + 1).some((x) => filled(x) >= 6);
    const isPermutation = known.length >= 7 && new Set(known).size === known.length && known.every((v) => v >= 1 && v <= 18);
    const parLike = known.every((v) => v >= 3 && v <= 6) && (known.length < 9 || (sum(known) >= 27 && sum(known) <= 45));
    if (r.kind === 'header' || r.kind === 'skip') continue;
    const nameLike = r.kind === 'player' && looksLikeName(r.label);
    // The first row under HOLE on every GSPro card is PAR: accept it by numbers when its label isn't a clear name.
    const parByValues = !par && !players.length && parLike && known.length >= 7 && !nameLike && moreBelow && r.kind !== 'player';
    const matchesCourse = coursePar && vals.filter((v, k) => v != null && v === coursePar[k]).length >= Math.min(7, known.length);
    if (r.kind === 'par' || parByValues || (r.kind === 'unknown' && !par && !players.length && parLike && matchesCourse)) {
      if (!par) par = vals.map((v, k) => v ?? coursePar?.[k] ?? null);
      continue;
    }
    if (isPermutation) continue; // stroke-index row (all distinct 1–18) — no real round looks like that
    // near-permutation (one misread) above the first player, without a name: still the INDEX row
    // Near-permutation (OCR merged/misread a cell or two) that no round could produce against par: INDEX row.
    const idx = known.filter((v) => v >= 1 && v <= 18);
    const ref = par || coursePar;
    const impossible = ref ? vals.filter((v, k) => v != null && (v === 1 || v <= ref[k] - 2 || v >= ref[k] + 4)).length : 0;
    const nearPerm = idx.length >= 6 && new Set(idx).size >= idx.length - 2 && idx.some((v) => v <= 2) && idx.some((v) => v >= 7);
    if (nearPerm && impossible >= 3 && !nameLike) continue;
    if (known.filter((v) => v > 15).length >= 3) continue; // yardage / distance row
    players.push({ ...scoreRow(r, par || coursePar), down: r.down, shift: r.shift || 0, labelFrom: r.labelFrom });
  }
  return { par, players };
}

function scoreRow(r, par) {
  const holes = r.holes.map((h) => (h && Number.isFinite(h.value) && h.value >= 1 && h.value <= 15 ? h.value : null));
  const conf = r.holes.map((h, k) => (holes[k] == null ? 0 : Math.round(h.conf ?? 0)));
  const totalRead = r.total && Number.isFinite(r.total.value) && r.total.value >= 9 && r.total.value <= 135 ? r.total.value : null;
  const complete = holes.every((v) => v != null);
  const totalOk = totalRead != null && complete ? sum(holes) === totalRead : null;
  const sumOk = totalRead != null && complete && sum(holes) === totalRead; // OUT checksum: strong evidence every cell is right
  const flags = holes.map((v, k) => {
    if (v == null) return 'missing';
    if (!sumOk && conf[k] < (totalRead != null ? 75 : 60)) return 'low';
    if (par && par[k] && (v - par[k] >= 5 || v <= par[k] - 2)) return 'odd'; // eagle-or-better / +5: double-check
    if (v === 1) return 'odd';
    return null;
  });
  // A wrong OUT total means at least one cell is off — flag the least confident if none flagged.
  if (totalOk === false && !flags.some(Boolean)) {
    const k = conf.indexOf(Math.min(...conf)); flags[k] = 'low';
  }
  const quality = Math.round((sum(conf) / HOLES) * (complete ? 1 : 0.7) * (totalOk === false ? 0.8 : 1) * (totalOk ? 1.05 : 1));
  return { label: r.label || '', holes, conf, total: totalRead, totalOk, quality: Math.min(100, quality), flags };
}

/** Fuzzy pick of the row matching the player's name; falls back to the best-quality row. */
export function pickRow(players, name, id) {
  if (!players.length) return -1;
  if (id) { const k = players.findIndex((p) => p.rosterId === id); if (k >= 0) return k; }
  if (name) {
    const toks = norm(name);
    let best = -1, bestScore = 0;
    players.forEach((p, k) => {
      const pt = norm(p.label);
      let s = 0;
      for (const a of toks) for (const b of pt) { if (a === b) s += 3; else if (a.length > 2 && b.length > 2 && (lev(a, b) <= 1 || a.startsWith(b) || b.startsWith(a))) s += 2; else if (a.length > 3 && lev(a, b) <= 2) s += 1; }
      if (s > bestScore) { best = k; bestScore = s; }
    });
    if (best >= 0) return best;
  }
  if (players.length === 1) return 0;
  return -1; // ambiguous → user picks
}
const norm = (s) => String(s || '').toLowerCase().replace(/["“”'’]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 1);
export function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Fallback: parse plain OCR text (no usable geometry), e.g. when the photo is cropped to one row.
 * Accepts a string or lines [{text, words:[{text, conf}]}].
 */
export function parseText(input, { coursePar } = {}) {
  const lines = typeof input === 'string'
    ? input.split(/\r?\n/).map((t) => ({ text: t, words: t.split(/\s+/).filter(Boolean).map((w) => ({ text: w, conf: 80 })) }))
    : input;
  const rows = [];
  for (const l of lines) {
    const label = [], nums = [];
    for (const w of l.words) {
      const n = numericToken(w.text);
      if (n == null) { if (!nums.length && /[a-z]/i.test(w.text)) label.push(w.text.replace(/[^\w.'"-]/g, '')); continue; }
      nums.push({ s: n, conf: w.conf ?? 80 });
    }
    if (nums.length < 5) continue;
    const seq = segment(nums);
    if (!seq) continue;
    const kind = classifyLabel(label.join(' '));
    if (seq.isHeader) continue;
    rows.push({ label: label.join(' '), kind: kind === 'unknown' ? 'unknown' : kind, holes: seq.holes, total: seq.total });
  }
  return assemble(rows, { coursePar });
}

/**
 * Choose how to read a run of numeric tokens as 9 hole values (+ optional total).
 * Multi-digit tokens may be merged cells ("45" → 4,5) or genuine 10–15 scores / totals.
 */
export function segment(nums) {
  // header row 1..9 (maybe merged "123456789")
  const flat = nums.map((n) => n.s).join('');
  if (flat.startsWith('123456789')) return { isHeader: true };
  let best = null;
  const n = nums.length;
  // DFS over interpretations, capped — rows are short.
  const out = [];
  const walk = (k, acc, splits) => {
    if (out.length > 4000) return;
    if (k === n) { out.push({ acc, splits }); return; }
    const t = nums[k];
    const whole = +t.s;
    walk(k + 1, [...acc, { value: whole, conf: t.conf, whole: true, len: t.s.length }], splits);
    if (t.s.length > 1 && t.s.length <= 4 && !t.s.includes('0')) walk(k + 1, [...acc, ...[...t.s].map((d) => ({ value: +d, conf: t.conf * 0.85 }))], splits + 1);
  };
  walk(0, [], 0);
  for (const { acc, splits } of out) {
    for (let start = 0; start + HOLES <= acc.length && start <= 1; start++) {
      const h = acc.slice(start, start + HOLES);
      if (h.some((c) => c.value < 1 || c.value > 15)) continue;
      const rest = acc.slice(start + HOLES);
      const s = sum(h.map((c) => c.value));
      const tot = rest.find((c) => c.value >= 9);
      let score = 100 - splits * 6 - start * 8 - Math.max(0, rest.length - 2) * 4;
      if (tot && tot.value === s) score += 40; else if (tot) score -= 5;
      if (h.some((c) => c.value > 9 && c.value !== 10)) score -= 6; // 11–15 are rare
      if (!best || score > best.score) best = { score, holes: h.map((c) => ({ value: c.value, conf: c.conf })), total: tot ? { value: tot.value, conf: tot.conf } : null };
    }
  }
  return best;
}


/** Does an OCR'd label plausibly read as a person's name (not "oswwwans", "RRs", "semsmeunucEun")? */
export function looksLikeName(label, conf = null) {
  const t = String(label || '').trim();
  if (!t || t.length < 3 || t.length > 32) return false;
  if (!/^[A-Za-z][A-Za-z .'’-]*$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  for (const w of words) {
    const L = w.replace(/[^A-Za-z]/g, '');
    if (L.length < 2 && words.length === 1) return false;
    if (/(.)\1\1/i.test(L)) return false;                       // "www"
    if (/[^aeiouy]{5,}/i.test(L)) return false;                   // consonant soup
    for (const run of L.match(/[^aeiouy]{4}/gi) || []) if (!/ch|sh|th|ck|gh|ph|sch|ng|st|tz|rt|ld/i.test(run)) return false; // "GKNV"
    if (words.length === 1 && L.length > 9) return false;         // one 10+ letter blob is two names fused by OCR
    const v = (L.match(/[aeiouy]/gi) || []).length / Math.max(1, L.length);
    if (L.length >= 3 && (v < 0.12 || v > 0.8)) return false;
    if (/[a-z][A-Z]/.test(L) && !/^(Mc|Mac|O|De|Di|Van|Le|La)[A-Z]/.test(L)) return false; // "meunucEun"
  }
  if (conf != null && conf < 55) return false;
  return true;
}

const letters = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
function nameSim(read, name) {
  const a = letters(read), b = letters(name);
  if (!a || !b) return 0;
  let best = 1 - lev(a, b) / Math.max(a.length, b.length);
  // a first or last name alone ("DORAN", "Nick") also counts, a bit less
  for (const part of String(name).split(/[\s"“”]+/).map(letters).filter((x) => x.length >= 3)) {
    const sim = 1 - lev(a, part) / Math.max(a.length, part.length);
    best = Math.max(best, sim * 0.92);
  }
  return best;
}

/**
 * Match card rows to the league roster (+ this week's subs). Greedy best-first, one row per person.
 * Sets p.rosterId / p.display / p.nameConf. Rows with no confident match keep a clean OCR label,
 * or fall back to "Row N" — never OCR gibberish.
 */
export function matchRoster(players, roster = []) {
  const pairs = [];
  players.forEach((p, i) => roster.forEach((r, j) => pairs.push({ i, j, s: nameSim(p.label, r.name) })));
  pairs.sort((x, y) => y.s - x.s);
  const usedP = new Set(), usedR = new Set();
  for (const { i, j, s } of pairs) {
    if (s < 0.6 || usedP.has(i) || usedR.has(j)) continue;
    usedP.add(i); usedR.add(j);
    Object.assign(players[i], { rosterId: roster[j].id, display: roster[j].name, nameConf: Math.round(s * 100) });
  }
  players.forEach((p, i) => {
    if (p.display) return;
    p.display = looksLikeName(p.label, p.labelConf) ? tidyName(p.label) : `Row ${i + 1}`;
    p.nameConf = p.display.startsWith('Row ') ? 0 : 50;
  });
  return players;
}
const tidyName = (s) => String(s).trim().replace(/\s+/g, ' ');
