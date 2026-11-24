// End-to-end for the Nov 2026 batch: tees, skins opt-in + payout, out/subs, handicap chart, seasons,
// missing-cards banner, wizard course picker (local mode), plus sign-in help and the admin screen
// against a mocked Supabase (no real accounts touched).
// Usage: node scripts/batch-e2e.mjs [baseUrl]   (default http://localhost:4173/ — run `npx vite preview` first)
// Screenshots → screenshots/batch-*.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p)), args: ['--no-sandbox'] });
const problems = []; let fails = 0;
const ok = (cond, msg, d = '') => { console.log(`  ${cond ? '✓' : '✗'} ${msg} ${d}`); if (!cond) { fails++; problems.push(msg); } };
async function open({ vw = 390, vh = 844, prefs = { theme: 'dark', onboarded: true, mode: 'local' }, store = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: vw < 800, hasTouch: vw < 800, reducedMotion: 'reduce' });
  await ctx.addInitScript(([prefs, store]) => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('carry:prefs', JSON.stringify(prefs)); for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v); sessionStorage.setItem('init', '1'); } }, [prefs, store]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|Failed to load resource|mock\.supabase/.test(m.text())) problems.push(`console: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
  return p;
}
const shot = async (p, name, opts = {}) => { await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}batch-${name}.png`, ...opts }); console.log('    📸 screenshots/batch-' + name + '.png'); };
const text = (p) => p.evaluate(() => document.body.innerText);
const league = async (p) => { await p.waitForTimeout(700); return p.evaluate(() => { const db = JSON.parse(localStorage.getItem('carry:v1') || '{}'); return Object.values(db.leagues || {}).find((l) => l.weeks || l.archive) || null; }); };
const entrant = (p, name) => p.locator('.entrant', { has: p.locator('.nm', { hasText: name }) });

console.log('Week 7: skins opt-in, missing banner, out & subs');
let p = await open();
await p.goto(BASE + '#/scores/w7'); await p.waitForSelector('[data-testid=skins-toggle]', { timeout: 15000 });
const toggles = p.locator('[data-testid=skins-toggle]');
ok((await toggles.count()) === 8, 'every entrant has a skins checkbox', String(await toggles.count()));
const onBefore = await p.locator('[data-testid=skins-toggle][aria-pressed=true]').count();
ok(onBefore === 6, 'seeded week 7: 6 of 8 in skins', String(onBefore));
ok(await p.locator('[data-testid=missing-cards]').isVisible(), 'missing-cards banner shows');
const miss = await p.locator('[data-testid=missing-cards]').innerText();
ok(/card/i.test(miss), 'banner names the missing cards', JSON.stringify(miss.slice(0, 90)));
await shot(p, '01-week-skins-missing');
await toggles.first().click(); await p.waitForTimeout(200);
ok((await p.locator('[data-testid=skins-toggle][aria-pressed=true]').count()) === onBefore - 1, 'unticking a player removes them from skins');
await toggles.first().click(); await p.waitForTimeout(200);
// out / sub — find an entrant with an incomplete card
const rows = p.locator('.entrant');
const n = await rows.count();
let target = null;
for (let i = 0; i < n; i++) { const t = await rows.nth(i).innerText(); if (!/\b\d{2}\b.*net|Net/.test(t) && /Out \/ sub/.test(t)) { target = rows.nth(i); break; } }
if (!target) target = rows.last();
const targetName = (await target.locator('.nm').innerText()).trim();
await target.getByRole('button', { name: /Mark out or bring in a sub/ }).click();
await p.waitForSelector('[data-testid=sub-save]');
ok(/no handicap/.test(await text(p)), 'sub sheet says a new sub starts with no handicap');
ok((await p.locator('[data-testid=sub-saved]').count()) >= 2, 'saved subs are listed');
await shot(p, '02-sub-sheet');
await p.fill('[data-testid=sub-name]', 'Pat Newsub'); await p.click('[data-testid=sub-save]'); await p.waitForTimeout(400);
ok(await entrant(p, 'Pat Newsub').count() > 0, 'new sub appears in the week');
let L = await league(p);
ok(L.subPlayers.some((s) => s.name === 'Pat Newsub' && !('index' in s)), 'new sub saved to league.subPlayers with no handicap');
ok(Object.values(L.weeks.find((w) => w.id === 'w7').subs).some((s) => s.name === 'Pat Newsub' && s.playerId && s.index === undefined), 'week sub stored by playerId, no borrowed index');
// mark the sub's slot out instead
await entrant(p, 'Pat Newsub').getByRole('button', { name: /Edit substitute/ }).click();
await p.click('[data-testid=sub-mark-out]'); await p.waitForTimeout(400);
ok(await p.locator('[data-testid=entrant-out]').count() === 1, 'player marked out shows as OUT row');
L = await league(p);
ok(Object.keys(L.weeks.find((w) => w.id === 'w7').out || {}).length === 1, 'week.out records the absence');
await p.locator('[data-testid=entrant-out]').scrollIntoViewIfNeeded(); await shot(p, '03-week-out');
await p.context().close();

console.log('Tees: GSPro picker with real tee ratings → course → week tee dropdown');
p = await open();
await p.goto(BASE + '#/courses'); await p.waitForSelector('[data-testid=course-add]');
await p.click('[data-testid=course-add]');
await p.waitForSelector('[data-testid=course-result]', { timeout: 20000 });
await p.fill('[data-testid=course-search]', 'Abacoa'); await p.waitForTimeout(300);
await p.locator('[data-testid=course-result]').first().click();
await p.waitForSelector('[data-testid=course-tees]', { timeout: 10000 });
const teeOpts = await p.locator('[data-testid=course-tees] .tee-opt').allInnerTexts();
ok(teeOpts.length >= 3 && teeOpts.some((t) => /Black/.test(t)) && teeOpts.some((t) => /Another tee/.test(t)), 'tee list from the scorecard + manual fallback', teeOpts.map((t) => t.replace(/\s+/g, ' ')).join(' | '));
await shot(p, '04-tee-picker');
await p.click('[data-testid=course-use]');
await p.waitForSelector('[data-testid=tee-boxes]', { timeout: 10000 });
await p.getByRole('button', { name: /^Save/ }).last().click(); await p.waitForTimeout(500);
L = await league(p);
const ab = L.courses.find((c) => /Abacoa/.test(c.name));
ok(ab && ab.teeSets?.length >= 3 && ab.teeSets.every((t) => t.rating > 25 && t.slope >= 55), 'course saved with all real tee sets', ab ? ab.teeSets.map((t) => `${t.name} ${t.rating}/${t.slope}`).join(', ') : 'none');
const base = ab && { rating: ab.rating, slope: ab.slope };
// put week 7 on Abacoa via the week sheet, then switch tees with the dropdown
await p.goto(BASE + '#/scores/w7'); await p.waitForSelector('[data-testid=skins-toggle]');
await p.getByRole('button', { name: /Week$/ }).click();
await p.locator('.sheet select').first().selectOption({ label: new RegExp('Abacoa') }).catch(async () => { const v = await p.locator('.sheet select').first().locator('option', { hasText: 'Abacoa' }).getAttribute('value'); await p.locator('.sheet select').first().selectOption(v); });
await p.waitForSelector('[data-testid=weeksheet-tee]');
await p.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(400);
await p.waitForSelector('[data-testid=week-tee]');
const black = ab.teeSets.find((t) => t.name === 'Black'); const red = ab.teeSets.find((t) => /Red|Gold|Green/.test(t.name)) || ab.teeSets[ab.teeSets.length - 1];
await p.selectOption('[data-testid=week-tee]', black.name); await p.waitForTimeout(300);
ok((await p.locator('[data-testid=week-rating]').innerText()).includes(String(black.rating)) && (await p.locator('[data-testid=week-slope]').innerText()).includes(String(black.slope)), `Black tee → ${black.rating}/${black.slope} this week`);
await shot(p, '05-week-tee');
await p.selectOption('[data-testid=week-tee]', red.name); await p.waitForTimeout(300);
ok((await p.locator('[data-testid=week-rating]').innerText()).includes(String(red.rating)), `switch to ${red.name} → ${red.rating}/${red.slope}`);
await p.selectOption('[data-testid=week-tee]', black.name); await p.waitForTimeout(300);
L = await league(p);
const ab2 = L.courses.find((c) => c.id === ab.id);
ok(ab2.rating === base.rating && ab2.slope === base.slope && JSON.stringify(ab2.teeSets) === JSON.stringify(ab.teeSets), 'switching tees never changes the saved course');
ok(L.weeks.find((w) => w.id === 'w7').tee === black.name, 'week stores only the tee name');
await p.context().close();

console.log('Skins payout, handicap chart, subs list');
p = await open();
await p.goto(BASE + '#/skins'); await p.waitForSelector('[data-testid=skins-payout]', { timeout: 15000 });
const pay = await p.locator('[data-testid=skins-payout]').innerText();
ok(/Collects/.test(pay) && /\$/.test(pay), 'payout card lists who collects what', JSON.stringify(pay.slice(0, 120)));
await p.locator('[data-testid=skins-payout]').scrollIntoViewIfNeeded(); await shot(p, '06-skins-payout');
await p.goto(BASE + '#/players/p2'); await p.waitForSelector('[data-testid=handicap-chart]', { timeout: 15000 });
const pts = await p.locator('[data-testid=handicap-chart] circle').count();
ok(pts >= 3, 'handicap chart plots one point per week', String(pts));
await p.locator('[data-testid=handicap-chart]').scrollIntoViewIfNeeded(); await shot(p, '07-handicap-chart');
await p.goto(BASE + '#/players'); await p.waitForTimeout(500);
ok((await p.locator('[data-testid=sub-card]').count()) >= 2, 'Players shows saved subs with their own handicap');
await p.context().close();

console.log('Season close-out');
p = await open();
await p.goto(BASE + '#/league'); await p.waitForSelector('[data-testid=seasons]', { timeout: 15000 });
const oldSeason = (await league(p)).season;
await p.click('[data-testid=season-close]'); await p.waitForSelector('[data-testid=season-confirm]');
await p.fill('[data-testid=season-name]', '2026 Fall');
await shot(p, '08-season-close');
await p.click('[data-testid=season-confirm]'); await p.waitForTimeout(600);
L = await league(p);
ok(L.archive?.length === 1 && L.archive[0].season === oldSeason && L.archive[0].weeks.length >= 7 && L.season === '2026 Fall', `"${oldSeason}" archived with its weeks; now "2026 Fall"`);
ok(L.weeks.length === 0 && L.players.length >= 8, 'fresh season: no weeks, same roster');
await p.goto(BASE + '#/league'); await p.waitForSelector('[data-testid=season-row]');
ok(new RegExp(oldSeason).test(await p.locator('[data-testid=season-row]').innerText()) && (await p.locator('[data-testid=season-row] button').count()) >= 2, 'past season listed with View / Excel');
await p.locator('[data-testid=seasons]').scrollIntoViewIfNeeded(); await shot(p, '09-seasons');
await p.context().close();

console.log('Create-league wizard uses the GSPro picker');
p = await open({ prefs: { theme: 'dark', onboarded: false, mode: 'local' } });
await p.goto(BASE); await p.waitForTimeout(800);
await p.getByRole('button', { name: /Start my own league/ }).click();
await p.getByPlaceholder('Thursday Night Sim League').fill('Test Night League');
await p.getByRole('button', { name: /^Next/ }).click();
for (let i = 0; i < 4; i++) await p.getByPlaceholder(`Player ${i + 1}`).fill(['Amy A', 'Bo B', 'Cy C', 'Di D'][i]);
await p.getByRole('button', { name: /^Next/ }).click(); await p.waitForTimeout(300);
const wiz = await p.locator('[data-testid=wizard-find-course]').count();
ok(wiz > 0, 'wizard shows "Find a GSPro course"');
if (wiz) {
  await p.click('[data-testid=wizard-find-course]');
  await p.waitForSelector('[data-testid=course-search]', { timeout: 20000 });
  await p.fill('[data-testid=course-search]', 'Abacoa'); await p.waitForTimeout(300);
  ok((await p.locator('[data-testid=course-result]').count()) > 0, 'wizard opens the searchable picker');
  await shot(p, '12-wizard-picker');
}
await p.context().close();

console.log('Cloud (mocked Supabase): sign-in help, admin screen');
const MOCK = 'https://mock.supabase.co';
const cloudStore = { 'carry:cloud': JSON.stringify({ url: MOCK, key: 'mock-anon-key' }) };
p = await open({ prefs: { theme: 'dark', onboarded: true, mode: 'cloud' }, store: cloudStore });
await p.route(MOCK + '/**', (r) => {
  const u = r.request().url();
  if (u.includes('/auth/v1/token')) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) });
  if (u.includes('/auth/v1/signup')) return r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 422, error_code: 'user_already_exists', msg: 'User already registered' }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await p.goto(BASE); await p.waitForSelector('text=Sign in', { timeout: 15000 });
await p.getByLabel('Email').fill('golfer@example.com'); await p.getByLabel(/^Password/).fill('wrong-password-1');
await p.getByRole('button', { name: 'Sign in', exact: true }).click();
await p.waitForSelector('[data-testid=account-exists]', { timeout: 10000 });
let ex = await p.locator('[data-testid=account-exists]').innerText();
ok(/Email me a code/.test(ex) && /Forgot password/.test(ex), 'wrong password → code + reset options');
await p.getByRole('button', { name: /New here\? Create an account/ }).click().catch(() => {});
await p.getByLabel(/^Password/).fill('another-pass-12');
await p.getByRole('button', { name: 'Create account' }).click();
await p.waitForTimeout(800);
ex = await p.locator('[data-testid=account-exists]').innerText().catch(() => '');
ok(/already/i.test(ex) && /Email me a code/.test(ex), 'sign-up with an existing email → "already has an account" + code/reset', JSON.stringify(ex.slice(0, 80)));
ok(!p.url().includes('#/#'), 'no stray redirect hash');
await shot(p, '10-signup-exists');
await p.context().close();

// admin: a signed-in session (fake JWT, mocked endpoints)
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', exp: now + 3600, role: 'authenticated', email: 'admin@example.com' })}.sig`;
const user = { id: 'u-admin', email: 'admin@example.com', aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user };
const overview = { // same shape as public.admin_overview() in supabase/admin.sql
  users: [
    { id: 'u-admin', email: 'admin@example.com', created_at: '2026-09-01T12:00:00Z', last_sign_in_at: '2026-11-24T15:00:00Z', confirmed: true, has_password: true, providers: ['email'], admin: true, leagues: [{ id: 'L1', name: 'Thursday Sim League', role: 'commissioner', player_id: 'p1' }] },
    { id: 'u-2', email: 'player.one@example.com', created_at: '2026-10-02T12:00:00Z', last_sign_in_at: null, confirmed: false, has_password: false, providers: ['email'], admin: false, leagues: [] },
  ],
  leagues: [{ id: 'L1', name: 'Thursday Sim League', season: 'Fall 2026', invite_code: 'ABC234', owner: 'u-admin', owner_email: 'admin@example.com', created_at: '2026-09-01T12:00:00Z', updated_at: '2026-11-20T12:00:00Z', players: 8, weeks: 7, seasons: 0, members: 8, cards: 52, pending: 1 }],
  audit: [{ id: 1, at: '2026-11-24T15:10:00Z', actor: 'u-admin', actor_email: 'admin@example.com', action: 'set_score', league_id: 'L1', target: 'p3', detail: { week: 'w7', reason: 'typo on hole 4' } }],
};
let rpcCalls = [];
p = await open({ prefs: { theme: 'dark', onboarded: true, mode: 'cloud' }, store: { ...cloudStore, 'carry-auth': JSON.stringify(session) } });
await p.route(MOCK + '/**', (r) => {
  const u = r.request().url();
  if (u.includes('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
  const m = u.match(/\/rest\/v1\/rpc\/(\w+)/);
  if (m) { rpcCalls.push(m[1]); const body = m[1] === 'am_i_admin' ? 'true' : m[1] === 'admin_overview' ? JSON.stringify(overview) : 'null'; return r.fulfill({ status: 200, contentType: 'application/json', body }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await p.goto(BASE + '#/admin'); await p.waitForSelector('[data-testid=admin-tiles]', { timeout: 15000 });
ok(rpcCalls.includes('am_i_admin') && rpcCalls.includes('admin_overview'), 'admin screen asks the server (am_i_admin, admin_overview)', rpcCalls.join(','));
ok(/Thursday Sim League/.test(await text(p)) && /52/.test(await p.locator('[data-testid=admin-tiles]').innerText()), 'admin lists leagues and card totals');
await shot(p, '11-admin');
await p.locator('.seg button', { hasText: 'Accounts' }).click(); await p.waitForTimeout(300);
ok(/never signed in/.test(await text(p)), 'accounts tab flags accounts that need a look');
await p.locator('.seg button', { hasText: 'Audit log' }).click(); await p.waitForTimeout(300);
ok(/set_score|Card|score/i.test(await p.locator('[data-testid=admin-audit]').innerText()), 'audit log lists changes');
await p.context().close();
// non-admin: no Admin link, route refused
p = await open({ prefs: { theme: 'dark', onboarded: true, mode: 'cloud' }, store: { ...cloudStore, 'carry-auth': JSON.stringify(session) } });
await p.route(MOCK + '/**', (r) => {
  const u = r.request().url();
  if (u.includes('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
  if (u.includes('/rpc/am_i_admin')) return r.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await p.goto(BASE + '#/admin'); await p.waitForTimeout(2500);
ok(!(await p.locator('[data-testid=admin-tiles]').count()), 'non-admin never sees the admin screen');
await p.context().close();

const real = problems.filter((x) => /pageerror|console/.test(x));
ok(real.length === 0, 'no page errors', real.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exitCode = fails ? 1 : 0;
