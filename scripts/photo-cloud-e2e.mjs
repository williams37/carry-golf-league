// Cloud-mode photo flow through the real UI against the live Supabase project:
// Dee scans + saves her card → photo lands in the private bucket, linked to her score → Sam (same league) views it →
// the commissioner deletes the card (photo goes too) → deleting the week clears its photos folder.
// Usage: E2E_PW=... VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/photo-cloud-e2e.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { demoLeague } from '../src/lib/seed.js';
const BASE = process.argv[2] || 'http://localhost:4173/';
const URL_ = process.env.VITE_SUPABASE_URL, KEY = process.env.VITE_SUPABASE_ANON_KEY, PW = process.env.E2E_PW;
const FIX = new URL('../tests/fixtures/scorecards/', import.meta.url).pathname;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const truth = JSON.parse(fs.readFileSync(FIX + 'truth.json', 'utf8'));
const results = []; const problems = [];
const ok = (cond, msg) => { results.push(!!cond); console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const api = async (who) => { const c = createClient(URL_, KEY, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: `carry.e2e+${who}@example.com`, password: PW }); if (error) throw error; return c; };
const [C, D, S] = await Promise.all(['commish', 'dee', 'sam'].map(api));

// league setup (as the app would store it): demo league doc, week 7 only, no scores yet
const doc = demoLeague(); doc.name = 'Carry photo E2E';
doc.weeks = doc.weeks.filter((w) => w.id === 'w7').map(({ scores, ...w }) => ({ ...w, final: false }));
const { data: lid, error } = await C.rpc('create_league', { p_name: doc.name, p_data: (({ id, ...x }) => x)(doc) }); if (error) throw error;
const { data: lg } = await C.from('leagues').select('invite_code').eq('id', lid).single();
const dee = doc.players.find((p) => p.name === 'Dee Okafor').id, sam = doc.players.find((p) => /^Sam/.test(p.name)).id;
for (const [c, pid] of [[D, dee], [S, sam]]) { await c.rpc('join_league', { p_code: lg.invite_code, p_display_name: pid }); await c.rpc('claim_player', { p_league: lid, p_player: pid }); }
await C.rpc('claim_player', { p_league: lid, p_player: doc.players[0].id });

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function signedIn(who) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript((lid) => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('carry:prefs', JSON.stringify({ theme: 'dark', onboarded: true, activeLeagueId: lid })); sessionStorage.setItem('init', '1'); } }, lid);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[${who}] ${e.message}`)); p.on('dialog', (d) => d.accept());
  await p.goto(BASE); await p.getByLabel('Email').fill(`carry.e2e+${who}@example.com`); await p.getByLabel(/^Password/).fill(PW);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForSelector('.tabbar, nav', { timeout: 20000 }); await p.goto(BASE + '#/scores/w7'); await p.waitForSelector('.entrant', { timeout: 20000 });
  return p;
}
const row = (p, name) => p.locator('.entrant', { has: p.locator('.nm', { hasText: name }) }).first();
const scoreRow = async () => (await C.from('scores').select('*').eq('league_id', lid).eq('week_id', 'w7').eq('player_key', dee).maybeSingle()).data;
const objects = async (prefix) => ((await C.storage.from('scorecards').list(prefix)).data || []).filter((x) => x.id);

try {
  console.log('Dee scans her card (cloud)');
  const pd = await signedIn('dee');
  await row(pd, 'Dee Okafor').getByRole('button', { name: /Enter card/ }).click();
  await pd.click('[data-testid=scan-open]');
  await pd.waitForSelector('[data-testid=scan-pick]');
  ok(await pd.locator('text=stored privately for your league').count() === 1, 'picker explains cloud photos are private to the league');
  await pd.setInputFiles('[data-testid=scan-file]', FIX + 'screen-photo.jpg');
  await pd.click('[data-testid=scan-read]');
  await pd.waitForSelector('[data-testid=scan-review]', { timeout: 120000 });
  const got = await pd.$$eval('[data-testid=scan-cells] input', (xs) => xs.map((x) => +x.value || null));
  ok(JSON.stringify(got) === JSON.stringify(truth.cases.find((c) => c.id === 'screen-photo').scores), `read ${got.join('')}`);
  await pd.click('[data-testid=scan-use]'); await pd.click('[data-testid=pad-save]');
  await pd.waitForTimeout(3500);
  const r1 = await scoreRow();
  ok(r1 && r1.status === 'pending' && JSON.stringify(r1.holes) === JSON.stringify(got), 'score saved as pending (player card) with the scanned holes');
  ok(r1?.photo_path === `${lid}/w7/${dee}.webp`, `photo linked: ${r1?.photo_path?.replace(lid, '<league>')}`);
  const objs = await objects(`${lid}/w7`);
  ok(objs.length === 1 && objs[0].metadata?.size < 200_000, `photo stored privately: ${objs[0]?.name}, ${Math.round((objs[0]?.metadata?.size || 0) / 1024)} KB ${objs[0]?.metadata?.mimetype}`);
  await pd.reload(); await pd.waitForSelector('.entrant'); await pd.goto(BASE + '#/scores/w7'); await pd.waitForSelector('[data-testid=entrant-photo]', { timeout: 15000 });
  ok(true, '"Card" button on Dee\'s row after reload');

  console.log('Sam (same league) views it');
  const ps = await signedIn('sam');
  await row(ps, 'Dee Okafor').locator('[data-testid=entrant-photo]').click();
  await ps.waitForFunction(() => document.querySelector('.lightbox-img img')?.naturalWidth > 0, null, { timeout: 15000 });
  const src = await ps.getAttribute('.lightbox-img img', 'src');
  ok(/\/storage\/v1\/object\/sign\/scorecards\//.test(src), 'league-mate sees the photo through a short-lived signed URL');
  await ps.screenshot({ path: OUT + 'photo-14-cloud-lightbox.png' }); console.log('    📸 photo-14-cloud-lightbox');
  ok(await ps.locator('.lightbox button', { hasText: 'Remove' }).count() === 0, 'league-mate gets no Remove button');

  console.log('Commissioner deletes the card');
  const pc = await signedIn('commish');
  await row(pc, 'Dee Okafor').getByRole('button', { name: /Edit card/ }).click();
  await pc.waitForSelector('[data-testid=view-card]');
  await pc.screenshot({ path: OUT + 'photo-15-cloud-commish-pad.png' }); console.log('    📸 photo-15-cloud-commish-pad');
  await pc.click('[aria-label="Delete card"]'); await pc.waitForTimeout(2500);
  ok(!(await scoreRow()) && (await objects(`${lid}/w7`)).length === 0, 'deleting the card deleted the score row and its photo');

  console.log('Deleting a week clears its photos');
  await D.from('scores').upsert({ league_id: lid, week_id: 'w7', player_key: dee, holes: got, status: 'pending' });
  const webp = new Blob([fs.readFileSync(FIX + 'screen-photo.jpg')], { type: 'image/jpeg' });
  await D.storage.from('scorecards').upload(`${lid}/w7/${dee}.jpg`, webp, { upsert: true, contentType: 'image/jpeg' });
  ok((await objects(`${lid}/w7`)).length === 1, 'photo re-uploaded for the week test');
  await pc.reload(); await pc.goto(BASE + '#/scores/w7'); await pc.waitForSelector('.entrant');
  await pc.getByRole('button', { name: /^Week$/ }).click(); await pc.getByRole('button', { name: /Delete/ }).click(); await pc.waitForTimeout(3000);
  const left = (await C.from('scores').select('player_key').eq('league_id', lid).eq('week_id', 'w7')).data;
  ok((await objects(`${lid}/w7`)).length === 0 && left.length === 0, 'week delete removed its photos and score rows');
} finally {
  const files = []; for (const w of (await C.storage.from('scorecards').list(lid)).data || []) for (const f of (await C.storage.from('scorecards').list(`${lid}/${w.name}`)).data || []) files.push(`${lid}/${w.name}/${f.name}`);
  if (files.length) await C.storage.from('scorecards').remove(files);
  await C.from('leagues').delete().eq('id', lid);
  await browser.close();
}
if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
console.log(`\n${results.filter(Boolean).length}/${results.length} cloud photo checks passed`);
process.exit(results.every(Boolean) && !problems.length ? 0 : 1);
