/**
 * Local storage adapter — the whole app works offline with this alone.
 * Shape in localStorage['carry:v1']: { leagues: { [id]: League } }
 * Changes in another tab are pushed through the `storage` event (live updates locally too).
 */
const KEY = 'carry:v1';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { leagues: {} }; } catch { return { leagues: {} }; }
}
function write(db) { localStorage.setItem(KEY, JSON.stringify(db)); }

export const localStore = {
  kind: 'local',
  async listLeagues() {
    return Object.values(read().leagues).map((l) => ({ id: l.id, name: l.name, season: l.season, role: 'commissioner', isDemo: !!l.isDemo }));
  },
  async getLeague(id) {
    const l = read().leagues[id];
    return l ? { league: l, role: 'commissioner', myPlayerId: l.myPlayerId || null } : null;
  },
  async createLeague(league) { const db = read(); db.leagues[league.id] = league; write(db); return league.id; },
  async saveLeague(league) { const db = read(); db.leagues[league.id] = { ...league, updatedAt: Date.now() }; write(db); },
  async setScore(league, weekId, key, holes, status = 'approved') {
    const db = read();
    const l = db.leagues[league.id] || league;
    const w = l.weeks.find((x) => x.id === weekId);
    w.scores = { ...w.scores, [key]: { holes, status, by: 'local', at: Date.now() } };
    db.leagues[l.id] = l; write(db);
    return l;
  },
  async deleteLeague(id) { const db = read(); delete db.leagues[id]; write(db); },
  subscribe(id, cb) {
    const h = (e) => { if (e.key === KEY) { const l = read().leagues[id]; if (l) cb(l); } };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  },
};
