// Run one tool as Vyakti staff (actor 'vp_success') on this server's database: the way staff use the tools no workspace
// role may call (member.phone.mark_verified, number.attach_carrier, wallet.credit). Only someone with a shell and the
// server's env on the host can run it; every run is audited by the registry under the staff id given.
//
//   node --import tsx product/scripts/staff.ts --staff <your-staff-id> --workspace <workspace-id> <tool> '<json args>'
//
// Reads the same env as the server (DATABASE_URL, VP_PUBLIC_URL, VP_RUNTIME_PUBLIC_URL, PLIVO_*, VP_TELEPHONY_*). Prints
// the tool's receipt as JSON. Never prints env values.
import { buildApp } from '../server/app.ts';
import { createPool } from '../server/db.ts';
import { modules } from '../server/modules/index.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const staff = arg('--staff'), workspaceId = arg('--workspace');
const rest = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !['--staff', '--workspace'].includes(all[i - 1]));
const [toolName, json] = rest;
if (!staff || !workspaceId || !toolName) {
  console.error("usage: staff.ts --staff <staff-id> --workspace <workspace-id> <tool> '<json args>'");
  process.exit(2);
}
let input: unknown;
try { input = JSON.parse(json ?? '{}'); } catch { console.error('the args are not valid JSON'); process.exit(2); }

async function main(): Promise<void> {
  const pool = createPool();
  const { registry, stop } = buildApp(pool, modules);
  try {
    const r = await registry.execute(pool, toolName, input, { workspaceId: workspaceId!, actor: { type: 'vp_success', id: staff } });
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.status === 'confirmed' ? 0 : 1;
  } finally {
    await stop();
    await pool.end();
  }
}
void main();
