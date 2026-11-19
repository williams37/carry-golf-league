/**
 * Supabase adapter. Tables + RLS live in supabase/schema.sql.
 *  - leagues.data   : league document (players, courses, weeks, settings) — scores stripped
 *  - scores         : one row per (league, week, player_key) so players can write only their own card
 *  - members        : who belongs to a league, their role and claimed player slot
 * Auth: email+password, magic link (PKCE redirect), or 6-digit email code (no redirect at all).
 */
let clientP = null;
let clientKey = '';

/** One client per page. The promise is cached so concurrent first calls can't race into two auth clients. */
export function getClient(cfg) {
  const k = cfg.url + cfg.key;
  if (clientP && clientKey === k) return clientP;
  clientKey = k;
  clientP = import('@supabase/supabase-js').then(({ createClient }) => createClient(cfg.url, cfg.key, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'carry-auth' },
  }));
  clientP.catch(() => { clientP = null; });
  return clientP;
}

const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

/**
 * Resolve the session exactly once, robustly:
 *  - handles ?code= (PKCE) and #access_token (implicit) callbacks and ?error_description
 *  - never hangs: hard timeout with a clear message
 *  - cleans the callback params out of the URL so a refresh can't re-trigger a stale exchange
 */
export async function resolveSession(cfg) {
  const sb = await getClient(cfg);
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#\/?[^?]*\??/, '').replace(/^#/, ''));
  const err = url.searchParams.get('error_description') || hash.get('error_description');
  const clean = () => {
    ['code', 'error', 'error_code', 'error_description', 'type'].forEach((k) => url.searchParams.delete(k));
    const h = url.hash.includes('access_token') || url.hash.includes('error') ? '#/' : url.hash;
    window.history.replaceState({}, '', url.pathname + (url.search || '') + h);
  };
  if (err) { clean(); throw new Error(decodeURIComponent(err.replace(/\+/g, ' '))); }
  const code = url.searchParams.get('code');
  if (code) {
    try {
      const { data, error } = await withTimeout(sb.auth.exchangeCodeForSession(code), 12000, 'Sign-in link timed out. Request a new link or use the 6-digit code.');
      clean();
      if (error) throw error;
      // PKCE reset links arrive as a plain ?code=; remember that this browser asked for one
      if (localStorage.getItem('carry:resetPending')) { localStorage.removeItem('carry:resetPending'); sessionStorage.setItem('carry:recovery', '1'); }
      return data.session;
    } catch (e) {
      clean();
      const s = (await sb.auth.getSession()).data.session; // detectSessionInUrl may have won the race
      if (s) return s;
      throw new Error(/verifier/i.test(e.message)
        ? 'This email link was opened in a different browser than the one that asked for it. If you were confirming a new account, it is confirmed now: sign in with your password. For a sign-in link, use the 6-digit code from the email or request a new link here.'
        : e.message);
    }
  }
  const { data, error } = await withTimeout(sb.auth.getSession(), 10000, 'Could not reach the sign-in server. Check your connection and retry.');
  if (url.hash.includes('access_token')) clean();
  if (error) throw error;
  return data.session;
}

export const auth = {
  async signInPassword(cfg, email, password) {
    const sb = await getClient(cfg);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw friendly(error); return data.session;
  },
  async signUp(cfg, email, password) {
    const sb = await getClient(cfg);
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw friendly(error);
    // With confirmation on, an already-registered email comes back as a user with no identities.
    const exists = !data.session && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
    return { session: data.session, needsConfirm: !data.session && !exists, exists };
  },
  async sendLink(cfg, email) {
    const sb = await getClient(cfg);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } });
    if (error) throw friendly(error);
  },
  async verifyCode(cfg, email, token) {
    const sb = await getClient(cfg);
    const { data, error } = await sb.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
    if (error) throw friendly(error); return data.session;
  },
  async resendConfirmation(cfg, email) {
    const sb = await getClient(cfg);
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw friendly(error);
  },
  async resetPassword(cfg, email) {
    const sb = await getClient(cfg);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error) throw friendly(error);
    localStorage.setItem('carry:resetPending', '1');
  },
  async updatePassword(cfg, password) {
    const sb = await getClient(cfg);
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw friendly(error);
    sessionStorage.removeItem('carry:recovery');
  },
  async signOut(cfg) { const sb = await getClient(cfg); await sb.auth.signOut(); },
  async onChange(cfg, cb) {
    const sb = await getClient(cfg);
    const { data } = sb.auth.onAuthStateChange((event, session) => cb(session, event));
    return () => data.subscription.unsubscribe();
  },
};

/** Turn Supabase auth errors into plain-English messages (code kept on .code for the UI). */
export function friendly(error) {
  const m = error?.message || String(error);
  const code = error?.code || (/not confirmed/i.test(m) ? 'email_not_confirmed' : /invalid login/i.test(m) ? 'invalid_credentials' : '');
  const map = [
    [/not confirmed/i, "This email isn't confirmed yet. Open the confirmation email we sent (check spam), then sign in."],
    [/invalid login credentials/i, "That email and password don't match. Check them, or tap \"Forgot password\"."],
    [/rate limit|too many|over_email_send_rate_limit/i, 'Too many emails sent just now. Wait a few minutes and try again.'],
    [/not authorized|email address .* is invalid/i, "The league server can't send email to this address yet. Ask your commissioner (they need to set up email sending in Supabase)."],
    [/password should be|weak password/i, 'Choose a stronger password: at least 6 characters.'],
    [/already registered/i, 'That email already has an account. Sign in instead.'],
    [/token has expired|otp.*(expired|invalid)/i, 'That code is wrong or has expired. Request a new one.'],
    [/error sending/i, "The league server couldn't send the email. Try again in a minute, or ask your commissioner to check email settings."],
  ];
  const hit = map.find(([re]) => re.test(m));
  const e = new Error(hit ? hit[1] : m);
  e.code = code; e.raw = m;
  return e;
}

export function redirectUrl() {
  const u = new URL(window.location.href);
  return u.origin + u.pathname; // must be listed in Supabase → Auth → URL configuration
}

// leagues.data holds the league document only: scores live in their own table,
// and members / invite code / id come from their own columns (never copied into JSON).
const stripScores = ({ members, inviteCode, id, ...league }) => ({
  ...league,
  weeks: (league.weeks || []).map(({ scores, ...w }) => w),
});

const BUCKET = 'scorecards';
const urlCache = new Map();
/** Remove every object under a folder (one level of sub-folders: league/week/file). */
async function removeFolder(c, prefix) {
  const files = [];
  const walk = async (p, depth) => {
    const { data } = await c.storage.from(BUCKET).list(p, { limit: 1000 });
    for (const e of data || []) {
      if (e.id) files.push(`${p}/${e.name}`); else if (depth < 2) await walk(`${p}/${e.name}`, depth + 1);
    }
  };
  await walk(prefix, 0);
  for (let i = 0; i < files.length; i += 100) await c.storage.from(BUCKET).remove(files.slice(i, i + 100));
  return files.length;
}

export function cloudStore(cfg) {
  const sb = () => getClient(cfg);
  return {
    kind: 'cloud',
    async listLeagues() {
      const c = await sb();
      const { data: user } = await c.auth.getUser();
      const { data, error } = await c.from('members').select('role, player_id, leagues(id, name, data)').eq('user_id', user.user.id);
      if (error) throw error;
      return data.map((m) => ({ id: m.leagues.id, name: m.leagues.name, season: m.leagues.data?.season, role: m.role }));
    },
    async getLeague(id) {
      const c = await sb();
      const { data: user } = await c.auth.getUser();
      const [lg, sc, mem] = await Promise.all([
        c.from('leagues').select('*').eq('id', id).single(),
        c.from('scores').select('*').eq('league_id', id),
        c.from('members').select('*').eq('league_id', id),
      ]);
      if (lg.error) throw lg.error;
      const league = { ...lg.data.data, id, name: lg.data.name, inviteCode: lg.data.invite_code };
      for (const w of league.weeks || []) w.scores = {};
      for (const s of sc.data || []) {
        const w = league.weeks.find((x) => x.id === s.week_id);
        if (w) w.scores[s.player_key] = { holes: s.holes, status: s.status, by: s.entered_by, at: Date.parse(s.updated_at), ...(s.photo_path ? { photo: s.photo_path } : {}) };
      }
      league.members = mem.data || [];
      const me = league.members.find((m) => m.user_id === user.user.id);
      return { league, role: me?.role || 'player', myPlayerId: me?.player_id || null, userId: user.user.id };
    },
    async createLeague(league) {
      const c = await sb();
      const { data, error } = await c.rpc('create_league', { p_name: league.name, p_data: stripScores(league) });
      if (error) throw error;
      // push any scores (e.g. when uploading a local league)
      for (const w of league.weeks || []) for (const [k, v] of Object.entries(w.scores || {}))
        await c.from('scores').upsert({ league_id: data, week_id: w.id, player_key: k, holes: v.holes, status: 'approved' });
      return data;
    },
    async saveLeague(league) {
      const c = await sb();
      const { error } = await c.from('leagues').update({ name: league.name, data: stripScores(league) }).eq('id', league.id);
      if (error) throw error;
    },
    async setScore(league, weekId, key, holes, status) {
      const c = await sb();
      const { error } = await c.from('scores').upsert({ league_id: league.id, week_id: weekId, player_key: key, holes, status });
      if (error) throw error;
    },
    async deleteLeague(id) {
      const c = await sb();
      await removeFolder(c, id); // storage objects can't cascade from SQL — clear the league's photos first
      const { error } = await c.from('leagues').delete().eq('id', id); if (error) throw error;
    },
    // ---- scorecard photos: private bucket, path <league>/<week>/<player>.<ext>, RLS in supabase/schema.sql ----
    async savePhoto(league, weekId, key, blob) {
      const c = await sb();
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${league.id}/${weekId}/${String(key).replace(/:/g, '_')}.${ext}`;
      const up = await c.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: '3600' });
      if (up.error) throw new Error(`Photo upload failed: ${up.error.message}`);
      const other = path.replace(/\.(webp|jpg)$/, ext === 'webp' ? '.jpg' : '.webp');
      await c.storage.from(BUCKET).remove([other]).catch(() => {}); // a previous photo in the other format
      const { error } = await c.from('scores').update({ photo_path: path }).eq('league_id', league.id).eq('week_id', weekId).eq('player_key', key);
      if (error) throw error;
      urlCache.delete(path);
      return path;
    },
    async photoUrl(path) {
      const hit = urlCache.get(path);
      if (hit && hit.exp > Date.now()) return hit.url;
      const c = await sb();
      const { data, error } = await c.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) throw new Error("Couldn't load the card photo.");
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60e3 });
      return data.signedUrl;
    },
    async deletePhoto(league, weekId, key, path) {
      const c = await sb();
      if (path) { const r = await c.storage.from(BUCKET).remove([path]); if (r.error) throw r.error; }
      const { error } = await c.from('scores').update({ photo_path: null }).eq('league_id', league.id).eq('week_id', weekId).eq('player_key', key);
      if (error) throw error;
      urlCache.delete(path);
    },
    /** Deleting a card deletes its photo too (photo first: once the row is gone nobody can find the file). */
    async deleteScore(league, weekId, key, path) {
      const c = await sb();
      if (path) { const r = await c.storage.from(BUCKET).remove([path]); if (r.error) throw r.error; }
      const { error } = await c.from('scores').delete().eq('league_id', league.id).eq('week_id', weekId).eq('player_key', key);
      if (error) throw error;
    },
    async deleteWeekData(league, weekId) {
      const c = await sb();
      await removeFolder(c, `${league.id}/${weekId}`);
      const { error } = await c.from('scores').delete().eq('league_id', league.id).eq('week_id', weekId);
      if (error) throw error;
    },
    async join(code, displayName) {
      const c = await sb();
      const { data, error } = await c.rpc('join_league', { p_code: code.trim().toUpperCase(), p_display_name: displayName || null });
      if (error) throw error; return data;
    },
    async claim(leagueId, playerId) {
      const c = await sb();
      const { error } = await c.rpc('claim_player', { p_league: leagueId, p_player: playerId });
      if (error) throw error;
    },
    async setMember(leagueId, userId, patch) {
      const c = await sb();
      const { error } = await c.from('members').update(patch).eq('league_id', leagueId).eq('user_id', userId);
      if (error) throw error;
    },
    async newInvite(leagueId) {
      const c = await sb();
      const { data, error } = await c.rpc('regenerate_invite', { p_league: leagueId });
      if (error) throw error; return data;
    },
    subscribe(id, cb) {
      let ch;
      sb().then((c) => {
        ch = c.channel('league-' + id)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `league_id=eq.${id}` }, () => cb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'leagues', filter: `id=eq.${id}` }, () => cb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `league_id=eq.${id}` }, () => cb())
          .subscribe();
      });
      return () => ch && ch.unsubscribe();
    },
  };
}
