// Entry point: `node --import tsx server/main.ts`. Reads DATABASE_URL, PORT (default 8080) and serves web/dist.
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { createPool } from './db.ts';
import { modules } from './modules/index.ts';
import { startJobs } from './jobs.ts';

const pool = createPool();
const webRoot = fileURLToPath(new URL('../web/dist/', import.meta.url));
const { server, deps, jobs, stop } = buildApp(pool, modules, { webRoot });
// VP_JOBS=0 runs an API-only replica; background jobs take advisory locks, so several replicas may run them safely.
const stopJobs = process.env.VP_JOBS === '0' ? () => {} : startJobs(jobs, deps);
const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => console.log(`[vp] control plane on :${port} with ${modules.length} modules, ${jobs.length} jobs`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopJobs(); server.close(); void stop().finally(() => pool.end()); });
