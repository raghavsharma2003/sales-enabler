export type Channel = 'telegram' | 'whatsapp';
export type ChannelThread = {
  id: string; deploymentId: string; channel: Channel; connectionId: string; authorizationVersion: string;
  identity: string; participant: string; identityVerified: false; mode: 'ai' | 'human' | 'stopped';
  lastInboundAt: string; updatedAt: string; activeJobId?: string; inboxThreadId?: string;
};
export type ChannelJob = {
  id: string; threadId: string; deploymentId: string; channel: Channel; connectionId: string;
  authorizationVersion: string; identity: string; participant: string; providerEventId: string;
  text: string; receivedAt: string; providerAt: string; expiresAt: string; inputDigest: string;
  state: 'queued' | 'generating' | 'sending' | 'accepted' | 'rejected' | 'uncertain' | 'cancelled';
  claimedAt?: string; dispatchAt?: string; answer?: string; providerId?: string; reason?: string;
  aiRunId?: string; publicKnowledgeIds?: string[]; versionId?: string; inboxThreadId?: string;
  author?: 'operator';
  deploymentRevision?: number;
  autoLearning?: boolean;
  activeSlotId?: string;
  runtimeEvidence?: import('../voice/relational-runtime').RelationalRuntime;
};
