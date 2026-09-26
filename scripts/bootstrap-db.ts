import { db } from '../lib/server/db';
import { configurationIssues } from '../lib/server/health';

// Explicit startup/bootstrap only. This runs existing additive CREATE IF NOT EXISTS
// statements; it is not a versioned migration runner or a data migration tool.
async function main() {
  const issues = configurationIssues();
  if (issues.length) { console.error(JSON.stringify({ ready: false, issues })); process.exit(1); }
  await (await db()).all('SELECT 1 AS ready');
  console.log('Database bootstrap completed.');
  process.exit(0); // The one-shot process owns its database pool.
}
main().catch(() => { console.error('Database bootstrap failed. Check database access and configuration.'); process.exit(1); });
