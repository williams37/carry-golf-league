/**
 * Pure helpers for emailing the league workbook: a short plain-text summary,
 * the email subject, the workbook filename, and a mailto: URL.
 * No DOM here, so it is unit-tested (tests/share.test.js).
 */
import { computeHandicaps, sortedWeeks, weekEntrants, teamResults, weekSkins, standings, isWeekFinal, courseById } from './golf.js';

const shortName = (name = '') => { // same as ui.jsx (kept DOM-free here)
  const clean = name.replace(/".*?"\s*/g, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : clean;
};
const money = (m) => `$${(Math.round(m * 100) / 100).toFixed(m % 1 ? 2 : 0)}`;
const fileSafe = (s = '') => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');

export const workbookName = (league) =>
  `${fileSafe(league.name)}${league.season ? '-' + fileSafe(league.season) : ''}.xlsx`;

/** Latest final week (falls back to the latest scheduled week). */
export function summaryWeek(league, hcp = computeHandicaps(league)) {
  const weeks = sortedWeeks(league);
  const finals = weeks.filter((w) => isWeekFinal(w, weekEntrants(league, w, hcp)));
  return { week: finals[finals.length - 1] || weeks[weeks.length - 1] || null, isFinal: finals.length > 0 };
}

export function leagueSummary(league) {
  const hcp = computeHandicaps(league);
  const { week, isFinal } = summaryWeek(league, hcp);
  const n = week?.number ?? 0;
  const subject = `${league.name} standings – Week ${n || 1}`;
  const lines = [`${league.name}${league.season ? ` · ${league.season}` : ''}`];
  const facts = { week: n, leader: null, winners: null, skins: [] };
  if (!week) {
    lines.push('', 'No rounds played yet.');
    return { subject, body: lines.join('\n'), facts };
  }
  const course = courseById(league, week.courseId);
  lines.push(`${isFinal ? 'Through' : 'In progress:'} week ${n}${course ? ` (${course.name})` : ''}`, '');

  const table = isFinal ? standings(league, n, hcp).filter((r) => r.played > 0) : [];
  if (table.length) {
    const lead = table.filter((r) => r.place === 1);
    facts.leader = lead.map((r) => shortName(r.name));
    const gap = table.find((r) => r.place > 1);
    lines.push(`Leader: ${facts.leader.join(' & ')}, ${lead[0].total} net${gap ? ` (${gap.total - lead[0].total} ahead of ${shortName(gap.name)})` : ''}`);
  }
  const ents = weekEntrants(league, week, hcp);
  const winners = teamResults(league, week, ents).filter((t) => t.winner);
  if (winners.length) {
    facts.winners = winners.map((t) => t.members.map((m) => shortName(m.name)).join(' & '));
    lines.push(`Week ${n} ${winners.length > 1 ? 'co-winners' : 'winners'}: ${facts.winners.join(' / ')} (${winners[0].net} net)`);
  }
  const sk = weekSkins(league, week, ents);
  const won = Object.entries(sk.byKey).map(([k, v]) => ({ name: shortName(ents.find((e) => e.key === k)?.name || k), ...v }))
    .sort((a, b) => b.units - a.units || b.money - a.money);
  facts.skins = won;
  if (won.length) {
    const fmt = (u) => (Number.isInteger(u) ? u : u.toFixed(1));
    lines.push(`Skins: ${won.map((w) => `${w.name} ${fmt(w.units)}${sk.pot ? ` (${money(w.money)})` : ''}`).join(', ')}${sk.unclaimed ? ` · ${sk.unclaimed} unclaimed` : ''}`);
  } else if (sk.field.length >= 2) lines.push('Skins: none won (all carried)');
  lines.push('', 'Full standings, weekly results and skins are in the attached Excel workbook.');
  return { subject, body: lines.join('\n'), facts };
}

/** mailto: URL. Newlines become CRLF per RFC 6068; body is trimmed to stay under client URL limits. */
export function mailtoUrl({ to = [], subject = '', body = '' }, maxBody = 1800) {
  const b = body.length > maxBody ? body.slice(0, maxBody - 1) + '…' : body;
  const enc = (s) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
  const rcpt = to.filter(Boolean).map((e) => encodeURIComponent(e.trim()).replace(/%40/g, '@')).join(',');
  return `mailto:${rcpt}?subject=${enc(subject)}&body=${enc(b)}`;
}

/** Body for the fallback path: the user must attach the downloaded file by hand. */
export const withAttachNote = (body, filename) =>
  `${body}\n\n📎 Attach the file "${filename}" (it just downloaded to your Downloads folder).`;
