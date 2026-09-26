import type { AuthUser } from '../server/auth';
import { db, type Database } from '../server/db';
import { HttpError } from '../server/http';

export type AiUsageSummary = {
  periodDays: number;
  completedRequests: number;
  uncertainRequests: number;
  pendingRequests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  daily: { date: string; requests: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null }[];
};

/** Public usage view contains aggregates only; stored prompts, replies and hashes never leave the server. */
export async function getAiUsage(user: AuthUser, periodDays = 30, database?: Database): Promise<AiUsageSummary> {
  if (!Number.isSafeInteger(periodDays) || periodDays < 1 || periodDays > 90) throw new HttpError(400, 'Choose a usage period from 1 to 90 days.');
  const store = database || await db();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - periodDays + 1);
  const rows = await store.all('SELECT status, data, created_at FROM entities WHERE organization_id = ? AND kind = ? AND created_at >= ? ORDER BY created_at DESC', [user.organizationId, 'ai:run', since.toISOString()]);
  const summary: AiUsageSummary = { periodDays, completedRequests: 0, uncertainRequests: 0, pendingRequests: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, daily: [] };
  const days = new Map<string, AiUsageSummary['daily'][number]>();
  for (const row of rows) {
    if (row.status === 'uncertain') { summary.uncertainRequests++; continue; }
    if (row.status === 'pending') { summary.pendingRequests++; continue; }
    if (row.status !== 'complete') continue;
    const data = JSON.parse(String(row.data)) as { inputTokens?: unknown; outputTokens?: unknown; estimatedCostUsd?: unknown };
    if (!Number.isSafeInteger(data.inputTokens) || !Number.isSafeInteger(data.outputTokens)) continue;
    const inputTokens = data.inputTokens as number, outputTokens = data.outputTokens as number;
    const date = String(row.created_at).slice(0, 10);
    const day = days.get(date) || { date, requests: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
    day.requests++; day.inputTokens += inputTokens; day.outputTokens += outputTokens;
    summary.completedRequests++; summary.inputTokens += inputTokens; summary.outputTokens += outputTokens;
    if (typeof data.estimatedCostUsd === 'number' && Number.isFinite(data.estimatedCostUsd) && data.estimatedCostUsd >= 0) {
      if (day.estimatedCostUsd !== null) day.estimatedCostUsd += data.estimatedCostUsd;
      if (summary.estimatedCostUsd !== null) summary.estimatedCostUsd += data.estimatedCostUsd;
    } else { day.estimatedCostUsd = null; summary.estimatedCostUsd = null; }
    days.set(date, day);
  }
  summary.daily = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
  if (summary.estimatedCostUsd !== null) summary.estimatedCostUsd = Math.round(summary.estimatedCostUsd * 1e9) / 1e9;
  for (const day of summary.daily) if (day.estimatedCostUsd !== null) day.estimatedCostUsd = Math.round(day.estimatedCostUsd * 1e9) / 1e9;
  return summary;
}
