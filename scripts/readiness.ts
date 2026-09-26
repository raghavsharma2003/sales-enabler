import { checkReadiness, configurationIssues } from '../lib/server/health';

async function main() {
  const flags = process.argv.slice(2);
  const workerFlags = ['--worker', '--channel-worker', '--learning-worker'];
  if (flags.some(flag => !['--config-only', ...workerFlags].includes(flag)) || workerFlags.filter(flag => flags.includes(flag)).length > 1) throw new Error();
  const result = flags.includes('--config-only')
    ? { ready: configurationIssues().length === 0, issues: configurationIssues() }
    : await checkReadiness({ requireWorker: flags.includes('--worker'), requireChannelWorker: flags.includes('--channel-worker'), requireLearningWorker: flags.includes('--learning-worker') });
  console.log(JSON.stringify(result));
  if (!result.ready) process.exitCode = 1;
}
main().catch(() => { console.error('Readiness check failed. Use --config-only or one of --worker/--channel-worker/--learning-worker; no configuration values are logged.'); process.exitCode = 1; });
