// Pure parsers for the GSPro course library sync (no network, unit-tested).
// Sources: Simulator Golf Tour's public course list (primary) and PakGolf Studios' GSPro course list (styles, country, private servers).

/** SGT embeds its list as <script id='courses-data' type='application/json'>{ v, updated, courses: [[...]] }</script>. */
export function parseSgt(html) {
  const m = /<script[^>]*id=['"]courses-data['"][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) throw new Error('SGT: courses-data block not found (page layout changed?)');
  const d = JSON.parse(m[1]);
  if (!Array.isArray(d.courses)) throw new Error('SGT: courses-data has no courses array');
  const out = [];
  for (const r of d.courses) {
    // [id, name, location, par, difficulty, plays, ?, flyoverYoutubeId, updated, designer, ?, lat, lon]
    if (!Array.isArray(r) || r.length < 10 || !Number.isInteger(r[0]) || typeof r[1] !== 'string') continue;
    out.push({
      id: r[0], name: clean(r[1]), loc: cleanLoc(r[2]), par: num(r[3]), diff: num(r[4]), plays: num(r[5]) || 0,
      updated: /^\d{4}-\d{2}-\d{2}$/.test(r[8] || '') ? r[8] : null, designer: clean(r[9] || ''),
      lat: round4(r[11]), lon: round4(r[12]),
    });
  }
  return { updated: d.updated || null, courses: out };
}

const STYLE_COLS = { Links: 'links', Parkland: 'parkland', Coastal: 'coastal', Mountain: 'mountain', Desert: 'desert', Heathland: 'heathland', Tropical: 'tropical', Historic: 'historic', Fantasy: 'fantasy', TourStop: 'tour stop', 'Major Venue': 'major venue', Beginner: 'beginner', Training: 'training' };

/** PakGolf renders a wpDataTables <table id="table_1"> with one header row and one <tr> per course. */
export function parsePak(html) {
  const t = /<table[^>]*id=["']table_1["'][\s\S]*?<\/table>/i.exec(html);
  if (!t) throw new Error('PakGolf: table_1 not found');
  const head = /<thead[\s\S]*?<\/thead>/i.exec(t[0]);
  const headers = [...(head ? head[0] : '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => clean(strip(m[1])));
  if (!headers.includes('Name')) throw new Error('PakGolf: no Name column');
  const body = t[0].slice(head ? head.index + head[0].length : 0);
  const rows = [];
  for (const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(strip(m[1])));
    if (cells.length < headers.length - 2) continue;
    const o = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    if (!o.Name) continue;
    rows.push({
      name: o.Name, loc: cleanLoc(o.Location), designer: o.Designer || '', country: o.Country || '',
      server: o.Server || '', styles: Object.entries(STYLE_COLS).filter(([k]) => /^y/i.test(o[k] || '')).map(([, v]) => v),
    });
  }
  return rows;
}

export const nameKey = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, 'and').replace(/\bgolf club\b/g, 'gc').replace(/\bcountry club\b/g, 'cc').replace(/[^a-z0-9]/g, '');

export const COLS = ['id', 'name', 'loc', 'par', 'diff', 'plays', 'updated', 'designer', 'lat', 'lon', 'country', 'styles', 'server'];

/** Merge SGT (authoritative) with PakGolf extras → the compact library object written to public/courses.json. */
export function buildLibrary(sgt, pak = []) {
  const byKey = new Map();
  for (const p of pak) { const k = nameKey(p.name); if (!byKey.has(k)) byKey.set(k, p); }
  const used = new Set();
  const rows = sgt.courses.map((c) => {
    const k = nameKey(c.name); const p = byKey.get(k); if (p) used.add(k);
    return [c.id, c.name, c.loc, c.par, c.diff, c.plays, c.updated, c.designer, c.lat, c.lon, p?.country || '', (p?.styles || []).join(','), p && !/^public$/i.test(p.server) ? p.server : ''];
  });
  // Courses only on PakGolf: mostly private / Patreon servers. No par or SGT id — ids are 'p:<key>'.
  for (const [k, p] of byKey) {
    if (used.has(k)) continue;
    rows.push([`p:${k}`, p.name, p.loc, null, null, 0, null, p.designer, null, null, p.country, p.styles.join(','), /^public$/i.test(p.server) ? '' : p.server]);
  }
  rows.sort((a, b) => a[1].localeCompare(b[1], 'en', { sensitivity: 'base' }) || String(a[0]).localeCompare(String(b[0])));
  return {
    v: 1, cols: COLS,
    sources: {
      sgt: { name: 'Simulator Golf Tour', url: 'https://simulatorgolftour.com/courses/', updated: sgt.updated, count: sgt.courses.length },
      pak: { name: 'PakGolf Studios', url: 'https://pakgolfstudios.com/gspro-course-list/', count: pak.length },
    },
    scorecardUrl: 'https://simulatorgolftour.com/public/assets/courseImages/scorecards/scorecard_{id}.jpg',
    courses: rows,
  };
}

/** Safety gate: refuse a refresh that lost a big chunk of the list (source broke / partial page). */
export function checkDrop(prev, next, maxDrop = 0.2) {
  const was = prev?.sources?.sgt?.count || 0, now = next.sources.sgt.count;
  if (now < 500) return `only ${now} SGT courses parsed`;
  if (was && now < was * (1 - maxDrop)) return `SGT count dropped ${was} → ${now} (more than ${Math.round(maxDrop * 100)}%)`;
  return null;
}

/** Same data? (ignore source timestamps so the weekly job only commits real changes) */
export const sameData = (a, b) => !!a && JSON.stringify(a.courses) === JSON.stringify(b.courses);

const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&#8217;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/&#8211;|&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
const cleanLoc = (s) => clean(s || '').replace(/(\s*,\s*)+/g, ', ').replace(/^, |, $/g, '');
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const round4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
