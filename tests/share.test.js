import { describe, it, expect } from 'vitest';
import { leagueSummary, mailtoUrl, workbookName, withAttachNote } from '../src/lib/share.js';
import { demoLeague, blankLeague } from '../src/lib/seed.js';
import { standings, sortedWeeks } from '../src/lib/golf.js';

describe('email summary + mailto', () => {
  it('summarises the latest final week: leader, week winners, skins', () => {
    const lg = demoLeague();
    const { subject, body, facts } = leagueSummary(lg);
    expect(facts.week).toBeGreaterThan(0);
    expect(subject).toBe(`${lg.name} standings – Week ${facts.week}`);
    const top = standings(lg, facts.week).find((r) => r.place === 1);
    expect(body).toMatch(/^Leader: /m);
    expect(body).toContain(`${top.total} net`);
    expect(facts.leader[0]).toBe(top.name.replace(/".*?"\s*/g, '').split(/\s+/)[0] + ' ' + top.name.trim().split(/\s+/).pop()[0] + '.');
    expect(body).toMatch(new RegExp(`^Week ${facts.week} (co-)?winners: .+ \\(\\d+ net\\)$`, 'm'));
    expect(body).toMatch(/^Skins: /m);
    expect(body).toContain('attached Excel workbook');
    expect(body).not.toMatch(/undefined|NaN|null/);
  });

  it('handles a league with no rounds', () => {
    const lg = blankLeague('Empty League', ['A One', 'B Two']);
    const { subject, body } = leagueSummary(lg);
    expect(subject).toBe('Empty League standings – Week 1');
    expect(body).toContain('No rounds played yet.');
  });

  it('builds an RFC 6068 mailto with recipients, encoded subject and CRLF body', () => {
    const url = mailtoUrl({ to: ['dee@example.com', ' sam+golf@example.com'], subject: 'Thursday Night – Week 3 & more', body: 'Line 1\nLine 2 ?=#' });
    expect(url.startsWith('mailto:dee@example.com,sam%2Bgolf@example.com?subject=')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('subject')).toBe('Thursday Night – Week 3 & more');
    expect(q.get('body')).toBe('Line 1\r\nLine 2 ?=#');
    expect(url).toContain('%0D%0A');
    expect(url).not.toMatch(/ /);
  });

  it('caps long bodies and adds the attach note for the fallback path', () => {
    const url = mailtoUrl({ subject: 's', body: 'x'.repeat(5000) }, 100);
    expect(new URLSearchParams(url.split('?')[1]).get('body')).toHaveLength(100);
    expect(mailtoUrl({ subject: 's', body: 'b' }).startsWith('mailto:?subject=s')).toBe(true);
    const lg = demoLeague();
    expect(workbookName(lg)).toMatch(/^[\w-]+\.xlsx$/);
    expect(withAttachNote('Hi', 'a.xlsx')).toMatch(/Attach the file "a\.xlsx"/);
  });
});
