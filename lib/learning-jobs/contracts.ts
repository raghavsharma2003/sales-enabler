export type IssuedLearningDeployment = { id: string; revision: number; autoLearning: boolean };
export type LearningJobStatus = 'queued' | 'claimed' | 'inference' | 'ready' | 'cancelled' | 'uncertain';
export type LearningJob = {
  id: string; sessionId: string; deploymentId: string; deploymentRevision: number; sourceDigest: string;
  ownerUserId: string; requestId: string; status: LearningJobStatus; createdAt: string; updatedAt: string;
  claimedAt?: string; claimToken?: string; analysisId?: string; reason?: string;
};
export type LearningJobView = Omit<LearningJob, 'claimToken' | 'ownerUserId' | 'requestId' | 'sourceDigest'>;
export const LEARNING_JOB_KIND = 'learning:job';
export const LEARNING_MAX_JOBS_PER_DEPLOYMENT_DAY = 25;
export const LEARNING_MAX_JOBS_PER_WORKSPACE_DAY = 100;
export const LEARNING_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
