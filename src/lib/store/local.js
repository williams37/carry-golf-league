/**
 * Local storage adapter — the whole app works offline with this alone.
 * Shape in localStorage['carry:v1']: { leagues: { [id]: League } }
 * Changes in another tab are pushed through the `storage` event (live updates locally too).
 */
import { localPhotos, cardKey } from '../photos.js';

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
    const prev = w.scores?.[key];
    w.scores = { ...w.scores, [key]: { holes, status, by: 'local', at: Date.now(), ...(prev?.photo ? { photo: prev.photo } : {}) } };
    db.leagues[l.id] = l; write(db);
    return l;
  },
  async deleteLeague(id) { const db = read(); delete db.leagues[id]; write(db); localPhotos.delPrefix(id + '/').catch(() => {}); },
  // ---- scorecard photos: kept on this device only (IndexedDB) ----
  patchScore(league, weekId, key, patch) {
    const db = read(); const l = db.leagues[league.id]; const w = l?.weeks.find((x) => x.id === weekId);
    if (!w?.scores?.[key]) return;
    w.scores[key] = { ...w.scores[key], ...patch }; if (patch.photo == null) delete w.scores[key].photo; write(db);
  },
  async savePhoto(league, weekId, key, blob) {
    const path = cardKey(league.id, weekId, key);
    await localPhotos.put(path, blob);
    this.patchScore(league, weekId, key, { photo: path });
    return path;
  },
  async photoUrl(path) { const b = await localPhotos.get(path); return b ? URL.createObjectURL(b) : null; },
  async deletePhoto(league, weekId, key) {
    await localPhotos.del(cardKey(league.id, weekId, key)).catch(() => {});
    this.patchScore(league, weekId, key, { photo: null });
  },
  async deleteScore(league, weekId, key) {
    await localPhotos.del(cardKey(league.id, weekId, key)).catch(() => {});
    const db = read(); const w = db.leagues[league.id]?.weeks.find((x) => x.id === weekId);
    if (w?.scores) { delete w.scores[key]; write(db); }
  },
  async deleteWeekData(league, weekId) { await localPhotos.delPrefix(`${league.id}/${weekId}/`).catch(() => {}); },
  subscribe(id, cb) {
    const h = (e) => { if (e.key === KEY) { const l = read().leagues[id]; if (l) cb(l); } };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  },
};
