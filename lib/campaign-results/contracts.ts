import type { ReviewColumn } from '../business/contracts';

export type AnswerValue = string | number | boolean;
export type AnswerSource = { quote: string; turnIndex: number; start: number; end: number; receivedAt?: string };
export type AnswerField = {
  column: ReviewColumn; state: 'proposed' | 'unknown' | 'conflicting'; value?: AnswerValue;
  sources: AnswerSource[]; reason: string;
  review?: { status: 'accepted' | 'unknown' | 'rejected'; value?: AnswerValue; source?: AnswerSource; reviewedBy: string; reviewedAt: string };
};
export type AnswerBinding = {
  sessionId: string; sessionDigest: string; runId: string; campaignId: string; contactId: string; offeringId: string;
  schemaDigest: string; basisDigest: string; releaseId: string; agentVersionId: string;
};
export type CampaignResult = {
  id: string; revision: number; status: 'processing' | 'ready' | 'reviewed' | 'failed' | 'stale'; createdAt: string;
  binding: AnswerBinding; columns: ReviewColumn[]; fields: AnswerField[]; originalModelText?: string;
  receipt?: { runId: string; model: string; usage: { inputTokens: number; outputTokens: number } };
  error?: string;
  validationVersion?: number; revalidatedAt?: string;
};
export type CampaignAnswerRow = AnswerBinding & { id: string; resultId: string; revision: number; fields: AnswerField[]; reviewedAt: string };
export type AnswerReview = { key: string; status: 'accepted' | 'unknown' | 'rejected'; value?: AnswerValue; quote?: string; turnIndex?: number };
export type AnswerTurn = { role: string; text: string; receivedAt?: string };
