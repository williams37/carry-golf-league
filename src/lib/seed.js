import { HOLES, generateTeams, computeHandicaps, gsproToSlope, suggestRating, subKey } from './golf.js';

export const PALETTE = ['#2dd4bf', '#f59e0b', '#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fb7185', '#facc15', '#22d3ee', '#c084fc'];
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

export function makeCourse(name, pars, sis, difficulty, extra = {}) {
  const par = pars.reduce((a, b) => a + b, 0);
  const slope = gsproToSlope(difficulty);
  return {
    id: uid('c_'), name, gspro: difficulty, slope, par, rating: suggestRating(par, slope),
    holes: pars.map((p, i) => ({ par: p, si: sis[i] })), ...extra,
  };
}

export function blankLeague(name = 'My League', playerNames = []) {
  return {
    id: uid('lg_'), name, season: String(new Date().getFullYear()), createdAt: Date.now(), version: 1,
    settings: {}, players: playerNames.map((n, i) => ({ id: uid('p_'), name: n, color: PALETTE[i % PALETTE.length], startIndex: 0, manualIndex: null })),
    courses: [], weeks: [],
  };
}

/** A rich demo league: 8 players, 7 courses, 6 weeks played (subs + carryovers) and week 7 in progress. */
export const DEMO_SEED = 348; // picked so the story reads well: close race, a sub cashing skins, long carry chains
export function demoLeague(seed = DEMO_SEED) {
  const r = rng(seed);
  const roster = [
    ['Marcus "Mash" Bell', 7.5], ['Dee Okafor', 3.2], ['Tommy Reyes', 11.8], ['Jules Whitaker', 5.4],
    ['Sam Castellano', 9.6], ['Priya Natarajan', 4.1], ['Ben "Lefty" Kowalski', 13.5], ['Owen Gallagher', 6.9],
  ];
  const lg = blankLeague('Thursday Night Sim League', roster.map((x) => x[0]));
  lg.id = 'demo';
  lg.isDemo = true;
  lg.season = 'Winter 2026';
  lg.settings = { skins: { mode: 'net', carryover: true, buyIn: 5, endCarry: 'split', netAllowance: 1 } };
  lg.players.forEach((p, i) => { p.skill = roster[i][1]; p.id = `p${i + 1}`; }); // stable ids → stable demo
  lg.courses = [
    makeCourse('Pinecrest — Front Nine', [4, 5, 3, 4, 4, 3, 4, 5, 4], [3, 7, 9, 1, 5, 8, 2, 6, 4], 6.4, { tees: 'Blue' }),
    makeCourse('Harbor Links — Back Nine', [4, 4, 3, 5, 4, 4, 3, 4, 5], [2, 6, 8, 4, 1, 5, 9, 3, 7], 5.6, { tees: 'White' }),
    makeCourse('Copper Ridge — Canyon', [5, 3, 4, 4, 3, 4, 5, 4, 4], [5, 9, 1, 3, 8, 2, 6, 4, 7], 7.3, { tees: 'Black' }),
    makeCourse('Old Quarry — Front Nine', [4, 4, 5, 3, 4, 4, 3, 5, 4], [1, 4, 6, 9, 3, 2, 8, 7, 5], 6.0, { tees: 'Blue' }),
    makeCourse('Juniper Dunes — Links', [4, 3, 5, 4, 4, 3, 4, 4, 5], [4, 8, 2, 6, 1, 9, 3, 5, 7], 6.8, { tees: 'Tips' }),
    makeCourse('Cedar Bluff — Lakes', [4, 5, 4, 3, 4, 4, 5, 3, 4], [3, 5, 1, 9, 6, 2, 7, 8, 4], 5.2, { tees: 'White' }),
    makeCourse('Lantern Bay — Ocean Nine', [5, 4, 3, 4, 4, 5, 3, 4, 4], [6, 2, 9, 1, 4, 7, 8, 3, 5], 7.8, { tees: 'Blue' }),
  ];
  lg.courses.forEach((c, i) => (c.id = `c${i + 1}`));
  const start = new Date('2026-10-08T19:00:00');
  const ids = lg.players.map((p) => p.id);
  const history = [];
  // sub indexes are on the 9-hole league scale (≈ half an 18-hole WHS index)
  const subsPlan = { 3: [[6, 'Rick Alvarez', 6.2]], 5: [[2, 'Hannah Cho', 4.0]], 6: [[4, 'Gus Patel', 7.4]] };
  for (let n = 1; n <= 7; n++) {
    const teams = generateTeams(ids, history, { seed: n * 7 });
    history.push(teams);
    const date = new Date(start.getTime() + (n - 1) * 7 * 864e5);
    const w = { id: `w${n}`, number: n, date: date.toISOString().slice(0, 10), courseId: lg.courses[n - 1].id, teams, subs: {}, scores: {} };
    for (const [pi, name, index] of subsPlan[n] || []) w.subs[ids[pi]] = { name, index };
    lg.weeks.push(w);
  }
  // Generate scores
  const course = (w) => lg.courses.find((c) => c.id === w.courseId);
  for (const w of lg.weeks) {
    const c = course(w);
    const live = w.number === 7;
    lg.players.forEach((p, pi) => {
      const sub = w.subs[p.id];
      const skill = sub ? sub.index * 2 : p.skill; // back to the 18-hole-ish skill scale
      const key = sub ? subKey(p.id) : p.id;
      const holesToPlay = live ? [9, 6, 9, 4, 7, 9, 5, 3][pi] : HOLES;
      const holes = c.holes.map((h, i) => {
        if (i >= holesToPlay) return null;
        // skill ≈ an 18-hole index; a nine at that level runs about skill/2 over par plus a little
        const mean = h.par + skill / 17 + 0.12 + (c.slope - 113) / 150 + (h.si <= 3 ? 0.22 : h.si >= 7 ? -0.18 : 0);
        let s = Math.round(mean + gauss(r) * 0.85);
        return Math.max(h.par - 2, Math.min(h.par + 4, Math.max(2, s)));
      });
      w.scores[key] = { holes, status: 'approved', by: 'demo', at: Date.now() };
    });
  }
  lg.weeks[6].scores[ids[3]].status = 'pending';
  return lg;
}

export function demoSummary() {
  const lg = demoLeague();
  return computeHandicaps(lg).current;
}
