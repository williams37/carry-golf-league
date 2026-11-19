// Screenshots + layout checks with headless Chrome. Usage: node scripts/screenshots.mjs [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const problems = [];

async function page(vw, vh, { theme = 'dark', onboarded = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await ctx.addInitScript(([theme, onboarded]) => {
    if (!sessionStorage.getItem('init')) {
      localStorage.clear();
      localStorage.setItem('carry:prefs', JSON.stringify({ theme, onboarded, mode: 'local' }));
      sessionStorage.setItem('init', '1');
    }
  }, [theme, onboarded]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[${vw}] pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && problems.push(`[${vw}] console: ${m.text()}`));
  return p;
}
async function nav(p, hash) { await p.goto(BASE + '#/' + hash); await p.waitForTimeout(700); }
async function shot(p, name, full = false) { await p.waitForTimeout(350); await p.screenshot({ path: OUT + name + '.png', fullPage: full }); console.log('  ✓', name); }

async function checkLayout(p, label) {
  const r = await p.evaluate(() => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) out.push(`horizontal overflow ${de.scrollWidth} > ${de.clientWidth}`);
    const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    document.querySelectorAll('.entrant').forEach((row, i) => {
      const parts = ['.info', '.score', '.holes', '.acts'].map((s) => [s, row.querySelector(s)?.getBoundingClientRect()]).filter((x) => x[1]);
      const btns = [...row.querySelectorAll('.acts .btn')].map((b) => b.getBoundingClientRect());
      for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++)
        if (overlap(parts[a][1], parts[b][1])) out.push(`entrant ${i}: ${parts[a][0]} overlaps ${parts[b][0]}`);
      for (let a = 0; a < btns.length; a++) for (let b = a + 1; b < btns.length; b++) if (overlap(btns[a], btns[b])) out.push(`entrant ${i}: buttons overlap`);
      const rr = row.getBoundingClientRect();
      [...row.querySelectorAll('.btn, .nm, .g')].forEach((el) => { const b = el.getBoundingClientRect(); if (b.right > rr.right + 0.5) out.push(`entrant ${i}: ${el.className} sticks out`); });
    });
    // text clipped in buttons
    document.querySelectorAll('.btn').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) out.push(`button text clipped: "${b.textContent.trim()}"`); });
    return out;
  });
  r.forEach((x) => problems.push(`[${label}] ${x}`));
}

console.log('mobile 360');
{
  const p = await page(360, 780, { onboarded: false });
  await nav(p, 'home'); await shot(p, 'm01-welcome');
  await p.click('text=Explore the demo league'); await p.waitForTimeout(600);
  await shot(p, 'm02-home'); await shot(p, 'm02-home-full', true); await checkLayout(p, 'm-home');
  await nav(p, 'scores/w7'); await shot(p, 'm03-scores'); await shot(p, 'm03-scores-full', true); await checkLayout(p, 'm-scores');
  await p.locator('.entrant .acts .btn').nth(2).click(); await p.waitForTimeout(600); await shot(p, 'm04-scorepad');
  await p.keyboard.press('Escape');
  await nav(p, 'scores/w6'); await checkLayout(p, 'm-scores-w6'); await shot(p, 'm05-scores-w6-sub', true);
  await p.locator('.entrant .acts button:has-text("Sub")').first().click(); await p.waitForTimeout(500); await shot(p, 'm06-sub-sheet'); await p.keyboard.press('Escape');
  await nav(p, 'table'); await shot(p, 'm07-standings'); await checkLayout(p, 'm-table');
  await p.locator('.lb-row').first().click(); await shot(p, 'm07b-standings-expanded');
  await p.click('text=Teams'); await p.waitForTimeout(400); await shot(p, 'm08-teams', true);
  await nav(p, 'skins'); await shot(p, 'm09-skins'); await shot(p, 'm09-skins-full', true); await checkLayout(p, 'm-skins');
  await nav(p, 'players'); await shot(p, 'm10-players'); await checkLayout(p, 'm-players');
  await nav(p, 'players/' + (await p.evaluate(() => JSON.parse(localStorage.getItem('carry:v1')).leagues.demo.players[1].id))); await shot(p, 'm11-player-sheet');
  await nav(p, 'courses'); await shot(p, 'm12-courses'); await checkLayout(p, 'm-courses');
  await nav(p, 'rules'); await shot(p, 'm13-rules'); await checkLayout(p, 'm-rules');
  await p.fill('input[aria-label="Search rules"]', 'bunker'); await p.waitForTimeout(300); await shot(p, 'm14-rules-search');
  await nav(p, 'league'); await shot(p, 'm15-league', true); await checkLayout(p, 'm-league');
  await nav(p, 'more'); await shot(p, 'm16-more');
}
console.log('mobile light');
{
  const p = await page(390, 844, { theme: 'light' });
  await nav(p, 'home'); await shot(p, 'm20-home-light'); await nav(p, 'scores/w7'); await shot(p, 'm21-scores-light'); await checkLayout(p, 'm-light');
  await nav(p, 'skins'); await shot(p, 'm22-skins-light');
}
console.log('desktop 1440');
{
  const p = await page(1440, 900);
  await nav(p, 'home'); await shot(p, 'd01-home'); await checkLayout(p, 'd-home');
  await nav(p, 'scores/w7'); await shot(p, 'd02-scores'); await checkLayout(p, 'd-scores');
  await p.locator('.entrant .acts .btn').first().click(); await p.waitForTimeout(600); await shot(p, 'd03-scorepad'); await p.keyboard.press('Escape');
  await nav(p, 'table'); await shot(p, 'd04-standings');
  await nav(p, 'skins'); await shot(p, 'd05-skins');
  await nav(p, 'players'); await shot(p, 'd06-players');
  await nav(p, 'rules'); await shot(p, 'd07-rules');
  await nav(p, 'league'); await shot(p, 'd08-league');
  await p.click('text=Week'); 
}
console.log('tv 1920');
{
  const p = await page(1920, 1080);
  await nav(p, 'tv'); await p.waitForTimeout(1200); await shot(p, 'tv01-board');
}
console.log('welcome wizard');
{
  const p = await page(390, 844, { onboarded: false });
  await nav(p, 'home'); await p.click('text=Start my own league'); await p.fill('input[placeholder="Thursday Night Sim League"]', 'Basement Birdies');
  await p.click('text=Next'); await p.waitForTimeout(300);
  const names = ['Alex', 'Blair', 'Casey', 'Drew', 'Emery', 'Finn', 'Gray', 'Harper'];
  for (let i = 0; i < 8; i++) await p.fill(`input[placeholder="Player ${i + 1}"]`, names[i]);
  await shot(p, 'w01-wizard-players');
  await p.click('text=Next'); await p.waitForTimeout(300); await shot(p, 'w02-wizard-course');
  await p.click('text=Create league'); await p.waitForTimeout(900); await shot(p, 'w03-new-league-week1', true); await checkLayout(p, 'w-new');
}
console.log('cloud sign-in (unreachable test server → must show errors, never hang)');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('init')) return;
    localStorage.clear();
    localStorage.setItem('carry:prefs', JSON.stringify({ theme: 'dark', onboarded: true, mode: 'cloud' }));
    localStorage.setItem('carry:cloud', JSON.stringify({ url: 'https://carry-test.invalid', key: 'x'.repeat(40) }));
    sessionStorage.setItem('init', '1');
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[auth] pageerror: ${e.message}`));
  await p.goto(BASE + '?error=access_denied&error_description=Email+link+is+invalid+or+has+expired#/home');
  await p.waitForSelector('text=Email link is invalid or has expired', { timeout: 15000 });
  if (p.url().includes('error_description')) problems.push('[auth] callback params not cleaned from URL');
  await shot(p, 'a01-signin-callback-error');
  await p.fill('input[type=email]', 'dee@example.com');
  await p.fill('input[type=password]', 'not-a-real-password');
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForSelector('.banner.err', { timeout: 20000 });
  await shot(p, 'a02-signin-network-error');
  await p.click('text=Just looking? Explore the demo league'); await p.waitForTimeout(1500);
  if (!(await p.locator('.welcome, .app').count())) problems.push('[auth] offline fallback failed');
  await shot(p, 'a03-offline-fallback');
}
console.log('single-file build over file://');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[single] pageerror: ${e.message}`));
  await p.goto('file://' + new URL('../dist-single/index.html', import.meta.url).pathname);
  await p.waitForSelector('text=Explore the demo league', { timeout: 10000 });
  console.log('  ✓ single file opens on cloud sign-in (built-in project)');
  await p.click('text=Explore the demo league'); await p.waitForSelector('.hero', { timeout: 8000 });
  const dl = p.waitForEvent('download', { timeout: 20000 });
  await p.goto(p.url().split('#')[0] + '#/league'); await p.waitForTimeout(500);
  await p.click('text=Export to Excel');
  const file = await dl; await file.saveAs(OUT + '../samples/exported-from-single-file.xlsx');
  console.log('  ✓ single file renders + Excel download works:', file.suggestedFilename());
}
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'No layout problems or console errors found.');
