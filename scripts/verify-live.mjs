// Verify the deployed site. Usage: node scripts/verify-live.mjs [liveUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const LIVE = process.argv[2] || 'https://williams37.github.io/carry-golf-league/';
const OUT = new URL('../screenshots/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p)), args: ['--no-sandbox'] });
let fails = 0; const errs = [];
const ok = (n, c, d = '') => { console.log(c ? '  ✓' : '  ✗', n, d); if (!c) fails++; };
async function fresh(vw = 390, vh = 844) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`console ${m.text()} @ ${m.location()?.url || ''}`));
  p.on('response', (r) => r.status() >= 400 && r.url().startsWith(LIVE) && errs.push(`${r.status()} ${r.url()}`));
  return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);

let p = await fresh();
const r = await p.goto(LIVE, { waitUntil: 'networkidle' });
ok('live URL returns 200', r.status() === 200, String(r.status()));
await p.waitForSelector('text=Sign in', { timeout: 15000 });
ok('cloud sign-in screen renders', /Password/.test(await text(p)) && /Explore the demo league/.test(await text(p)));
await p.waitForTimeout(1500); await p.screenshot({ path: OUT + 'live-01-sign-in.png' });
const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return r?.scope || null; });
ok('service worker scoped to the app path', sw === LIVE || sw === null, String(sw));
const man = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); return { url: r.url, ok: r.ok }; });
ok('manifest loads under the app path', man.ok && man.url.startsWith(LIVE), man.url);
// bad password reaches Supabase from the live origin (CORS ok)
await p.getByLabel('Email').fill('nobody@example.com'); await p.getByLabel(/^Password/).fill('wrong-password-123');
await p.getByRole('button', { name: 'Sign in', exact: true }).click();
await p.waitForSelector('.banner.err', { timeout: 15000 });
ok('live origin talks to Supabase (wrong password → friendly error)', /don't match/.test(await p.locator('.banner.err').innerText()));
errs.splice(0, errs.length, ...errs.filter((e) => !/status of 400/.test(e))); // the expected 400 from the bad password
await p.getByText('Just looking? Explore the demo league').click();
await p.waitForSelector('.hero', { timeout: 15000 });
ok('demo league opens', /Clubhouse|Standings/.test(await text(p)));
await p.screenshot({ path: OUT + 'live-02-demo-home.png' });
await p.goto(LIVE + '#/table'); await p.waitForTimeout(1200);
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
ok('hash deep link survives refresh (#/table)', /Standings/.test(await text(p)) && p.url().endsWith('#/table'));
await p.screenshot({ path: OUT + 'live-03-standings-refresh.png' });
await p.context().close();

// invite link the app builds from the live origin
p = await fresh();
await p.goto(LIVE); await p.waitForSelector('text=Sign in');
const built = await p.evaluate(() => `${location.origin}${location.pathname}#/join/ABC234`);
ok('invite link built from live origin', built === LIVE + '#/join/ABC234', built);
await p.goto(built); await p.waitForSelector('text=Join your league', { timeout: 15000 });
ok('invite link opens join sign-in with the code', (await text(p)).includes('ABC234'));
await p.waitForTimeout(1200); await p.screenshot({ path: OUT + 'live-04-invite-link.png' });
await p.reload(); await p.waitForSelector('text=Join your league', { timeout: 15000 });
ok('invite link survives refresh', (await text(p)).includes('ABC234'));
await p.context().close();

// path-style deep link → 404.html SPA fallback → hash route
p = await fresh();
const r2 = await p.goto(LIVE + 'join/XYZ789');
await p.waitForSelector('text=Join your league', { timeout: 15000 });
ok('path deep link /join/XYZ789 falls back to #/join/XYZ789', p.url() === LIVE + '#/join/XYZ789' && (await text(p)).includes('XYZ789'), `${r2.status()} → ${p.url()}`);
errs.splice(0, errs.length, ...errs.filter((e) => !e.includes('/join/XYZ789'))); // GitHub returns 404 status for the fallback page by design
await p.screenshot({ path: OUT + 'live-05-path-deeplink.png' });
await p.context().close();

// desktop render
p = await fresh(1440, 900);
await p.goto(LIVE); await p.waitForSelector('text=Sign in');
await p.waitForTimeout(1500); await p.screenshot({ path: OUT + 'live-06-desktop-sign-in.png' });
await p.context().close();

ok('no console errors / failed app requests', errs.length === 0, errs.join(' | '));
await browser.close();
process.exitCode = fails ? 1 : 0;
