import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook } from '../src/lib/excel.js';
import { demoLeague } from '../src/lib/seed.js';

describe('excel export', () => {
  it('builds the formatted multi-sheet workbook with SUB labels', async () => {
    const blob = await buildWorkbook(demoLeague());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Players', 'Courses', 'Weekly Results', 'Individual Standings', 'Team Results', 'Skins', 'Skins Payout']);
    const weekly = wb.getWorksheet('Weekly Results');
    const types = []; weekly.eachRow((r, i) => i > 3 && types.push(r.getCell(5).value));
    expect(types).toContain('SUB');
    const st = wb.getWorksheet('Individual Standings');
    const names = []; st.eachRow((r, i) => i > 3 && names.push(r.getCell(2).value));
    expect(names).toHaveLength(8);
    expect(names.join()).not.toMatch(/Gus Patel|Hannah Cho|Rick Alvarez/);
    expect(st.getRow(4).getCell(1).fill.fgColor.argb).toBe('FFFFF4D6'); // winner highlight
    expect(weekly.getRow(3).getCell(1).border.top.style).toBe('thin');
  });
});
