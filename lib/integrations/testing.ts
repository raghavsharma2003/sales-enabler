import { randomUUID } from "node:crypto";
import type { ExecutionRecord, IntegrationAction, IntegrationConnector, IntegrationExecutionStore } from "./contracts";

/** Test double only. Do not wire this class into application configuration. */
export class InMemoryExecutionStoreForTests implements IntegrationExecutionStore {
  private readonly records = new Map<string, ExecutionRecord>();
  async claim(action: IntegrationAction, acceptedAt: string): Promise<{ claimed: boolean; record: ExecutionRecord }> {
    const key = `${action.tenantId}:${action.integrationId}:${action.idempotencyKey}`;
    const existing = this.records.get(key);
    if (existing) return { claimed: false, record: { ...existing } };
    const record: ExecutionRecord = { executionId: randomUUID(), tenantId: action.tenantId, integrationId: action.integrationId, actionId: action.id, idempotencyKey: action.idempotencyKey, state: "accepted", acceptedAt, updatedAt: acceptedAt };
    this.records.set(key, record);
    return { claimed: true, record: { ...record } };
  }
  async transition(input: Parameters<IntegrationExecutionStore["transition"]>[0]): Promise<ExecutionRecord> {
    for (const [key, record] of this.records) {
      if (record.executionId !== input.executionId) continue;
      if (record.state !== input.from) throw new Error("Invalid integration execution transition.");
      const next: ExecutionRecord = { ...record, state: input.to, updatedAt: input.updatedAt, providerReference: input.providerReference, reason: input.reason };
      this.records.set(key, next);
      return { ...next };
    }
    throw new Error("Execution record was not found.");
  }
}

/** Connector stub only for contract tests. Its result sequence emulates provider acknowledgements. */
export class StubConnectorForTests implements IntegrationConnector {
  calls: IntegrationAction[] = [];
  constructor(readonly definition: IntegrationConnector["definition"], private readonly results: Array<Awaited<ReturnType<IntegrationConnector["dispatch"]>> | Error>) {}
  async dispatch(action: IntegrationAction) {
    this.calls.push(action);
    const result = this.results.shift() ?? { state: "confirmed" as const };
    if (result instanceof Error) throw result;
    return result;
  }
}
