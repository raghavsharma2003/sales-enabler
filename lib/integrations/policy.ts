import type { ConnectorDefinition, IntegrationAction, IntegrationConnection } from "./contracts";

export type PreflightDenial =
  | "tenant-mismatch"
  | "connector-mismatch"
  | "connection-inactive"
  | "consent-not-granted"
  | "approval-not-explicit"
  | "unknown-capability"
  | "capability-not-granted"
  | "channel-not-supported"
  | "channel-not-consented"
  | "channel-required"
  | "missing-idempotency-key";

export type PreflightResult = { allowed: true } | { allowed: false; denial: PreflightDenial };

/** Pure policy boundary, so the same decision is available to APIs, voice tools, and jobs. */
export function preflightAction(
  action: IntegrationAction,
  connection: IntegrationConnection | undefined,
  definition: ConnectorDefinition | undefined,
): PreflightResult {
  if (!action.idempotencyKey.trim() || action.idempotencyKey.length > 200) return { allowed: false, denial: "missing-idempotency-key" };
  if (!connection || connection.tenantId !== action.tenantId) return { allowed: false, denial: "tenant-mismatch" };
  if (connection.integrationId !== action.integrationId || connection.status !== "active") return { allowed: false, denial: "connection-inactive" };
  if (!definition || definition.id !== action.integrationId) return { allowed: false, denial: "connector-mismatch" };
  if (connection.consent.state !== "granted") return { allowed: false, denial: "consent-not-granted" };
  if (action.approval.state !== "approved" || !action.approval.approvedAt || !action.approval.approvedBy) return { allowed: false, denial: "approval-not-explicit" };
  if (!definition.capabilities.includes(action.capability)) return { allowed: false, denial: "unknown-capability" };
  if (!connection.grantedCapabilities.includes(action.capability)) return { allowed: false, denial: "capability-not-granted" };
  if ((action.capability === "send" || action.capability === "schedule") && !action.channel) return { allowed: false, denial: "channel-required" };
  if (action.channel && !definition.supportedChannels.includes(action.channel)) return { allowed: false, denial: "channel-not-supported" };
  if (action.channel && !connection.grantedChannels.includes(action.channel)) return { allowed: false, denial: "channel-not-consented" };
  return { allowed: true };
}
