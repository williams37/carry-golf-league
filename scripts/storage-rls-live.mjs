// Live check of scorecard-photo storage + RLS against the real Supabase project.
// Needs confirmed users carry.e2e+{commish,dee,sam,out}@example.com (password in E2E_PW) — see README "Testing".
// Usage: E2E_PW=... VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/storage-rls-live.mjs
import { createClient } from '@supabase/supabase-js';
const URL_ = process.env.VITE_SUPABASE_URL, KEY = process.env.VITE_SUPABASE_ANON_KEY, PW = process.env.E2E_PW;
if (!URL_ || !KEY || !PW) { console.error('Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and E2E_PW'); process.exit(2); }
const results = [];
const ok = (cond, msg) => { results.push(!!cond); console.log(`${cond ? '✓' : '✗'} ${msg}`); };
const user = async (who) => {
  const c = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: `carry.e2e+${who}@example.com`, password: PW });
  if (error) throw new Error(`${who}: ${error.message}`);
  return c;
};
// a tiny real WebP (1×1) and JPEG payload are enough for policy checks
const webp = new Blob([Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64')], { type: 'image/webp' });

const [C, D, S, O] = await Promise.all(['commish', 'dee', 'sam', 'out'].map(user));
const B = (c) => c.storage.from('scorecards');

// league with two players; dee + sam join and claim their slots
const { data: lid, error: e1 } = await C.rpc('create_league', { p_name: 'RLS photo test', p_data: { season: '2026', players: [{ id: 'p_dee', name: 'Dee' }, { id: 'p_sam', name: 'Sam' }], courses: [], weeks: [{ id: 'w1', number: 1, courseId: null, teams: [], subs: {} }], settings: {} } });
if (e1) throw e1;
const { data: lg } = await C.from('leagues').select('invite_code').eq('id', lid).single();
for (const [c, pid] of [[D, 'p_dee'], [S, 'p_sam']]) {
  const j = await c.rpc('join_league', { p_code: lg.invite_code, p_display_name: pid }); if (j.error) throw j.error;
  const k = await c.rpc('claim_player', { p_league: lid, p_player: pid }); if (k.error) throw k.error;
}
const deePath = `${lid}/w1/p_dee.webp`, samPath = `${lid}/w1/p_sam.webp`;
try {
  // writes
  await D.from('scores').upsert({ league_id: lid, week_id: 'w1', player_key: 'p_dee', holes: [5, 4, 2, 5, 4, 6, 3, 4, 5], status: 'pending' });
  let r = await B(D).upload(deePath, webp, { upsert: true, contentType: 'image/webp' });
  ok(!r.error, 'player uploads the photo for their own card');
  r = await B(D).upload(deePath, webp, { upsert: true, contentType: 'image/webp' });
  ok(!r.error, 'player can replace (upsert) their own photo');
  r = await B(D).upload(samPath, webp, { upsert: true, contentType: 'image/webp' });
  ok(!!r.error, `player cannot upload to another player's card (${r.error?.message || 'allowed!'})`);
  r = await B(D).upload(`${lid}/w1/p_dee.png`, webp, { contentType: 'image/webp' });
  ok(!!r.error, 'odd file names/extensions are rejected');
  r = await B(O).upload(`${lid}/w1/p_x.webp`, webp, { contentType: 'image/webp' });
  ok(!!r.error, 'non-member cannot upload into the league folder');
  r = await B(D).upload(`${lid}/w1/p_dee.jpg`, new Blob(['not an image'], { type: 'text/plain' }), { contentType: 'text/plain' });
  ok(!!r.error, `bucket refuses non-image uploads (${r.error?.message})`);
  const u = await D.from('scores').update({ photo_path: deePath }).eq('league_id', lid).eq('week_id', 'w1').eq('player_key', 'p_dee');
  ok(!u.error, 'card row links to its photo (photo_path)');
  const bad = await D.from('scores').update({ photo_path: `00000000-0000-0000-0000-000000000000/w1/p_dee.webp` }).eq('league_id', lid).eq('week_id', 'w1').eq('player_key', 'p_dee');
  ok(!!bad.error, 'photo_path cannot point outside the card\'s own league folder');

  // reads
  let s = await B(S).createSignedUrl(deePath, 60);
  ok(!s.error && s.data?.signedUrl, 'another member of the league can view the photo (signed URL)');
  if (s.data?.signedUrl) { const res = await fetch(s.data.signedUrl); ok(res.ok && (await res.arrayBuffer()).byteLength > 0, 'signed URL serves the image'); }
  s = await B(O).createSignedUrl(deePath, 60);
  ok(!!s.error, `non-member cannot get a signed URL (${s.error?.message || 'allowed!'})`);
  const dl = await B(O).download(deePath);
  ok(!!dl.error, 'non-member cannot download the photo');
  const ls = await B(O).list(`${lid}/w1`);
  ok(!ls.error && (ls.data || []).length === 0, 'non-member sees an empty folder listing');
  const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
  const an = await anon.storage.from('scorecards').download(deePath);
  ok(!!an.error, 'signed-out visitors cannot download');
  const pub = await fetch(`${URL_}/storage/v1/object/public/scorecards/${deePath}`);
  ok(!pub.ok, `bucket is private (public URL → HTTP ${pub.status})`);

  // deletes
  let d = await B(S).remove([deePath]);
  const still = await B(D).download(deePath);
  ok(!still.error, 'another player cannot delete someone else\'s photo');
  d = await B(C).remove([deePath]);
  ok(!d.error && d.data?.length === 1, 'commissioner can delete any photo in the league');
  // owner deletes their own
  await B(D).upload(deePath, webp, { upsert: true, contentType: 'image/webp' });
  d = await B(D).remove([deePath]);
  ok(!d.error && d.data?.length === 1, 'player can delete their own photo');
} finally {
  // the real app code path for cleanup (removes the folder, then the league)
  const files = []; for (const w of (await B(C).list(lid)).data || []) for (const f of (await B(C).list(`${lid}/${w.name}`)).data || []) files.push(`${lid}/${w.name}/${f.name}`);
  if (files.length) await B(C).remove(files);
  await C.from('leagues').delete().eq('id', lid);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} storage checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
