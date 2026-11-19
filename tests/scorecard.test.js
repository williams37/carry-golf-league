import { describe, it, expect } from 'vitest';
import { numericToken, segment, parseText, findHeader, layoutRows, assemble, pickRow, classifyLabel, looksLikeName, matchRoster } from '../src/lib/scorecard.js';

const PAR = [5, 4, 3, 4, 4, 5, 3, 4, 4];
const DEE = [5, 4, 2, 5, 4, 6, 3, 4, 5];
const nums = (s) => s.split(/\s+/).map((t) => ({ s: numericToken(t), conf: 90 })).filter((n) => n.s);

describe('numericToken', () => {
  it('maps common screen-font confusions', () => {
    expect(numericToken('O')).toBe('0');
    expect(numericToken('l0')).toBe('10');
    expect(numericToken('S')).toBe('5');
    expect(numericToken('[5]')).toBe('5'); // box shape read as brackets
    expect(numericToken('(2')).toBe('2'); // circle read as a paren
    expect(numericToken('5s')).toBe('5'); // trailing noise
    expect(numericToken('B')).toBe('8');
  });
  it('rejects words and to-par markers', () => {
    expect(numericToken('+2')).toBeNull();
    expect(numericToken('-1')).toBeNull();
    expect(numericToken('Dee')).toBeNull();
    expect(numericToken('SI')).toBeNull();
  });
});

describe('segment', () => {
  it('reads 9 holes and the OUT total', () => {
    const r = segment(nums('5 4 2 5 4 6 3 4 5 38'));
    expect(r.holes.map((h) => h.value)).toEqual(DEE);
    expect(r.total.value).toBe(38);
  });
  it('splits merged cells when the OUT total confirms it', () => {
    const r = segment(nums('54 2 5 4 63 4 5 38'));
    expect(r.holes.map((h) => h.value)).toEqual(DEE);
  });
  it('keeps genuine double-digit holes', () => {
    const r = segment(nums('5 4 2 10 4 6 3 4 5 43'));
    expect(r.holes.map((h) => h.value)).toEqual([5, 4, 2, 10, 4, 6, 3, 4, 5]);
  });
  it('recognises a header row', () => {
    expect(segment(nums('1 2 3 4 5 6 7 8 9')).isHeader).toBe(true);
    expect(segment(nums('123456789')).isHeader).toBe(true);
  });
});

describe('parseText (fallback for row-only crops / no geometry)', () => {
  it('handles a realistic Tesseract dump of a 4-player shapes-style card', () => {
    const text = `SCORECARD Lanter Bay — Ocean Nine
HOLE 1 2 3 4 5 6 7 8 9 OUT
PAR 5 4 3 4 4 5 3 4 4 36
HCP 3 7 9 1 5 2 8 4 6
Marcus Bell [6] [5] 3 4 [7] 5 [4] [5] 4 43 +7
Dee Okafor 5s 4 (2 [5] 4 [6] 3 4 [5] 38 +2
Tommy Reyes (4) 4 3 [6] [5] 5 (2) 4 4 37 +1`;
    const r = parseText(text, { coursePar: PAR });
    expect(r.par).toEqual(PAR);
    expect(r.players.map((p) => p.label)).toEqual(['Marcus Bell', 'Dee Okafor', 'Tommy Reyes']);
    expect(r.players[1].holes).toEqual(DEE);
    expect(r.players[1].totalOk).toBe(true);
  });
  it('flags a row whose OUT total disagrees', () => {
    const r = parseText('Dee 5 4 2 5 4 6 3 4 5 39', { coursePar: PAR });
    expect(r.players[0].totalOk).toBe(false);
    expect(r.players[0].flags.some(Boolean)).toBe(true);
  });
  it('skips yardage and stroke-index rows', () => {
    const r = parseText(`YDS 512 401 168 377 390 530 155 410 365\n3 7 9 1 5 2 8 4 6\nDee 5 4 2 5 4 6 3 4 5`, { coursePar: PAR });
    expect(r.players).toHaveLength(1);
    expect(r.players[0].holes).toEqual(DEE);
  });
  it('treats a bare par-matching first row as par', () => {
    const r = parseText(`5 4 3 4 4 5 3 4 4 36\n5 4 2 5 4 6 3 4 5 38`, { coursePar: PAR });
    expect(r.par).toEqual(PAR);
    expect(r.players).toHaveLength(1);
  });
});

// Build Tesseract-like lines from a grid we lay out ourselves (optionally rotated), to test geometry.
function fakeLines(rows, { angle = 0, x0 = 300, y0 = 100, dx = 60, dy = 48, h = 20 } = {}) {
  const rot = (x, y) => ({ x: x0 + x * Math.cos(angle) - y * Math.sin(angle), y: y0 + x * Math.sin(angle) + y * Math.cos(angle) });
  const box = (x, y, w) => { const c = rot(x, y); return { x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y - h / 2, y1: c.y + h / 2 }; };
  return rows.map((r, ri) => ({
    text: '', words: [
      ...(r.label ? [{ text: r.label, conf: 90, bbox: box(-dx * 2.5, ri * dy, 90) }] : []),
      ...r.cells.map((t, ci) => ({ text: String(t), conf: 90, bbox: box(dx * (ci + 1), ri * dy, 12 * String(t).length), symbols: [] })),
    ],
  }));
}

describe('grid geometry', () => {
  const card = [
    { label: 'HOLE', cells: [1, 2, 3, 4, 5, 6, 7, 8, 9, 'OUT'] },
    { label: 'PAR', cells: [...PAR, 36] },
    { label: 'HCP', cells: [3, 7, 9, 1, 5, 2, 8, 4, 6] },
    { label: 'Marcus Bell', cells: [6, 5, 3, 4, 7, 5, 4, 5, 4, 43] },
    { label: 'Dee Okafor', cells: [...DEE, 38] },
  ];
  for (const angle of [0, 0.06, -0.09]) {
    it(`finds header + rows at ${angle.toFixed(2)} rad`, () => {
      const lines = fakeLines(card, { angle });
      const hdr = findHeader(lines);
      expect(hdr).not.toBeNull();
      expect(hdr.found).toBe(9);
      expect(Math.abs(hdr.spacing - 60)).toBeLessThan(2);
      const rows = layoutRows(lines, hdr);
      expect(rows.map((r) => r.kind)).toEqual(['par', 'skip', 'player', 'player']);
      // Dee's 4th cell should land on Dee's 4th number
      const dee = rows[3]; const expect4 = lines[4].words[4].bbox;
      expect(Math.abs(dee.cells[3].x - (expect4.x0 + expect4.x1) / 2)).toBeLessThan(4);
      expect(Math.abs(dee.cells[3].y - (expect4.y0 + expect4.y1) / 2)).toBeLessThan(4);
    });
  }
  it('extrapolates when a few header numbers are missing', () => {
    const lines = fakeLines([{ label: 'HOLE', cells: [1, 2, '', 4, 5, 6, '', 8, 9] }, { label: 'Dee', cells: DEE }]);
    const hdr = findHeader(lines);
    expect(hdr.found).toBe(7);
    expect(Math.round(hdr.cols[2].x)).toBe(480);
  });
  it('returns null when there is no header', () => {
    expect(findHeader(fakeLines([{ label: 'Dee', cells: DEE }]))).toBeNull();
  });
});

describe('assemble + pickRow', () => {
  const cell = (v, conf = 92) => ({ value: v, conf });
  const row = (label, vals, total, kind = classifyLabel(label)) => ({ label, kind, holes: vals.map((v) => (v == null ? null : cell(v))), total: total == null ? null : cell(total) });
  it('flags low confidence, missing and unusual cells', () => {
    const r = assemble([row('Dee', [5, 4, 2, 5, 4, 6, 3, 4, 5], 38)], { coursePar: PAR });
    expect(r.players[0].flags.every((f) => !f)).toBe(true);
    const r2 = assemble([{ ...row('Dee', [5, 4, null, 5, 4, 6, 3, 4, 1], null), holes: [cell(5), cell(4, 40), null, cell(5), cell(4), cell(6), cell(3), cell(4), cell(1)] }], { coursePar: PAR });
    expect(r2.players[0].flags).toEqual([null, 'low', 'missing', null, null, null, null, null, 'odd']);
  });
  it('matches the entrant by fuzzy name (OCR typos, nicknames)', () => {
    const players = [{ label: 'Marcus Bell' }, { label: 'Dee Okator' }, { label: 'Tommy Reyes' }];
    expect(pickRow(players, 'Dee Okafor')).toBe(1);
    expect(pickRow(players, 'Marcus "Mash" Bell')).toBe(0);
    expect(pickRow(players, 'Priya Natarajan')).toBe(-1); // nobody → user picks
    expect(pickRow([{ label: '' }], 'Anyone')).toBe(0);
  });
});

describe('real GSPro card problems (Nick Vidra / Seth McLaughlin / Josh Williams)', () => {
  const ROSTER = [{ id: 'p1', name: 'Nick Vidra' }, { id: 'p2', name: 'Seth McLaughlin' }, { id: 'p3', name: 'Josh Williams' }, { id: 'p4', name: 'Dee Okafor' }];
  const rowOf = (label, s, kind) => ({ label, kind: kind || classifyLabel(label), holes: s.map((v) => (v == null ? null : { value: v, conf: 90 })), total: null });
  it('recognises structural rows even when OCR mangles the label', () => {
    for (const l of ['PAR', 'PAR:', 'RAR']) expect(classifyLabel(l)).toBe('par');
    for (const l of ['INDEX', 'lNDEX', 'INDFX', 'DISTANCE', 'DlSTANCE', 'STANCE', 'HCP', 'HANDICAP', 'YARDS']) expect(classifyLabel(l)).not.toBe('player');
    for (const l of ['Dee', 'Nick Vidra', 'JOSH WILLIAMS']) expect(classifyLabel(l)).toBe('player');
  });
  it('keeps exactly the 3 player rows: drops INDEX (even misread) and DISTANCE', () => {
    const r = assemble([
      rowOf('RAR', [4, 3, 4, 4, 3, 5, 3, 4, 5]),
      rowOf('RRs', [5, 9, 1, 3, 72, 2, 2, 6, 4]),            // INDEX with a fused cell and a misread
      rowOf('Rr Tg', [388, 102, 431, 402, 175, 538, 148, 177, 312]),
      rowOf('ERY', [5, 3, 4, 3, 3, 5, 3, 5, 7]),
      rowOf('SEE', [5, 5, 5, 4, 3, 6, 5, 4, 4]),
      rowOf('mms', [5, 4, 4, 6, 4, 4, 3, 5, 4]),
    ], { coursePar: [4, 3, 4, 4, 3, 5, 3, 4, 5] });
    expect(r.par).toEqual([4, 3, 4, 4, 3, 5, 3, 4, 5]);
    expect(r.players.map((p) => p.holes.join(''))).toEqual(['534335357', '555436544', '544644354']);
  });
  it('a bare, unlabelled first row is par only when more rows follow', () => {
    expect(assemble([rowOf('', [4, 3, 4, 4, 3, 5, 3, 4, 5], 'unknown'), rowOf('Josh', [5, 4, 4, 6, 4, 4, 3, 5, 4])]).par).toEqual([4, 3, 4, 4, 3, 5, 3, 4, 5]);
    expect(assemble([rowOf('', [4, 4, 4, 4, 3, 5, 3, 4, 5], 'unknown')]).par).toBe(null);
  });
  it('never shows OCR gibberish: the reads the user actually got', () => {
    for (const g of ['NIGKNVIBRA', 'semsmeunucEun', 'yoosramserss', 'oswwwans', 'RRs', 'Shiite pe', 'IBRA']) expect(looksLikeName(g), g).toBe(g === 'IBRA' || g === 'Shiite pe');
    for (const n of ['NICK VIDRA', 'SETH MCLAUGHLIN', 'Josh Williams', "Dee O'Kafor", 'Schwartz', 'McDonald']) expect(looksLikeName(n), n).toBe(true);
    expect(looksLikeName('NICK VIDRA', 30)).toBe(false); // low OCR confidence
  });
  it('maps rows to the roster (fuzzy), and falls back to "Row N" otherwise', () => {
    const ps = matchRoster([{ label: 'NIGKNVIBRA' }, { label: 'semsmeunucEun' }, { label: 'JOSH WILLAMS' }], ROSTER);
    expect(ps.map((p) => p.display)).toEqual(['Nick Vidra', 'Row 2', 'Josh Williams']);
    expect(ps[0].rosterId).toBe('p1');
    expect(pickRow(ps, 'Josh Williams', 'p3')).toBe(2);
    // one roster person can't claim two rows; a surname alone still matches
    const two = matchRoster([{ label: 'VIDRA' }, { label: 'NICK VIDRA' }], ROSTER);
    expect(two.map((p) => p.display)).toEqual(['VIDRA', 'Nick Vidra']); // second row keeps its own clean read
  });
  it('with no roster, clean OCR names show as read', () => {
    expect(matchRoster([{ label: 'SETH MCLAUGHLIN', labelConf: 88 }, { label: 'yoosramserss' }]).map((p) => p.display)).toEqual(['SETH MCLAUGHLIN', 'Row 2']);
  });
});
