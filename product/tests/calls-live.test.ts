// Calls' live tools across two real processes: this control plane (calls + agents, POST /hooks/runtime) and the voice
// runtime's development server (python -m vpvoice.devsim: the real HTTP surface, signing, door and events, with fake
// ears/brain/voice and no keys). A sim call is placed through HttpRuntime, joined over the sim socket, whispered to
// (an A2 approval), refused a listen (sim has no audio), taken over by a person, and hung up by them. The runtime's own
// signed event batches then land in calls' ingest.
// Skipped without DATABASE_URL, or without a Python that has the runtime's requirements (set VP_VOICE_PYTHON, e.g. a
// venv made with `pip install -r product/voice/requirements.txt`). Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer as netServer, type AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import { HttpRuntime, setRuntime } from '../server/runtime-client.ts';
import type { Registry } from '../server/tools.ts';
import type { CallTicket } from '../shared/runtime-protocol.ts';
import { combinationId, requireStack } from '../shared/stacks.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';

const VOICE = join(dirname(fileURLToPath(import.meta.url)), '..', 'voice');
const PY = process.env.VP_VOICE_PYTHON ?? 'python3';
const hasRuntimeDeps = () => spawnSync(PY, ['-c', 'import aiohttp, numpy'], { cwd: VOICE }).status === 0;
const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set'
  : !hasRuntimeDeps() ? `no Python with the voice runtime's requirements (${PY}); set VP_VOICE_PYTHON` : false;
const SECRET = 'calls-live-test-secret-'.padEnd(40, 'z');

let pool: pg.Pool, server: Server, registry: Registry, runtimeProc: ChildProcess | undefined, rt = '';
let savedSecret: string | undefined;

const freePort = () => new Promise<number>((res, rej) => {
  const s = netServer().once('error', rej).listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => res(p)); });
});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(what: string, f: () => Promise<T | null | undefined | false>, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}
/** A websocket that queues JSON messages so none is missed between awaits. */
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

before(async () => {
  if (skip) return;
  savedSecret = process.env.VP_RUNTIME_SECRET;
  process.env.VP_RUNTIME_SECRET = SECRET;
  pool = createPool(process.env.DATABASE_URL);
  const app = buildApp(pool, [calls, agents]);
  registry = app.registry; server = app.server;
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const control = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const port = await freePort();
  rt = `127.0.0.1:${port}`;
  runtimeProc = spawn(PY, ['-m', 'vpvoice.devsim'], { cwd: VOICE, stdio: 'ignore',
    env: { ...process.env, VP_DEVSIM: '1', VP_RUNTIME_SECRET: SECRET, VP_CONTROL_URL: control, PORT: String(port), VP_LOG_LEVEL: 'WARNING' } });
  await until('the dev runtime', async () => (await fetch(`http://${rt}/v1/health`)).ok);
  setRuntime(new HttpRuntime(`http://${rt}`, SECRET));
});

after(async () => {
  if (skip) return;
  setRuntime(null); setFakeLlm(null);
  runtimeProc?.kill('SIGTERM');
  await Promise.race([new Promise(r => runtimeProc?.once('exit', r)), sleep(3000)]);
  if (runtimeProc && runtimeProc.exitCode === null) runtimeProc.kill('SIGKILL');
  await analysesSettled();
  await new Promise(r => server?.close(r));
  await pool?.end();
  if (savedSecret === undefined) delete process.env.VP_RUNTIME_SECRET; else process.env.VP_RUNTIME_SECRET = savedSecret;
});

test('live tools against the real runtime: whisper (approved), listen refused on sim, a person takes over and hangs up', { skip, timeout: 60_000 }, async () => {
  setFakeLlm(req => ({ text: JSON.stringify({ points: [], moments: [], reasonCode: null, outcome: null }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('calls live test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };

  // A real agent config and brief, from the agents module's own tools.
  const made = await registry.execute<any>(pool, 'agent.create', { name: 'Live test', templateId: 'insurance-renewal' }, ctx);
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  if (made.status !== 'confirmed') return;
  assert.equal((await registry.execute(pool, 'stack.set', { agentId: made.result.agentId, stackId: 'v2-flashlite' }, ctx)).status, 'confirmed');
  const got = await registry.execute<any>(pool, 'agent.get', { agentId: made.result.agentId }, ctx);
  const brief = await registry.execute<any>(pool, 'brief.compile', { config: got.status === 'confirmed' ? got.result.draft : null }, ctx);
  assert.equal(brief.status, 'confirmed', JSON.stringify(brief));
  if (got.status !== 'confirmed' || brief.status !== 'confirmed') return;

  const cid = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, channel, direction, status, run_manifest) VALUES ($1,'test','outbound','live','{"test":true}') RETURNING id`, [ws]))!.id;
  const ticket: CallTicket = {
    protocol: 1, conversationId: cid, attemptId: null, workspaceId: ws, direction: 'outbound',
    transport: { kind: 'sim', simCallerId: 'calls-live-test' },
    agent: { ...got.result.draft, versionHash: got.result.draftHash }, brief: brief.result,
    stack: { id: 'v2-flashlite', combinationId: combinationId(requireStack('v2-flashlite'), got.result.draft.voice?.voiceId) },
    contact: { displayName: '', timezone: 'Asia/Kolkata', facts: {}, memoryBrief: '', memoryStatus: 'disabled' },
    consent: { basis: 'consent' }, limits: { maxDurationS: 120, maxCostInrMilli: 10_000 }, test: true,
  };
  const start = await (await import('../server/runtime-client.ts')).runtime().start(ticket);
  assert.equal(start.accepted, true, JSON.stringify(start));
  const tok = (start.join as { token: string }).token;

  // Before anyone joins, a live control is refused with the runtime's own reason.
  const early = await registry.execute(pool, 'live.listen', { conversationId: cid }, ctx);
  assert.equal(early.status, 'not_executed');
  assert.match(early.status === 'not_executed' ? early.reason : '', /refused to open a listen session: call is not joined/);

  const caller = await socket(`ws://${rt}/v1/media/sim/${cid}?token=${tok}`);
  const opening = await caller.next();
  assert.ok(opening.sentences?.length, 'she opens the call');
  caller.send({ t: 'say', text: 'Haan boliye, kya baat hai?' });
  await caller.next();

  const listen = await registry.execute(pool, 'live.listen', { conversationId: cid }, ctx);
  assert.equal(listen.status, 'not_executed');
  assert.match(listen.status === 'not_executed' ? listen.reason : '', /a sim call has no audio to listen to/);

  const proposed = await registry.execute(pool, 'live.whisper', { conversationId: cid, text: 'Renewal date 5 November hai' }, ctx);
  assert.equal(proposed.status, 'needs_approval');
  if (proposed.status !== 'needs_approval') return;
  const whispered = await registry.approve(pool, proposed.actionId, { workspaceId: ws, memberId: owner });
  assert.equal(whispered.status, 'confirmed', JSON.stringify(whispered));

  const took = await registry.execute<any>(pool, 'live.takeover', { conversationId: cid }, ctx);
  assert.equal(took.status, 'confirmed', JSON.stringify(took));
  if (took.status !== 'confirmed') return;
  assert.equal(took.result.join.kind, 'takeover');
  const member = await socket(`ws://${rt}/v1/media/takeover/${cid}?token=${took.result.join.token}`);
  assert.equal((await member.next()).t, 'ready');
  member.send({ t: 'say', text: 'Namaste, main Priya bol rahi hoon.' });
  caller.send({ t: 'say', text: 'Ji, boliye.' });
  member.send({ t: 'hangup' });

  const ended = await until('call.ended to reach calls', async () =>
    one<{ end_reason: string; reason_code: string; flags: string[] }>(pool, `SELECT end_reason, reason_code, flags FROM conversation WHERE id = $1 AND status <> 'live'`, [cid]));
  await analysesSettled();
  caller.close(); member.close();

  assert.equal(ended.end_reason, 'handed_off');
  assert.equal(ended.reason_code, 'END_HANDED_OFF');
  assert.ok(ended.flags.includes('human_joined'), 'the take-over hand-off marks a person joined');
  assert.ok(!ended.flags.includes('safety'), 'no supervisor action is a safety signal');
  const moments = (await many<{ kind: string; note: string | null }>(pool, "SELECT kind, note FROM call_moment WHERE conversation_id = $1 AND source = 'runtime' ORDER BY at_ms", [cid]));
  assert.ok(moments.some(m => m.kind === 'whisper' && !m.note), 'the whisper is a moment without its text');
  assert.ok(moments.some(m => m.kind === 'takeover'));
  assert.ok(!JSON.stringify(moments).includes('Renewal date'), 'the whisper text never reaches the call record');
  const ho = await one<{ destination: string; brief: { reason: string } }>(pool, 'SELECT destination, brief FROM hand_off WHERE conversation_id = $1', [cid]);
  assert.equal(ho!.destination, `member:${owner}`); assert.equal(ho!.brief.reason, 'takeover');
  const turns = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM turn WHERE conversation_id = $1 AND speaker = 'caller'", [cid]);
  assert.ok(turns!.n >= 1, 'caller turns arrived through the signed hook');
});
