// Weekly GSPro course library sync → public/courses.json (run by .github/workflows/sync-courses.yml).
// One polite request per source. If SGT breaks or shrinks >20%, exit non-zero and leave the old file alone.
// PakGolf is optional: if it fails, the SGT list still ships (without style flags / private-server courses).
// Usage: node scripts/sync-courses.mjs [--sgt-file f.html] [--pak-file f.html] [--out public/courses.json]
import fs from 'node:fs';
import { parseSgt, parsePak, buildLibrary, checkDrop, sameData } from './lib/course-sources.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
const OUT = opt('--out') || 'public/courses.json';
const UA = 'CarryGolfLeague-CourseSync/1.0 (weekly; +https://github.com/williams37/carry-golf-league)';

async function get(url, file) {
  if (file) return fs.readFileSync(file, 'utf8');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45_000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
let sgt;
try { sgt = parseSgt(await get('https://simulatorgolftour.com/courses/', opt('--sgt-file'))); }
catch (e) { console.error(`✗ SGT failed, keeping the existing ${OUT}: ${e.message}`); process.exit(1); }
let pak = [];
try { pak = parsePak(await get('https://pakgolfstudios.com/gspro-course-list/', opt('--pak-file'))); }
catch (e) { console.warn(`! PakGolf skipped: ${e.message}`); }

const next = buildLibrary(sgt, pak);
const bad = checkDrop(prev, next);
if (bad) { console.error(`✗ ${bad}; keeping the existing ${OUT}`); process.exit(1); }
if (sameData(prev, next)) { console.log(`= no course changes (${next.courses.length} courses)`); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify(next));
console.log(`✓ wrote ${OUT}: ${next.courses.length} courses (SGT ${next.sources.sgt.count}, PakGolf ${pak.length}), ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
