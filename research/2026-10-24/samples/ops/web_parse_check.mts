// R13 sample check, offline: after `node product/web/build.mjs`, does the web's own parser (product/web/src/samples.ts)
// accept every manifest entry in dist/samples, and does every clip URL resolve to a file the server would serve?
//   node --import tsx research/2026-10-24/samples/ops/web_parse_check.mts
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const { parseSamples } = await import(root + 'product/web/src/samples.ts');
const dist = root + 'product/web/dist';
const raw = JSON.parse(readFileSync(dist + '/samples/manifest.json', 'utf8'));
const got = parseSamples(raw);
console.log('manifest entries', Object.keys(raw).length, 'accepted by parseSamples', Object.keys(got).length);
for (const [id, s] of Object.entries(got) as [string, { src: string; durationS: number; recorded: string }][]) {
  const path = dist + s.src.split('?')[0];          // the server drops the query string (server/app.ts)
  console.log(id, s.src, 'durationS', s.durationS, 'recorded', s.recorded, 'file exists', existsSync(path), existsSync(path) ? statSync(path).size : 0);
}
const curated = ['v2-live', 'v2-flashlite', 'v2-54mini', 'v2-38flash', 'v2-mai', 'v2-luna', 'sarvam-india'];
console.log('cards with no sample:', curated.filter(c => !got[c]));
