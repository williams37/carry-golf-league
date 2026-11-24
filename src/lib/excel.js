/**
 * Client-side, professionally formatted Excel workbook (ExcelJS, lazy-loaded).
 * Sheets: Summary, Players, Courses, Weekly Results, Individual Standings, Team Results, Skins, Skins Payout.
 */
import ExcelJS from 'exceljs';
import {
  computeHandicaps, sortedWeeks, weekEntrants, teamResults, standings, weekSkins, seasonSkins,
  courseForWeek, settingsOf, isWeekFinal, weekHighlights, skinsPayout, teeSetsOf,
} from './golf.js';

/** Course name as played that week, with its tee. */
const playedAs = (league, w) => { const c = courseForWeek(league, w); return c ? c.name + (c.tees ? ` (${c.tees})` : '') : ''; };

const C = { ink: 'FF0B1A10', green: 'FF0F5A3F', green2: 'FF1B7A57', pale: 'FFEAF4EE', gold: 'FFF6C453', goldPale: 'FFFFF4D6', sub: 'FFEDE7FF', subInk: 'FF5B3FC4', line: 'FFB7C9BF', grey: 'FF6F877B', red: 'FFD8432F', birdie: 'FFFDE2DD', eagle: 'FFFFE9A8', white: 'FFFFFFFF' };
const thin = { style: 'thin', color: { argb: C.line } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function titleRows(ws, title, subtitle, span) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title; t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: C.white } };
  t.fill = fill(C.green); t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 34;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = subtitle; s.font = { size: 10, italic: true, color: { argb: C.grey } }; s.alignment = { indent: 1 };
  ws.getRow(2).height = 18;
}
function header(ws, rowIdx, labels) {
  const row = ws.getRow(rowIdx);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l; c.font = { bold: true, color: { argb: C.white } }; c.fill = fill(C.green2);
    c.border = border; c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 22;
}
function body(ws, from, to, cols, { zebra = true } = {}) {
  for (let r = from; r <= to; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.border = border;
      if (!cell.alignment) cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
      if (zebra && (r - from) % 2 === 1 && !cell.fill) cell.fill = fill(C.pale);
    }
  }
}
const highlight = (row, cols, argb = C.goldPale) => { for (let c = 1; c <= cols; c++) { const cell = row.getCell(c); cell.fill = fill(argb); cell.font = { ...(cell.font || {}), bold: true }; } };
const subStyle = (cell) => { cell.font = { bold: true, color: { argb: C.subInk } }; };

export async function buildWorkbook(league) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carry'; wb.created = new Date();
  const hcp = computeHandicaps(league);
  const s = settingsOf(league);
  const weeks = sortedWeeks(league);
  const stamp = `${league.name} · ${league.season || ''} · exported ${new Date().toLocaleString()}`;
  const tbl = standings(league, Infinity, hcp);
  const sSkins = seasonSkins(league, hcp);

  // ---------- Summary ----------
  {
    const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.green } } });
    ws.columns = [{ width: 30 }, { width: 46 }];
    titleRows(ws, `${league.name}`, stamp, 2);
    const leader = tbl[0];
    const finals = weeks.filter((w) => isWeekFinal(w, weekEntrants(league, w, hcp)));
    const rows = [
      ['Season', league.season || ''], ['Regular players', league.players.length], ['Weeks played (final)', finals.length],
      ['Season leader', leader && finals.length ? `${leader.name} (${leader.total} net)` : '—'],
      ['Skins leader', sSkins[0] ? `${sSkins[0].name}${sSkins[0].isSub ? ' [SUB]' : ''} ($${sSkins[0].money})` : '—'],
      ['Handicap method', `9-hole WHS-style: best N of last 20 differentials after ${Math.max(3, s.minRounds)} rounds; NDB cap`],
      ['Handicap allowance', `${Math.round(s.allowance * 100)}%`],
      ['Skins', `${s.skins.mode === 'net' ? 'Net' : 'Gross'}, ${s.skins.carryover ? 'carryovers' : 'no carryovers'}, $${s.skins.buyIn}/player`],
      ['Missed weeks', s.absencePolicy === 'fieldMaxPlus1' ? 'Worst regular net + 1' : s.absencePolicy === 'average' ? 'Own average' : 'Skipped'],
      ['Substitutes', 'Count for their team; excluded from standings; marked SUB'],
    ];
    header(ws, 4, ['Item', 'Value']);
    rows.forEach((r, i) => ws.addRow(r));
    body(ws, 5, 4 + rows.length, 2);
    ws.getRow(8).eachCell((c) => (c.fill = fill(C.goldPale)));
    let r = 6 + rows.length;
    ws.getCell(r, 1).value = 'Weekly winners'; ws.getCell(r, 1).font = { bold: true, size: 13, color: { argb: C.green } };
    header(ws, r + 1, ['Week', 'Winning team (combined net)']);
    weeks.forEach((w, i) => {
      const t = teamResults(league, w, weekEntrants(league, w, hcp)).filter((x) => x.winner);
      ws.getRow(r + 2 + i).values = [`Week ${w.number} · ${playedAs(league, w)}`, t.length ? t.map((x) => x.members.map((m) => m.name + (m.isSub ? ' [SUB]' : '')).join(' & ') + ` (${x.net})`).join(' / ') : 'In progress'];
    });
    body(ws, r + 2, r + 1 + weeks.length, 2);
  }

  // ---------- Players ----------
  {
    const ws = wb.addWorksheet('Players', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
    ws.columns = [{ width: 26 }, { width: 14 }, { width: 18 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 30 }];
    titleRows(ws, 'Players & handicaps', stamp, 7);
    header(ws, 3, ['Player', 'League index', 'Method', 'Rounds', 'Starting idx', 'Low diff', 'Differentials used']);
    league.players.forEach((p) => {
      const c = hcp.current[p.id]; const log = hcp.log[p.id];
      ws.addRow([p.name, c.index, c.method === 'whs' ? 'Calculated (WHS)' : c.method === 'manual' ? 'Manual override' : 'Starting', log.length, p.startIndex || 0,
        log.length ? Math.min(...log.map((x) => x.diff)) : null, log.filter((x) => x.used).map((x) => `W${x.weekNumber}: ${x.diff}`).join(', ')]);
    });
    body(ws, 4, 3 + league.players.length, 7);
    ws.getColumn(2).numFmt = '0.0'; ws.getColumn(6).numFmt = '0.0';
  }

  // ---------- Courses ----------
  {
    const ws = wb.addWorksheet('Courses', { views: [{ showGridLines: false }] });
    const cols = 6 + 9;
    ws.columns = [{ width: 30 }, { width: 9 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 10 }, ...Array(9).fill({ width: 6 })];
    titleRows(ws, 'Courses', 'GSPro slope mapping: slope = 55 + 10 × difficulty (5.8 ≈ 113). Hole rows: par / stroke index.', cols);
    header(ws, 3, ['Course', 'Tees', 'Par', 'Rating', 'Slope', 'GSPro', ...Array.from({ length: 9 }, (_, i) => `H${i + 1}`)]);
    let r = 4;
    league.courses.forEach((c) => {
      ws.getRow(r).values = [c.name, c.tees || '', c.par, c.rating, c.slope, c.gspro ?? '', ...c.holes.map((h) => h.par)];
      ws.getRow(r + 1).values = ['  stroke index', '', '', '', '', '', ...c.holes.map((h) => h.si)];
      ws.getRow(r + 1).font = { italic: true, color: { argb: C.grey } };
      r += 2;
      const tees = teeSetsOf(c);
      if (tees.length) {
        ws.getRow(r).values = ['  tees (9-hole rating / slope)', tees.map((t) => `${t.name} ${t.rating}/${t.slope}`).join(' · ')];
        ws.getRow(r).font = { italic: true, color: { argb: C.grey } };
        r += 1;
      }
    });
    body(ws, 4, r - 1, cols, { zebra: false });
  }

  // ---------- Weekly Results ----------
  {
    const ws = wb.addWorksheet('Weekly Results', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
    const labels = ['Week', 'Course', 'Team', 'Player', 'Type', 'Index', 'CH', ...Array.from({ length: 9 }, (_, i) => `${i + 1}`), 'Gross', 'Net', 'Team net', 'Status'];
    ws.columns = [{ width: 7 }, { width: 26 }, { width: 7 }, { width: 24 }, { width: 8 }, { width: 8 }, { width: 6 }, ...Array(9).fill({ width: 5 }), { width: 8 }, { width: 8 }, { width: 10 }, { width: 12 }];
    titleRows(ws, 'Weekly results (hole by hole)', 'Gold rows = winning team. SUB = one-off substitute (not in season standings). Red = birdie or better.', labels.length);
    header(ws, 3, labels);
    let r = 4;
    for (const w of weeks) {
      const ents = weekEntrants(league, w, hcp);
      const course = courseForWeek(league, w);
      const teams = teamResults(league, w, ents).sort((a, b) => a.team - b.team);
      const start = r;
      for (const t of teams) for (const e of t.members) {
        const row = ws.getRow(r);
        row.values = [w.number, playedAs(league, w), t.team + 1, e.name, e.out ? 'OUT' : e.isSub ? 'SUB' : 'Regular', e.index, e.ch, ...e.holes.map((x) => x ?? ''), e.gross ?? '', e.net ?? '', t.net ?? '', w.final || isWeekFinal(w, ents) ? 'Final' : 'Live'];
        body(ws, r, r, labels.length, { zebra: false });
        if (t.winner) highlight(row, labels.length);
        if (e.isSub) { subStyle(row.getCell(4)); subStyle(row.getCell(5)); }
        e.holes.forEach((x, i) => {
          if (x && course && x < course.holes[i].par) { const c = row.getCell(8 + i); c.font = { bold: true, color: { argb: C.red } }; }
        });
        r++;
      }
      // week separator
      if (r > start) { ws.getRow(r - 1).eachCell((c) => (c.border = { ...border, bottom: { style: 'medium', color: { argb: C.green } } })); }
    }
    ws.getColumn(6).numFmt = '0.0';
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: labels.length } };
  }

  // ---------- Individual Standings ----------
  {
    const ws = wb.addWorksheet('Individual Standings', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }], properties: { tabColor: { argb: C.gold } } });
    const finals = weeks.filter((w) => isWeekFinal(w, weekEntrants(league, w, hcp)));
    const labels = ['Pos', 'Player', ...finals.map((w) => `W${w.number}`), 'Total net', 'Rounds', 'Missed', 'Avg net'];
    ws.columns = [{ width: 6 }, { width: 26 }, ...finals.map(() => ({ width: 7 })), { width: 11 }, { width: 9 }, { width: 9 }, { width: 9 }];
    titleRows(ws, 'Individual standings · lowest cumulative net wins', 'Regular players only. Substitutes are excluded. Italic = absence score.', labels.length);
    header(ws, 3, labels);
    tbl.forEach((x, i) => {
      const row = ws.getRow(4 + i);
      row.values = [x.place, x.name, ...x.rounds.map((y) => y.net ?? ''), x.total, x.played, x.absences, x.avg ?? ''];
      x.rounds.forEach((y, j) => { if (y.absent) row.getCell(3 + j).font = { italic: true, color: { argb: C.red } }; });
    });
    body(ws, 4, 3 + tbl.length, labels.length);
    if (tbl.length) highlight(ws.getRow(4), labels.length);
  }

  // ---------- Team Results ----------
  {
    const ws = wb.addWorksheet('Team Results', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 7 }, { width: 26 }, { width: 7 }, { width: 40 }, { width: 10 }, { width: 10 }];
    titleRows(ws, 'Weekly team results · lowest combined net wins', stamp, 6);
    header(ws, 3, ['Week', 'Course', 'Place', 'Team', 'Net', 'Gross']);
    let r = 4;
    for (const w of weeks) {
      const ents = weekEntrants(league, w, hcp);
      for (const t of teamResults(league, w, ents)) {
        const row = ws.getRow(r);
        row.values = [w.number, playedAs(league, w), t.place ?? '', t.members.map((m) => m.name + (m.isSub ? ' [SUB]' : '')).join(' & '), t.net ?? '', t.gross ?? ''];
        body(ws, r, r, 6, { zebra: false });
        if (t.winner) highlight(row, 6);
        r++;
      }
    }
  }

  // ---------- Skins ----------
  {
    const ws = wb.addWorksheet('Skins', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 7 }, { width: 26 }, ...Array(9).fill({ width: 12 }), { width: 10 }, { width: 10 }];
    titleRows(ws, `Skins · ${s.skins.mode} · ${s.skins.carryover ? 'with carryovers' : 'no carryovers'} · $${s.skins.buyIn}/player`, 'Each hole: winner (skins won). "carry" = tied, rolls to next hole.', 13);
    header(ws, 3, ['Week', 'Course', ...Array.from({ length: 9 }, (_, i) => `Hole ${i + 1}`), 'Pot', '$/skin']);
    let r = 4;
    for (const w of weeks) {
      const ents = weekEntrants(league, w, hcp);
      const sk = weekSkins(league, w, ents);
      const nm = (k) => { const e = ents.find((x) => x.key === k); return e ? e.name.split(' ')[0] + (e.isSub ? ' [SUB]' : '') : ''; };
      const row = ws.getRow(r);
      row.values = [w.number, playedAs(league, w), ...sk.holes.map((h) => (h.winner ? `${nm(h.winner)} (${h.units})` : h.split ? `split ${h.split.length}` : h.carriedOut ? 'carry' : 'push')), sk.pot, Math.round(sk.unitValue * 100) / 100];
      body(ws, r, r, 13, { zebra: false });
      sk.holes.forEach((h, i) => { if (h.winner) { const c = row.getCell(3 + i); c.fill = fill(C.goldPale); c.font = { bold: true }; } else if (h.carriedOut) row.getCell(3 + i).font = { italic: true, color: { argb: C.grey } }; });
      row.getCell(12).numFmt = '"$"#,##0.00'; row.getCell(13).numFmt = '"$"#,##0.00';
      r++;
    }
    r += 1;
    ws.getCell(r, 1).value = 'Season skins money'; ws.getCell(r, 1).font = { bold: true, size: 13, color: { argb: C.green } };
    header(ws, r + 1, ['Rank', 'Player', 'Skins', 'Winnings', 'Weeks']);
    sSkins.forEach((t, i) => {
      const row = ws.getRow(r + 2 + i);
      row.values = [i + 1, t.name + (t.isSub ? ' [SUB]' : ''), Math.round(t.units * 100) / 100, t.money, t.weeks.join(', ')];
      row.getCell(4).numFmt = '"$"#,##0.00';
      if (t.isSub) subStyle(row.getCell(2));
    });
    body(ws, r + 2, r + 1 + sSkins.length, 5);
    if (sSkins.length) highlight(ws.getRow(r + 2), 5);
  }

  // ---------- Skins Payout ----------
  {
    const ws = wb.addWorksheet('Skins Payout', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 7 }, { width: 26 }, { width: 24 }, { width: 10 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 10 }];
    titleRows(ws, 'Skins payout · who is owed what', 'Only players who bought in that week are in the pot. Owed = cash to collect; Net = owed − buy-in.', 8);
    header(ws, 3, ['Week', 'Course', 'Player', 'Skins', 'Holes won', 'Buy-in', 'Owed', 'Net']);
    let r = 4;
    for (const w of weeks) {
      const ents = weekEntrants(league, w, hcp);
      const sk = weekSkins(league, w, ents);
      if (!sk.field.length) continue;
      const pay = skinsPayout(league, w, sk);
      for (const x of pay.rows) {
        const row = ws.getRow(r);
        row.values = [w.number, playedAs(league, w), x.name + (x.isSub ? ' [SUB]' : ''), Math.round(x.units * 100) / 100, x.holes.join(', '), x.paid, x.owed, x.net];
        [6, 7, 8].forEach((k) => (row.getCell(k).numFmt = '"$"#,##0.00'));
        body(ws, r, r, 8, { zebra: false });
        if (x.owed > 0) row.getCell(7).font = { bold: true };
        r++;
      }
      ws.getRow(r - 1).eachCell((c) => (c.border = { ...border, bottom: { style: 'medium', color: { argb: C.green } } }));
    }
  }

  wb.eachSheet((ws) => { ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export { weekHighlights };
