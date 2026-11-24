// Tees per week, skins opt-in, out players & saved subs, payouts, season close-out, handicap history.
import { describe, it, expect } from 'vitest';
import {
  computeHandicaps, weekEntrants, weekSkins, teamResults, standings, isWeekFinal, missingCards,
  courseForWeek, teeSetsOf, inSkins, skinsPayout, closeSeason, seasonAsLeague, subKey, courseHandicap, seasonSkins,
} from '../src/lib/golf.js';
import { handicapHistory } from '../src/lib/helpers.js';
import { teeSetsFromCard, indexLibrary, courseFromLibrary } from '../src/lib/courseLibrary.js';
import { parseTeeLine, parseRatingSlope, snapName } from '../scripts/lib/tee-ocr.mjs';
import { demoLeague } from '../src/lib/seed.js';

const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4];
const baseCourse = () => ({
  id: 'c1', name: 'Test Nine', tees: 'White', rating: 35.5, slope: 128, par: 36,
  holes: pars.map((par, i) => ({ par, si: i + 1 })),
  teeSets: [
    { name: 'Black', rating: 37.5, slope: 142, source: 'scorecard' },
    { name: 'White', rating: 35.5, slope: 128, source: 'scorecard' },
    { name: 'Red', rating: 33.1, slope: 115, source: 'scorecard' },
  ],
});
const card = (over) => pars.map((p, i) => p + (Array.isArray(over) ? over[i] : over));
const TEAMS = [['p0', 'p1'], ['p2', 'p3'], ['p4', 'p5'], ['p6', 'p7']];
function league({ weeks = [], settings = {}, subPlayers } = {}) {
  return {
    id: 't', name: 'T', settings, season: 'Winter 2026',
    players: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, startIndex: 0 })),
    ...(subPlayers ? { subPlayers } : {}),
    courses: [baseCourse()], weeks,
  };
}
const week = (n, overs, extra = {}) => {
  const scores = {};
  overs.forEach((o, i) => { if (o != null) scores[`p${i}`] = { holes: card(o), status: 'approved' }; });
  return { id: `w${n}`, number: n, date: `2026-10-${String(n).padStart(2, '0')}`, courseId: 'c1', teams: TEAMS, subs: {}, scores, ...extra };
};

describe('tees: one rating/slope per week through courseForWeek', () => {
  it('picks the week tee without touching the saved course', () => {
    const lg = league({ weeks: [week(1, [0, 0, 0, 0, 0, 0, 0, 0], { tee: 'Black' })] });
    const before = JSON.stringify(lg.courses);
    const c = courseForWeek(lg, lg.weeks[0]);
    expect(c).toMatchObject({ rating: 37.5, slope: 142, tees: 'Black', par: 36 });
    expect(JSON.stringify(lg.courses)).toBe(before); // base course untouched
    // calling it again can't compound
    expect(courseForWeek(lg, lg.weeks[0])).toMatchObject({ rating: 37.5, slope: 142 });
  });
  it('falls back to the course default when the week has no tee or an unknown one', () => {
    const lg = league({ weeks: [week(1, []), week(2, [], { tee: 'Gold' })] });
    expect(courseForWeek(lg, lg.weeks[0])).toBe(lg.courses[0]);
    expect(courseForWeek(lg, lg.weeks[1])).toMatchObject({ rating: 35.5, slope: 128 });
    expect(teeSetsOf({ teeSets: [{ name: 'X', rating: 'n/a', slope: 120 }] })).toEqual([]);
    expect(teeSetsOf({})).toEqual([]); // manual courses with no tee data
  });
  it('drives course handicap, net, skins and differentials', () => {
    const lg = league({ settings: { minRounds: 3 } });
    lg.players[0].startIndex = 10;
    lg.weeks = [week(1, [1, 0, 0, 0, 0, 0, 0, 0], { tee: 'Black' }), week(2, [1, 0, 0, 0, 0, 0, 0, 0], { tee: 'Red' })];
    const h = computeHandicaps(lg);
    const [b, r] = h.log.p0;
    expect([b.rating, b.slope, b.tees]).toEqual([37.5, 142, 'Black']);
    expect([r.rating, r.slope, r.tees]).toEqual([33.1, 115, 'Red']);
    expect(b.diff).toBeCloseTo((113 / 142) * (b.ags - 37.5), 1);
    const eB = weekEntrants(lg, lg.weeks[0], h).find((e) => e.key === 'p0');
    const eR = weekEntrants(lg, lg.weeks[1], h).find((e) => e.key === 'p0');
    expect(eB.ch).toBe(courseHandicap(10, { rating: 37.5, slope: 142, par: 36 })); // 10×142/113 + 1.5 = 14
    expect(eR.ch).toBe(courseHandicap(10, { rating: 33.1, slope: 115, par: 36 })); // 10×115/113 − 2.9 = 7
    expect(eB.ch).toBeGreaterThan(eR.ch);
    expect(eB.net).toBe(eB.gross - eB.ph);
  });
  it('turns card tees into 9-hole tee sets (WHS) and keeps every tee on the course', () => {
    const t = teeSetsFromCard([{ name: 'Blue', rating: 72.7, slope: 138 }, { name: 'Red', rating: 66.1, slope: 123 }], { par9: 36, par18: 72 });
    expect(t).toEqual([
      { name: 'Blue', rating: 36.4, slope: 138, card: '72.7/138', source: 'scorecard' }, // 36 + (72.7−72)/2 = 36.35 → 36.4
      { name: 'Red', rating: 33.1, slope: 123, card: '66.1/123', source: 'scorecard' },
    ]);
    // a 9-hole course whose card prints 9-hole ratings keeps them as printed
    expect(teeSetsFromCard([{ name: 'Black', rating: 38.1, slope: 144 }], { nine9: true, par9: 35 })[0]).toMatchObject({ rating: 38.1, slope: 144 });
    const lib = indexLibrary({ cols: ['id', 'name', 'loc', 'par', 'diff'], courses: [[602, 'Abacoa', 'FL', 72, 3.7]] }, { cards: { 602: { u: '', t: [['Blue', 72.7, 138]] } } });
    expect(lib.courses[0].cardTees).toEqual([{ name: 'Blue', rating: 72.7, slope: 138 }]);
    const c = courseFromLibrary(lib.courses[0], { holes: pars.map((par, i) => ({ par, si: i + 1 })), tees: 'Blue', id: 'x', teeSets: t });
    expect(c.teeSets).toHaveLength(2);
  });
});

describe('scorecard tee OCR parsing (never guesses)', () => {
  it('reads rating/slope even when OCR drops the dot or the slash', () => {
    expect(parseRatingSlope('75.0/142')).toEqual({ rating: 75, slope: 142 });
    expect(parseRatingSlope('725/138')).toEqual({ rating: 72.5, slope: 138 });
    expect(parseRatingSlope('70.5134')).toEqual({ rating: 70.5, slope: 134 });
    expect(parseRatingSlope('72/120')).toEqual({ rating: 72, slope: 120 });
  });
  it('rejects anything ambiguous or implausible', () => {
    expect(parseRatingSlope('7114122')).toBeNull(); // dot and slash both gone
    expect(parseRatingSlope('0.0/0')).toBeNull();
    expect(parseRatingSlope('72.0/190')).toBeNull();
    expect(parseTeeLine('54.0/120 PAR3')).toBeNull(); // a separate par-3 layout
    expect(parseTeeLine('54/120 Pars3')).toBeNull();
    expect(parseTeeLine('69.8/126 Rep')).toEqual({ name: 'Red', rating: 69.8, slope: 126 });
    expect(parseTeeLine('72.0/120 JUNIOR')).toBeNull(); // GreenKeeper's untouched placeholder
    expect(parseTeeLine('68.2/138 GREEN')).toEqual({ name: 'Green', rating: 68.2, slope: 138 });
    expect(snapName('Biue')).toBe('Blue');
  });
});

describe('skins opt-in', () => {
  it('only ticked players are in the field and the pot; legacy weeks keep everyone', () => {
    const lg = league({ settings: { skins: { mode: 'gross', buyIn: 5 } } });
    // p1 has the best card but didn't buy in
    const w = week(1, [1, [-1, -1, 0, 0, 0, 0, 0, 0, 0], 0, 0, 1, 1, 1, 1], { skinsIn: { p0: true, p2: true, p3: true } });
    lg.weeks = [w];
    const ents = weekEntrants(lg, w);
    expect(ents.find((e) => e.key === 'p1').skins).toBe(false);
    const sk = weekSkins(lg, w, ents);
    expect(sk.field.map((e) => e.key)).toEqual(['p0', 'p2', 'p3']);
    expect(sk.pot).toBe(15);
    expect(Object.keys(sk.byKey)).not.toContain('p1');
    for (const h of sk.holes) expect(h.scores.map((s) => s.key)).not.toContain('p1'); // can't win or tie
    // p1 still counts for teams and standings
    const net = (k) => ents.find((e) => e.key === k).net;
    expect(net('p1')).toBe(34 + 1); // CR 35.5 − par 36 → course handicap −1 for a 0 index
    expect(teamResults(lg, w, ents).find((t) => t.team === 0).net).toBe(net('p0') + net('p1'));
    w.final = true;
    expect(standings(lg).find((r) => r.id === 'p1').total).toBe(net('p1'));
    // a week saved before the opt-in existed: everyone with a card is in
    const legacy = week(2, [0, 0, 0, 0, 0, 0, 0, 0]);
    expect(inSkins(legacy, 'p5')).toBe(true);
    lg.weeks.push(legacy);
    expect(weekSkins(lg, legacy).field).toHaveLength(8);
  });
  it('a new week with skinsIn {} has nobody in the pot', () => {
    const lg = league({ weeks: [week(1, [0, 0, 0, 0, 0, 0, 0, 0], { skinsIn: {} })] });
    const sk = weekSkins(lg, lg.weeks[0]);
    expect(sk.field).toHaveLength(0);
    expect(sk.pot).toBe(0);
  });
  it('payout: who won what, owed and net per player', () => {
    const lg = league({ settings: { skins: { mode: 'gross', buyIn: 5, carryover: true } } });
    const w = week(1, [[-1, 0, 0, 0, 0, 0, 0, 0, 0], [0, -1, 0, 0, 0, 0, 0, 0, 0], 0, 0], { skinsIn: { p0: true, p1: true, p2: true, p3: true } });
    lg.weeks = [w];
    const sk = weekSkins(lg, w);
    const pay = skinsPayout(lg, w, sk);
    expect(pay.pot).toBe(20);
    // holes 1 and 2 won; holes 3–9 tie → carry → split 4 ways on the 9th (7 skins)
    const p0 = pay.rows.find((r) => r.key === 'p0');
    expect(p0.holes).toEqual([1, 9]);
    expect(p0.owed).toBeCloseTo(20 * (1 + 7 / 4) / 9, 2);
    expect(p0.net).toBeCloseTo(p0.owed - 5, 2);
    expect(pay.rows.reduce((a, r) => a + r.owed, 0)).toBeCloseTo(20, 1);
    expect(pay.holes[0]).toMatchObject({ hole: 1, winners: ['p0'] });
  });
});

describe('out players and saved subs', () => {
  it('an out player is not a missing card and does not block the week', () => {
    const lg = league();
    const w = week(1, [0, 0, 0, 0, 0, 0, 0, null], { out: { p7: true } });
    lg.weeks = [w];
    const ents = weekEntrants(lg, w);
    expect(ents.find((e) => e.key === 'p7').out).toBe(true);
    expect(missingCards(ents)).toHaveLength(0);
    expect(isWeekFinal(w, ents)).toBe(true);
    const teams = teamResults(lg, w, ents);
    expect(teams.find((t) => t.team === 3).short).toBe(true);
    expect(teams.filter((t) => t.winner).length).toBeGreaterThan(0); // the short team doesn't block a winner
    const p7 = standings(lg).find((r) => r.id === 'p7');
    expect(p7.absences).toBe(1);
    // with someone not out and no card, they are missing
    const w2 = week(2, [0, 0, 0, 0, 0, 0, 0, null]);
    expect(missingCards(weekEntrants(lg, w2)).map((e) => e.key)).toEqual(['p7']);
  });
  it('a saved sub starts with no handicap and builds their own; never the regular\'s', () => {
    const lg = league({ settings: { minRounds: 3 }, subPlayers: [{ id: 's1', name: 'Sam Sub' }] });
    lg.players[0].startIndex = 12; // the regular has a big handicap
    const wks = [1, 2, 3, 4].map((n) => {
      const w = week(n, [null, 0, 0, 0, 0, 0, 0, 0]);
      w.subs = { p0: { playerId: 's1', name: 'Sam Sub' } };
      w.scores[subKey('p0')] = { holes: card(1), status: 'approved' }; // 45 every week
      return w;
    });
    lg.weeks = wks;
    const h = computeHandicaps(lg);
    const e1 = weekEntrants(lg, wks[0], h).find((e) => e.isSub);
    expect(e1).toMatchObject({ name: 'Sam Sub', index: 0, subPlayerId: 's1' }); // not 12
    expect(h.log.s1).toHaveLength(4);
    expect(h.log.p0).toHaveLength(0); // the regular's record is untouched
    expect(h.byWeek.w4.s1.method).toBe('whs');
    expect(h.byWeek.w4.s1.index).toBeGreaterThan(0);
    expect(weekEntrants(lg, wks[3], h).find((e) => e.isSub).index).toBe(h.byWeek.w4.s1.index);
    expect(standings(lg).map((r) => r.name)).not.toContain('Sam Sub');
    // season skins group a saved sub across weeks
    lg.weeks.forEach((w) => (w.final = true));
    const money = seasonSkins(lg, h).filter((t) => t.isSub);
    expect(money.every((t) => t.id === 's1')).toBe(true);
  });
  it('old weeks with a typed sub index still work', () => {
    const lg = league();
    const w = week(1, [null, 0, 0, 0, 0, 0, 0, 0]);
    w.subs = { p0: { name: 'Old Sub', index: 4 } };
    w.scores[subKey('p0')] = { holes: card(0), status: 'approved' };
    lg.weeks = [w];
    expect(weekEntrants(lg, w).find((e) => e.isSub).index).toBe(4);
  });
});

describe('season close-out and handicap history', () => {
  it('archives the season with its cards and starts fresh, carrying indexes', () => {
    const lg = demoLeague();
    const h = computeHandicaps(lg);
    const next = closeSeason(lg, { nextSeason: 'Spring 2027', closedAt: '2026-11-24T12:00:00Z' });
    expect(next.season).toBe('Spring 2027');
    expect(next.weeks).toEqual([]);
    expect(next.archive).toHaveLength(1);
    const a = next.archive[0];
    expect(a.season).toBe('Winter 2026');
    expect(a.weeks).toHaveLength(7);
    expect(a.weeks[0].scores).toEqual(lg.weeks[0].scores); // nothing lost
    expect(a.summary.table[0].place).toBe(1);
    for (const p of next.players) expect(p.startIndex).toBe(h.current[p.id].index);
    // the archived season still computes exactly as before
    const old = seasonAsLeague(next, a);
    expect(standings(old).map((r) => r.total)).toEqual(standings(lg).map((r) => r.total));
    expect(lg.weeks).toHaveLength(7); // input not mutated
  });
  it('history lists the index carried into each week, its differential, then now', () => {
    const lg = demoLeague();
    const h = computeHandicaps(lg);
    const pts = handicapHistory(lg, h, 'p1');
    expect(pts).toHaveLength(8);
    expect(pts[0]).toMatchObject({ label: 'W1', index: h.byWeek.w1.p1.index });
    expect(pts[7]).toMatchObject({ label: 'Now', now: true, index: h.current.p1.index });
    expect(pts.filter((p) => p.diff != null).length).toBe(h.log.p1.length);
  });
});
