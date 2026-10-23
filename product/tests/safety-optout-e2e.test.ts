// An opt-out said mid-call, end to end across processes and modules:
//   voice runtime (python -m vpvoice.devsim: the real door, caller signals, brief rows and session end logic, with fake
//   ears/brain/voice) -> signed event batches -> calls (ingest: the opt_out moment, call_opt_out, the A3 flush) ->
//   intake (contact.suppress_after_opt_out: a workspace suppression and a consent withdrawal).
// The agent confirms in one line (she follows the brief's opt-out row), the runtime ends the call with end reason
// opt_out, and the contact is suppressed afterwards. A second run without the suppression tool proves the same check
// fails when that step is missing. Skipped without DATABASE_URL or a Python with the runtime's requirements
// (VP_VOICE_PYTHON). Synthetic data only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer as netServer, type AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { buildApp, type Module } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import { HttpRuntime, runtime, setRuntime } from '../server/runtime-client.ts';
import type { CallTicket } from '../shared/runtime-protocol.ts';
import { combinationId, requireStack } from '../shared/stacks.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';

const VOICE = join(dirname(fileURLToPath(import.meta.url)), '..', 'voice');
const PY = process.env.VP_VOICE_PYTHON ?? 'python3';
const hasRuntimeDeps = () => spawnSync(PY, ['-c', 'import aiohttp, numpy'], { cwd: VOICE }).status === 0;
const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set'
  : !hasRuntimeDeps() ? `no Python with the voice runtime's requirements (${PY}); set VP_VOICE_PYTHON` : false;
const SECRET = 'safety-optout-e2e-secret-'.padEnd(40, 'z');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise<number>((res, rej) => {
  const s = netServer().once('error', rej).listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => res(p)); });
});
async function until<T>(what: string, f: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}
async function socket(url: string) {
  const ws = new WebSocket(url);
  const inbox: any[] = [], waiters: ((m: any) => void)[] = [];
  ws.addEventListener('message', e => { const m = JSON.parse(String(e.data)); const w = waiters.shift(); if (w) w(m); else inbox.push(m); });
  await new Promise<void>((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', () => rej(new Error('socket refused: ' + url))); });
  return {
    next: (ms = 10_000) => inbox.length ? Promise.resolve(inbox.shift()) : new Promise<any>((res, rej) => {
      const t = setTimeout(() => rej(new Error('no message from ' + url)), ms); waiters.push(m => { clearTimeout(t); res(m); });
    }),
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    close: () => ws.close(),
  };
}

let pool: pg.Pool | undefined;
const stops: (() => Promise<void>)[] = [];
after(async () => {
  for (const stop of stops.reverse()) await stop();
  setRuntime(null); setFakeLlm(null);
  await analysesSettled();
  await pool?.end();
});

/** One control plane (the given modules) and one dev runtime pointed at it; returns what a call needs. */
async function stand(modules: Module[]) {
  pool ??= createPool(process.env.DATABASE_URL);
  const app = buildApp(pool, modules);
  const server: Server = app.server;
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const control = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const port = await freePort();
  const proc: ChildProcess = spawn(PY, ['-m', 'vpvoice.devsim'], { cwd: VOICE, stdio: 'ignore',
    env: { ...process.env, VP_DEVSIM: '1', VP_RUNTIME_SECRET: SECRET, VP_CONTROL_URL: control, PORT: String(port), VP_LOG_LEVEL: 'WARNING' } });
  stops.push(async () => {
    proc.kill('SIGTERM');
    await Promise.race([new Promise(r => proc.once('exit', r)), sleep(3000)]);
    if (proc.exitCode === null) proc.kill('SIGKILL');
    await new Promise(r => server.close(r));
  });
  const rt = `127.0.0.1:${port}`;
  await until('the dev runtime', async () => (await fetch(`http://${rt}/v1/health`)).ok);
  setRuntime(new HttpRuntime(`http://${rt}`, SECRET));
  return { registry: app.registry, rt };
}

/** Place a sim call to a real contact, let the caller say `line`, and wait for the call to end in calls. */
async function optOutCall(modules: Module[], line: string) {
  const prev = process.env.VP_RUNTIME_SECRET;
  process.env.VP_RUNTIME_SECRET = SECRET;
  try {
    const { registry, rt } = await stand(modules);
    setFakeLlm(() => ({ text: JSON.stringify({ points: [], moments: [], reasonCode: null, outcome: null }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
    const db = pool!;
    const ws = (await one<{ id: string }>(db, "INSERT INTO workspace (name) VALUES ('opt-out e2e') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(db, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
    const ctx = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
    const contact = (await one<{ id: string }>(db, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,'+919000000071','Test Person') RETURNING id", [ws]))!.id;

    const made = await registry.execute<any>(db, 'agent.create', { name: 'Opt-out e2e', templateId: 'insurance-renewal' }, ctx);
    assert.equal(made.status, 'confirmed', JSON.stringify(made));
    if (made.status !== 'confirmed') throw new Error('agent');
    assert.equal((await registry.execute(db, 'stack.set', { agentId: made.result.agentId, stackId: 'v2-flashlite' }, ctx)).status, 'confirmed');
    const got = await registry.execute<any>(db, 'agent.get', { agentId: made.result.agentId }, ctx);
    const brief = await registry.execute<any>(db, 'brief.compile', { config: got.status === 'confirmed' ? got.result.draft : null }, ctx);
    if (got.status !== 'confirmed' || brief.status !== 'confirmed') throw new Error('brief: ' + JSON.stringify(brief));

    const cid = (await one<{ id: string }>(db, `INSERT INTO conversation (workspace_id, contact_id, channel, direction, status, run_manifest)
      VALUES ($1,$2,'test','outbound','live','{"test":true}') RETURNING id`, [ws, contact]))!.id;
    const ticket: CallTicket = {
      protocol: 1, conversationId: cid, attemptId: null, workspaceId: ws, direction: 'outbound',
      transport: { kind: 'sim', simCallerId: 'optout-e2e' },
      agent: { ...got.result.draft, versionHash: got.result.draftHash }, brief: brief.result,
      stack: { id: 'v2-flashlite', combinationId: combinationId(requireStack('v2-flashlite'), got.result.draft.voice?.voiceId), components: requireStack('v2-flashlite').components },
      contact: { displayName: 'Test Person', timezone: 'Asia/Kolkata', facts: {}, memoryBrief: '', memoryStatus: 'disabled' },
      consent: { basis: 'consent' }, limits: { maxDurationS: 120, maxCostInrMilli: 10_000 }, test: true,
    };
    const start = await runtime().start(ticket);
    assert.equal(start.accepted, true, JSON.stringify(start));
    const caller = await socket(`ws://${rt}/v1/media/sim/${cid}?token=${(start.join as { token: string }).token}`);
    assert.ok((await caller.next()).sentences?.length, 'she opens the call');
    caller.send({ t: 'say', text: line });

    const ended = await until('call.ended to reach calls', async () =>
      one<{ end_reason: string; reason_code: string | null; flags: string[] }>(db, `SELECT end_reason, reason_code, flags FROM conversation WHERE id = $1 AND status <> 'live'`, [cid]));
    await analysesSettled();
    caller.close();
    return { db, ws, cid, contact, ended };
  } finally {
    if (prev === undefined) delete process.env.VP_RUNTIME_SECRET; else process.env.VP_RUNTIME_SECRET = prev;
  }
}

/** Everything that must be true after a caller opts out mid-call. Throws on the first thing that is not. */
async function assertOptOutHonoured(r: Awaited<ReturnType<typeof optOutCall>>) {
  const { db, ws, cid, contact, ended } = r;
  assert.equal(ended.end_reason, 'opt_out', 'the runtime ends the call itself after an opt-out');
  assert.ok(ended.flags.includes('opt_out'), 'calls flags the conversation');
  const last = await one<{ text: string }>(db, "SELECT text FROM turn WHERE conversation_id = $1 AND speaker = 'agent' ORDER BY idx DESC LIMIT 1", [cid]);
  assert.match(last?.text ?? '', /call nahi aayega/i, 'her last line confirms they will not be called');
  const queued = await one<{ status: string; detail: string | null }>(db, 'SELECT status, detail FROM call_opt_out WHERE conversation_id = $1', [cid]);
  assert.ok(queued, 'calls queues the opt-out against the contact');
  assert.equal(queued!.status, 'applied', `the opt-out is applied (${queued!.status}: ${queued!.detail})`);
  const sup = await many<{ reason: string; source: string | null; scope: string }>(db, 'SELECT reason, source, scope FROM suppression WHERE workspace_id = $1 AND contact_id = $2', [ws, contact]);
  assert.deepEqual(sup.map(s => [s.reason, s.source, s.scope]), [['opt_out', 'in_call', 'workspace']], 'the contact is suppressed workspace-wide');
  const consent = await one<{ granted: boolean; basis: string }>(db, "SELECT granted, basis FROM consent_record WHERE contact_id = $1 AND source = 'in_call' ORDER BY created_at DESC LIMIT 1", [contact]);
  assert.deepEqual(consent, { granted: false, basis: 'withdrawal' }, 'a consent withdrawal is recorded');
}

const LINES = [
  'Dekhiye, mujhe dobara call mat karna, mera number list se hata do.',
  'Thirumba call pannaadheenga, en number-a list-la irundhu remove pannunga.',
  'Amake ar phone korben na, amar number ta list theke bad din.',
];

test('a mid-call opt-out is confirmed, ends the call, and suppresses the contact (runtime + calls + intake)', { skip, timeout: 120_000 }, async () => {
  for (const line of LINES) await assertOptOutHonoured(await optOutCall([calls, agents, intake], line));
});

test('the same check fails when the suppression step is missing (no contact.suppress_after_opt_out)', { skip, timeout: 60_000 }, async () => {
  const r = await optOutCall([calls, agents], LINES[0]);
  assert.equal(r.ended.end_reason, 'opt_out', 'the call side still works');
  await assert.rejects(assertOptOutHonoured(r), /applied|suppressed/, 'without the suppression step the end-to-end check must fail');
  const q = await one<{ status: string; detail: string | null }>(r.db, 'SELECT status, detail FROM call_opt_out WHERE conversation_id = $1', [r.cid]);
  assert.equal(q!.status, 'pending', 'the opt-out waits for the suppression step; it is never dropped');
  assert.equal((await many(r.db, 'SELECT 1 FROM suppression WHERE contact_id = $1', [r.contact])).length, 0);
});
