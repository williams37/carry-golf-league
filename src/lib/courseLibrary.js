// GSPro course library: lazy-loaded public/courses.json (synced weekly from Simulator Golf Tour + PakGolf).
import { gsproToSlope, suggestRating } from './golf.js';

const PAGES = 'https://williams37.github.io/carry-golf-league/';
// The single-file build runs from file:// (or anywhere), so it reads the published copy; GitHub Pages sends CORS *.
const ROOT = import.meta.env?.MODE === 'single' ? PAGES : (import.meta.env?.BASE_URL || '/');
export const LIBRARY_URL = ROOT + 'courses.json';
/** Per-tee rating/slope read off each course's SGT scorecard (scripts/sync-tees.mjs). Optional: the picker works without it. */
export const TEES_URL = ROOT + 'tees.json';
export const SGT_URL = 'https://simulatorgolftour.com/courses/';
export const scorecardImage = (id) => (typeof id === 'number' ? `https://simulatorgolftour.com/public/assets/courseImages/scorecards/scorecard_${id}.jpg` : null);

let loading = null;
export function loadLibrary(fetchImpl = fetch) {
  if (!loading) {
    const tees = fetchImpl(TEES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    loading = fetchImpl(LIBRARY_URL).then((r) => { if (!r.ok) throw new Error(`Course list unavailable (${r.status})`); return r.json(); })
      .then(async (lib) => indexLibrary(lib, await tees)).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Rows → objects with search keys. */
export function indexLibrary(lib, teeData = null) {
  const ix = Object.fromEntries(lib.cols.map((c, i) => [c, i]));
  const cards = teeData?.cards || {};
  const courses = lib.courses.map((r) => {
    const c = Object.fromEntries(lib.cols.map((k) => [k, r[ix[k]]]));
    c.cardTees = (cards[c.id]?.t || []).map(([name, rating, slope]) => ({ name, rating, slope }));
    c.styles = c.styles ? String(c.styles).split(',') : [];
    c.fictional = /fictional|fantasy/i.test(c.loc) || c.styles.includes('fantasy');
    c.nine = c.par != null && c.par <= 40;
    const n = norm(c.name), l = norm(c.loc), d = norm(c.designer);
    c._k = { n, nw: n.split(' '), l, lw: l.split(' '), d, dw: d.split(' ') };
    return c;
  });
  return { ...lib, courses };
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  // optimal string alignment: a swapped pair ("suoth") costs 1
  let pp = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    pp = prev; prev = cur;
  }
  return prev[b.length];
}
const fuzzyWord = (tok, words) => {
  const max = tok.length >= 7 ? 2 : tok.length >= 4 ? 1 : 0; if (!max) return false;
  return words.some((w) => lev(tok, w.slice(0, tok.length + 1), max) <= max || lev(tok, w, max) <= max);
};
function tokenScore(tok, k) {
  if (k.nw.some((w) => w.startsWith(tok))) return 3;
  if (k.n.includes(tok)) return 2;
  if (k.lw.some((w) => w.startsWith(tok))) return 1.6;
  if (k.dw.some((w) => w.startsWith(tok))) return 1.2;
  if (fuzzyWord(tok, k.nw)) return 1.1;
  if (fuzzyWord(tok, k.lw) || fuzzyWord(tok, k.dw)) return 0.7;
  return 0;
}

/**
 * Fuzzy search over name / location / designer, with filters.
 * f: { holes: 'any'|'9'|'18', diff: 'any'|'easy'|'medium'|'hard', kind: 'any'|'real'|'fictional', privateServers: bool }
 */
export function searchCourses(lib, query, f = {}, limit = 60) {
  const toks = norm(query).split(' ').filter(Boolean);
  const out = [];
  for (const c of lib.courses) {
    if (f.holes === '9' && !c.nine) continue;
    if (f.holes === '18' && (c.par == null || c.nine)) continue;
    if (f.diff && f.diff !== 'any') {
      if (c.diff == null) continue;
      if (f.diff === 'easy' && c.diff >= 3.5) continue;
      if (f.diff === 'medium' && (c.diff < 3.5 || c.diff > 5)) continue;
      if (f.diff === 'hard' && c.diff <= 5) continue;
    }
    if (f.kind === 'real' && c.fictional) continue;
    if (f.kind === 'fictional' && !c.fictional) continue;
    if (f.privateServers === false && c.server) continue;
    let s = 0;
    for (const t of toks) { const v = tokenScore(t, c._k); if (!v) { s = -1; break; } s += v; }
    if (s < 0) continue;
    if (toks.length && c._k.n.startsWith(toks.join(' '))) s += 2;
    s += Math.log10((c.plays || 0) + 1) * (toks.length ? 0.35 : 1);
    out.push([s, c]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return { total: out.length, results: out.slice(0, limit).map((x) => x[1]) };
}

/** Typical hole pars that add up to `par` for nine holes (a starting point; the commissioner checks the card). */
export function defaultPars(par) {
  const p = [4, 4, 3, 5, 4, 4, 3, 5, 4];
  const target = Math.min(54, Math.max(27, Math.round(Number(par) || 36)));
  let sum = 36;
  const order = [3, 7, 0, 5, 8, 1, 4, 2, 6];
  for (let g = 0; sum > target && g < 30; g++) for (const i of order) { if (sum <= target) break; if (p[i] > 3) { p[i]--; sum--; } }
  for (let g = 0; sum < target && g < 30; g++) for (const i of order) { if (sum >= target) break; if (p[i] < 6) { p[i]++; sum++; } }
  return p;
}

/** Nine-hole par split for an 18-hole course (editable; SGT only knows the total). */
export function ninePar(course, nine) {
  if (course.par == null) return 36;
  if (course.nine) return course.par;
  const front = Math.ceil(course.par / 2);
  return nine === 'back' ? course.par - front : front;
}

/**
 * WHS 9-hole values from an 18-hole tee: slope stays the same; rating = nine par + (18 rating − 18 par) / 2.
 */
export function nineFrom18({ rating18, slope18, par18, par9 }) {
  const r = Number(rating18), s = Number(slope18), p18 = Number(par18), p9 = Number(par9);
  if (![r, s, p18, p9].every(Number.isFinite) || r <= 0 || s < 55 || s > 155) return null;
  return { rating: Math.round((p9 + (r - p18) / 2) * 10) / 10, slope: Math.round(s) };
}

/** Estimate from GSPro difficulty (same rule as manual entry). */
export function estimateFromDifficulty(diff, par9) {
  const slope = gsproToSlope(diff ?? 5.8);
  return { slope, rating: suggestRating(par9, slope) };
}

/**
 * Tee boxes printed on the scorecard → 9-hole tee sets for one nine (WHS: slope unchanged, rating = par9 + (r18 − par18) / 2).
 * A 9-hole course's card may already print 9-hole ratings (rating < 50); those are used as printed.
 */
export function teeSetsFromCard(cardTees, { nine9 = false, par9, par18 }) {
  return (cardTees || []).map((t) => {
    const asNine = nine9 && t.rating < 50;
    const v = asNine ? { rating: t.rating, slope: t.slope } : nineFrom18({ rating18: t.rating, slope18: t.slope, par18: nine9 ? par9 * 2 : par18, par9 });
    return v ? { name: t.name, rating: v.rating, slope: v.slope, card: `${t.rating.toFixed(1)}/${t.slope}`, source: 'scorecard' } : null;
  }).filter(Boolean);
}

/** Build a league course object from a library pick + the commissioner's choices. */
export function courseFromLibrary(c, { nine = 'front', holes, tees = '', source = 'estimated', rating18, slope18, par18, id, teeSets = [] }) {
  const par = holes.reduce((a, h) => a + Number(h.par), 0);
  const est = estimateFromDifficulty(c.diff, par);
  const real = source === 'scorecard' ? nineFrom18({ rating18, slope18, par18, par9: par }) : null;
  const v = real || est;
  const label = c.nine ? c.name : `${c.name} — ${nine === 'back' ? 'Back' : 'Front'} Nine`;
  return {
    id, name: label, tees, gspro: c.diff ?? 5.8, slope: v.slope, rating: v.rating, par, holes, ...(teeSets.length ? { teeSets } : {}),
    lib: { id: c.id, nine: c.nine ? 'nine' : nine, source: real ? 'scorecard' : 'estimated', ...(real ? { rating18: Number(rating18), slope18: Number(slope18), par18: Number(par18) } : {}) },
  };
}
