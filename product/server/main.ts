// Entry point: `node --import tsx server/main.ts`. Reads DATABASE_URL, PORT (default 8080) and serves web/dist.
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { createPool } from './db.ts';
import { modules } from './modules/index.ts';

const pool = createPool();
const webRoot = fileURLToPath(new URL('../web/dist/', import.meta.url));
const { server } = buildApp(pool, modules, { webRoot });
const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => console.log(`[vp] control plane on :${port} with ${modules.length} modules`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { server.close(); void pool.end(); });
