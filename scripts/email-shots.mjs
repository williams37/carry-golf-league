// Screenshots + checks for the Email-the-workbook button. Usage: node scripts/email-shots.mjs [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const problems = []; let fails = 0;
const ok = (n, c, d = '') => { console.log(c ? '  ✓' : '  ✗', n, d); if (!c) fails++; };

async function page(vw, vh, share) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.addInitScript(([share]) => {
    if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('carry:prefs', JSON.stringify({ theme: 'dark', onboarded: true, mode: 'local' })); sessionStorage.setItem('init', '1'); }
    window.__mail = []; window.__shared = [];
    if (share) {
      navigator.canShare = (d) => !!d?.files?.length;
      navigator.share = async (d) => { window.__shared.push({ n: d.files.length, name: d.files[0].name, size: d.files[0].size, title: d.title }); if (window.__abort) throw new DOMException('cancel', 'AbortError'); };
    } else { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch {} }
  }, [share]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`[${vw}] ${e.message}`));
  // capture the mailto navigation instead of leaving the page
  await p.route(/^mailto:/, (r) => r.abort());
  return p;
}
async function overlaps(p, sel) {
  return p.evaluate((sel) => {
    const out = []; const ov = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    document.querySelectorAll(sel).forEach((box) => {
      const bs = [...box.querySelectorAll(':scope .btn, :scope > b, :scope small')].map((b) => [b.textContent.trim(), b.getBoundingClientRect()]);
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (ov(bs[i][1], bs[j][1])) out.push(`${bs[i][0]} × ${bs[j][0]}`);
      const r = box.getBoundingClientRect(); bs.forEach(([t, b]) => { if (b.right > r.right + 1 || b.left < r.left - 1) out.push(`${t} overflows`); });
    });
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('horizontal page overflow');
    return out;
  }, sel);
}

for (const [vw, vh, tag] of [[1280, 860, 'desktop'], [360, 760, '360']]) {
  console.log(tag);
  const p = await page(vw, vh, false);
  await p.goto(BASE + '#/league'); await p.waitForTimeout(1200);
  const o1 = await overlaps(p, '.card .row.wrap');
  ok(`${tag}: League buttons don't overlap`, !o1.length, o1.join('; '));
  await p.locator('[data-testid=email-excel]').first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}email-${tag}-league.png` });
  await p.goto(BASE + '#/more'); await p.waitForTimeout(900);
  const o2 = await overlaps(p, '.excel-choice');
  ok(`${tag}: More → Excel row buttons don't overlap`, !o2.length, o2.join('; '));
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}email-${tag}-more.png` });
  // open sheet → fallback (no Web Share): download + mailto
  await p.locator('[data-testid=email-excel]').click();
  await p.waitForSelector('text=Download & open email', { timeout: 20000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}email-${tag}-sheet-fallback.png` });
  const foot = await overlaps(p, '.sheet-foot');
  ok(`${tag}: sheet footer buttons fit`, !foot.length, foot.join('; '));
  const dl = p.waitForEvent('download', { timeout: 10000 });
  const mail = p.waitForEvent('request', { predicate: (r) => r.url().startsWith('mailto:'), timeout: 5000 }).then((r) => r.url()).catch(() => null);
  await p.locator('[data-testid=email-send]').click();
  const f = await dl;
  ok(`${tag}: fallback downloads the workbook`, /\.xlsx$/.test(f.suggestedFilename()), f.suggestedFilename());
  const toast = await p.locator('.toast').innerText().catch(() => '');
  ok(`${tag}: fallback toast explains attaching`, /Attach/.test(toast), toast);
  const m = await mail;
  if (m) ok(`${tag}: mailto prefilled`, /subject=.*standings.*Week/.test(decodeURIComponent(m)) && /Attach the file/.test(decodeURIComponent(m)));
  await p.screenshot({ path: `${OUT}email-${tag}-fallback-toast.png` });
  await p.context().close();
}

console.log('Web Share path (stubbed share sheet)');
{
  const p = await page(360, 760, true);
  await p.goto(BASE + '#/more'); await p.waitForTimeout(900);
  await p.locator('[data-testid=email-excel]').click();
  await p.waitForSelector('text=Share file', { timeout: 20000 });
  await p.screenshot({ path: `${OUT}email-share-sheet.png` });
  const f2 = await overlaps(p, '.sheet-foot');
  ok('share sheet footer buttons fit (360px)', !f2.length, f2.join('; '));
  await p.evaluate(() => (window.__abort = true));
  await p.locator('[data-testid=email-send]').click(); await p.waitForTimeout(600);
  ok('share cancel (AbortError) is silent: sheet stays open, no download', await p.locator('[data-testid=email-send]').isVisible() && !(await p.locator('.toast').count()));
  await p.evaluate(() => (window.__abort = false));
  await p.locator('[data-testid=email-send]').click(); await p.waitForTimeout(600);
  const sh = await p.evaluate(() => window.__shared);
  ok('navigator.share got the .xlsx file + subject', sh.length === 2 && sh[1].n === 1 && /\.xlsx$/.test(sh[1].name) && sh[1].size > 10000 && /standings – Week/.test(sh[1].title), JSON.stringify(sh[1]));
  ok('sheet closes with "Workbook shared"', /shared/i.test(await p.locator('.toast').innerText()));
  await p.context().close();
}
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'No page errors.');
process.exitCode = fails ? 1 : 0;
