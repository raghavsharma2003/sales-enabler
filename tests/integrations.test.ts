import assert from "node:assert/strict";
import test from "node:test";
import { actionFromVoiceProposal, IntegrationExecutor, IntegrationPolicyError, VoiceProposalScopeError } from "../lib/integrations/executor";
import { assessFreshness, type ConnectorDefinition, type IntegrationAction, type IntegrationConnection } from "../lib/integrations/contracts";
import { InMemoryExecutionStoreForTests, StubConnectorForTests } from "../lib/integrations/testing";

const definition: ConnectorDefinition = { id: "test-mail", displayName: "Test mail", availability: "test-only", capabilities: ["send"], supportedChannels: ["email"], description: "Contract test connector." };
const connection = (changes: Partial<IntegrationConnection> = {}): IntegrationConnection => ({
  id: "connection-1", integrationId: "test-mail", tenantId: "tenant-a", status: "active", grantedCapabilities: ["send"], grantedChannels: ["email"], consent: { state: "granted", capturedAt: "2026-01-01T00:00:00.000Z" }, ...changes,
});
const action = (changes: Partial<IntegrationAction> = {}): IntegrationAction => ({
  id: "action-1", tenantId: "tenant-a", integrationId: "test-mail", connectionId: "connection-1", capability: "send", channel: "email", payload: { subject: "Hello" }, idempotencyKey: "follow-up-1", approval: { state: "approved", approvedBy: "operator-1", approvedAt: "2026-01-01T00:00:00.000Z" }, proposedBy: "operator", proposedAt: "2026-01-01T00:00:00.000Z", ...changes,
});
function executor(conn = connection(), results: ConstructorParameters<typeof StubConnectorForTests>[1] = [{ state: "confirmed", providerReference: "message-1" }]) {
  const connector = new StubConnectorForTests(definition, results);
  return { connector, executor: new IntegrationExecutor({ connections: { get: async () => conn }, executions: new InMemoryExecutionStoreForTests(), connector, now: () => new Date("2026-01-02T00:00:00.000Z") }) };
}

test("idempotency claim prevents duplicate sends", async () => {
  const setup = executor();
  const first = await setup.executor.execute(action());
  const second = await setup.executor.execute(action({ id: "action-2" }));
  assert.equal(first.state, "confirmed");
  assert.equal(second.executionId, first.executionId);
  assert.equal(setup.connector.calls.length, 1);
});

test("ambiguous provider result is durable uncertain and is never blindly replayed", async () => {
  const setup = executor(connection(), [{ state: "uncertain", reason: "request timed out after provider accepted the body" }]);
  const first = await setup.executor.execute(action());
  const retry = await setup.executor.execute(action({ id: "new-local-action-id" }));
  assert.equal(first.state, "uncertain");
  assert.match(first.reason ?? "", /reconcile|timed out/i);
  assert.equal(retry.state, "uncertain");
  assert.equal(setup.connector.calls.length, 1);
});

test("tenant mismatch is rejected before execution", async () => {
  const setup = executor(connection({ tenantId: "tenant-b" }));
  await assert.rejects(() => setup.executor.execute(action()), (error: unknown) => error instanceof IntegrationPolicyError && error.denial === "tenant-mismatch");
  assert.equal(setup.connector.calls.length, 0);
});

test("an overlapping capability on a different connector cannot dispatch the action", async () => {
  const wrongDefinition: ConnectorDefinition = { ...definition, id: "different-mail" };
  const connector = new StubConnectorForTests(wrongDefinition, [{ state: "confirmed" }]);
  const executorUnderTest = new IntegrationExecutor({
    connections: { get: async () => connection() },
    executions: new InMemoryExecutionStoreForTests(),
    connector,
  });
  await assert.rejects(() => executorUnderTest.execute(action()), (error: unknown) => error instanceof IntegrationPolicyError && error.denial === "connector-mismatch");
  assert.equal(connector.calls.length, 0);
});

test("send actions require an explicit consented channel", async () => {
  const setup = executor();
  await assert.rejects(() => setup.executor.execute(action({ channel: undefined })), (error: unknown) => error instanceof IntegrationPolicyError && error.denial === "channel-required");
  assert.equal(setup.connector.calls.length, 0);
});

test("revoked consent prevents channel actions even with a previous approval", async () => {
  const setup = executor(connection({ consent: { state: "revoked", capturedAt: "2026-01-01T00:00:00.000Z", revokedAt: "2026-01-02T00:00:00.000Z" } }));
  await assert.rejects(() => setup.executor.execute(action()), (error: unknown) => error instanceof IntegrationPolicyError && error.denial === "consent-not-granted");
  assert.equal(setup.connector.calls.length, 0);
});

test("freshness treats malformed and future provenance as unknown", () => {
  const base = { tenantId: "tenant-a", recordType: "contact", field: "email", source: "crm", authorityRank: 1, observedAt: "2026-01-02T00:00:00.000Z" };
  const now = new Date("2026-01-03T00:00:00.000Z");
  assert.equal(assessFreshness({ ...base, expiresAt: "not-a-date" }, now), "unknown");
  assert.equal(assessFreshness({ ...base, sourceUpdatedAt: "not-a-date" }, now), "unknown");
  assert.equal(assessFreshness({ ...base, observedAt: "2026-01-04T00:00:00.000Z" }, now), "unknown");
});

test("voice proposals cannot smuggle an action across tenants", () => {
  const candidate = action();
  const { id: _id, approval: _approval, proposedBy: _proposedBy, proposedAt: _proposedAt, ...voiceAction } = candidate;
  assert.throws(() => actionFromVoiceProposal({ tenantId: "tenant-b", actorId: "operator-1", action: voiceAction, evidence: { conversationId: "conversation-1", turnId: "turn-1", transcriptReference: "stored-transcript" } }), VoiceProposalScopeError);
});
