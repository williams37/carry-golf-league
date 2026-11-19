// On-device scorecard photos for local (offline) leagues: one IndexedDB object store, keyed league/week/player.
const DB = 'carry-photos', STORE = 'cards';
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbP = null; rej(r.error); };
  });
  return dbP;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode); const s = t.objectStore(STORE); const out = fn(s);
    t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error);
  });
};
export const localPhotos = {
  put: (key, blob) => tx('readwrite', (s) => s.put(blob, key)),
  get: (key) => tx('readonly', (s) => s.get(key)),
  del: (key) => tx('readwrite', (s) => s.delete(key)),
  async delPrefix(prefix) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readwrite'); const s = t.objectStore(STORE);
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      s.openCursor(range).onsuccess = (e) => { const c = e.target.result; if (c) { c.delete(); c.continue(); } };
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  },
};
export const cardKey = (leagueId, weekId, playerKey) => `${leagueId}/${weekId}/${String(playerKey).replace(/:/g, '_')}`;
