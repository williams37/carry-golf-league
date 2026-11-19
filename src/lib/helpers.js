import { weekEntrants, isWeekFinal, standings, sortedWeeks, courseById, computeHandicaps } from './golf.js';

export function weekState(league, week, hcp) {
  const ents = weekEntrants(league, week, hcp);
  return { ents, final: isWeekFinal(week, ents), done: ents.filter((e) => e.complete).length, course: courseById(league, week.courseId) };
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
