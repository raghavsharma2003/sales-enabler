import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';

// Test-only admission is explicit. An unconfigured ordinary Node worker must
// never inherit the same inference privileges merely because it is not Next.
const requested = process.argv.slice(2);
const tests = requested.length ? requested.map(name => resolve(name))
  : readdirSync(resolve('tests')).filter(name => name.endsWith('.test.ts')).sort().map(name => resolve('tests', name));
const testRoot = `${resolve('tests')}${sep}`.toLowerCase();
if (!tests.every(path => path.toLowerCase().startsWith(testRoot) && path.endsWith('.test.ts'))) throw new Error('Select test files inside this repository’s tests directory.');
const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...tests], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' },
});
child.on('error', () => { process.stderr.write('The test runner could not start.\n'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
