import { runPrivateVoiceSupervisor } from '../lib/voice/supervisor';

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--once')) throw new Error('Only --once is supported.');
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try { await runPrivateVoiceSupervisor({ signal: controller.signal, once: process.argv.includes('--once') }); }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
main().catch(() => { console.error('Private voice supervisor stopped. Review service configuration and saved attempt states.'); process.exitCode = 1; });
