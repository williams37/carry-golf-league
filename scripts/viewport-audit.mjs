// Every sheet / full-screen panel / page top must fit the visible viewport (phones with Safari toolbars, keyboard open).
// Usage: node scripts/viewport-audit.mjs [baseUrl] [shotTag]   Screenshots (390px) → screenshots/vp-*.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:4173/';
const TAG = process.argv[3] || 'local';
const OUT = new URL('../screenshots/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p)), args: ['--no-sandbox'] });
const SIZES = [[375, 667], [390, 664], [430, 740]];
let fails = 0; const bad = [];
async function open(vw, vh, prefs = { theme: 'dark', onboarded: true, mode: 'local' }) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript((prefs) => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('carry:prefs', JSON.stringify(prefs)); sessionStorage.setItem('init', '1'); } }, prefs);
  const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); return p;
}
// geometry check of whatever is open: sheet (header + close visible, inside viewport), or page/panel top at scroll 0
const fit = async (p, label, vw) => {
  await p.waitForTimeout(450);
  const r = await p.evaluate(() => {
    const H = innerHeight, W = innerWidth, out = [];
    const sheets = [...document.querySelectorAll('.sheet')];
    const sh = sheets[sheets.length - 1];
    if (sh) {
      const b = sh.getBoundingClientRect();
      if (b.top < -0.5) out.push(`sheet top ${b.top.toFixed(0)}`);
      if (b.bottom > H + 0.5) out.push(`sheet bottom ${b.bottom.toFixed(0)}>${H}`);
      const head = sh.querySelector('.sheet-head').getBoundingClientRect();
      if (head.top < -0.5 || head.bottom > H) out.push('header off-screen');
      const x = sh.querySelector('.sheet-head .icon-btn').getBoundingClientRect();
      if (x.top < 0 || x.right > W + 0.5) out.push('close button off-screen');
      const body = sh.querySelector('.sheet-body');
      const foot = sh.querySelector('.sheet-foot');
      if (foot && foot.getBoundingClientRect().bottom > H + 0.5) out.push('footer off-screen');
      return { kind: 'sheet', out, scrolls: body.scrollHeight > body.clientHeight + 1 };
    }
    const panel = document.querySelector('.welcome, .tv, .lightbox');
    const first = panel ? (panel.querySelector('.welcome-inner, .tv-top, .lightbox-bar') || panel) : document.querySelector('.topbar');
    if (panel) panel.scrollTop = 0; else scrollTo(0, 0);
    const t = first.getBoundingClientRect();
    if (t.top < -0.5) out.push(`top hidden ${t.top.toFixed(0)}`);
    if (document.documentElement.scrollWidth > W + 1) out.push('horizontal overflow');
    return { kind: panel ? 'panel' : 'page', out };
  });
  const ok = !r.out.length; if (!ok) { fails++; bad.push(`${vw} ${label}: ${r.out.join(', ')}`); }
  console.log(`  ${ok ? '✓' : '✗'} ${vw} ${label} (${r.kind}${r.scrolls ? ', body scrolls' : ''}) ${r.out.join(', ')}`);
};
const shot = async (p, vw, name) => { if (vw === 390) { await p.screenshot({ path: `${OUT}vp-${TAG}-${name}.png` }); console.log('    📸 screenshots/vp-' + TAG + '-' + name + '.png'); } };
const close = async (p) => { await p.locator('.sheet .sheet-head [aria-label=Close]').last().click(); await p.waitForTimeout(250); };

for (const [vw, vh] of SIZES) {
  console.log(`\n${vw}×${vh}`);
  let p = await open(vw, vh);
  for (const pg of ['home', 'scores/w7', 'table', 'skins', 'players', 'courses', 'rules', 'league', 'more']) { await p.goto(BASE + '#/' + pg); await p.waitForTimeout(700); await fit(p, 'page ' + pg, vw); }
  // course picker with the full list, then typing (keyboard open ≈ viewport loses ~300px)
  await p.goto(BASE + '#/courses'); await p.click('[data-testid=course-add]'); await p.waitForSelector('[data-testid=course-result]', { timeout: 20000 });
  await fit(p, 'course picker (long list)', vw); await shot(p, vw, 'course-picker');
  await p.locator('.sheet-body').evaluate((b) => (b.scrollTop = b.scrollHeight)); await fit(p, 'course picker scrolled to bottom', vw);
  await p.locator('.sheet-body').evaluate((b) => (b.scrollTop = 0));
  await p.focus('[data-testid=course-search]'); await p.setViewportSize({ width: vw, height: vh - 300 }); await p.fill('[data-testid=course-search]', 'pine');
  await fit(p, 'course picker, keyboard open', vw); await p.setViewportSize({ width: vw, height: vh });
  await p.fill('[data-testid=course-search]', 'Abacoa'); await p.waitForTimeout(300);
  await p.locator('[data-testid=course-result]').first().click(); await p.waitForSelector('[data-testid=course-tees]', { timeout: 15000 });
  await fit(p, 'course setup / tee picker', vw); await shot(p, vw, 'tee-picker');
  await p.click('[data-testid=course-use]'); await p.waitForSelector('[data-testid=tee-boxes]'); await fit(p, 'course editor (tee boxes)', vw);
  await close(p);
  // week sheets
  await p.goto(BASE + '#/scores/w7'); await p.waitForSelector('[data-testid=skins-toggle]');
  await p.getByRole('button', { name: /Week$/ }).click(); await fit(p, 'week sheet', vw); await close(p);
  await p.getByRole('button', { name: /Teams$/ }).click(); await fit(p, 'teams sheet', vw); await close(p);
  await p.getByRole('button', { name: /Mark out or bring in a sub/ }).first().click(); await fit(p, 'sub sheet', vw); await shot(p, vw, 'sub-sheet');
  await p.focus('[data-testid=sub-name]'); await p.setViewportSize({ width: vw, height: vh - 300 }); await fit(p, 'sub sheet, keyboard open', vw); await p.setViewportSize({ width: vw, height: vh }); await close(p);
  await p.locator('.entrant .acts .btn').first().click(); await fit(p, 'score pad', vw);
  await p.getByText('Scan the scorecard').click(); await p.waitForTimeout(400); await fit(p, 'scan card', vw); await close(p).catch(() => {});
  await p.goto(BASE + '#/skins'); await p.waitForTimeout(600); await p.click('[aria-label="Skins settings"]').catch(() => {}); await fit(p, 'skins settings', vw); await close(p).catch(() => {});
  await p.goto(BASE + '#/players/p2'); await p.waitForSelector('[data-testid=handicap-chart]'); await fit(p, 'player sheet', vw);
  await p.goto(BASE + '#/more'); await p.waitForTimeout(500); await p.click('[data-testid=email-excel]'); await p.waitForTimeout(800); await fit(p, 'email workbook', vw); await close(p);
  await p.goto(BASE + '#/league'); await p.waitForSelector('[data-testid=season-close]'); await p.click('[data-testid=season-close]'); await fit(p, 'close season', vw);
  await p.click('[data-testid=season-confirm]'); await p.waitForTimeout(600); await p.locator('[data-testid=season-row] button', { hasText: 'View' }).click(); await fit(p, 'past season view', vw); await close(p);
  await p.goto(BASE + '#/tv'); await p.waitForTimeout(1200); await fit(p, 'TV board', vw);
  await p.context().close();
  // wizard + auth + join (full-screen panels)
  p = await open(vw, vh, { theme: 'dark', onboarded: false, mode: 'local' });
  await p.goto(BASE); await p.waitForSelector('text=Start my own league'); await fit(p, 'welcome', vw);
  await p.getByRole('button', { name: /Start my own league/ }).click(); await fit(p, 'wizard 1', vw);
  await p.getByRole('button', { name: /^Next/ }).click(); await p.getByRole('button', { name: /2 more/ }).click(); await p.getByRole('button', { name: /2 more/ }).click(); await p.getByRole('button', { name: /2 more/ }).click(); await fit(p, 'wizard 2 (10 players)', vw);
  for (let i = 0; i < 4; i++) await p.getByPlaceholder(`Player ${i + 1}`, { exact: true }).fill('Player ' + 'ABCD'[i]);
  await p.getByRole('button', { name: /^Next/ }).click(); await fit(p, 'wizard 3', vw);
  await p.click('[data-testid=wizard-find-course]'); await p.waitForSelector('[data-testid=course-result]', { timeout: 20000 }); await fit(p, 'wizard course picker', vw);
  await p.context().close();
  p = await open(vw, vh, { theme: 'dark', onboarded: true });
  await p.goto(BASE); await p.waitForSelector('text=Sign in'); await fit(p, 'sign in', vw); await shot(p, vw, 'sign-in');
  await p.getByRole('button', { name: 'New here? Create an account' }).click(); await fit(p, 'create account', vw);
  await p.goto(BASE + '#/join/K7M2QX'); await p.waitForSelector('text=Join your league'); await fit(p, 'join', vw);
  await p.context().close();
}
console.log(fails ? `\n${fails} FAILED\n${bad.join('\n')}` : '\nALL FIT');
await browser.close(); process.exitCode = fails ? 1 : 0;
