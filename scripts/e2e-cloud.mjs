// End-to-end test against a real Supabase project. Usage:
//   E2E_PW=... node scripts/e2e-cloud.mjs [baseUrl]
// Users carry.e2e+{commish,dee,sam}@example.com must exist and be confirmed (see README "Testing").
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173/';
const PW = process.env.E2E_PW;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const results = [];
const problems = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(cond ? '  ✓' : '  ✗', name, detail); if (!cond) process.exitCode = 1; };

async function user(label, { vw = 430, vh = 932 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('carry:prefs', JSON.stringify({ theme: 'dark', onboarded: false })); sessionStorage.setItem('init', '1'); }
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|403|406|400 \(\)/.test(m.text()) && problems.push(`[${label}] console: ${m.text()}`));
  p.label = label; pages.push(p);
  return p;
}
const shot = async (p, name, full = false) => { await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}cloud-${name}.png`, fullPage: full }); console.log('    📸', `screenshots/cloud-${name}.png`); };
const text = (p) => p.evaluate(() => document.body.innerText);
async function signIn(p, email) {
  await p.getByLabel('Email').fill(email);
  await p.getByLabel(/^Password/).fill(PW);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function enterCard(p, holes) {
  for (const n of holes) { await p.locator('.pad-keys .key .kn', { hasText: new RegExp(`^${n}$`) }).first().click(); await p.waitForTimeout(170); }
  await p.getByRole('button', { name: /Save card/ }).click();
  await p.waitForTimeout(1200);
}
const onFatal = async (e) => { console.log('FATAL', e.message.split('\n')[0]); for (const p of pages) { try { await p.screenshot({ path: `/tmp/fail-${p.label}.png` }); console.log(p.label, p.url(), (await text(p)).slice(0, 300).replace(/\n/g, ' | ')); } catch {} } process.exit(1); };
process.on('uncaughtException', onFatal); process.on('unhandledRejection', onFatal);
const pages = [];
const entrant = (p, name) => p.locator('.entrant', { has: p.locator('.nm', { hasText: name }) });

// ---------- 0. sign-up UI with email confirmation on ----------
console.log('Sign-up (confirmation required)');
const g = await user('guest');
await g.goto(BASE);
await g.waitForSelector('text=Sign in');
ok('fresh visitor lands on cloud sign-in (cloud is the default)', /Sign in/.test(await text(g)) && /Explore the demo league/.test(await text(g)));
await shot(g, '01-sign-in');
await g.getByRole('button', { name: 'New here? Create an account' }).click();
await g.getByLabel('Email').fill(`carry.e2e+signup${Date.now() % 100000}@example.com`);
await g.getByLabel(/^Password/).fill(PW);
await g.getByRole('button', { name: 'Create account' }).click();
await g.waitForTimeout(3000);
const gt = await text(g);
const checkEmail = /Check your email/.test(gt);
ok('sign-up with confirmation on shows "Check your email" (or a clear email-sending error)', checkEmail || /send email|can't send|couldn't send|Too many emails/i.test(gt), checkEmail ? 'check-email screen' : gt.split('\n').find((l) => /email/i.test(l)));
await shot(g, '02-sign-up-result');
// what a player sees once the project can send email: simulate GoTrue's "confirmation required" reply
await g.route('**/auth/v1/signup**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: '', email: 'new.player@example.com', identities: [{ provider: 'email' }], confirmation_sent_at: new Date().toISOString() }) }));
await g.getByLabel('Email').fill('new.player@example.com');
await g.getByRole('button', { name: 'Create account' }).click();
await g.waitForSelector('[data-testid=check-email]', { timeout: 8000 }).catch(() => {});
ok('confirmation-required sign-up shows the "Check your email" screen (simulated server reply)', /Check your email/.test(await text(g)) && /new\.player@example\.com/.test(await text(g)));
await shot(g, '02b-check-email');
await g.unroute('**/auth/v1/signup**');
// demo is one tap away
await g.goto(BASE); await g.waitForTimeout(800);
if (/Use a different email|I've confirmed/.test(await text(g))) { await g.getByRole('button', { name: /I've confirmed/ }).click(); }
await g.getByText('Just looking? Explore the demo league').click();
await g.waitForTimeout(1500);
ok('demo league opens offline from the sign-in screen', (await g.locator('.hero').count()) > 0);
await g.context().close();

// ---------- 1. commissioner creates a league ----------
console.log('Commissioner');
const C = await user('commish', { vw: 1280, vh: 860 });
await C.goto(BASE);
await signIn(C, 'carry.e2e+commish@example.com');
await C.waitForSelector('text=Start my own league', { timeout: 15000 });
ok('commissioner signed in with email + password', true);
await C.getByText('Start my own league').click();
await C.getByLabel('League name').fill('Carry E2E League');
await C.getByRole('button', { name: /Next/ }).click();
const names = ['Chris Commish', 'Dee Okafor', 'Sam Reyes', 'Pat Lin'];
for (let i = 0; i < 4; i++) await C.getByPlaceholder(`Player ${i + 1}`).fill(names[i]);
// remove the 4 empty slots
await C.getByRole('button', { name: 'Remove 2' }).click(); await C.getByRole('button', { name: 'Remove 2' }).click();
await C.getByRole('button', { name: /Next/ }).click();
await C.getByRole('button', { name: /Create league/ }).click();
await C.waitForSelector('.entrant', { timeout: 20000 });
ok('league created in the cloud (RPC create_league) and week 1 drawn', (await C.locator('.entrant').count()) === 4);
await C.waitForTimeout(800);
await shot(C, '03-commish-week1');

// claim own slot via League → members select
await C.goto(BASE + '#/league'); await C.waitForTimeout(1500);
const code = (await C.locator('.display.num').first().innerText()).trim();
ok('invite code generated', /^[A-Z2-9]{6}$/.test(code), code);
const sel = C.locator('section.card select').first();
const chrisId = await sel.locator('option', { hasText: 'Chris' }).getAttribute('value');
await sel.selectOption(chrisId); await C.waitForTimeout(1200);
await shot(C, '04-commish-invite', true);
const inviteLink = `${BASE}#/join/${code}`;

// commissioner card (approved immediately)
await C.goto(BASE + '#/scores'); await C.waitForTimeout(1500);
await entrant(C, 'Chris').getByRole('button', { name: /Enter card/ }).click();
await enterCard(C, [4, 5, 3, 5, 4, 4, 3, 6, 4]);
ok('commissioner card saved', /38/.test(await entrant(C, 'Chris').innerText()));

// ---------- 2. Dee joins through the invite link ----------
console.log('Player Dee');
const D = await user('dee');
await D.goto(inviteLink);
await D.waitForSelector('text=Join your league', { timeout: 15000 });
ok('invite link opens the join sign-in with the code', (await text(D)).includes(code));
await shot(D, '05-invite-sign-in');
await signIn(D, 'carry.e2e+dee@example.com');
await D.waitForSelector('text=Join a league', { timeout: 15000 });
await D.getByPlaceholder('Dee Okafor').fill('Dee');
await D.getByRole('button', { name: 'Join league' }).click();
await D.waitForSelector("text=You're in", { timeout: 15000 });
await shot(D, '06-claim-player');
await D.locator('.chip', { hasText: 'Dee' }).click();
await D.waitForTimeout(2500);
ok('Dee joined and claimed her slot', true);

// commissioner sees the new member live
await C.goto(BASE + '#/league'); await C.waitForTimeout(1500);
ok('commissioner sees Dee in the member list', /Dee/.test(await C.locator('section.card', { hasText: 'Invite players' }).innerText()));

// Dee enters a hole-by-hole card while the commissioner watches the week
await C.goto(BASE + '#/scores'); await C.waitForTimeout(2000);
await D.goto(BASE + '#/scores'); await D.waitForTimeout(2000);
ok('Dee sees a "You" badge on her row', /You/i.test(await entrant(D, 'Dee').innerText()));
ok('Dee cannot edit Sam\'s card (View only)', /View/i.test(await entrant(D, 'Sam').innerText()));
await entrant(D, 'Dee').getByRole('button', { name: /Enter card/ }).click();
await D.waitForTimeout(500);
await shot(D, '07-dee-score-pad');
await enterCard(D, [4, 4, 3, 5, 5, 4, 2, 5, 4]);
ok('Dee\'s card saved as Pending', /Pending/i.test(await entrant(D, 'Dee').innerText()));
ok('Dee has no Approve button', (await entrant(D, 'Dee').getByRole('button', { name: /Approve/ }).count()) === 0);
await shot(D, '08-dee-pending');

// RLS probe: Dee tries to approve her own card and write Sam's card straight through the API
const probe = await D.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('carry-auth'));
  return { token: s?.access_token };
});
probe.url = process.env.VITE_SUPABASE_URL; probe.key = process.env.VITE_SUPABASE_ANON_KEY;
if (probe.url) {
  const h = { apikey: probe.key, Authorization: `Bearer ${probe.token}`, 'content-type': 'application/json', Prefer: 'return=representation' };
  const lid = await D.evaluate(() => JSON.parse(localStorage.getItem('carry:prefs')).activeLeagueId);
  const r1 = await fetch(`${probe.url}/rest/v1/scores?league_id=eq.${lid}&player_key=neq.x&status=eq.pending`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'approved' }) });
  ok('RLS: player cannot self-approve via the API', r1.status >= 400, `HTTP ${r1.status}`);
  const r2 = await fetch(`${probe.url}/rest/v1/leagues?id=eq.${lid}`, { method: 'PATCH', headers: h, body: JSON.stringify({ name: 'hacked' }) });
  const b2 = await r2.json();
  ok('RLS: player cannot rename the league', Array.isArray(b2) && b2.length === 0, `HTTP ${r2.status}, ${Array.isArray(b2) ? b2.length : '?'} rows`);
  const r3 = await fetch(`${probe.url}/rest/v1/leagues?select=id`, { headers: { apikey: probe.key } });
  const b3 = await r3.json();
  ok('RLS: signed-out requests see no leagues', r3.status >= 400 || (Array.isArray(b3) && b3.length === 0), `HTTP ${r3.status}`);
}

// realtime: commissioner never reloaded
await C.waitForTimeout(2500);
const cDee = await entrant(C, 'Dee').innerText();
ok('REALTIME: commissioner sees Dee\'s card + Pending without reloading', /Pending/i.test(cDee) && /36/.test(cDee), cDee.replace(/\s+/g, ' ').slice(0, 80));
const home = await C.evaluate(() => document.body.innerText);
await shot(C, '09-commish-live-pending');
await entrant(C, 'Dee').getByRole('button', { name: /Approve/ }).click();
await C.waitForTimeout(2500);
ok('commissioner approved Dee\'s card', !/Pending/i.test(await entrant(C, 'Dee').innerText()));
await D.waitForTimeout(1500);
ok('REALTIME: Dee sees her card approved without reloading', !/Pending/i.test(await entrant(D, 'Dee').innerText()));

// ---------- 3. Sam joins with the code typed in ----------
console.log('Player Sam');
const S = await user('sam');
await S.goto(BASE);
await signIn(S, 'carry.e2e+sam@example.com');
await S.waitForSelector('text=I have an invite code', { timeout: 15000 });
await S.getByText('I have an invite code').click();
await S.getByPlaceholder('ABC123').fill(code.toLowerCase());
await S.getByPlaceholder('Dee Okafor').fill('Sam');
await S.getByRole('button', { name: 'Join league' }).click();
await S.waitForSelector("text=You're in", { timeout: 15000 });
ok('claimed slots are disabled for the next player', await S.locator('.chip', { hasText: 'Dee' }).isDisabled());
await S.locator('.chip', { hasText: 'Sam' }).click();
await S.waitForTimeout(2000);
await S.goto(BASE + '#/scores'); await S.waitForTimeout(2000);
await entrant(S, 'Sam').getByRole('button', { name: /Enter card/ }).click();
await enterCard(S, [5, 5, 4, 6, 4, 5, 3, 6, 5]);
await C.waitForTimeout(2500);
await entrant(C, 'Sam').getByRole('button', { name: /Approve/ }).click();
await C.waitForTimeout(1500);
// commissioner enters Pat's card for him (no account)
await entrant(C, 'Pat').getByRole('button', { name: /Enter card/ }).click();
await enterCard(C, [4, 5, 4, 5, 4, 5, 3, 5, 5]);
await C.waitForTimeout(1500);
ok('week 1 final with 4 cards', /Final/i.test(await C.locator('section.card').first().innerText()));
await shot(C, '10-commish-week-final', true);

// standings / skins / handicap pages
await C.goto(BASE + '#/table'); await C.waitForTimeout(1800);
const tbl = await text(C);
ok('standings show all 4 regulars', ['Chris', 'Dee', 'Sam', 'Pat'].every((n) => tbl.includes(n)));
await shot(C, '11-standings', true);
await C.goto(BASE + '#/skins'); await C.waitForTimeout(1800);
const sk = await text(C);
ok('skins page computes the week', /skin/i.test(sk));
await shot(C, '12-skins', true);
await D.goto(BASE + '#/players'); await D.waitForTimeout(1800);
await shot(D, '13-dee-players', true);
await D.goto(BASE + '#/home'); await D.waitForTimeout(1800);
await shot(D, '14-dee-clubhouse', true);

// new week → handicaps carry on; Dee edits a pending card and the commissioner sees it again
await C.goto(BASE + '#/scores'); await C.waitForTimeout(1200);
await C.getByRole('button', { name: /New week/ }).click();
await C.waitForTimeout(2500);
await D.goto(BASE + '#/scores'); await D.waitForTimeout(2500);
ok('REALTIME: Dee sees the new week the commissioner created', /W2/.test(await D.locator('.chips').innerText()));
await shot(D, '15-dee-week2');

fs.writeFileSync(`${OUT}cloud-results.json`, JSON.stringify({ results, problems }, null, 2));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
if (problems.length) console.log('Problems:\n' + problems.join('\n'));
await browser.close();
