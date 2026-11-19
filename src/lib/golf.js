/**
 * Carry — golf league engine (pure functions, no UI, fully unit-tested).
 *
 * Handicap model: a closed-league "League Index" on the 9-hole scale, following
 * World Handicap System (WHS) mechanics:
 *   9-hole Score Differential = (113 / Slope) × (Adjusted Gross Score − Course Rating)
 *   Index = WHS lookup table (best N of the most recent ≤20 differentials,
 *           with the table's small-sample adjustments halved for the 9-hole scale)
 *   Course Handicap (9) = Index × Slope/113 + (Course Rating − Par)
 *   Playing Handicap = round(Course Handicap × allowance)
 * Adjusted Gross Score caps every hole at Net Double Bogey (par + 2 + strokes
 * received). Until a player has an established index, the cap is par + 5 (WHS 3.1b).
 * Note: official WHS (2024+) converts 9-hole rounds to 18-hole differentials using an
 * "expected score". That curve is not public, so Carry keeps everything on the
 * 9-hole scale, which is self-consistent for a league that only ever plays nine.
 */

export const HOLES = 9;

// ---------- small utils ----------
export const round1 = (x) => Math.round(x * 10) / 10;
/** Round half away from zero (WHS convention: .5 rounds up for positive). */
export const roundHalfUp = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const isCompleteCard = (holes) =>
  Array.isArray(holes) && holes.length === HOLES && holes.every((h) => Number.isFinite(h) && h > 0);

// ---------- GSPro difficulty → slope ----------
/**
 * GSPro shows a 0–10 course difficulty. Slope runs 55–155 with 113 = "standard".
 * Mapping: linear, slope = 55 + difficulty × 10, so 5.8 ≈ 113 (standard) and
 * 10 = 155 (max). Rating defaults to par + (slope − 113) / 13 for nine holes,
 * a rough rule of thumb (≈ 1 stroke per 13 slope points over 9 holes).
 */
export function gsproToSlope(difficulty) {
  const d = Math.min(10, Math.max(0, Number(difficulty) || 0));
  return Math.round(55 + d * 10);
}
export function suggestRating(par, slope) {
  return round1(par + (slope - 113) / 13);
}

// ---------- strokes, caps ----------
/** Strokes a player receives on a hole with stroke index `si` (1..9) given a 9-hole playing handicap. */
export function strokesOnHole(ph, si, holes = HOLES) {
  if (!Number.isFinite(ph) || ph === 0) return 0;
  if (ph > 0) {
    const base = Math.floor(ph / holes);
    const extra = ph % holes;
    return base + (si <= extra ? 1 : 0);
  }
  // plus handicap: gives strokes back starting on the easiest holes (highest SI)
  const give = -ph;
  const base = Math.floor(give / holes);
  const extra = give % holes;
  return -(base + (si > holes - extra ? 1 : 0)) || 0;
}

/** Max hole score for handicap purposes. */
export function holeCap(par, strokes, established) {
  return established ? par + 2 + strokes : par + 5;
}

export function adjustedGross(holes, course, courseHandicap, established) {
  return sum(
    holes.map((s, i) => {
      const h = course.holes[i];
      const cap = holeCap(h.par, strokesOnHole(courseHandicap, h.si), established);
      return Math.min(s, cap);
    })
  );
}

export function scoreDifferential(ags, rating, slope) {
  return round1((113 / slope) * (ags - rating));
}

// ---------- index from differentials (WHS table) ----------
const WHS_TABLE = [
  // [count, use best N, adjustment (18-hole scale)]
  [3, 1, -2.0], [4, 1, -1.0], [5, 1, 0], [6, 2, -1.0], [7, 2, 0], [8, 2, 0],
  [9, 3, 0], [10, 3, 0], [11, 3, 0], [12, 4, 0], [13, 4, 0], [14, 4, 0],
  [15, 5, 0], [16, 5, 0], [17, 6, 0], [18, 6, 0], [19, 7, 0], [20, 8, 0],
];

/**
 * Compute an index from a chronological list of differentials.
 * Returns { index, used: [positions in recent window], window, best, adj } or null.
 */
export function indexFromDifferentials(diffs, { maxIndex = 27 } = {}) {
  const recent = diffs.slice(-20);
  const n = recent.length;
  if (n < 3) return null;
  const [, best, adj18] = WHS_TABLE.find((r) => r[0] === n);
  const adj = adj18 / 2; // 9-hole scale
  const order = recent.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d || a.i - b.i);
  const picked = order.slice(0, best);
  const avg = sum(picked.map((p) => p.d)) / best;
  const raw = avg + adj;
  const index = Math.min(maxIndex, round1(raw));
  return { index, usedPositions: picked.map((p) => p.i).sort((a, b) => a - b), window: n, best, adj, avg: round1(avg) };
}

export function courseHandicap(index, course, settings = {}) {
  const crPar = settings.includeCrMinusPar === false ? 0 : course.rating - course.par;
  return roundHalfUp(index * (course.slope / 113) + crPar);
}
export function playingHandicap(ch, allowance = 1) {
  return roundHalfUp(ch * allowance);
}

// ---------- league model helpers ----------
export const DEFAULT_SETTINGS = {
  minRounds: 4, // rounds before computed handicaps kick in
  maxIndex: 27,
  allowance: 1, // playing-handicap allowance for net competition
  includeCrMinusPar: true,
  absencePolicy: 'fieldMaxPlus1', // 'fieldMaxPlus1' | 'average' | 'skip'
  countPending: true, // count scores awaiting commissioner approval
  skins: { mode: 'net', carryover: true, buyIn: 5, endCarry: 'split', netAllowance: 1 },
  house: { gimme: 'off', mulligans: 0, puttingMode: 'auto-gimme-8ft' },
};

export function settingsOf(league) {
  const s = league.settings || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    skins: { ...DEFAULT_SETTINGS.skins, ...(s.skins || {}) },
    house: { ...DEFAULT_SETTINGS.house, ...(s.house || {}) },
  };
}

export const sortedWeeks = (league) => [...(league.weeks || [])].sort((a, b) => a.number - b.number);
export const courseById = (league, id) => league.courses.find((c) => c.id === id);
export const playerById = (league, id) => league.players.find((p) => p.id === id);
export const subKey = (regularId) => `sub:${regularId}`;

/** Score record for an entrant if it counts (complete + approved/pending policy). */
function countedCard(week, key, settings) {
  const rec = week.scores?.[key];
  if (!rec || !isCompleteCard(rec.holes)) return null;
  if (rec.status === 'pending' && !settings.countPending) return null;
  return rec.holes;
}

/**
 * Walk the season chronologically. For every week returns the index each regular
 * carried INTO that week, and builds each regular's differential log.
 */
export function computeHandicaps(league) {
  const settings = settingsOf(league);
  const weeks = sortedWeeks(league);
  const log = {}; // pid -> [{weekId, weekNumber, gross, ags, diff, courseName, ...}]
  const byWeek = {}; // weekId -> pid -> {index, established, method, ...}
  const current = {};
  for (const p of league.players) log[p.id] = [];

  const indexFor = (p) => {
    if (p.manualIndex != null && p.manualIndex !== '') {
      return { index: Number(p.manualIndex), established: true, method: 'manual' };
    }
    const diffs = log[p.id].map((r) => r.diff);
    if (diffs.length < Math.max(3, settings.minRounds)) {
      return { index: Number(p.startIndex || 0), established: false, method: 'starting', rounds: diffs.length };
    }
    const r = indexFromDifferentials(diffs, settings);
    return { index: r.index, established: true, method: 'whs', rounds: diffs.length, detail: r };
  };

  for (const w of weeks) {
    const course = courseById(league, w.courseId);
    byWeek[w.id] = {};
    for (const p of league.players) byWeek[w.id][p.id] = indexFor(p);
    if (!course) continue;
    for (const p of league.players) {
      if (w.subs?.[p.id]) continue; // a sub played this slot
      const holes = countedCard(w, p.id, settings);
      if (!holes) continue;
      const hi = byWeek[w.id][p.id];
      const ch = courseHandicap(hi.index, course, settings);
      const ags = adjustedGross(holes, course, ch, hi.established);
      log[p.id].push({
        weekId: w.id, weekNumber: w.number, courseName: course.name, rating: course.rating, slope: course.slope,
        gross: sum(holes), ags, diff: scoreDifferential(ags, course.rating, course.slope), capped: sum(holes) - ags,
      });
    }
  }
  for (const p of league.players) current[p.id] = indexFor(p);
  // mark which differentials currently count
  for (const p of league.players) {
    const c = current[p.id];
    const L = log[p.id];
    const offset = Math.max(0, L.length - 20);
    L.forEach((r, i) => {
      r.inWindow = i >= offset;
      r.used = c.method === 'whs' && c.detail.usedPositions.includes(i - offset);
    });
  }
  return { byWeek, log, current };
}

/** Everyone who teed it up in a week (regulars + subs) with gross/net computed. */
export function weekEntrants(league, week, hcp = computeHandicaps(league)) {
  const settings = settingsOf(league);
  const course = courseById(league, week.courseId);
  const out = [];
  const teamOf = {};
  (week.teams || []).forEach((t, ti) => t.forEach((pid) => (teamOf[pid] = ti)));
  for (const p of league.players) {
    const sub = week.subs?.[p.id];
    const isSub = !!sub;
    const key = isSub ? subKey(p.id) : p.id;
    const index = isSub ? Number(sub.index || 0) : hcp.byWeek[week.id]?.[p.id]?.index ?? 0;
    const ch = course ? courseHandicap(index, course, settings) : 0;
    const ph = playingHandicap(ch, settings.allowance);
    const rec = week.scores?.[key];
    const holes = rec?.holes || Array(HOLES).fill(null);
    const counted = countedCard(week, key, settings);
    const gross = counted ? sum(counted) : null;
    out.push({
      key, regularId: p.id, isSub, name: isSub ? sub.name : p.name, color: p.color,
      index, ch, ph, holes, status: rec?.status || null, photo: rec?.photo || null, complete: !!counted,
      entered: holes.filter((h) => Number.isFinite(h) && h > 0).length,
      gross, net: counted ? gross - ph : null, team: teamOf[p.id] ?? null,
    });
  }
  return out;
}

/** Team results for a week: lowest combined net wins (ties share). */
export function teamResults(league, week, entrants = weekEntrants(league, week)) {
  const teams = (week.teams || []).map((pair, i) => {
    const members = pair.map((pid) => entrants.find((e) => e.regularId === pid)).filter(Boolean);
    const complete = members.length === 2 && members.every((m) => m.complete);
    return {
      team: i, members, complete,
      net: complete ? sum(members.map((m) => m.net)) : null,
      gross: complete ? sum(members.map((m) => m.gross)) : null,
    };
  });
  const done = teams.filter((t) => t.complete);
  const best = done.length ? Math.min(...done.map((t) => t.net)) : null;
  const sorted = [...teams].sort((a, b) => (a.net ?? 1e9) - (b.net ?? 1e9));
  let place = 0, last = null;
  sorted.forEach((t, i) => {
    if (t.net !== last) place = i + 1;
    last = t.net;
    t.place = t.complete ? place : null;
    t.winner = t.complete && t.net === best && done.length === teams.length;
  });
  return sorted;
}

/** A week is final when every card is in, or the commissioner closed it (absences then apply). */
export function isWeekFinal(week, entrants) {
  if (week.final) return true;
  return entrants.length > 0 && entrants.every((e) => e.complete);
}

/**
 * Individual season standings — regulars only (subs never appear).
 * Absences are filled per settings.absencePolicy so a missed week isn't an advantage.
 * `throughWeek` limits to weeks with number ≤ throughWeek (for the scrubber + movement arrows).
 */
export function standings(league, throughWeek = Infinity, hcp = computeHandicaps(league)) {
  const settings = settingsOf(league);
  const weeks = sortedWeeks(league).filter((w) => w.number <= throughWeek);
  const rows = league.players.map((p) => ({ id: p.id, name: p.name, color: p.color, rounds: [], total: 0, played: 0, absences: 0 }));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const w of weeks) {
    const ents = weekEntrants(league, w, hcp);
    const regs = ents.filter((e) => !e.isSub && e.complete);
    if (!isWeekFinal(w, ents)) continue; // live or unplayed weeks don't move the table
    const fieldMax = regs.length ? Math.max(...regs.map((e) => e.net)) : null;
    for (const r of rows) {
      const e = regs.find((x) => x.regularId === r.id);
      if (e) r.rounds.push({ week: w.number, net: e.net, gross: e.gross, absent: false });
      else r.rounds.push({ week: w.number, net: null, absent: true, fieldMax });
    }
  }
  for (const r of rows) {
    const played = r.rounds.filter((x) => !x.absent);
    r.played = played.length;
    r.absences = r.rounds.length - played.length;
    const avg = played.length ? sum(played.map((x) => x.net)) / played.length : null;
    r.avg = avg == null ? null : round1(avg);
    for (const x of r.rounds) {
      if (!x.absent) continue;
      if (settings.absencePolicy === 'fieldMaxPlus1' && x.fieldMax != null) x.net = x.fieldMax + 1;
      else if (settings.absencePolicy === 'average' && avg != null) x.net = Math.round(avg);
      else x.net = null;
    }
    r.total = sum(r.rounds.filter((x) => x.net != null).map((x) => x.net));
    r.best = played.length ? Math.min(...played.map((x) => x.net)) : null;
  }
  const ranked = rows.sort((a, b) => {
    const ac = a.rounds.filter((x) => x.net != null).length, bc = b.rounds.filter((x) => x.net != null).length;
    if (settings.absencePolicy === 'skip' && ac !== bc) return bc - ac;
    return a.total - b.total || (a.avg ?? 99) - (b.avg ?? 99) || a.name.localeCompare(b.name);
  });
  let place = 0, last = null;
  ranked.forEach((r, i) => {
    if (r.total !== last) place = i + 1;
    last = r.total;
    r.place = place;
  });
  return ranked;
}

// ---------- skins ----------
/**
 * Skins for one week. All entrants with a complete card (regulars and subs) are in.
 * mode 'gross' or 'net' (net uses hole strokes from playing handicap × netAllowance).
 * Ties carry the skin to the next hole when carryover is on; leftover carry after the
 * last hole is split among those tied on the last hole ('split') or left unclaimed.
 */
export function weekSkins(league, week, entrants = weekEntrants(league, week)) {
  const settings = settingsOf(league);
  const sk = settings.skins;
  const course = courseById(league, week.courseId);
  const field = entrants.filter((e) => e.complete);
  const holes = [];
  const winnings = {}; // key -> units
  let carry = 0;
  if (!course || field.length < 2) {
    return { holes, field, pot: 0, unitValue: 0, awardedUnits: 0, unclaimed: 0, winnings, byKey: {} };
  }
  for (let i = 0; i < HOLES; i++) {
    const h = course.holes[i];
    const scores = field.map((e) => {
      const strokes = sk.mode === 'net' ? strokesOnHole(roundHalfUp(e.ch * sk.netAllowance), h.si) : 0;
      return { key: e.key, gross: e.holes[i], score: e.holes[i] - strokes, dot: strokes };
    });
    const low = Math.min(...scores.map((s) => s.score));
    const lows = scores.filter((s) => s.score === low);
    const units = 1 + carry;
    if (lows.length === 1) {
      holes.push({ hole: i + 1, par: h.par, low, winner: lows[0].key, units, carriedIn: carry, scores });
      winnings[lows[0].key] = (winnings[lows[0].key] || 0) + units;
      carry = 0;
    } else {
      const last = i === HOLES - 1;
      if (last && sk.carryover && sk.endCarry === 'split') {
        const share = units / lows.length;
        lows.forEach((l) => (winnings[l.key] = (winnings[l.key] || 0) + share));
        holes.push({ hole: i + 1, par: h.par, low, winner: null, split: lows.map((l) => l.key), units, carriedIn: carry, scores });
        carry = 0;
      } else {
        holes.push({ hole: i + 1, par: h.par, low, winner: null, tied: lows.map((l) => l.key), units, carriedIn: carry, scores, carriedOut: sk.carryover });
        carry = sk.carryover ? units : 0;
      }
    }
  }
  const awardedUnits = sum(Object.values(winnings));
  const pot = (Number(sk.buyIn) || 0) * field.length;
  const unitValue = awardedUnits ? pot / awardedUnits : 0;
  const byKey = {};
  for (const [k, u] of Object.entries(winnings)) byKey[k] = { units: u, money: Math.round(u * unitValue * 100) / 100 };
  return { holes, field, pot, unitValue, awardedUnits, unclaimed: carry, winnings, byKey };
}

/** Season skins totals. Subs are included (labeled) because they won real money. */
export function seasonSkins(league, hcp = computeHandicaps(league)) {
  const totals = {};
  for (const w of sortedWeeks(league)) {
    const ents = weekEntrants(league, w, hcp);
    if (!isWeekFinal(w, ents)) continue; // live week skins are provisional
    const s = weekSkins(league, w, ents);
    for (const [k, v] of Object.entries(s.byKey)) {
      const e = ents.find((x) => x.key === k);
      const id = e.isSub ? `${k}@${w.id}` : k;
      totals[id] ||= { id, name: e.name, isSub: e.isSub, color: e.color, units: 0, money: 0, weeks: [] };
      totals[id].units += v.units;
      totals[id].money = Math.round((totals[id].money + v.money) * 100) / 100;
      totals[id].weeks.push(w.number);
    }
  }
  return Object.values(totals).sort((a, b) => b.money - a.money || b.units - a.units);
}

// ---------- team rotation ----------
/** All perfect matchings of an even list of ids. */
export function allPairings(ids) {
  if (ids.length === 0) return [[]];
  const [a, ...rest] = ids;
  const out = [];
  rest.forEach((b, i) => {
    const remaining = rest.filter((_, j) => j !== i);
    for (const m of allPairings(remaining)) out.push([[a, b], ...m]);
  });
  return out;
}
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function partnerCounts(history) {
  const c = {};
  for (const teams of history) for (const [a, b] of teams) c[pairKey(a, b)] = (c[pairKey(a, b)] || 0) + 1;
  return c;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick next week's teams. Objective, in order:
 *  1. fewest repeat partnerships (squared counts, so a 3rd repeat hurts more than two 2nds)
 *  2. keep the most repeat-free weeks available afterwards (lookahead → a full
 *     round-robin, 7 weeks with 8 players, is reached with zero repeats)
 *  3. most balanced team handicaps (optional `indexes` map)
 *  4. seeded random tiebreak
 */
export function generateTeams(ids, history = [], { indexes = {}, seed = 1 } = {}) {
  if (ids.length % 2) throw new Error('Need an even number of players for 2-man teams');
  const all = allPairings([...ids].sort());
  const counts = partnerCounts(history);
  const cost = (m, c) => sum(m.map(([a, b]) => (c[pairKey(a, b)] || 0) ** 2));
  const rand = mulberry32(seed);
  let bestScore = null, best = [];
  for (const m of all) {
    const c1 = cost(m, counts);
    const next = { ...counts };
    for (const [a, b] of m) next[pairKey(a, b)] = (next[pairKey(a, b)] || 0) + 1;
    const minNext = Math.min(...all.map((x) => cost(x, next)));
    const freeNext = all.filter((x) => cost(x, next) === minNext).length;
    const teamIdx = m.map(([a, b]) => (indexes[a] || 0) + (indexes[b] || 0));
    const spread = Math.max(...teamIdx) - Math.min(...teamIdx);
    const score = [c1, minNext, -freeNext, round1(spread)];
    const cmp = bestScore ? score.findIndex((v, i) => v !== bestScore[i]) : -1;
    if (!bestScore || (cmp >= 0 && score[cmp] < bestScore[cmp])) { bestScore = score; best = [m]; }
    else if (cmp === -1) best.push(m);
  }
  const pick = best[Math.floor(rand() * best.length)];
  return pick.map((t) => [...t]);
}

export function repeatPartners(teams, history) {
  const c = partnerCounts(history);
  return teams.filter(([a, b]) => c[pairKey(a, b)]).map(([a, b]) => ({ a, b, times: c[pairKey(a, b)] }));
}

// ---------- weekly highlights ----------
export function weekHighlights(league, week, entrants = weekEntrants(league, week)) {
  const course = courseById(league, week.courseId);
  const done = entrants.filter((e) => e.complete);
  if (!done.length || !course) return null;
  const lowGross = Math.min(...done.map((e) => e.gross));
  const lowNet = Math.min(...done.map((e) => e.net));
  let birdies = 0, eagles = 0, pars = 0;
  for (const e of done) e.holes.forEach((s, i) => {
    const d = s - course.holes[i].par;
    if (d <= -2) eagles++; else if (d === -1) birdies++; else if (d === 0) pars++;
  });
  return {
    lowGross: done.filter((e) => e.gross === lowGross), lowGrossScore: lowGross,
    lowNet: done.filter((e) => e.net === lowNet), lowNetScore: lowNet,
    birdies, eagles, pars, rounds: done.length,
  };
}
