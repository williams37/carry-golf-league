import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localStore } from './store/local.js';
import { cloudStore, resolveSession, auth } from './store/cloud.js';
import { cloudConfig, hasBuiltInCloud } from '../config.js';
import { demoLeague } from './seed.js';
import { computeHandicaps, sortedWeeks } from './golf.js';

const PREFS = 'carry:prefs';
export const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } };
export const writePrefs = (p) => localStorage.setItem(PREFS, JSON.stringify({ ...readPrefs(), ...p }));

/**
 * The single source of truth for the UI. Talks to the active storage adapter
 * (local or Supabase), exposes the league + permissions + actions.
 */
export function useLeague() {
  const prefs = readPrefs();
  // cloud is the default when the build ships with a league server; the demo stays one tap away
  const initialMode = (prefs.mode || (hasBuiltInCloud() ? 'cloud' : 'local')) === 'cloud' && cloudConfig() ? 'cloud' : 'local';
  const [mode, setModeState] = useState(initialMode);
  const [authState, setAuth] = useState({ status: mode === 'cloud' ? 'checking' : 'n/a', session: null, error: null });
  const [leagues, setLeagues] = useState([]);
  const [activeId, setActiveId] = useState(prefs.activeLeagueId || null);
  const [state, setState] = useState({ league: null, role: 'commissioner', myPlayerId: null, loading: true, error: null });
  const [syncing, setSyncing] = useState(false);
  const cfg = cloudConfig();
  const store = useMemo(() => (mode === 'cloud' && cfg ? cloudStore(cfg) : localStore), [mode, cfg?.url, cfg?.key]); // eslint-disable-line
  const leagueRef = useRef(null);
  leagueRef.current = state.league;

  // ---- auth (cloud) with a hard stop: never an endless "signing you in" ----
  const checkAuth = useCallback(async () => {
    if (mode !== 'cloud') return;
    setAuth({ status: 'checking', session: null, error: null });
    try {
      const session = await resolveSession(cfg);
      setAuth({ status: session ? 'signedIn' : 'signedOut', session, error: null, recovery: !!session && sessionStorage.getItem('carry:recovery') === '1' });
    } catch (e) {
      setAuth({ status: 'signedOut', session: null, error: e.message || String(e) });
    }
  }, [mode, cfg?.url]); // eslint-disable-line
  useEffect(() => { checkAuth(); }, [checkAuth]);
  useEffect(() => {
    if (mode !== 'cloud' || !cfg) return;
    let off;
    auth.onChange(cfg, (session, event) => setAuth((a) => ({ ...a, status: session ? 'signedIn' : 'signedOut', session, recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'USER_UPDATED' || event === 'SIGNED_OUT' ? false : a.recovery }))).then((u) => (off = u));
    return () => off?.();
  }, [mode]); // eslint-disable-line

  const ready = mode === 'local' || authState.status === 'signedIn';

  // ---- league list ----
  const refreshList = useCallback(async () => {
    if (!ready) return [];
    let list = await store.listLeagues();
    if (mode === 'local' && list.length === 0) {
      await store.createLeague(demoLeague());
      list = await store.listLeagues();
    }
    setLeagues(list);
    return list;
  }, [store, ready, mode]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await refreshList();
        if (!alive || !ready) return;
        const id = list.find((l) => l.id === activeId)?.id || list[0]?.id || null;
        if (id !== activeId) setActiveId(id);
        if (!id) setState({ league: null, role: 'player', myPlayerId: null, loading: false, error: null });
      } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
    })();
    return () => { alive = false; };
  }, [refreshList]); // eslint-disable-line

  // ---- load active league + live updates ----
  const load = useCallback(async () => {
    if (!activeId || !ready) return;
    try {
      const r = await store.getLeague(activeId);
      if (r) setState({ ...r, loading: false, error: null });
      else setState((s) => ({ ...s, loading: false }));
    } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  }, [activeId, store, ready]);
  useEffect(() => { setState((s) => ({ ...s, loading: true })); load(); writePrefs({ activeLeagueId: activeId }); }, [load]); // eslint-disable-line
  useEffect(() => {
    if (!activeId || !ready) return;
    return store.subscribe(activeId, (l) => (l ? setState((s) => ({ ...s, league: l })) : load()));
  }, [activeId, store, ready, load]);

  // ---- actions ----
  const persist = useCallback(async (fn) => {
    setSyncing(true);
    try { await fn(); } finally { setSyncing(false); }
  }, []);

  const mutate = useCallback((fn) => {
    const cur = leagueRef.current;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    setState((s) => ({ ...s, league: next }));
    return persist(() => store.saveLeague(next));
  }, [store, persist]);

  const setScore = useCallback((weekId, key, holes, statusOverride) => {
    const isComm = state.role === 'commissioner';
    const status = statusOverride || (mode === 'local' || isComm ? 'approved' : 'pending');
    setState((s) => {
      const l = structuredClone(s.league);
      const w = l.weeks.find((x) => x.id === weekId);
      w.scores = { ...w.scores, [key]: { holes, status, by: 'me', at: Date.now() } };
      return { ...s, league: l };
    });
    return persist(() => store.setScore(leagueRef.current, weekId, key, holes, status));
  }, [store, persist, state.role, mode]);

  const derived = useMemo(() => {
    if (!state.league) return null;
    return { hcp: computeHandicaps(state.league), weeks: sortedWeeks(state.league) };
  }, [state.league]);

  const canEditScore = (key) =>
    mode === 'local' || state.role === 'commissioner' || (state.myPlayerId && key === state.myPlayerId);

  return {
    mode, setMode: (m) => { writePrefs({ mode: m }); setModeState(m); },
    authState, checkAuth, cfg, store, leagues, refreshList, activeId,
    setActiveId: (id) => { setActiveId(id); writePrefs({ activeLeagueId: id }); },
    ...state, derived, syncing, mutate, setScore, reload: load, canEditScore,
    isCommissioner: mode === 'local' || state.role === 'commissioner',
  };
}
