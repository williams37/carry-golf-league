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

// ---------- Projector-style white card (modelled on a real bay photo): INDEX + DISTANCE rows, ghost avatars, UPPERCASE names ----------
const RPAR = [4, 3, 4, 4, 3, 5, 3, 4, 5];
const RIDX = [5, 9, 1, 3, 7, 2, 8, 6, 4];
const RDIST = [388, 162, 431, 402, 175, 538, 148, 377, 512];
const RPL = [
  { name: 'NICK VIDRA', s: [5, 3, 4, 3, 3, 5, 3, 5, 7] },
  { name: 'SETH MCLAUGHLIN', s: [5, 5, 5, 4, 3, 6, 5, 4, 4] },
  { name: 'JOSH WILLIAMS', s: [5, 4, 4, 6, 4, 4, 3, 5, 4] },
];
const avatar = `<svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="#d5d9de"/><circle cx="15" cy="11.5" r="5" fill="#9aa3ad"/><path d="M5.5 25c1.8-5 5.4-7 9.5-7s7.7 2 9.5 7" fill="#9aa3ad"/></svg>`;
function whiteCard() {
  const cell = (v, par) => { const d = v - par; const st = d <= -1 ? 'border-radius:50%;border:2px solid #c23a2c;color:#c23a2c' : d === 1 ? 'border:2px solid #3d4a57' : d >= 2 ? 'border:2px solid #3d4a57;outline:2px solid #3d4a57;outline-offset:2px' : ''; return `<td><span class="sc" style="${st}">${v}</span></td>`; };
  const row = (label, vals, total, cls = '') => `<tr class="${cls}"><td class="nm">${label}</td>${vals.map((v) => `<td>${v}</td>`).join('')}<td class="tot">${total ?? ''}</td></tr>`;
  return `<!doctype html><html><head><style>
  body{margin:0;font-family:'Segoe UI',Roboto,Arial,sans-serif}
  .stage{width:1600px;height:900px;display:grid;place-items:center;background:linear-gradient(160deg,#3a4652,#1d242b)}
  .card{background:#f7f8fa;color:#1b2430;border-radius:6px;padding:26px 30px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
  .ttl{display:flex;justify-content:space-between;font-weight:800;font-size:24px;margin-bottom:14px;letter-spacing:1px} .ttl small{font-weight:600;color:#6b7785;font-size:18px}
  table{border-collapse:collapse;font-size:24px} th{background:#1f3b57;color:#fff;font-weight:700;padding:9px 0;width:66px}
  th:first-child,td.nm{width:290px;text-align:left;padding-left:12px} td{text-align:center;padding:8px 0;border-bottom:1px solid #d9dee4}
  tr.par td{background:#e8edf2;font-weight:700} tr.sub td{color:#6b7785;font-size:.78em}
  td.nm.pl{display:flex;align-items:center;gap:12px;font-weight:700;letter-spacing:.5px}
  .sc{display:inline-grid;place-items:center;width:34px;height:34px;font-weight:700} .tot{font-weight:800}
  </style></head><body><div class="stage"><div class="card" id="card">
  <div class="ttl"><span>SCORECARD</span><small>FRONT 9</small></div>
  <table><tr><th>HOLE</th>${RPAR.map((_, i) => `<th>${i + 1}</th>`).join('')}<th>OUT</th></tr>
  ${row('PAR', RPAR, sum(RPAR), 'par')}${row('INDEX', RIDX, '', 'sub')}${row('DISTANCE', RDIST, sum(RDIST), 'sub')}
  ${RPL.map((p) => `<tr><td class="nm pl">${avatar}${p.name}</td>${p.s.map((v, k) => cell(v, RPAR[k])).join('')}<td class="tot">${sum(p.s)}</td></tr>`).join('')}
  </table></div></div></body></html>`;
}
const projector = `
  .stage{transform:perspective(1300px) rotateX(-8deg) rotateY(7deg) rotate(1.5deg) scale(.95)}
  .card{filter:blur(.9px) contrast(.85) brightness(1.06)}
  body::after{content:'';position:fixed;inset:0;pointer-events:none;
    background:repeating-linear-gradient(97deg,rgba(0,0,0,.07) 0 30px,rgba(255,255,255,.05) 60px,rgba(0,0,0,.04) 95px,transparent 130px),
      repeating-linear-gradient(4deg,rgba(0,0,0,.05) 0 2px,transparent 2px 5px),
      radial-gradient(ellipse at 35% 25%,rgba(255,255,240,.35),transparent 45%),radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.5))}
  body{background:#111;filter:saturate(.8) sepia(.15)}`;
for (const c of [{ id: 'projector-clean', css: '' }, { id: 'projector-photo', css: projector, jpeg: 50, scale: 0.8 }]) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: c.scale || 1 });
  const p = await ctx.newPage();
  await p.setContent(whiteCard().replace('</style>', c.css + '</style>'));
  const file = `${c.id}.${c.jpeg ? 'jpg' : 'png'}`;
  const bb = await p.locator('#card').boundingBox(); const m = 14;
  const crop = { x: Math.max(0, (bb.x - m) / 1600), y: Math.max(0, (bb.y - m) / 900), w: Math.min(1, (bb.width + 2 * m) / 1600), h: Math.min(1, (bb.height + 2 * m) / 900) };
  await p.screenshot({ path: OUT + file, type: c.jpeg ? 'jpeg' : 'png', quality: c.jpeg || undefined });
  truth.cases.push({ id: c.id, file, player: RPL[2].name, scores: RPL[2].s, rows: RPL.map((x) => x.name), all: RPL, par: RPAR, multi: true, crop, strict: true });
  console.log('  ✓', file);
  await ctx.close();
}
// A real bay photo can be dropped in (kept out of git — people's names): tests/fixtures/private/real-gspro-1.jpg
truth.cases.push({ id: 'real-gspro-1', file: '../private/real-gspro-1.jpg', optional: true, player: 'JOSH WILLIAMS', scores: [5, 4, 4, 6, 4, 4, 3, 5, 4], rows: RPL.map((x) => x.name), all: RPL, par: RPAR, multi: true, strict: true });
fs.writeFileSync(OUT + 'truth.json', JSON.stringify(truth, null, 2));
await browser.close();
