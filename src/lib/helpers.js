import { weekEntrants, isWeekFinal, standings, sortedWeeks, courseForWeek, computeHandicaps, missingCards } from './golf.js';

export function weekState(league, week, hcp) {
  const ents = weekEntrants(league, week, hcp);
  const playing = ents.filter((e) => !e.out);
  return { ents, playing, final: isWeekFinal(week, ents), done: ents.filter((e) => e.complete).length, missing: missingCards(ents), course: courseForWeek(league, week) };
}

export function currentWeek(league, hcp) {
  const ws = sortedWeeks(league);
  return ws.find((w) => !isWeekFinal(w, weekEntrants(league, w, hcp))) || ws[ws.length - 1] || null;
}

export function finalWeekNumbers(league, hcp) {
  return sortedWeeks(league).filter((w) => isWeekFinal(w, weekEntrants(league, w, hcp))).map((w) => w.number);
}

/** standings with movement vs the previous final week */
export function standingsWithMovement(league, through, hcp = computeHandicaps(league)) {
  const finals = finalWeekNumbers(league, hcp).filter((n) => n <= through);
  const now = standings(league, through, hcp);
  const prevN = finals.length > 1 ? finals[finals.length - 2] : null;
  const prev = prevN ? standings(league, prevN, hcp) : null;
  return now.map((r) => {
    const p = prev?.find((x) => x.id === r.id);
    return { ...r, move: p ? p.place - r.place : 0 };
  });
}

/** index trajectory for sparkline: index carried into each week + current */
export function indexTrend(league, hcp, pid) {
  const ws = sortedWeeks(league);
  return [...ws.map((w) => hcp.byWeek[w.id]?.[pid]?.index ?? null), hcp.current[pid]?.index];
}

export const fmtDate = (iso, opts = { month: 'short', day: 'numeric' }) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, opts);
};

/**
 * Week-by-week handicap history for one player (regular or saved sub): the index they carried into each week,
 * the differential they posted that week (if any, and whether it counts now), then where they stand today.
 */
export function handicapHistory(league, hcp, pid) {
  const log = Object.fromEntries((hcp.log[pid] || []).map((r) => [r.weekId, r]));
  const pts = sortedWeeks(league).map((w) => {
    const b = hcp.byWeek[w.id]?.[pid];
    const r = log[w.id];
    return b ? { key: w.id, label: `W${w.number}`, date: w.date, index: b.index, method: b.method, diff: r ? r.diff : null, used: !!r?.used, gross: r?.gross ?? null, course: r?.courseName } : null;
  }).filter(Boolean);
  const cur = hcp.current[pid];
  if (cur) pts.push({ key: 'now', label: 'Now', index: cur.index, method: cur.method, diff: null, used: false, now: true });
  return pts;
}
