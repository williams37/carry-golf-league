// Renders the PWA icons from the brand mark SVG.
import { chromium } from 'playwright-core';
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#4fe3c1"/><stop offset="1" stop-color="#c6f36d"/></linearGradient><radialGradient id="r" cx="0.75" cy="0" r="1"><stop offset="0" stop-color="#1c4a3a"/><stop offset="1" stop-color="#07110d"/></radialGradient></defs><rect width="40" height="40" fill="url(#r)"/><path d="M8 30C13 9 26 6 32 21" stroke="url(#g)" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="32" cy="21" r="2.8" fill="#fff"/><path d="M6 32.5h28" stroke="rgba(220,255,235,.18)" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const s of [192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<body style="margin:0">${svg(s)}</body>`);
  await p.screenshot({ path: `public/icon-${s}.png` });
}
await b.close();
