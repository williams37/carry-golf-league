// Per-tee rating/slope for the GSPro course library → public/tees.json.
// Source: the scorecard image Simulator Golf Tour publishes for each course (GSPro GreenKeeper template),
// whose header prints every tee as "<rating>/<slope>" over the tee name. SGT has no structured tee data,
// so each card is read once with OCR (scripts/lib/tee-ocr.mjs) and cached by the course's "updated" date;
// later runs only read new or updated courses. Rows that don't validate are dropped, never guessed.
// Usage: node scripts/sync-tees.mjs [--limit N] [--ids 602,618] [--concurrency 4]
import fs from 'node:fs';
import { readTees, makeWorker } from './lib/tee-ocr.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
const LIB = 'public/courses.json', OUT = 'public/tees.json';
const CARD = (id) => `https://simulatorgolftour.com/public/assets/courseImages/scorecards/scorecard_${id}.jpg`;
const UA = 'CarryGolfLeague-TeeSync/1.0 (weekly; +https://github.com/williams37/carry-golf-league)';
const CONC = Number(opt('--concurrency', 4));
const LIMIT = Number(opt('--limit', Infinity));
const ONLY = opt('--ids', null)?.split(',').map(Number);

const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
const ix = Object.fromEntries(lib.cols.map((c, i) => [c, i]));
const V = 2; // reader version: bump when tee-ocr.mjs changes so every card is re-read (v2: 3-scale majority vote)
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { v: V, cards: {} };
const cards = prev.cards || {};
const stale = prev.v !== V;

/** Plausible for this course? 18-hole ratings sit near par; nine-hole courses may print 9- or 18-hole values. */
export function plausible(t, par) {
  if (par == null) return true;
  const near = (p) => t.rating >= p - 20 && t.rating <= p + 8;
  return par <= 40 ? near(par) || near(par * 2) : near(par);
}

const todo = lib.courses
  .filter((r) => typeof r[ix.id] === 'number')
  .filter((r) => (ONLY ? ONLY.includes(r[ix.id]) : stale || cards[r[ix.id]]?.u !== (r[ix.updated] || '')))
  .slice(0, LIMIT);
console.log(`${todo.length} cards to read (${Object.keys(cards).length} cached)`);

let done = 0, found = 0, failed = 0;
const t0 = Date.now();
async function lane(rows) {
  const w = await makeWorker(new URL('../public/ocr', import.meta.url).pathname);
  for (const r of rows) {
    const id = r[ix.id], par = r[ix.par];
    try {
      const res = await fetch(CARD(id), { headers: { 'user-agent': UA } });
      if (res.status === 404) { cards[id] = { u: r[ix.updated] || '', t: [] }; continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tees = (await readTees(w, Buffer.from(await res.arrayBuffer()))).filter((t) => plausible(t, par));
      cards[id] = { u: r[ix.updated] || '', t: tees.map((t) => [t.name, t.rating, t.slope]) };
      if (tees.length) found++;
    } catch (e) { failed++; if (stale) delete cards[id]; // re-read next run with the new reader
      if (failed < 20) console.warn(`! ${id}: ${e.message}`); }
    finally {
      if (++done % 100 === 0) {
        console.log(`${done}/${todo.length} · ${found} with tees · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        fs.writeFileSync(OUT, JSON.stringify({ v: stale && done < todo.length ? prev.v : V, source: 'Simulator Golf Tour scorecards (OCR)', updated: new Date().toISOString(), cards }));
      }
    }
  }
  await w.terminate();
}
const lanes = Array.from({ length: CONC }, (_, k) => todo.filter((_, i) => i % CONC === k));
await Promise.all(lanes.map(lane));
// drop courses that left the library
const live = new Set(lib.courses.map((r) => String(r[ix.id])));
for (const k of Object.keys(cards)) if (!live.has(k)) delete cards[k];
fs.writeFileSync(OUT, JSON.stringify({ v: stale && (ONLY || LIMIT < Infinity) ? prev.v : V, source: 'Simulator Golf Tour scorecards (OCR)', updated: new Date().toISOString(), cards }));
const withTees = Object.values(cards).filter((c) => c.t.length).length;
console.log(`✓ ${OUT}: ${withTees}/${Object.keys(cards).length} courses with tee ratings · read ${done} (${found} with tees, ${failed} failed) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (failed > Math.max(20, todo.length * 0.2)) process.exit(1);
