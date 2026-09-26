import { randomUUID } from "node:crypto";
import type {
  DispatchResult, ExecutionRecord, IntegrationAction, IntegrationConnectionStore,
  IntegrationConnector, IntegrationExecutionStore,
} from "./contracts";
import { preflightAction, type PreflightDenial } from "./policy";

export class IntegrationPolicyError extends Error {
  constructor(readonly denial: PreflightDenial) { super(`Integration action denied: ${denial}`); }
}
export class VoiceProposalScopeError extends Error {}

export interface IntegrationExecutorDependencies {
  connections: IntegrationConnectionStore;
  executions: IntegrationExecutionStore;
  connector: IntegrationConnector;
  now?: () => Date;
}

export class IntegrationExecutor {
  private readonly now: () => Date;
  constructor(private readonly dependencies: IntegrationExecutorDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async execute(action: IntegrationAction): Promise<ExecutionRecord> {
    const connection = await this.dependencies.connections.get(action.connectionId);
    const permitted = preflightAction(action, connection, this.dependencies.connector.definition);
    if (!permitted.allowed) throw new IntegrationPolicyError(permitted.denial);

    const acceptedAt = this.now().toISOString();
    const claimed = await this.dependencies.executions.claim(action, acceptedAt);
    // Replays never dispatch. This includes uncertain executions: they require reconciliation,
    // a human decision, and a new explicitly approved action if a resend is appropriate.
    if (!claimed.claimed) return claimed.record;

    let result: DispatchResult;
    try {
      result = await this.dependencies.connector.dispatch(action);
    } catch {
      // A thrown transport/provider error cannot establish whether the provider acted.
      result = { state: "uncertain", reason: "Provider response was unavailable; reconcile before any retry." };
    }
    return this.dependencies.executions.transition({
      executionId: claimed.record.executionId,
      from: "accepted",
      to: result.state,
      updatedAt: this.now().toISOString(),
      providerReference: result.providerReference,
      reason: result.state === "confirmed" ? undefined : result.reason,
    });
  }
}

/** Turns a voice result into an unapproved proposal. It has no path to dispatch. */
export function actionFromVoiceProposal(proposal: import("./contracts").VoiceToolProposal): IntegrationAction {
  if (proposal.tenantId !== proposal.action.tenantId) throw new VoiceProposalScopeError("Voice proposal tenant does not match its action tenant.");
  return {
    ...proposal.action,
    id: randomUUID(),
    approval: { state: "pending" },
    proposedBy: "voice",
    proposedAt: new Date().toISOString(),
  };
}
