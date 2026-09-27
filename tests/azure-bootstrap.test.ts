import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const subscription = '11111111-1111-1111-1111-111111111111';
const appId = '22222222-2222-2222-2222-222222222222';
const spId = '33333333-3333-3333-3333-333333333333';
const dummySecret = 'DUMMY_SECRET_MUST_NOT_APPEAR';
const script = path.resolve('infrastructure/azure/bootstrap-access.sh');

function findBash(): string | undefined {
  if (process.platform !== 'win32') return existsSync('/bin/bash') ? '/bin/bash' : undefined;
  const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']];
  return roots.filter(Boolean).map((root) => path.join(root!, 'Programs', 'Git', 'bin', 'bash.exe'))
    .concat(roots.filter(Boolean).map((root) => path.join(root!, 'Git', 'bin', 'bash.exe')))
    .find(existsSync);
}

function findPython(): string | undefined {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const name = process.platform === 'win32' ? 'python.exe' : 'python3';
  const found = spawnSync(command, [name], { encoding: 'utf8' });
  return found.status === 0
    ? found.stdout.split(/\r?\n/).find((entry) => entry && !entry.includes('WindowsApps'))
    : undefined;
}

const bash = findBash();
const python = findPython();
const skip = !bash || !python ? 'Git Bash (Windows) or /bin/bash and Python 3 are required' : false;
const bashPath = (value: string) => process.platform === 'win32' ? value.replaceAll('\\', '/') : value;

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'azure-bootstrap-'));
  const bin = path.join(cwd, 'bin');
  await mkdir(bin);
  if (process.platform === 'win32') {
    await writeFile(path.join(bin, 'python3'), `#!/usr/bin/env bash\nexec "${bashPath(python!)}" "$@"\n`, { mode: 0o700 });
  }
  const bashEnv = path.join(cwd, 'fake-azure.sh');
  await writeFile(bashEnv, `az() {
  printf '%s\\n' "$*" >> mock.log
  local args="$*"
  case "$args" in
    'account set --subscription '*) return 0 ;;
    'account show --query id -o tsv') printf '${subscription}\\n' ;;
    'account show --query name -o tsv') printf 'Startup Grant\\n' ;;
    'account show --query tenantId -o tsv') printf '44444444-4444-4444-4444-444444444444\\n' ;;
    'account show --query user.name -o tsv') printf 'founder@example.test\\n' ;;
    'resource list --resource-type Microsoft.CognitiveServices/accounts '*)
      printf '%s\\n' '[{"name":"startup-foundry","resourceGroup":"ai-existing","location":"centralindia","id":"/subscriptions/${subscription}/resourceGroups/ai-existing/providers/Microsoft.CognitiveServices/accounts/startup-foundry"}]' ;;
    'group exists --name sales-enabler-prod -o tsv') printf 'false\\n' ;;
    'group create --name sales-enabler-prod --location centralindia --output none') return 0 ;;
    'ad app create --display-name '*) printf '${appId}\\n' ;;
    'ad sp create --id ${appId} --query id -o tsv')
      if [[ ! -e sp-attempted ]]; then touch sp-attempted; return 1; fi
      printf '${spId}\\n' ;;
    'ad sp show --id ${appId} --query id -o tsv') return 1 ;;
    'role assignment create '*)
      [[ "$FAKE_FAIL_ROLE" == 1 && "$args" == *'c883944f-8b7b-4483-af10-35834be79c4a'* ]] && return 9
      return 0 ;;
    'ad app credential reset '*) printf '${dummySecret}\\n' ;;
    *) printf 'Unexpected fake az call: %s\\n' "$args" >&2; return 64 ;;
  esac
}
`, { mode: 0o600 });
  return { cwd, bin, bashEnv };
}

function run(cwd: string, bin: string, bashEnv: string, confirmation: string, failRole = false) {
  return spawnSync(bash!, [bashPath(script)], {
    cwd, encoding: 'utf8', input: `${subscription}\n1\n${confirmation}\n`, timeout: 90_000,
    env: {
      ...process.env,
      PATH: process.platform === 'win32' ? `${bin};${process.env.PATH ?? ''}` : process.env.PATH,
      BASH_ENV: bashPath(bashEnv),
      FAKE_FAIL_ROLE: failRole ? '1' : '0',
    },
  });
}

test('offline bootstrap retries SP creation, grants bounded roles, and protects its secret', { skip }, async () => {
  const { cwd, bin, bashEnv } = await fixture();
  const result = run(cwd, bin, bashEnv, 'APPLY SALES ENABLER ACCESS');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(dummySecret));
  const envPath = path.join(cwd, '.env.azure-management.local');
  const env = await readFile(envPath, 'utf8');
  assert.match(env, new RegExp(`AZURE_CLIENT_SECRET="${dummySecret}"`));
  if (process.platform !== 'win32') {
    assert.equal((await stat(envPath)).mode & 0o077, 0);
  }
  const log = await readFile(path.join(cwd, 'mock.log'), 'utf8');
  assert.equal(log.match(/ad sp create/g)?.length, 2);
  assert.match(log, /--role b24988ac-6180-42a0-ab88-20f7382dd24c --scope \/subscriptions\/11111111/);
  assert.match(log, /--role 8e3af657-a8ff-443c-a75c-2fe8c4bcb635 .*GuidNotEquals \{8e3af657-a8ff-443c-a75c-2fe8c4bcb635, f58310d9-a9f6-439a-9e8d-f62e7b41a168, 18d7d88d-d35e-4fb5-a5c3-7773c20a72d9\}/);
  assert.match(log, /--role c883944f-8b7b-4483-af10-35834be79c4a --scope .*startup-foundry/);
  assert.ok(log.indexOf('role assignment create') < log.indexOf('ad app credential reset'));
  const second = run(cwd, bin, bashEnv, 'APPLY SALES ENABLER ACCESS');
  assert.notEqual(second.status, 0);
  assert.equal(await readFile(envPath, 'utf8'), env);
});

test('offline bootstrap decline performs no mutations', { skip }, async () => {
  const { cwd, bin, bashEnv } = await fixture();
  const result = run(cwd, bin, bashEnv, 'NO');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(await readFile(path.join(cwd, 'mock.log'), 'utf8'), /group create|ad app create|role assignment create|credential reset/);
  assert.match(result.stderr, /No Azure changes were started/);
});

test('offline role failure leaves receipt and creates no credential', { skip }, async () => {
  const { cwd, bin, bashEnv } = await fixture();
  const result = run(cwd, bin, bashEnv, 'APPLY SALES ENABLER ACCESS', true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Partial Azure state may exist/);
  const receipt = await readFile(path.join(cwd, '.sales-enabler-bootstrap-receipt'), 'utf8');
  assert.match(receipt, new RegExp(appId));
  assert.match(receipt, new RegExp(spId));
  await assert.rejects(readFile(path.join(cwd, '.env.azure-management.local'), 'utf8'));
  const log = await readFile(path.join(cwd, 'mock.log'), 'utf8');
  assert.doesNotMatch(log, /credential reset/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(dummySecret));
});
