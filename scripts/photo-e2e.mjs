// End-to-end: scorecard photo → scores, through the real UI (local mode), at phone sizes.
// Usage: node scripts/photo-e2e.mjs [baseUrl]   (default http://localhost:4173/ — run `npx vite preview` first)
// Screenshots → screenshots/photo-*.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const FIX = new URL('../tests/fixtures/scorecards/', import.meta.url).pathname;
const truth = JSON.parse(fs.readFileSync(FIX + 'truth.json', 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const problems = []; const checks = [];
const ok = (cond, msg) => { checks.push([!!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) problems.push(msg); };

async function open(vw, vh) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('carry:prefs', JSON.stringify({ theme: 'dark', onboarded: true, mode: 'local' })); sessionStorage.setItem('init', '1'); }
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[${vw}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) problems.push(`[${vw}] console: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
  return p;
}
const shot = async (p, name) => { await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}photo-${name}.png` }); console.log('    📸 photo-' + name); };
const noOverflow = async (p, label) => {
  const r = await p.evaluate(() => {
    const de = document.documentElement; const out = [];
    if (de.scrollWidth > de.clientWidth + 1) out.push(`page overflow ${de.scrollWidth}>${de.clientWidth}`);
    const sheet = document.querySelector('.sheet-body'); if (sheet && sheet.scrollWidth > sheet.clientWidth + 1) out.push(`sheet overflow ${sheet.scrollWidth}>${sheet.clientWidth}`);
    document.querySelectorAll('.sheet .btn, .lightbox .btn').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) out.push(`clipped: "${b.textContent.trim()}"`); });
    return out;
  });
  ok(!r.length, `${label}: no overflow${r.length ? ' — ' + r.join('; ') : ''}`);
};
const cells = (p) => p.$$eval('[data-testid=scan-cells] input', (xs) => xs.map((x) => (x.value ? +x.value : null)));
async function openPad(p, name) {
  await p.goto(BASE + '#/scores/w7'); await p.waitForSelector('.entrant');
  const row = p.locator('.entrant', { has: p.locator('.nm', { hasText: name }) }).first();
  await row.locator('.acts .btn').first().click();
  await p.waitForSelector('[data-testid=scan-open]');
}
async function scan(p, file, { crop } = {}) {
  await p.click('[data-testid=scan-open]');
  await p.waitForSelector('[data-testid=scan-pick]');
  await p.setInputFiles('[data-testid=scan-file]', FIX + file);
  await p.waitForSelector('[data-testid=scan-adjust] .cropper img');
  if (crop) { // drag the corners like a thumb would
    const b = await p.locator('[data-testid=cropper]').boundingBox();
    const drag = async (sel, tx, ty) => { const h = await p.locator(sel).boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(b.x + tx * b.width, b.y + ty * b.height, { steps: 6 }); await p.mouse.up(); };
    await drag('.crop-h.tl', crop.x, crop.y); await drag('.crop-h.br', crop.x + crop.w, crop.y + crop.h);
  }
  return true;
}

// ---------- 390 × 844: the full story with screenshots ----------
console.log('390px — single player, screen photo');
{
  const p = await open(390, 844);
  const c = truth.cases.find((x) => x.id === 'screen-photo');
  await openPad(p, 'Dee Okafor'); await shot(p, '1-scorepad');
  await scan(p, c.file);
  await p.goBack?.call; // no-op, keep history untouched
  await shot(p, '3-adjust'); await noOverflow(p, 'adjust');
  // go back one step to capture the picker too
  await p.click('text=Retake'); await p.waitForSelector('[data-testid=scan-pick]'); await shot(p, '2-pick'); await noOverflow(p, 'pick');
  await p.setInputFiles('[data-testid=scan-file]', FIX + c.file); await p.waitForSelector('[data-testid=scan-adjust] .cropper img');
  const t0 = Date.now();
  await p.click('[data-testid=scan-read]');
  await p.waitForSelector('[data-testid=scan-reading]'); await p.waitForTimeout(400); await shot(p, '4-reading');
  await p.waitForSelector('[data-testid=scan-review]', { timeout: 120000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  await shot(p, '5-review'); await noOverflow(p, 'review');
  const got = await cells(p);
  ok(JSON.stringify(got) === JSON.stringify(c.scores), `screen photo read ${got.join('')} (want ${c.scores.join('')}) in ${secs}s incl. first-time reader load`);
  ok(await p.locator('text=Dee Okafor').count() > 0, 'row matched to Dee by name');
  ok(await p.locator('.scan-check .ok').count() === 1, 'OUT total check shows a match');
  // edit a cell by hand, then put it back (proves cells are editable)
  const c3 = p.locator('[data-testid=scan-cells] input').nth(2); await c3.fill('7'); ok((await cells(p))[2] === 7, 'cells are editable'); await c3.fill(String(c.scores[2]));
  await p.click('[data-testid=scan-use]');
  await p.waitForSelector('[data-testid=photo-attached]'); await shot(p, '6-filled'); await noOverflow(p, 'filled pad');
  const padVals = await p.$$eval('.pad-hole .hs', (xs) => xs.map((x) => +x.textContent || null));
  ok(JSON.stringify(padVals) === JSON.stringify(c.scores), 'pad holes filled from the scan (not saved yet)');
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('carry:v1')).leagues);
  const lid = Object.keys(before)[0]; const preSave = before[lid].weeks.find((w) => w.id === 'w7').scores;
  const deeId = before[lid].players.find((x) => x.name === 'Dee Okafor').id;
  ok(JSON.stringify(preSave[deeId].holes) !== JSON.stringify(c.scores), 'nothing saved before the user taps Save');
  await p.click('[data-testid=pad-save]'); await p.waitForTimeout(900);
  const after = await p.evaluate(([lid, id]) => JSON.parse(localStorage.getItem('carry:v1')).leagues[lid].weeks.find((w) => w.id === 'w7').scores[id], [lid, deeId]);
  ok(JSON.stringify(after.holes) === JSON.stringify(c.scores) && !!after.photo, `saved: ${after.holes.join('')} with photo ${after.photo}`);
  const size = await p.evaluate(async (k) => { const db = await new Promise((r) => { const q = indexedDB.open('carry-photos', 1); q.onsuccess = () => r(q.result); }); return new Promise((r) => { const g = db.transaction('cards').objectStore('cards').get(k); g.onsuccess = () => r(g.result ? { size: g.result.size, type: g.result.type } : null); }); }, after.photo);
  ok(size && size.size < 200_000, `photo compressed on device: ${size && Math.round(size.size / 1024)} KB ${size?.type}`);
  await p.reload(); await p.waitForSelector('.entrant');
  const btn = p.locator('.entrant', { has: p.locator('.nm', { hasText: 'Dee Okafor' }) }).locator('[data-testid=entrant-photo]');
  ok(await btn.count() === 1, '"Card" photo button on Dee\'s row after reload');
  await btn.scrollIntoViewIfNeeded(); await shot(p, '7-row-badge');
  await btn.click(); await p.waitForSelector('.lightbox-img img'); await p.waitForFunction(() => document.querySelector('.lightbox-img img')?.naturalWidth > 0);
  await shot(p, '8-lightbox'); await noOverflow(p, 'lightbox');
  await p.click('.lightbox [aria-label=Close]');
  // commissioner deletes the card → photo goes too
  const row = p.locator('.entrant', { has: p.locator('.nm', { hasText: 'Dee Okafor' }) }).first();
  await row.locator('.acts .btn').first().click(); await p.waitForSelector('[data-testid=view-card]'); await shot(p, '9-pad-with-photo');
  await p.click('[aria-label="Delete card"]'); await p.waitForTimeout(800);
  const gone = await p.evaluate(async (k) => { const db = await new Promise((r) => { const q = indexedDB.open('carry-photos', 1); q.onsuccess = () => r(q.result); }); return new Promise((r) => { const g = db.transaction('cards').objectStore('cards').get(k); g.onsuccess = () => r(g.result == null); }); }, after.photo);
  const rowGone = await p.evaluate(([lid, id]) => !JSON.parse(localStorage.getItem('carry:v1')).leagues[lid].weeks.find((w) => w.id === 'w7').scores[id], [lid, deeId]);
  ok(gone && rowGone, 'deleting the card deleted its photo');
  await p.context().close();
}

// ---------- 360 × 740: multi-player card, pick a row, smallest phone ----------
console.log('360px — 4-player shapes card, row picking, manual fallback');
{
  const p = await open(360, 740);
  const c = truth.cases.find((x) => x.id === 'colors-4p');
  await openPad(p, 'Priya Natarajan'); // not on the card → user must pick
  await scan(p, c.file);
  await noOverflow(p, '360 adjust');
  await p.click('[data-testid=scan-read]');
  await p.waitForSelector('[data-testid=scan-review]', { timeout: 120000 });
  const rows = await p.locator('[data-testid=scan-row]').allTextContents();
  ok(rows.length === 4, `4 rows offered: ${rows.join(' | ')}`);
  ok(await p.locator('text=Whose row is yours?').count() === 1, 'no name match → asks whose row');
  await shot(p, '10-pick-row-360'); await noOverflow(p, '360 review');
  await p.locator('[data-testid=scan-row]', { hasText: 'Tommy' }).click();
  ok(JSON.stringify(await cells(p)) === JSON.stringify(c.scores), `picked Tommy's row: ${(await cells(p)).join('')}`);
  await shot(p, '11-row-picked-360');
  await p.click('text=Enter manually instead');
  ok(await p.locator('.pad-keys').count() === 1, 'manual fallback returns to the keypad');
  await p.click('[data-testid=scan-open]');
  await p.setInputFiles('[data-testid=scan-file]', FIX + 'shapes-4p.png'); await p.waitForSelector('[data-testid=cropper]');
  await p.click('[aria-label="Rotate 90°"]'); await p.waitForTimeout(400); await shot(p, '12-rotated-360'); await noOverflow(p, '360 rotated');
  await p.context().close();
}

// ---------- not a scorecard → friendly error + manual ----------
console.log('390px — a photo with no scorecard');
{
  const p = await open(390, 844);
  await openPad(p, 'Sam Castellano');
  await p.click('[data-testid=scan-open]');
  await p.setInputFiles('[data-testid=scan-file]', new URL('../docs/', import.meta.url).pathname + fs.readdirSync('docs').find((f) => f.endsWith('.jpg')));
  await p.waitForSelector('[data-testid=cropper]'); await p.click('[data-testid=scan-read]');
  await p.waitForSelector('[data-testid=scan-error], [data-testid=scan-review]', { timeout: 120000 });
  const err = await p.locator('[data-testid=scan-error]').count();
  ok(err === 1, 'non-scorecard photo → "Couldn\'t read that card" with retry + manual options');
  if (err) await shot(p, '13-error');
  await p.context().close();
}

await browser.close();
const pass = checks.filter((c) => c[0]).length;
console.log(`\n${pass}/${checks.length} checks passed`);
if (problems.length) { console.log('PROBLEMS:\n' + problems.map((x) => ' - ' + x).join('\n')); process.exit(1); }
