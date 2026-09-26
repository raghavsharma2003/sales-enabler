/** Explicit worker: environment holds configuration; arguments never contain credentials. */
import { learningWorkerEnabled, runLearningWorkerTick } from '../lib/learning-jobs/engine';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--once')) throw new Error('Only --once is supported.');
  if (!learningWorkerEnabled()) { console.log(JSON.stringify({ event: 'learning_worker_pass', enabled: false })); return; }
  const once = process.argv.includes('--once');
  const heartbeatId = `learning:${randomUUID()}`, database = await db();
  const heartbeat = (status: 'running' | 'stopped') => database.run('INSERT INTO service_heartbeats (id,service,status,updated_at) VALUES (?,?,?,?) ON CONFLICT (id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at', [heartbeatId, 'learning-worker', status, new Date().toISOString()]);
  let stopping = false, wake: (() => void) | undefined;
  const stop = () => { stopping = true; wake?.(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    await heartbeat('running');
    do {
    const counts = await runLearningWorkerTick({ limit: 5 });
    console.log(JSON.stringify({ event: 'learning_worker_pass', ...counts }));
    await heartbeat('running');
    if (!once && !stopping) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { wake = undefined; resolve(); }, 15000);
      wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
    });
  } while (!once && !stopping);
  } finally { await heartbeat('stopped'); }
}
main().catch(() => { console.error('Learning worker stopped. Review worker configuration and saved job states.'); process.exitCode = 1; });
