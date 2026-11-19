import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`               → dist/          (PWA, for GitHub Pages / any static host)
// `vite build --mode single` → dist-single/   (one self-contained index.html to hand to Grok)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  // GitHub Pages serves the app under /<repo>/; the workflow sets BASE_PATH. Local/single builds stay relative.
  const base = single ? './' : process.env.BASE_PATH || './';
  return {
    base,
    plugins: [
      react(),
      single && viteSingleFile({ removeViteModuleLoader: true }),
      !single && {
        name: 'pwa-links',
        transformIndexHtml: (html) => html.replace('<!--PWA-->', '<link rel="manifest" href="./manifest.webmanifest" />\n    <link rel="apple-touch-icon" href="./icon-192.png" />'),
      },
      // SPA fallback for GitHub Pages: any unknown path under the app redirects to the app with the
      // path turned into a hash route (/carry-golf-league/join/ABC123 → /carry-golf-league/#/join/ABC123).
      !single && {
        name: 'spa-404',
        generateBundle() {
          const root = base.startsWith('/') ? base : '/';
          this.emitFile({ type: 'asset', fileName: '404.html', source: `<!doctype html><meta charset="utf-8"><title>Carry</title><script>
(function(){var b=${JSON.stringify(root)},p=location.pathname;var rest=p.indexOf(b)===0?p.slice(b.length):p.replace(/^\\//,'');
location.replace(b+(rest?'#/'+rest.replace(/\\/$/,''):'')+location.search+(rest?'':location.hash));})();
</script><noscript><a href="${root}">Open Carry</a></noscript>` });
        },
      },
    ].filter(Boolean),
    publicDir: single ? false : 'public',
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
      assetsInlineLimit: single ? 100000000 : 4096,
    },
    test: { environment: 'node', include: ['tests/**/*.test.js'] },
  };
});
