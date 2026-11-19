// End-to-end: GSPro course library picker through the real UI (local mode), at phone sizes.
// Usage: node scripts/courses-e2e.mjs [baseUrl]   (default http://localhost:4173/ — run `npx vite preview` first)
// Screenshots → screenshots/courses-*.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const problems = []; const checks = [];
const ok = (cond, msg) => { checks.push(!!cond); console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) problems.push(msg); };
async function open(vw, vh, extra = {}) {
  const ctx = await browser.newContext({ ...extra, viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('carry:prefs', JSON.stringify({ theme: 'dark', onboarded: true, mode: 'local' })); sessionStorage.setItem('init', '1'); } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[${vw}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|Failed to load resource/.test(m.text())) problems.push(`[${vw}] console: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
  return p;
}
const shot = async (p, name) => { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}courses-${name}.png` }); console.log('    📸 courses-' + name); };
const noOverflow = async (p, label) => {
  const r = await p.evaluate(() => {
    const out = []; const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) out.push(`page ${de.scrollWidth}>${de.clientWidth}`);
    document.querySelectorAll('.sheet-body').forEach((s) => { if (s.scrollWidth > s.clientWidth + 1) out.push(`sheet ${s.scrollWidth}>${s.clientWidth}`); });
    document.querySelectorAll('.sheet .btn, .sheet .seg button').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) out.push(`clipped "${b.textContent.trim()}"`); });
    return out;
  });
  ok(!r.length, `${label}: no overflow${r.length ? ' — ' + r.join('; ') : ''}`);
};
const names = (p) => p.$$eval('[data-testid=course-result] .cr-name', (xs) => xs.map((x) => x.textContent));
const search = async (p, q) => { await p.fill('[data-testid=course-search]', q); await p.waitForTimeout(150); };

console.log('390px — search, set up a nine from the scorecard, save');
{
  const p = await open(390, 844);
  await p.goto(BASE + '#/courses'); await p.waitForSelector('[data-testid=course-add]');
  await p.click('[data-testid=course-add]');
  await p.waitForSelector('[data-testid=course-result]', { timeout: 20000 });
  const count = await p.textContent('[data-testid=course-count]');
  ok(/[23],\d{3} matches/.test(count), `library loaded: ${count}`);
  ok((await p.locator('[data-testid=course-credit]').textContent()).includes('Simulator Golf Tour'), 'credit: "Course list courtesy of Simulator Golf Tour"');
  await shot(p, '1-browse'); await noOverflow(p, 'browse');
  await search(p, 'pinehurst'); ok((await names(p))[0]?.includes('Pinehurst'), `"pinehurst" → ${(await names(p)).slice(0, 3).join(', ')}`);
  await shot(p, '2-search');
  await search(p, 'torey suoth'); ok((await names(p))[0] === 'Torrey South', `typo "torey suoth" → ${(await names(p))[0]}`);
  await search(p, 'la jolla'); ok((await names(p)).includes('Torrey South'), 'location search "la jolla" finds Torrey South');
  await search(p, ''); await p.click('.course-filters .seg >> text=9-hole');
  const tags = await p.$$eval('[data-testid=course-result]', (xs) => xs.slice(0, 20).every((x) => x.textContent.includes('9 holes')));
  ok(tags, '9-hole filter shows only 9-hole designs');
  await p.click('.course-filters .seg >> text=All');
  await search(p, 'torrey south');
  await p.locator('[data-testid=course-result]', { hasText: 'Torrey South' }).first().click();
  await p.waitForSelector('[data-testid=course-setup]');
  const img = await p.waitForFunction(() => { const i = document.querySelector('[data-testid=course-scorecard] img'); return i && i.complete && i.naturalWidth > 0 && i.naturalWidth; }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => 0);
  ok(img > 300, `SGT scorecard image shown (${img}px wide)`);
  ok((await p.textContent('[data-testid=course-estimate]')).includes('Estimated from GSPro difficulty'), 'default values labelled "Estimated from GSPro difficulty"');
  await shot(p, '3-setup-estimate'); await noOverflow(p, 'setup');
  // Back nine of Torrey South from the card: pars 4 3 4 5 4 4 3 4 5, index 12 11 10 9 8 7 6 4 2, Blue 75.0/139, par 72.
  await p.click('.sheet .seg >> text=Back 9');
  const pars = [4, 3, 4, 5, 4, 4, 3, 4, 5], idx = [12, 11, 10, 9, 8, 7, 6, 4, 2];
  for (let i = 0; i < 9; i++) { await p.fill(`[aria-label="Par hole ${i + 10}"]`, String(pars[i])); await p.fill(`[aria-label="Card index hole ${i + 10}"]`, String(idx[i])); }
  await p.click('.sheet .seg >> text=From the card');
  await p.fill('.field:has-text("Tee") input', 'Blue');
  await p.fill('[data-testid=course-r18]', '75.0'); await p.fill('[data-testid=course-s18]', '139');
  const nv = await p.textContent('[data-testid=course-nine-values]');
  ok(/rating 37\.5/.test(nv) && /slope 139/.test(nv), `WHS 9-hole: ${nv.replace(/\s+/g, ' ').slice(0, 80)}`);
  await p.locator('[data-testid=course-nine-values]').scrollIntoViewIfNeeded();
  await shot(p, '4-from-card'); await noOverflow(p, 'from card');
  await p.click('[data-testid=course-use]');
  await p.waitForSelector('text=New course');
  const nm = await p.inputValue('.field:has-text("Course name") input');
  ok(nm === 'Torrey South — Back Nine', `editor prefilled: ${nm}`);
  ok(await p.inputValue('.field:has-text("Course rating") input') === '37.5' && await p.inputValue('.field:has-text("Slope") input') === '139', 'rating 37.5 / slope 139 carried over');
  const si = await p.$$eval('[aria-label^="Stroke index hole"]', (xs) => xs.map((x) => +x.value));
  ok(JSON.stringify(si) === '[9,8,7,6,5,4,3,2,1]', `card index ranked to 1–9: ${si.join(' ')}`);
  ok((await p.textContent('[data-testid=course-source]')).includes('From the scorecard'), 'source noted in the editor');
  await shot(p, '5-editor');
  await p.click('text=Save course');
  await p.waitForSelector('text=Torrey South — Back Nine');
  const saved = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('carry:v1')).leagues)[0].courses.find((c) => c.name.startsWith('Torrey')));
  if (!(typeof saved?.lib?.id === 'number' && saved.lib.nine === 'back' && saved.par === 36 && saved.rating === 37.5)) console.log('    saved =', JSON.stringify(saved));
  ok(typeof saved?.lib?.id === 'number' && saved.lib.nine === 'back' && saved.par === 36 && saved.rating === 37.5, 'saved in the league with its library id');
  await shot(p, '6-saved');
  // Entered once per league: picking it again offers the saved one.
  await p.click('[data-testid=course-add]'); await p.waitForSelector('[data-testid=course-result]');
  await search(p, 'torrey south');
  ok(await p.locator('[data-testid=course-result]', { hasText: 'Torrey South' }).first().locator('.tag.mine').count() === 1, '"In your league" tag on the result');
  await p.locator('[data-testid=course-result]', { hasText: 'Torrey South' }).first().click();
  await p.click('.sheet .seg >> text=Back 9');
  ok(await p.locator('[data-testid=course-saved]').count() === 1, 'setup offers "Already in your league"');
  await p.context().close();
}

console.log('360px — week settings entry point, manual entry, offline failure');
{
  const p = await open(360, 740);
  await p.goto(BASE + '#/scores/w7'); await p.waitForSelector('.entrant');
  await p.getByRole('button', { name: 'Week', exact: true }).click(); await p.waitForSelector('[data-testid=week-find-course]');
  await p.click('[data-testid=week-find-course]'); await p.waitForSelector('[data-testid=course-result]', { timeout: 20000 });
  await search(p, 'st andrews'); await shot(p, '7-week-360'); await noOverflow(p, '360 picker');
  const first = (await names(p))[0];
  ok(!!first, `360: "st andrews" → ${first}`);
  await p.locator('[data-testid=course-result]').first().click(); await p.waitForSelector('[data-testid=course-setup]');
  await shot(p, '8-setup-360'); await noOverflow(p, '360 setup');
  await p.click('[data-testid=course-use]'); await p.getByRole('button', { name: 'Save course' }).click();
  await p.waitForTimeout(300);
  const sel = await p.$eval('.sheet select', (s) => s.options[s.selectedIndex].textContent);
  ok(sel.includes(first.slice(0, 12)), `week course switched to the new course: ${sel}`);
  await p.context().close();
}
{
  const p = await open(360, 740, { serviceWorkers: 'block' }); // so page.route sees the request
  await p.route('**/courses.json', (r) => r.fulfill({ status: 503, body: 'down' }));
  await p.goto(BASE + '#/courses'); await p.waitForSelector('[data-testid=course-add]');
  await p.click('[data-testid=course-add]'); await p.waitForSelector('.warn-card');
  ok(/Couldn't load the course list/.test(await p.textContent('.warn-card')), 'list unavailable → friendly error');
  await shot(p, '9-unavailable-360');
  await p.click('[data-testid=course-manual]'); await p.waitForSelector('text=New course');
  ok(true, 'manual entry still works');
  await p.context().close();
}
await browser.close();
console.log(`\n${checks.filter(Boolean).length}/${checks.length} checks passed`);
if (problems.length) { console.log('PROBLEMS:\n' + problems.map((x) => ' - ' + x).join('\n')); process.exit(1); }
