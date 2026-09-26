/**
 * Provider-neutral contracts for actions that leave this product.
 *
 * These types intentionally contain neither provider SDK objects nor credentials.
 * A concrete adapter can be installed later only after its capability and policy
 * requirements have been declared in the registry.
 */

export type IntegrationId = string;
export type TenantId = string;
export type Channel = "email" | "sms" | "whatsapp" | "phone" | "crm" | "calendar" | "document";
export type ConnectorCapability = "read" | "write" | "send" | "schedule" | "lookup" | "reconcile";

export interface ConnectorDefinition {
  id: IntegrationId;
  displayName: string;
  /** `planned` means no executable adapter exists. `test-only` can never be selected by application configuration. */
  availability: "planned" | "test-only" | "live";
  capabilities: readonly ConnectorCapability[];
  supportedChannels: readonly Channel[];
  description: string;
}

export interface IntegrationConnection {
  id: string;
  integrationId: IntegrationId;
  tenantId: TenantId;
  status: "active" | "revoked" | "disabled";
  grantedCapabilities: readonly ConnectorCapability[];
  grantedChannels: readonly Channel[];
  consent: {
    state: "granted" | "revoked" | "expired";
    capturedAt: string;
    revokedAt?: string;
  };
}

export interface ExplicitApproval {
  state: "approved" | "pending" | "rejected" | "revoked";
  approvedBy?: string;
  approvedAt?: string;
}

export interface IntegrationAction {
  id: string;
  tenantId: TenantId;
  integrationId: IntegrationId;
  connectionId: string;
  capability: ConnectorCapability;
  /** Set for actions that reach a person or a channel-specific external system. */
  channel?: Channel;
  payload: Readonly<Record<string, unknown>>;
  idempotencyKey: string;
  approval: ExplicitApproval;
  proposedBy: "operator" | "voice" | "automation";
  proposedAt: string;
}

/** A voice conversation can create a proposal, but it cannot self-approve or execute it. */
export interface VoiceToolProposal {
  tenantId: TenantId;
  actorId: string;
  action: Omit<IntegrationAction, "id" | "approval" | "proposedBy" | "proposedAt">;
  evidence: { conversationId: string; turnId: string; transcriptReference: string };
}

export type ExecutionState = "accepted" | "confirmed" | "uncertain" | "failed";

export interface ExecutionRecord {
  executionId: string;
  tenantId: TenantId;
  integrationId: IntegrationId;
  actionId: string;
  idempotencyKey: string;
  state: ExecutionState;
  acceptedAt: string;
  updatedAt: string;
  providerReference?: string;
  /** A safe operator-facing reason; never store provider secrets or raw credentials. */
  reason?: string;
}

export type DispatchResult =
  | { state: "confirmed"; providerReference?: string }
  | { state: "uncertain"; reason: string; providerReference?: string }
  | { state: "failed"; reason: string; providerReference?: string };

export interface IntegrationConnector {
  readonly definition: ConnectorDefinition;
  dispatch(action: IntegrationAction): Promise<DispatchResult>;
}

/**
 * The execution layer needs an atomic, durable idempotency claim. Production
 * implementations must use persistent transactional storage with a unique key
 * on (tenantId, integrationId, idempotencyKey). An in-memory store is test-only.
 */
export interface IntegrationExecutionStore {
  claim(action: IntegrationAction, acceptedAt: string): Promise<{ claimed: boolean; record: ExecutionRecord }>;
  transition(input: {
    executionId: string;
    from: "accepted";
    to: Exclude<ExecutionState, "accepted">;
    updatedAt: string;
    providerReference?: string;
    reason?: string;
  }): Promise<ExecutionRecord>;
}

export interface IntegrationConnectionStore {
  get(connectionId: string): Promise<IntegrationConnection | undefined>;
}

export interface DataAuthorityClaim {
  tenantId: TenantId;
  recordType: string;
  field: string;
  source: string;
  /** Higher rank wins only when fresh enough; ties require review. */
  authorityRank: number;
  observedAt: string;
  sourceUpdatedAt?: string;
  expiresAt?: string;
  /** Optional source-specific freshness window. Omit only for data that has no expected expiry. */
  maxAgeMs?: number;
  valueVersion?: string;
}

export type FreshnessDecision = "fresh" | "stale" | "expired" | "unknown";
export type ConflictDecision = "incoming-wins" | "stored-wins" | "needs-review";

export function assessFreshness(claim: DataAuthorityClaim, now = new Date()): FreshnessDecision {
  const observed = Date.parse(claim.observedAt);
  if (Number.isNaN(observed)) return "unknown";
  if (observed > now.getTime()) return "unknown";
  if (claim.sourceUpdatedAt && Number.isNaN(Date.parse(claim.sourceUpdatedAt))) return "unknown";
  if (claim.expiresAt) {
    const expires = Date.parse(claim.expiresAt);
    if (Number.isNaN(expires)) return "unknown";
    if (expires <= now.getTime()) return "expired";
  }
  if (claim.maxAgeMs !== undefined) {
    if (!Number.isFinite(claim.maxAgeMs) || claim.maxAgeMs < 0) return "unknown";
    if (observed + claim.maxAgeMs < now.getTime()) return "stale";
  }
  return "fresh";
}

/** Never silently merge equal-authority conflicting values. */
export function decideConflict(stored: DataAuthorityClaim, incoming: DataAuthorityClaim, now = new Date()): ConflictDecision {
  if (stored.tenantId !== incoming.tenantId || stored.recordType !== incoming.recordType || stored.field !== incoming.field) {
    return "needs-review";
  }
  if (assessFreshness(incoming, now) !== "fresh") return "stored-wins";
  if (assessFreshness(stored, now) !== "fresh") return "incoming-wins";
  if (incoming.authorityRank > stored.authorityRank) return "incoming-wins";
  if (incoming.authorityRank < stored.authorityRank) return "stored-wins";
  if (incoming.valueVersion && stored.valueVersion && incoming.valueVersion === stored.valueVersion) return "stored-wins";
  return "needs-review";
}
