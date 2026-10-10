import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { runAiTask } from '../lib/ai/task-router';
import { getAiUsage } from '../lib/ai/usage';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ai-task-router-')), 'test.sqlite');
const env = { NODE_ENV: 'test', AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/openai/v1', AZURE_OPENAI_API_KEY: 'server-only', AZURE_OPENAI_TEXT_DEPLOYMENT: 'existing-mini' };
const input = (requestId: string, task: 'answer' | 'planning' = 'answer') => ({ task, requestId, system: 'Context.', input: 'Reply.', maxOutputTokens: 64 });
const reply = () => Response.json({ choices: [{ message: { content: 'Ready.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 18, completion_tokens: 7 } });

async function user(): Promise<AuthUser> {
  const store = await db(); const id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  await store.batch([
    { sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', params: [organizationId, 'Test', now] },
    { sql: 'INSERT INTO users (id, email, password_hash, organization_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, `${id}@example.test`, 'none', organizationId, now] },
  ]);
  return { id, organizationId, email: `${id}@example.test` };
}

test('task routing chooses explicit Azure roles and caches a completed request', async () => {
  const owner = await user(); let calls = 0;
  const fetcher = (async (_url: string, init: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'reasoning-slot');
    assert.equal(body.max_completion_tokens, 64);
    return reply();
  }) as typeof fetch;
  const settings = { env: { ...env, AZURE_OPENAI_REASONING_DEPLOYMENT: 'reasoning-slot' }, fetch: fetcher };
  const first = await runAiTask(owner, input('route-1', 'planning'), settings);
  const replay = await runAiTask(owner, input('route-1', 'planning'), { env: { NODE_ENV: 'test' } });
  assert.equal(first.cached, false);
  assert.equal(replay.cached, true);
  assert.equal(first.runId, replay.runId);
  assert.equal(calls, 1);
  await assert.rejects(runAiTask(owner, { ...input('route-1', 'planning'), input: 'Changed.' }, settings), /different AI input/);
  const usage = await getAiUsage(owner);
  assert.equal(usage.completedRequests, 1);
  assert.equal(usage.inputTokens, 18);
  assert.equal(usage.estimatedCostUsd, null);
  assert.equal(JSON.stringify(usage).includes('Ready.'), false);
});

test('concurrent claim and tenant scope prevent replay and cross-tenant visibility', async () => {
  const owner = await user(), other = await user(); let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetcher = (async () => { calls++; await gate; return reply(); }) as typeof fetch;
  const first = runAiTask(owner, input('same-id'), { env, fetch: fetcher });
  // The first Azure fetch starts only after its claim commits.
  while (!calls) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(runAiTask(owner, input('same-id'), { env, fetch: fetcher }), /pending or has an uncertain outcome/);
  assert.equal((await getAiUsage(other)).completedRequests, 0);
  release();
  await first;
  await runAiTask(other, input('same-id'), { env, fetch: (async () => reply()) as typeof fetch });
  assert.equal((await getAiUsage(other)).completedRequests, 1);
  assert.equal(calls, 1);
});

test('daily budget reservations fence concurrent claims and refund unused tokens', async () => {
  const owner = await user(); let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const budgetEnv = { ...env, AI_DAILY_ORG_TOKEN_BUDGET: '240' };
  const first = runAiTask(owner, input('budget-1'), { env: budgetEnv, fetch: (async () => { calls++; await gate; return reply(); }) as typeof fetch });
  while (!calls) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(runAiTask(owner, input('budget-2'), { env: budgetEnv, fetch: (async () => { calls++; return reply(); }) as typeof fetch }), /daily AI token budget/);
  assert.equal(calls, 1);
  release(); await first;
  await runAiTask(owner, input('budget-2'), { env: budgetEnv, fetch: (async () => { calls++; return reply(); }) as typeof fetch });
  assert.equal(calls, 2);
});

test('provider error is redacted and leaves an uncertain request with no retry', async () => {
  const owner = await user(); let calls = 0;
  const settings = { env, fetch: (async () => { calls++; throw new Error('private upstream key'); }) as typeof fetch };
  await assert.rejects(runAiTask(owner, input('error-1'), settings), error => error instanceof Error && !error.message.includes('private') && /No automatic retry/.test(error.message));
  await assert.rejects(runAiTask(owner, input('error-1'), settings), /uncertain outcome/);
  assert.equal(calls, 1);
  const usage = await getAiUsage(owner);
  assert.equal(usage.uncertainRequests, 1);
  assert.equal(usage.completedRequests, 0);
});
