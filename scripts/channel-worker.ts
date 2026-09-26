import { channelWorkerTick } from '../lib/channel-agents/service';
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
async function main() {
  if (process.env.CHANNEL_WORKER_ENABLED !== '1') {
    console.log('Channel worker is off. Set CHANNEL_WORKER_ENABLED=1 to process authorized channel replies.');
    return;
  }
  if (process.argv.slice(2).some(arg => arg !== '--once')) throw new Error('Only --once is supported.');
  do {
    try { await channelWorkerTick(); }
    catch { console.error('Channel worker tick failed. Pending jobs remain durable; inspect worker health.'); }
    if (process.argv.includes('--once')) break;
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 3000));
  } while (!stopping);
}
void main().catch(() => { console.error('Channel worker stopped. Check configuration and durable job history.'); process.exitCode = 1; });
