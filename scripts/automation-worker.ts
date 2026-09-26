/** Explicit local worker. Nothing is scheduled by installing or starting Next. */
import { randomUUID } from 'node:crypto';
import { runAutomationTick, stopAutomationWorker } from '../lib/automation/engine';

async function main() {
  if (process.env.AUTOMATION_WORKER_ENABLED !== '1') {
    console.log('Automation worker is off. Set AUTOMATION_WORKER_ENABLED=1 to execute explicitly enabled schedules.');
    return;
  }
  const once = process.argv.includes('--once');
  const unknown = process.argv.slice(2).filter(arg => arg !== '--once');
  if (unknown.length) throw new Error('Unsupported worker option. Only --once is supported.');
  const workerId = randomUUID();
  let stopping = false;
  let wake: (() => void) | undefined;
  const stop = () => { stopping = true; wake?.(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    do {
      const counts = await runAutomationTick({ enabled: true, workerId, limit: 5, keepAlive: !once });
      console.log(JSON.stringify({ event: 'automation_worker_pass', ...counts }));
      if (!once && !stopping) await new Promise<void>(resolve => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, 15_000);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    } while (!once && !stopping);
  } finally { await stopAutomationWorker(workerId); }
}
main().catch(() => { console.error('Automation worker stopped. Review schedule history and worker configuration.'); process.exitCode = 1; });
