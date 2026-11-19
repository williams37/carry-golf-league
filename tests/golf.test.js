import { describe, it, expect } from 'vitest';
import {
  strokesOnHole, holeCap, adjustedGross, scoreDifferential, indexFromDifferentials, courseHandicap,
  computeHandicaps, generateTeams, partnerCounts, standings, weekSkins, weekEntrants, teamResults,
  seasonSkins, gsproToSlope, subKey, allPairings,
} from '../src/lib/golf.js';
import { demoLeague } from '../src/lib/seed.js';

const course = {
  id: 'c1', name: 'Test Nine', rating: 36.0, slope: 113, par: 36,
  holes: [4, 4, 3, 5, 4, 4, 3, 5, 4].map((par, i) => ({ par, si: i + 1 })),
};
const pars = course.holes.map((h) => h.par);

function league({ players = 8, weeks = [], settings = {} } = {}) {
  return {
    id: 't', name: 'T', settings,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, startIndex: 0 })),
    courses: [course], weeks,
  };
}
const card = (over) => pars.map((p, i) => p + (Array.isArray(over) ? over[i] : over));

describe('strokes & net double bogey', () => {
  it('allocates strokes by stroke index', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((si) => strokesOnHole(3, si))).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0]);
    expect(strokesOnHole(11, 1)).toBe(2);
    expect(strokesOnHole(11, 3)).toBe(1);
    expect(strokesOnHole(-1, 9)).toBe(-1); // plus handicap gives back on easiest hole
    expect(strokesOnHole(-1, 8)).toBe(0);
  });
  it('caps at par+2+strokes when established, par+5 before', () => {
    expect(holeCap(4, 1, true)).toBe(7);
    expect(holeCap(4, 0, false)).toBe(9);
    const holes = card(0); holes[0] = 11; // blow-up on a par 4, SI 1
    expect(adjustedGross(holes, course, 0, true)).toBe(36 + 2); // 11 → 6
    expect(adjustedGross(holes, course, 9, true)).toBe(36 + 3); // gets 1 stroke → cap 7
    expect(adjustedGross(holes, course, 0, false)).toBe(36 + 5); // par+5 = 9
  });
});

describe('handicap', () => {
  it('9-hole differential formula', () => {
    expect(scoreDifferential(40, 35.0, 113)).toBe(5);
    expect(scoreDifferential(42, 34.6, 125)).toBe(6.7); // 113/125*7.4 = 6.69
  });
  it('WHS table with halved adjustments', () => {
    expect(indexFromDifferentials([5, 6, 7])).toMatchObject({ index: 4, best: 1 }); // 5 - 1.0
    expect(indexFromDifferentials([5, 6, 7, 8])).toMatchObject({ index: 4.5 }); // 5 - 0.5
    expect(indexFromDifferentials([8, 6, 7, 9, 10])).toMatchObject({ index: 6 });
    expect(indexFromDifferentials([8, 6, 7, 9, 10, 4]).index).toBe(4.5); // avg(4,6)=5 - .5
    const twenty = Array.from({ length: 24 }, (_, i) => i); // only last 20 (4..23) count, best 8 = 4..11
    expect(indexFromDifferentials(twenty).index).toBe(7.5);
    expect(indexFromDifferentials([40, 40, 40, 40, 40]).index).toBe(27); // capped
  });
  it('course handicap includes CR - Par', () => {
    expect(courseHandicap(10, { ...course, slope: 130, rating: 36.2 }, {})).toBe(Math.round(10 * 130 / 113 + 0.2));
  });
  it('starts at 0 (or manual start) and kicks in after 4 rounds, updating weekly', () => {
    const weeks = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `w${n}`, number: n, courseId: 'c1', teams: [], subs: {},
      scores: { p0: { holes: card(1), status: 'approved' } }, // 45 every week → diff 9
    }));
    const lg = league({ weeks });
    lg.players[1].startIndex = 12;
    const h = computeHandicaps(lg);
    for (const n of [1, 2, 3, 4]) expect(h.byWeek[`w${n}`].p0).toMatchObject({ index: 0, established: false });
    expect(h.byWeek.w5.p0).toMatchObject({ index: 8.5, method: 'whs' }); // 4 diffs of 9 → 9 - .5
    expect(h.byWeek.w6.p0.index).toBe(9); // 5 diffs → best 1, no adj
    expect(h.byWeek.w1.p1.index).toBe(12);
    expect(h.log.p0).toHaveLength(6);
  });
  it('manual override wins', () => {
    const lg = league();
    lg.players[0].manualIndex = 3.3;
    expect(computeHandicaps(lg).current.p0).toMatchObject({ index: 3.3, method: 'manual' });
  });
});

describe('team rotation', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  it('enumerates 105 pairings of 8', () => expect(allPairings(ids)).toHaveLength(105));
  it('7 straight weeks with zero repeat partners (full round robin)', () => {
    const history = [];
    for (let w = 0; w < 7; w++) history.push(generateTeams(ids, history, { seed: w + 1 }));
    const counts = Object.values(partnerCounts(history));
    expect(counts).toHaveLength(28);
    expect(Math.max(...counts)).toBe(1);
    for (const t of history) expect(t.flat().sort()).toEqual(ids);
  });
  it('week 8 repeats at most once per pair', () => {
    const history = [];
    for (let w = 0; w < 8; w++) history.push(generateTeams(ids, history, { seed: w + 3 }));
    expect(Math.max(...Object.values(partnerCounts(history)))).toBe(2);
  });
  it('balances handicaps on ties', () => {
    const idx = { a: 0, b: 0, c: 0, d: 0, e: 20, f: 20, g: 20, h: 20 };
    const t = generateTeams(ids, [], { indexes: idx });
    for (const [x, y] of t) expect(idx[x] + idx[y]).toBe(20);
  });
});

function playedWeek(n, nets, extra = {}) {
  // nets: array of strokes over par per player (index 0 everyone so net = gross)
  const scores = {};
  nets.forEach((o, i) => { if (o != null) scores[`p${i}`] = { holes: card([o, 0, 0, 0, 0, 0, 0, 0, 0]), status: 'approved' }; });
  return { id: `w${n}`, number: n, courseId: 'c1', teams: [['p0', 'p1'], ['p2', 'p3'], ['p4', 'p5'], ['p6', 'p7']], subs: {}, scores, ...extra };
}

describe('standings, teams and subs', () => {
  it('lowest cumulative net wins; absence = field max + 1', () => {
    const w2 = playedWeek(2, [2, null, 0, 0, 0, 0, 0, 0]);
    w2.final = true; // commissioner closed the week with p1 absent
    const lg = league({ weeks: [playedWeek(1, [0, 1, 2, 3, 0, 0, 0, 0]), w2] });
    const s = standings(lg);
    const p1 = s.find((r) => r.id === 'p1');
    expect(p1.absences).toBe(1);
    expect(p1.rounds[1].net).toBe(36 + 2 + 1); // field max (p0 38) + 1
    expect(s[0].id).toBe('p4'); // 36+36 tied with p5,p6,p7 → alphabetical P4
    expect(s.find((r) => r.id === 'p0').total).toBe(36 + 38);
  });
  it('subs count for the team but never appear in standings', () => {
    const w = playedWeek(1, [5, 0, 0, 0, 0, 0, 0, 0]);
    w.subs = { p0: { name: 'Sub Steve', index: 0 } };
    delete w.scores.p0;
    w.scores[subKey('p0')] = { holes: card(-1), status: 'approved' }; // 27 — absurdly good
    const lg = league({ weeks: [w] });
    const ents = weekEntrants(lg, w);
    expect(ents.find((e) => e.isSub)).toMatchObject({ name: 'Sub Steve', gross: 27 });
    const teams = teamResults(lg, w, ents);
    expect(teams[0]).toMatchObject({ team: 0, net: 27 + 36, winner: true });
    const s = standings(lg);
    expect(s.map((r) => r.name)).not.toContain('Sub Steve');
    expect(s.find((r) => r.id === 'p0').absences).toBe(1);
    expect(s.find((r) => r.id === 'p0').total).toBe(37); // field max 36 + 1
    // and sub rounds never feed the regular's handicap
    expect(computeHandicaps(lg).log.p0).toHaveLength(0);
  });
  it('live (unfinished) weeks do not move the standings', () => {
    const w = playedWeek(1, [0, 0, 0, 0, 0, 0, 0, null]);
    const lg = league({ weeks: [w] });
    expect(standings(lg).every((r) => r.rounds.length === 0)).toBe(true);
    w.final = true;
    expect(standings(lg).find((r) => r.id === 'p7').absences).toBe(1);
  });
  it('incomplete cards do not count', () => {
    const w = playedWeek(1, [0, 0, 0, 0, 0, 0, 0, 0]);
    w.scores.p3.holes[8] = null;
    const lg = league({ weeks: [w] });
    expect(weekEntrants(lg, w).find((e) => e.key === 'p3').complete).toBe(false);
    expect(teamResults(lg, w).find((t) => t.team === 1).complete).toBe(false);
  });
});

describe('skins', () => {
  const mk = (rows, sk = {}) => {
    const scores = {};
    rows.forEach((h, i) => (scores[`p${i}`] = { holes: pars.map((p, j) => p + h[j]), status: 'approved' }));
    const w = { id: 'w1', number: 1, courseId: 'c1', teams: [], subs: {}, scores };
    return [league({ players: rows.length, weeks: [w], settings: { skins: { mode: 'gross', buyIn: 5, ...sk } } }), w];
  };
  it('outright winners take a skin; ties carry over', () => {
    const [lg, w] = mk([
      [-1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, -1, 0, 0, 0, 0, -1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const s = weekSkins(lg, w);
    expect(s.holes[0]).toMatchObject({ winner: 'p0', units: 1 });
    expect(s.holes[1]).toMatchObject({ winner: null, carriedOut: true });
    expect(s.holes[3]).toMatchObject({ winner: 'p1', units: 3, carriedIn: 2 }); // holes 2,3 carried
    expect(s.holes[8]).toMatchObject({ winner: 'p1', units: 5 }); // 5..8 carried into 9
    expect(s.pot).toBe(15);
    expect(s.awardedUnits).toBe(9);
    expect(s.byKey.p1.units).toBe(8);
    expect(s.byKey.p1.money).toBeCloseTo(13.33, 2);
  });
  it('leftover carry is split on the last hole or left unclaimed', () => {
    const rows = [[-1, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]];
    let [lg, w] = mk(rows, { endCarry: 'split' });
    let s = weekSkins(lg, w);
    expect(s.byKey.p0.units).toBe(1 + 4);
    expect(s.byKey.p1.units).toBe(4);
    [lg, w] = mk(rows, { endCarry: 'none' });
    s = weekSkins(lg, w);
    expect(s.unclaimed).toBe(8);
    expect(s.byKey.p0.money).toBe(10);
  });
  it('carryover off voids tied holes', () => {
    const [lg, w] = mk([[-1, 0, -1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]], { carryover: false });
    const s = weekSkins(lg, w);
    expect(s.holes[2]).toMatchObject({ winner: 'p0', units: 1 });
  });
  it('net skins apply hole strokes', () => {
    const [lg, w] = mk([[0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 0]], { mode: 'net' });
    lg.players[1].startIndex = 1; // CH 1 → stroke on SI 1 (hole 1): bogey nets par → tie
    const s = weekSkins(lg, w);
    expect(s.holes[0].winner).toBe(null);
  });
});

describe('demo league + misc', () => {
  it('GSPro mapping', () => {
    expect(gsproToSlope(0)).toBe(55);
    expect(gsproToSlope(5.8)).toBe(113);
    expect(gsproToSlope(10)).toBe(155);
  });
  it('demo league is coherent', () => {
    const lg = demoLeague();
    expect(lg.players).toHaveLength(8);
    const s = standings(lg);
    expect(s).toHaveLength(8);
    expect(s.every((r) => r.rounds.length === 6)).toBe(true);
    const totals = seasonSkins(lg);
    expect(totals.some((t) => t.isSub)).toBe(true);
    expect(computeHandicaps(lg).current[lg.players[0].id].method).toBe('whs');
  });
});
