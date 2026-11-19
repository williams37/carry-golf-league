import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { indexLibrary, searchCourses, nineFrom18, defaultPars, ninePar, courseFromLibrary, estimateFromDifficulty } from '../src/lib/courseLibrary.js';
import { parseSgt, parsePak, buildLibrary, checkDrop, sameData } from '../scripts/lib/course-sources.mjs';

const SGT_HTML = `<html><script id='courses-data' type='application/json'>{"v":1,"updated":"2026-11-19T10:15:03-07:00","courses":[
[2341,"3 Ponds Farm","Bridgehampton, New York, USA",71,3.5,257,1,"","2026-06-10","RBHLAD",1,40.9429000001,-72.3335],
[1000,"Pebble Beach Golf Links","Pebble Beach, California, USA",72,4.6,8000,1,"","2026-01-02","Tekbud",1,36.5,-121.9],
[42,"Pinehurst No. 2","Pinehurst, NC",72,5.6,3000,1,"","2025-05-05","Pakman",1,35.1,-79.4],
[77,"Dragon's Lair",", , Golfsburg, Fictional",36,6.2,40,1,"","2025-05-05","Indyscott",1,null,null],
[78,"Short Par 3","Austin, TX",27,null,5,1,"","2025-05-05","x",1,null,null],
"junk",[1,2]]}</script></html>`;
const PAK_HTML = `<table id="table_1"><thead><tr><th class="x">Name</th><th>Server</th><th>Location</th><th>Designer</th><th>Links</th><th>Parkland</th><th>Country</th></tr></thead>
<tbody><tr><td>Pebble Beach Golf Links</td><td>Public</td><td>Pebble Beach, CA</td><td>Tekbud</td><td>Y</td><td>N</td><td>USA</td></tr>
<tr><td>Secret Dunes &amp; Links</td><td>TekBud</td><td>Scotland</td><td>Tekbud</td><td>Y</td><td>N</td><td>Scotland</td></tr></tbody></table>`;

const lib = indexLibrary(buildLibrary(parseSgt(SGT_HTML), parsePak(PAK_HTML)));

describe('course sync parsers', () => {
  it('parses SGT embedded JSON and skips malformed rows', () => {
    const s = parseSgt(SGT_HTML);
    expect(s.courses).toHaveLength(5);
    expect(s.courses[0]).toMatchObject({ id: 2341, name: '3 Ponds Farm', par: 71, diff: 3.5, designer: 'RBHLAD', lat: 40.9429 });
    expect(s.courses[3].loc).toBe('Golfsburg, Fictional'); // stray commas cleaned
    expect(() => parseSgt('<html>changed</html>')).toThrow(/not found/);
  });
  it('merges PakGolf styles/country and adds private-server-only courses', () => {
    const pebble = lib.courses.find((c) => c.id === 1000);
    expect(pebble.styles).toEqual(['links']); expect(pebble.country).toBe('USA'); expect(pebble.server).toBe('');
    const secret = lib.courses.find((c) => c.name === 'Secret Dunes & Links');
    expect(secret).toMatchObject({ server: 'TekBud', par: null }); expect(String(secret.id)).toMatch(/^p:/);
  });
  it('refuses a refresh that lost >20% of SGT courses, and detects no-op syncs', () => {
    const big = { sources: { sgt: { count: 2792 } } };
    expect(checkDrop(big, { sources: { sgt: { count: 2000 } } })).toMatch(/dropped/);
    expect(checkDrop(big, { sources: { sgt: { count: 2700 } } })).toBe(null);
    expect(checkDrop(null, { sources: { sgt: { count: 10 } } })).toMatch(/only 10/);
    const a = buildLibrary(parseSgt(SGT_HTML)); const b = { ...buildLibrary(parseSgt(SGT_HTML)), sources: {} };
    expect(sameData(a, b)).toBe(true);
  });
});

describe('course search', () => {
  const names = (q, f) => searchCourses(lib, q, f).results.map((c) => c.name);
  it('finds by name, location, designer, with typos', () => {
    expect(names('pebble')[0]).toBe('Pebble Beach Golf Links');
    expect(names('pinehrst')[0]).toBe('Pinehurst No. 2');          // typo
    expect(names('pinehusrt')[0]).toBe('Pinehurst No. 2');         // swapped letters
    expect(names('bridgehampton')).toEqual(['3 Ponds Farm']);      // location
    expect(names('pakman')).toContain('Pinehurst No. 2');          // designer
    expect(names('dragons lair')).toEqual(["Dragon's Lair"]);      // punctuation
    expect(names('zzzz')).toEqual([]);
  });
  it('filters by holes, difficulty, real/fictional and private servers', () => {
    expect(names('', { holes: '9' })).toEqual(["Dragon's Lair", 'Short Par 3']);
    expect(names('', { diff: 'hard' })).toEqual(['Pinehurst No. 2', "Dragon's Lair"]);
    expect(names('', { kind: 'fictional' })).toEqual(["Dragon's Lair"]);
    expect(names('', { privateServers: false })).not.toContain('Secret Dunes & Links');
  });
  it('the real synced file loads and searches fast', () => {
    const real = indexLibrary(JSON.parse(fs.readFileSync('public/courses.json', 'utf8')));
    expect(real.courses.length).toBeGreaterThan(2500);
    const t = performance.now(); const r = searchCourses(real, 'pebble beach'); const ms = performance.now() - t;
    expect(r.results[0].name + ' ' + r.results[0].loc).toMatch(/Pebble Beach/); // GSPro's is "DPC Pebble", Pebble Beach, CA expect(ms).toBeLessThan(150);
  });
});

describe('9-hole values', () => {
  it('WHS: slope same, rating = nine par + (18 rating − 18 par)/2', () => {
    expect(nineFrom18({ rating18: 74.1, slope18: 137, par18: 72, par9: 36 })).toEqual({ rating: 37.1, slope: 137 });
    expect(nineFrom18({ rating18: 70.3, slope18: 128, par18: 71, par9: 35 })).toEqual({ rating: 34.7, slope: 128 }); // 35 + (−0.7)/2 = 34.65
    expect(nineFrom18({ rating18: '', slope18: 128, par18: 71, par9: 35 })).toBe(null);
    expect(nineFrom18({ rating18: 70, slope18: 200, par18: 72, par9: 36 })).toBe(null);
  });
  it('default pars hit the nine par; 18-hole par splits front/back', () => {
    for (const p of [27, 33, 34, 35, 36, 37, 38]) expect(defaultPars(p).reduce((a, b) => a + b)).toBe(p);
    expect(ninePar({ par: 71 }, 'front')).toBe(36); expect(ninePar({ par: 71 }, 'back')).toBe(35);
    expect(ninePar({ par: 36, nine: true }, 'front')).toBe(36);
  });
  it('builds a league course: estimated vs from the scorecard', () => {
    const c = lib.courses.find((x) => x.id === 1000);
    const holes = defaultPars(36).map((par, i) => ({ par, si: i + 1 }));
    const est = courseFromLibrary(c, { holes, nine: 'back', id: 'c_x' });
    expect(est).toMatchObject({ name: 'Pebble Beach Golf Links — Back Nine', par: 36, gspro: 4.6, ...estimateFromDifficulty(4.6, 36), lib: { id: 1000, nine: 'back', source: 'estimated' } });
    const real = courseFromLibrary(c, { holes, source: 'scorecard', rating18: 75.5, slope18: 145, par18: 72, id: 'c_y' });
    expect(real).toMatchObject({ rating: 37.8, slope: 145, lib: { source: 'scorecard', rating18: 75.5 } });
  });
});
