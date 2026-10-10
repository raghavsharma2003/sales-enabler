import type { Database } from '../server/db';

export type UsageDependencies = { env?: Record<string, string | undefined>; database?: Database; now?: () => Date };
export type InferenceMode = 'hosted' | 'local' | 'test';
export type VoiceAttemptState = 'reserved' | 'connecting' | 'active' | 'stopping' | 'closed' | 'uncertain';
export type VoiceAttemptInput = { requestId: string; provider: 'azure'; purpose: 'private_webrtc' | 'audio_proof'; maxSeconds?: number };
export type VoiceAttemptRef = { id: string; organizationId: string };
export type VoiceStopOutcomeReason = 'confirmed' | 'not_allocated' | 'missing_reference' | 'owned_transport_required' | 'invalid_reference' | 'configuration_changed' | 'provider_unconfirmed' | 'transport_uncertain' | 'authority_changed' | 'unreported';
/** Server private. Never serialize this record into an API response. */
export type VoiceAttemptRecord = VoiceAttemptRef & {
  userId: string; provider: 'azure'; purpose: VoiceAttemptInput['purpose']; state: VoiceAttemptState;
  requestHash: string; createdAt: string; deadlineAt: string; maxSeconds: number;
  providerCallRef?: string; providerConfigurationDigest?: string; stopToken?: string; stopClaimedAt?: string; stopFromState?: VoiceAttemptState; closedAt?: string; stopAttempts?: number; nextStopAt?: string;
  cancelledBeforeReservation?: boolean;
  providerProvisioningStartedAt?: string;
  stopRequestedAt?: string;
  stopOutcomeReason?: VoiceStopOutcomeReason;
  stopHttpStatus?: number;
  stopOutcomeAt?: string;
  callRecord?: { kind: 'voice_preview' | 'voice_connection'; id: string };
};
export type VoiceAttemptReceipt = Pick<VoiceAttemptRecord, 'id' | 'deadlineAt' | 'state'> & { replayed: boolean };
export type UsageSnapshot = {
  date: string;
  access: { allowed: boolean; mode: InferenceMode; managedBy: 'platform_operator'; message: string };
  ai: { dailyTokenLimit: number; budgetTokensUsed: number; reservedTokens: number; reportedTokens: number; accounting: string };
  voice: { dailyAttemptLimit: number; attempts: number; dailyReservedSecondsLimit: number; reservedSeconds: number; live: number; userLiveLimit: number; organizationLiveLimit: number; supervision: { ready: boolean; lastHeartbeatAt: string | null }; accounting: string; attemptsSummary: Array<Pick<VoiceAttemptRecord, 'id' | 'purpose' | 'state' | 'createdAt' | 'deadlineAt' | 'maxSeconds'>> };
};
