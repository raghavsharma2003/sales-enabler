import { lstat, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Artifact-name boundary only: never open file contents or follow links. Dependency
// internals have legitimate data/fixture filenames and are outside this check.
// This is not a source-code secret scanner or a dependency provenance guarantee.
const privateDirectories = new Set(['data', '.data', 'backups', '.impeccable', '.git', '.codex', '.azure', 'test-results', 'playwright-report']);
const databaseArtifact = /\.(?:sqlite\d*|db[23]?)(?:$|[.-])/i;
const backupArtifact = /\.(?:bak|backup|dump)$/i;

async function checkPackage(root) {
  let rootStat;
  try { rootStat = await lstat(root); }
  catch { return { ok: false, issues: { missing_output: 1 }, inspectedEntries: 0 }; }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return { ok: false, issues: { invalid_output_directory: 1 }, inspectedEntries: 0 };
  const issues = {};
  const issue = code => { issues[code] = (issues[code] || 0) + 1; };
  let inspectedEntries = 0, entrypoint = false;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      // Do not descend into node_modules, including package-manager junctions.
      if (name === 'node_modules' && (entry.isDirectory() || entry.isSymbolicLink())) continue;
      inspectedEntries++;
      if (name.startsWith('.env')) { issue('environment_artifact'); continue; }
      if (privateDirectories.has(name)) { issue('private_directory'); continue; }
      if (databaseArtifact.test(name) || backupArtifact.test(name)) { issue('database_or_backup_artifact'); continue; }
      if (entry.isSymbolicLink()) { issue('unexpected_link'); continue; }
      if (entry.isDirectory()) pending.push(join(directory, entry.name));
      else if (!entry.isFile()) issue('unexpected_file_type');
      else if (directory === root && entry.name === 'server.js') entrypoint = true;
    }
  }
  if (!entrypoint) issue('missing_server_entrypoint');
  return { ok: Object.keys(issues).length === 0, issues, inspectedEntries };
}

async function main() {
  if (process.argv.length > 3) throw new Error();
  const result = await checkPackage(resolve(process.argv[2] || '.next/standalone'));
  // Names may themselves contain private identifiers. Report categories/counts
  // only, never offending paths, exception messages, configuration or contents.
  console.log(JSON.stringify({ check: 'standalone-package', ...result }));
  if (!result.ok) {
    console.error('Standalone package rejected. Exclude private environment/data/backup files from tracing, remove stale build output, and rebuild before packaging.');
    process.exitCode = 1;
  }
}
main().catch(() => {
  console.error('Standalone package check could not complete. Supply at most one output directory and verify directory access. No artifact paths or contents were logged.');
  process.exitCode = 1;
});
