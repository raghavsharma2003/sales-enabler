import { backup, DatabaseSync } from 'node:sqlite';
import { isAbsolute, join, dirname, basename } from 'node:path';
import { mkdir, realpath, stat } from 'node:fs/promises';

// Backup and restore both create a NEW isolated directory. Existing destinations,
// files and their WAL companions are never overwritten, moved or deleted.
async function main() {
  const [mode, sourceArgument, destinationArgument, ...extra] = process.argv.slice(2);
  if (!['backup', 'restore'].includes(mode) || extra.length || !sourceArgument || !destinationArgument || !isAbsolute(sourceArgument) || !isAbsolute(destinationArgument)) {
    throw new Error('Use backup|restore followed by an absolute source database path and an absolute NEW destination directory.');
  }
  const source = await realpath(sourceArgument);
  if (!(await stat(source)).isFile()) throw new Error('Source must be an existing database file.');
  const parent = await realpath(dirname(destinationArgument));
  const name = basename(destinationArgument);
  if (!name || ['.', '..'].includes(name)) throw new Error('Choose a new destination directory beneath an existing parent.');
  const destination = join(parent, name);
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.exec('PRAGMA busy_timeout = 5000');
    const integrity = database.prepare('PRAGMA quick_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new Error('Source database integrity check failed.');
    await mkdir(destination, { recursive: false, mode: 0o700 }); // Atomic exclusive allocation; EEXIST always fails.
    const target = join(destination, 'workspace.sqlite');
    await backup(database, target);
    const verification = new DatabaseSync(target, { readOnly: true });
    try {
      const checks = verification.prepare('PRAGMA integrity_check').all();
      if (checks.length !== 1 || Object.values(checks[0])[0] !== 'ok') throw new Error('Snapshot verification failed.');
    } finally { verification.close(); }
    console.log(mode === 'restore' ? 'Restore verified in the new directory. Stop all app/worker processes before switching SQLITE_PATH to its workspace.sqlite.' : 'SQLite backup verified in the new directory as workspace.sqlite.');
  } finally { database.close(); }
}
main().catch(() => {
  console.error('Snapshot failed. Use absolute paths, an existing readable SQLite source and a NEW destination directory with an existing parent. Existing destinations are never replaced. Inspect any newly created directory before reuse.');
  process.exitCode = 1;
});
