// Screenshots of the guided start in a brand-new workspace (empty, template picker, one step done) at both sizes.
//   node product/web/dev/shots-start.mjs [baseUrl]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const base = process.argv[2] ?? 'http://localhost:8799';
const out = fileURLToPath(new URL('../shots/', import.meta.url));
const b = await chromium.launch();
for (const [tag, vp, extra] of [['d', { width: 1440, height: 900 }, {}], ['m', { width: 390, height: 844 }, { isMobile: true, hasTouch: true }]]) {
  const c = await b.newContext({ viewport: vp, reducedMotion: 'reduce', ...extra });
  const r = await c.request.post(base + '/v1/signup', { data: { workspace: 'Shot Workspace ' + tag, name: 'Neha Kapoor', email: `shots-${tag}-${Date.now()}@guided.example`, password: 'sample-password-1234' } });
  if (!r.ok()) throw new Error('signup ' + r.status());
  const p = await c.newPage();
  await p.goto(base + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor();
  await p.screenshot({ path: out + `start-empty-${tag}.png`, fullPage: true });
  await p.getByRole('radio', { name: 'Start from a template' }).click(); await p.getByRole('heading', { name: 'Insurance' }).waitFor();
  await p.screenshot({ path: out + `start-templates-${tag}.png`, fullPage: true });
  await p.getByRole('radio', { name: /Health insurance renewal reminder/ }).click();
  await p.getByRole('button', { name: 'Create draft' }).click(); await p.waitForURL('**/agents/*');
  await p.goto(base + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor(); await p.getByText('First agent', { exact: false }).first().waitFor().catch(() => {});
  await p.screenshot({ path: out + `start-agent-done-${tag}.png`, fullPage: true });
  await c.close();
}
await b.close();
console.log('ok');
