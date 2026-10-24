// Bundles the single-page app into dist/: index.html + hashed JS/CSS. `node product/web/build.mjs`
// React 19 + esbuild only; no UI library. The server (server/app.ts) serves dist/ and falls back to index.html.
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
const dist = here + 'dist/';
await rm(dist, { recursive: true, force: true });
await mkdir(dist + 'assets', { recursive: true });

const result = await build({
  entryPoints: [here + 'src/main.tsx'],
  outdir: dist + 'assets',
  entryNames: '[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2020', 'chrome100', 'safari15'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.svg': 'dataurl' },
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
});

const outputs = Object.entries(result.metafile.outputs);
const js = outputs.find(([p, o]) => o.entryPoint?.endsWith("src/main.tsx") && p.endsWith(".js"))?.[0].split('/').pop();
const css = outputs.find(([p]) => p.endsWith('.css'))?.[0].split('/').pop();
if (!js || !css) throw new Error('build produced no js/css');

const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#1F3B30">
<title>Vyakti · व्यक्ति</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231F3B30'/%3E%3Ccircle cx='12' cy='16' r='3' fill='%23FBF8F2'/%3E%3Cpath d='M18 9a8.5 8.5 0 0 1 0 14' stroke='%23E28B66' stroke-width='2.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/assets/${css}">
</head>
<body>
<div id="root"></div>
<noscript>Vyakti needs JavaScript to run.</noscript>
<script type="module" src="/assets/${js}"></script>
</body>
</html>
`;
await writeFile(dist + 'index.html', html);
// Static files served as they are (public/samples/: the stack voice samples and their manifest, dropped in from the lab VM).
await cp(here + 'public', dist, { recursive: true });

let total = 0, gz = 0, entryGz = 0;
// The largest lazy chunk is what one page can add on top of the first load (decision.2026-10-24.web-budget-per-chunk).
let largest = { name: '', gzipBytes: 0 };
async function walk(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const p = dir + f.name;
    if (f.isDirectory()) { await walk(p + '/'); continue; }
    total += (await stat(p)).size;
    const g = gzipSync(readFileSync(p)).length;
    gz += g;
    if (f.name === js || f.name === css) entryGz += g;
    else if (g > largest.gzipBytes) largest = { name: f.name, gzipBytes: g };
  }
}
await walk(dist + 'assets/');
const report = { js, css, bytes: total, gzipBytes: gz, entryGzipBytes: entryGz, largestChunk: largest };
await writeFile(dist + 'build.json', JSON.stringify(report));
console.log(`web built: ${js} + ${css}; first load ${(entryGz / 1024).toFixed(1)} KB gzip, largest chunk ${largest.name} ${(largest.gzipBytes / 1024).toFixed(1)} KB, all chunks ${(gz / 1024).toFixed(1)} KB gzip (${(total / 1024).toFixed(1)} KB raw)`);
