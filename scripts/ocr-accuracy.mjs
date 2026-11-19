// Runs the real in-browser OCR pipeline over the synthetic scorecards and reports cell accuracy.
// Usage: node scripts/ocr-accuracy.mjs [--crop|--full|--both] [--json out.json]   (starts its own Vite dev server)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
const args = process.argv.slice(2);
const modes = args.includes('--full') ? ['full'] : args.includes('--crop') ? ['crop'] : ['crop', 'full'];
const truth = JSON.parse(fs.readFileSync('tests/fixtures/scorecards/truth.json', 'utf8'));
const only = args.find((a) => !a.startsWith('--') && truth.cases.some((c) => c.id === a));
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error', configFile: 'vite.config.js' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });
await page.goto('http://localhost:5199/tests/ocr-harness.html');
await page.waitForFunction(() => window.ready);
const results = []; let cells = 0, right = 0, rowsPicked = 0, rowsTotal = 0, exact = 0;
for (const mode of modes) for (const c of truth.cases) {
  if (only && c.id !== only) continue;
  const r = await page.evaluate(([u, o]) => window.runScan(u, o), [`/tests/fixtures/scorecards/${c.file}`, { crop: mode === 'crop' ? c.crop : null, coursePar: truth.par }]);
  if (args.includes('--debug')) { const d = await page.evaluate(() => window.lastPreview); if (d) fs.writeFileSync(`.scratch/clean-${c.id}-${mode}.png`, Buffer.from(d.split(',')[1], 'base64')); }
  if (args.includes('--debug')) fs.writeFileSync(`.scratch/debug-${c.id}-${mode}.json`, JSON.stringify(r.debug, null, 1));
  // find the row that belongs to the expected player (by label; else by best match to truth — what a user would tap)
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  let row = r.players.find((p) => norm(p.label).includes(norm(c.player.split(' ')[1])) || norm(p.label).includes(norm(c.player.split(' ')[0])));
  const byLabel = !!row;
  if (!row) row = r.players.map((p) => ({ p, hit: p.holes.filter((v, k) => v === c.scores[k]).length })).sort((a, b) => b.hit - a.hit)[0]?.p;
  const got = row ? row.holes : Array(9).fill(null);
  const hit = got.filter((v, k) => v === c.scores[k]).length;
  cells += 9; right += hit; rowsTotal += 1; if (byLabel) rowsPicked++; if (hit === 9) exact++;
  const flagged = row ? row.flags.map((f, k) => (f ? k : null)).filter((k) => k != null) : [];
  const wrongUnflagged = got.map((v, k) => (v !== c.scores[k] && !(row?.flags[k]) ? k : null)).filter((k) => k != null);
  results.push({ id: c.id, mode, method: r.method, ms: r.ms, rows: r.players.length, expectRows: c.rows.length, byLabel, hit, got, want: c.scores, total: row?.total, totalOk: row?.totalOk, flagged, wrongUnflagged, labels: r.players.map((p) => p.label), par: r.par });
  console.log(`${hit === 9 ? '✓' : '✗'} ${c.id.padEnd(18)} ${mode.padEnd(4)} ${String(hit).padStart(1)}/9  rows ${r.players.length}/${c.rows.length}${byLabel ? ' name✓' : ''}  ${r.method} ${r.ms}ms  got ${got.map((v) => v ?? '·').join('')} want ${c.scores.join('')}  OUT ${row?.total ?? '–'}${row?.totalOk ? '✓' : row?.totalOk === false ? '✗' : ''}${wrongUnflagged.length ? '  UNFLAGGED-WRONG ' + wrongUnflagged : ''}`);
}
const summary = { cells, right, cellAccuracy: +(right / cells * 100).toFixed(1), exactCards: exact, cards: rowsTotal, nameMatched: rowsPicked };
console.log('\n' + JSON.stringify(summary));
const j = args.indexOf('--json'); if (j > -1) fs.writeFileSync(args[j + 1], JSON.stringify({ summary, results }, null, 2));
await browser.close(); await server.close();
