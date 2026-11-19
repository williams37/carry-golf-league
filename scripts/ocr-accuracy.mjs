// Runs the real in-browser OCR pipeline over the synthetic scorecards and reports cell accuracy.
// Usage: node scripts/ocr-accuracy.mjs [--crop|--full|--both] [--json out.json]   (starts its own Vite dev server)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
const args = process.argv.slice(2);
const modes = args.includes('--full') ? ['full'] : args.includes('--crop') ? ['crop'] : ['crop', 'full'];
const truth = JSON.parse(fs.readFileSync('tests/fixtures/scorecards/truth.json', 'utf8'));
// Optional private cases (real photos with real names, git-ignored): tests/fixtures/private/truth.json, files relative to scorecards/
const PRIV = 'tests/fixtures/private/truth.json';
if (fs.existsSync(PRIV)) truth.cases.push(...JSON.parse(fs.readFileSync(PRIV, 'utf8')).cases.map((c) => ({ ...c, optional: true })));
const only = args.find((a) => !a.startsWith('--') && truth.cases.some((c) => c.id === a));
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error', configFile: 'vite.config.js' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });
await page.goto('http://localhost:5199/tests/ocr-harness.html');
await page.waitForFunction(() => window.ready);
const strict = []; const results = []; let cells = 0, right = 0, rowsPicked = 0, rowsTotal = 0, exact = 0;
for (const mode of modes) for (const c of truth.cases) {
  if (only && c.id !== only) continue;
  if (c.optional && !fs.existsSync(`tests/fixtures/scorecards/${c.file}`)) { if (mode === modes[0]) console.log(`- ${c.id}: not present (drop it at tests/fixtures/private/), skipped`); continue; }
  if (mode === 'crop' && !c.crop) continue;
  const r = await page.evaluate(([u, o]) => window.runScan(u, o), [`/tests/fixtures/scorecards/${c.file}`, { crop: mode === 'crop' ? c.crop : null, coursePar: c.par || truth.par, roster: args.includes('--roster') ? c.rows.map((n, k) => ({ id: 'r' + k, name: n })) : undefined }]);
  if (args.includes('--debug')) { const d = await page.evaluate(() => window.lastPreview); if (d) fs.writeFileSync(`.scratch/clean-${c.id}-${mode}.png`, Buffer.from(d.split(',')[1], 'base64')); }
  if (args.includes('--debug')) fs.writeFileSync(`.scratch/debug-${c.id}-${mode}.json`, JSON.stringify(r.debug, null, 1));
  if (args.includes('--debug')) fs.writeFileSync(`.scratch/players-${c.id}-${mode}.json`, JSON.stringify(r.players, null, 1));
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
  if (args.includes('--debug') && r.names) r.names.forEach((u, k) => fs.writeFileSync(`.scratch/names-${c.id}-${mode}-${k}.png`, Buffer.from(u.split(',')[1], 'base64')));
  if (c.strict) {
    const rowsExact = r.players.length === c.all.length && c.all.every((t, k) => JSON.stringify(r.players[k]?.holes) === JSON.stringify(t.s));
    const parExact = JSON.stringify(r.par) === JSON.stringify(c.par);
    const shown = r.players.map((p) => p.display || p.label);
    const namesOk = c.all.every((t, k) => shown[k] === t.name || /^Row \d/.test(shown[k] || ''));
    const gib = shown.filter((x) => !c.all.some((t) => t.name === x) && !/^Row \d/.test(x));
    strict.push({ id: c.id, mode, rowsExact, parExact, rows: r.players.length, shown });
    console.log(`  strict ${c.id} ${mode}: rows ${r.players.length}/${c.all.length} ${rowsExact ? 'all exact ✓' : '✗ ' + r.players.map((p) => p.holes.join('')).join(' ')} | par ${parExact ? '✓' : '✗ ' + JSON.stringify(r.par)} | shown: ${shown.join(' / ')}${gib.length ? '  GIBBERISH ' + gib : ''}${namesOk ? '' : ' names✗'}`);
  }
  console.log(`${hit === 9 ? '✓' : '✗'} ${c.id.padEnd(18)} ${mode.padEnd(4)} ${String(hit).padStart(1)}/9  rows ${r.players.length}/${c.rows.length}${byLabel ? ' name✓' : ''}  ${r.method} ${r.ms}ms  got ${got.map((v) => v ?? '·').join('')} want ${c.scores.join('')}  OUT ${row?.total ?? '–'}${row?.totalOk ? '✓' : row?.totalOk === false ? '✗' : ''}${wrongUnflagged.length ? '  UNFLAGGED-WRONG ' + wrongUnflagged : ''}`);
}
const summary = { strictOk: strict.filter((x) => x.rowsExact && x.parExact).length + '/' + strict.length, cells, right, cellAccuracy: +(right / cells * 100).toFixed(1), exactCards: exact, cards: rowsTotal, nameMatched: rowsPicked };
console.log('\n' + JSON.stringify(summary));
const j = args.indexOf('--json'); if (j > -1) fs.writeFileSync(args[j + 1], JSON.stringify({ summary, results }, null, 2));
await browser.close(); await server.close();
