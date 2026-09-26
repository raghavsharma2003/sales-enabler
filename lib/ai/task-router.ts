import { createHash } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, type Database, WriteConflictError } from '../server/db';
import { HttpError } from '../server/http';
import { normalizeAzureRealtimeEndpoint } from '../voice/config';
import { generateAzureText, type AzureTextResult } from './azure-text';

export type AiTask = 'extraction' | 'planning' | 'feedback' | 'evaluation' | 'answer';
export type AiTaskInput = { task: AiTask; requestId: string; system: string; input: string; maxOutputTokens?: number; responseFormat?: 'json_object' };
export type AiTaskResult = AzureTextResult & { runId: string; cached: boolean };

type Role = 'fast' | 'reasoning' | 'evaluation';
type RunData = {
  inputHash: string; requestHash: string; task: AiTask; model: string; role: Role;
  reservedTokens: number; text?: string; inputTokens?: number; outputTokens?: number;
  estimatedCostUsd?: number | null;
};
type Dependencies = { env?: Record<string, string | undefined>; database?: Database; fetch?: typeof fetch };

const taskPolicy: Record<AiTask, { role: Role; maxTokens: number }> = {
  extraction: { role: 'fast', maxTokens: 1600 },
  planning: { role: 'reasoning', maxTokens: 3000 },
  feedback: { role: 'fast', maxTokens: 1600 },
  evaluation: { role: 'evaluation', maxTokens: 1600 },
  answer: { role: 'fast', maxTokens: 1600 },
};
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const runIdFor = (organizationId: string, requestId: string) => `airun:${sha(JSON.stringify([organizationId, requestId]))}`;
const budgetIdFor = (organizationId: string, date: string) => `aibudget:${sha(JSON.stringify([organizationId, date]))}`;

function budgetLimit(env: Record<string, string | undefined>): number | undefined {
  const raw = env.AI_DAILY_ORG_TOKEN_BUDGET?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new HttpError(503, 'AI daily token budget is misconfigured.');
  return value;
}

function deployment(env: Record<string, string | undefined>, role: Role): string {
  const name = (role === 'fast' ? env.AZURE_OPENAI_FAST_DEPLOYMENT : role === 'reasoning' ? env.AZURE_OPENAI_REASONING_DEPLOYMENT : env.AZURE_OPENAI_EVALUATION_DEPLOYMENT)?.trim()
    || env.AZURE_OPENAI_TEXT_DEPLOYMENT?.trim() || 'gpt-4.1-mini';
  if (!/^[\w.-]{1,120}$/.test(name) || !normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT) || !env.AZURE_OPENAI_API_KEY?.trim())
    throw new HttpError(503, 'Configure the Azure text deployment before using this agent.');
  return name;
}

function priceFor(env: Record<string, string | undefined>, model: string, usage: AzureTextResult['usage']): number | null {
  const raw = env.AZURE_OPENAI_DEPLOYMENT_PRICES_JSON?.trim();
  if (!raw) return null;
  let prices: unknown;
  try { prices = JSON.parse(raw); } catch { throw new HttpError(503, 'Azure deployment prices are misconfigured.'); }
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new HttpError(503, 'Azure deployment prices are misconfigured.');
  const rate = (prices as Record<string, unknown>)[model];
  if (rate === undefined) return null;
  if (!rate || typeof rate !== 'object' || Array.isArray(rate)) throw new HttpError(503, 'Azure deployment prices are misconfigured.');
  const { inputUsdPerMillion, outputUsdPerMillion } = rate as Record<string, unknown>;
  if (typeof inputUsdPerMillion !== 'number' || typeof outputUsdPerMillion !== 'number' || !Number.isFinite(inputUsdPerMillion) || !Number.isFinite(outputUsdPerMillion) || inputUsdPerMillion < 0 || outputUsdPerMillion < 0)
    throw new HttpError(503, 'Azure deployment prices are misconfigured.');
  return Math.round(((usage.inputTokens * inputUsdPerMillion + usage.outputTokens * outputUsdPerMillion) / 1_000_000) * 1e9) / 1e9;
}

async function existingRun(database: Database, user: AuthUser, runId: string, inputHash: string): Promise<AiTaskResult> {
  const [row] = await database.all('SELECT status, data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [runId, user.organizationId, 'ai:run']);
  if (!row) throw new HttpError(409, 'AI request claim could not be confirmed. Do not retry with a new ID until reviewed.');
  const data = JSON.parse(String(row.data)) as RunData;
  if (data.inputHash !== inputHash) throw new HttpError(409, 'This request ID was already used for different AI input.');
  if (row.status !== 'complete') throw new HttpError(409, 'This AI request is pending or has an uncertain outcome. Do not retry it automatically.');
  if (typeof data.text !== 'string' || !Number.isSafeInteger(data.inputTokens) || !Number.isSafeInteger(data.outputTokens)) throw new HttpError(502, 'Saved AI receipt is incomplete.');
  return { runId, text: data.text, model: data.model, usage: { inputTokens: data.inputTokens!, outputTokens: data.outputTokens! }, cached: true };
}

/** One durable claim and at most one Azure attempt per tenant/request ID. */
export async function runAiTask(user: AuthUser, input: AiTaskInput, dependencies: Dependencies = {}): Promise<AiTaskResult> {
  const env = dependencies.env || process.env;
  const database = dependencies.database || await db();
  const policy = taskPolicy[input.task];
  if (!policy) throw new HttpError(400, 'Unknown AI task.');
  if (typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 160 || /[\x00-\x1f]/.test(input.requestId)) throw new HttpError(400, 'A bounded request ID is required.');
  if (typeof input.system !== 'string' || typeof input.input !== 'string' || !input.input.trim() || input.system.length > 12000 || input.input.length > 12000) throw new HttpError(400, 'AI input exceeds the 12,000-character chunk limit.');
  if (input.responseFormat !== undefined && input.responseFormat !== 'json_object') throw new HttpError(400, 'Unsupported AI response format.');
  const maxTokens = input.maxOutputTokens ?? policy.maxTokens;
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 64 || maxTokens > policy.maxTokens) throw new HttpError(400, 'Output token limit exceeds the task budget.');
  const inputHash = sha(JSON.stringify([input.task, input.system, input.input, maxTokens, input.responseFormat || null]));
  const runId = runIdFor(user.organizationId, input.requestId);
  const [previous] = await database.all('SELECT id FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [runId, user.organizationId, 'ai:run']);
  if (previous) return existingRun(database, user, runId, inputHash);
  const model = deployment(env, policy.role);
  const limit = budgetLimit(env);
  // Validate rate configuration before claiming the request.
  priceFor(env, model, { inputTokens: 0, outputTokens: 0 });
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const reservedTokens = Buffer.byteLength(input.system, 'utf8') + Buffer.byteLength(input.input, 'utf8') + maxTokens + 128;
  if (!Number.isSafeInteger(reservedTokens)) throw new HttpError(400, 'AI input is too large.');
  const claim: RunData = { inputHash, requestHash: sha(input.requestId), task: input.task, model, role: policy.role, reservedTokens };
  const budgetId = budgetIdFor(user.organizationId, date);
  if (limit !== undefined) {
    await database.run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', [budgetId, user.organizationId, 'ai:budget', 'active', '0', now]);
  }
  try {
    await database.batch([
      { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [runId, user.organizationId, 'ai:run', 'pending', JSON.stringify(claim), now] },
      ...(limit === undefined ? [] : [{ sql: 'UPDATE entities SET data = CAST(CAST(data AS BIGINT) + ? AS TEXT) WHERE id = ? AND organization_id = ? AND kind = ? AND CAST(data AS BIGINT) + ? <= ?', params: [reservedTokens, budgetId, user.organizationId, 'ai:budget', reservedTokens, limit], expectedChanges: 1 }]),
    ]);
  } catch (error) {
    const [row] = await database.all('SELECT id FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [runId, user.organizationId, 'ai:run']);
    if (row) return existingRun(database, user, runId, inputHash);
    if (error instanceof WriteConflictError) throw new HttpError(429, 'This workspace has reached its daily AI token budget.');
    throw error;
  }
  let result: AzureTextResult;
  try {
    result = await generateAzureText({ system: input.system, user: input.input, model, maxOutputTokens: maxTokens, responseFormat: input.responseFormat }, { env, fetch: dependencies.fetch });
  } catch (error) {
    await database.run('UPDATE entities SET status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', ['uncertain', runId, user.organizationId, 'ai:run', 'pending']);
    throw error;
  }
  const actualTokens = result.usage.inputTokens + result.usage.outputTokens;
  const completed: RunData = { ...claim, text: result.text, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, estimatedCostUsd: priceFor(env, model, result.usage) };
  const refund = Math.max(0, reservedTokens - actualTokens);
  const overage = Math.max(0, actualTokens - reservedTokens);
  try {
    await database.batch([
      { sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: ['complete', JSON.stringify(completed), runId, user.organizationId, 'ai:run', 'pending', JSON.stringify(claim)], expectedChanges: 1 },
      ...(limit === undefined ? [] : [{ sql: 'UPDATE entities SET data = CAST(CAST(data AS BIGINT) + ? AS TEXT) WHERE id = ? AND organization_id = ? AND kind = ?', params: [overage - refund, budgetId, user.organizationId, 'ai:budget'], expectedChanges: 1 }]),
    ]);
  } catch {
    throw new HttpError(503, 'AI reply completed but its receipt could not be saved. Do not retry with a new ID until reviewed.');
  }
  return { ...result, runId, cached: false };
}
