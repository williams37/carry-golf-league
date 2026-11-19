// Renders synthetic GSPro-style end-of-round scorecards (and photo-of-a-screen variants) for OCR tests.
// Usage: node scripts/make-scorecards.mjs   → tests/fixtures/scorecards/*.{png,jpg} + truth.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = new URL('../tests/fixtures/scorecards/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p)), args: ['--no-sandbox'] });

const PAR = [5, 4, 3, 4, 4, 5, 3, 4, 4];
const HCP = [3, 7, 9, 1, 5, 2, 8, 4, 6];
const players = {
  dee: { name: 'Dee Okafor', s: [5, 4, 2, 5, 4, 6, 3, 4, 5] },
  marcus: { name: 'Marcus Bell', s: [6, 5, 3, 4, 7, 5, 4, 5, 4] },
  tommy: { name: 'Tommy Reyes', s: [4, 4, 3, 6, 5, 5, 2, 4, 4] },
  jules: { name: 'Jules Whitaker', s: [7, 5, 4, 5, 4, 6, 3, 6, 5] },
};
const sum = (a) => a.reduce((x, y) => x + y, 0);
const toPar = (s) => { const d = sum(s) - sum(PAR); return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`; };

function cellStyle(score, par, style) {
  const d = score - par;
  if (style === 'colors') {
    if (d <= -2) return 'background:#f2c230;color:#1b1b1b';
    if (d === -1) return 'background:#d8352a;color:#fff';
    if (d === 0) return 'background:#f4f4f4;color:#111';
    if (d === 1) return 'background:#8d949c;color:#fff';
    return 'background:#151515;color:#fff';
  }
  // shapes
  if (d <= -2) return 'border-radius:50%;box-shadow:0 0 0 2px #fff, 0 0 0 4px #1d2733, 0 0 0 6px #fff';
  if (d === -1) return 'border-radius:50%;box-shadow:0 0 0 2px #fff';
  if (d === 0) return '';
  if (d === 1) return 'box-shadow:0 0 0 2px #fff';
  return 'box-shadow:0 0 0 2px #fff, 0 0 0 4px #1d2733, 0 0 0 6px #fff';
}

function card({ rows, style = 'colors', eighteen = false, course = 'Lantern Bay — Ocean Nine' }) {
  const holes = eighteen ? 18 : 9;
  const par = eighteen ? [...PAR, 4, 4, 3, 5, 4, 4, 3, 5, 4] : PAR;
  const hdr = []; for (let i = 1; i <= holes; i++) { hdr.push(`<th>${i}</th>`); if (eighteen && i === 9) hdr.push('<th>OUT</th>'); }
  hdr.push(eighteen ? '<th>IN</th><th>TOT</th>' : '<th>OUT</th>', '<th></th>');
  const parCells = []; par.forEach((p, i) => { parCells.push(`<td>${p}</td>`); if (eighteen && i === 8) parCells.push(`<td>${sum(par.slice(0, 9))}</td>`); });
  parCells.push(eighteen ? `<td>${sum(par.slice(9))}</td><td>${sum(par)}</td>` : `<td>${sum(par)}</td>`, '<td></td>');
  const hcpCells = (eighteen ? [...HCP.map((h) => h * 2 - 1), ...HCP.map((h) => h * 2)] : HCP).map((h, i) => `<td>${h}</td>` + (eighteen && i === 8 ? '<td></td>' : '')).join('') + (eighteen ? '<td></td><td></td>' : '<td></td>') + '<td></td>';
  const prow = (p) => {
    const s = eighteen ? [...p.s, 4, 5, 3, 5, 4, 4, 3, 5, 4] : p.s;
    const cells = []; s.forEach((v, i) => { cells.push(`<td><span class="sc" style="${cellStyle(v, par[i], style)}">${v}</span></td>`); if (eighteen && i === 8) cells.push(`<td class="tot">${sum(s.slice(0, 9))}</td>`); });
    cells.push(eighteen ? `<td class="tot">${sum(s.slice(9))}</td><td class="tot">${sum(s)}</td>` : `<td class="tot">${sum(s)}</td>`, `<td class="tp">${toPar(p.s)}</td>`);
    return `<tr><td class="nm">${p.name}</td>${cells.join('')}</tr>`;
  };
  return `<!doctype html><html><head><style>
  body{margin:0;background:#3b5d2f;font-family:'Segoe UI',Roboto,Arial,sans-serif}
  .stage{width:1600px;height:900px;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#6c9a4c,#22371b 70%)}
  .card{background:rgba(14,22,30,.92);color:#e9eef2;border-radius:10px;padding:22px 26px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .ttl{display:flex;justify-content:space-between;font-weight:700;font-size:22px;letter-spacing:.5px;margin-bottom:14px}
  .ttl small{font-weight:500;color:#9fb0bf}
  table{border-collapse:collapse;font-size:${eighteen ? 19 : 24}px}
  th{background:#24303c;color:#c9d4de;font-weight:600;padding:8px 0;width:${eighteen ? 46 : 64}px}
  th:first-child,td.nm{width:${eighteen ? 170 : 210}px;text-align:left;padding-left:10px}
  td{text-align:center;padding:7px 0;border-bottom:1px solid #2b3946}
  tr.par td{color:#c9d4de;background:#1a242e} tr.hcp td{color:#7f91a1;font-size:.8em}
  .sc{display:inline-grid;place-items:center;width:34px;height:34px;font-weight:700}
  .tot{font-weight:800} .tp{color:#f0c24d;font-weight:700;width:56px}
  </style></head><body><div class="stage"><div class="card" id="card">
  <div class="ttl"><span>SCORECARD</span><small>${course}</small></div>
  <table><tr><th>HOLE</th>${hdr.join('')}</tr>
  <tr class="par"><td class="nm">PAR</td>${parCells.join('')}</tr>
  <tr class="hcp"><td class="nm">HCP</td>${hcpCells}</tr>
  ${rows.map(prow).join('')}</table></div></div></body></html>`;
}

// screen-photo effects: perspective, moire, glare, noise, color cast, vignette
const photoFx = (deg, moire = true) => `
  .stage{transform:perspective(1500px) rotateX(${deg[0]}deg) rotateY(${deg[1]}deg) rotate(${deg[2]}deg) scale(.92)}
  body::after{content:'';position:fixed;inset:0;pointer-events:none;
    background:${moire ? 'repeating-linear-gradient(93deg,rgba(255,255,255,.06) 0 1px,transparent 1px 3px),repeating-linear-gradient(2deg,rgba(0,0,0,.08) 0 1px,transparent 1px 4px),' : ''}
      radial-gradient(ellipse at 68% 30%,rgba(255,255,255,.38),transparent 40%),
      radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55));mix-blend-mode:normal}
  body{background:#0d0f12;filter:saturate(.85) sepia(.12) contrast(.92) brightness(1.04)}`;

const cases = [
  { id: 'colors-1p', rows: ['dee'], style: 'colors', expect: 'dee' },
  { id: 'shapes-4p', rows: ['marcus', 'dee', 'tommy', 'jules'], style: 'shapes', expect: 'dee', multi: true },
  { id: 'colors-4p', rows: ['marcus', 'dee', 'tommy', 'jules'], style: 'colors', expect: 'tommy', multi: true },
  { id: 'eighteen-2p', rows: ['jules', 'dee'], style: 'colors', eighteen: true, expect: 'dee', multi: true },
  { id: 'skewed', rows: ['dee', 'marcus'], style: 'colors', expect: 'dee', multi: true, css: `.stage{transform:perspective(1400px) rotateX(9deg) rotateY(-12deg) rotate(-4deg)}` },
  { id: 'blurry', rows: ['dee'], style: 'colors', expect: 'dee', css: `.card{filter:blur(1.6px)}`, scale: 0.6 },
  { id: 'screen-photo', rows: ['dee', 'tommy'], style: 'colors', expect: 'dee', multi: true, css: photoFx([7, -9, 3]), jpeg: 55, noise: true },
  { id: 'screen-photo-hard', rows: ['marcus', 'dee', 'tommy'], style: 'shapes', expect: 'dee', multi: true, css: photoFx([12, 14, -6]) + '.card{filter:blur(1.1px)}', jpeg: 40, noise: true, scale: 0.7 },
];

const truth = { par: PAR, cases: [] };
for (const c of cases) {
  const scale = c.scale || 1;
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.setContent(card({ rows: c.rows.map((k) => players[k]), style: c.style, eighteen: c.eighteen }).replace('</style>', (c.css || '') + '</style>'));
  if (c.noise) await p.addStyleTag({ content: `body::before{content:'';position:fixed;inset:0;z-index:9;pointer-events:none;opacity:.18;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")}` });
  const file = `${c.id}.${c.jpeg ? 'jpg' : 'png'}`;
  const bb = await p.locator('#card').boundingBox();
  const m = 14; // a loose, thumb-drawn crop around the card
  const crop = { x: Math.max(0, (bb.x - m) / 1600), y: Math.max(0, (bb.y - m) / 900), w: Math.min(1, (bb.width + 2 * m) / 1600), h: Math.min(1, (bb.height + 2 * m) / 900) };
  await p.screenshot({ path: OUT + file, type: c.jpeg ? 'jpeg' : 'png', quality: c.jpeg || undefined });
  truth.cases.push({ id: c.id, file, player: players[c.expect].name, scores: players[c.expect].s, rows: c.rows.map((k) => players[k].name), multi: !!c.multi, eighteen: !!c.eighteen, crop });
  console.log('  ✓', file);
  await ctx.close();
}
fs.writeFileSync(OUT + 'truth.json', JSON.stringify(truth, null, 2));
await browser.close();
