/** Browser-safe contracts for reviewed company context. */
export type SourceAnchorRef = { sourceId: string; revision: number; digest: string; start: number; end: number; quote: string };
export type BusinessSource = { id: string; revision: number; digest: string; title: string; content: string };
export type Offering = {
  schemaVersion: 1; name: string; kind: 'product' | 'service'; summary: string; audienceDescription: string;
  sourceRefs: SourceAnchorRef[]; openQuestions: string[]; createdBy: string; reviewedBy?: string; reviewedAt?: string;
};
export type BusinessSignal = {
  schemaVersion: 1; title: string; observation: string; interpretation?: string; offeringId?: string; contactId?: string;
  sourceRefs: SourceAnchorRef[]; uncertainty: string[]; suggestedAction?: string; createdBy: string; reviewedBy?: string; reviewedAt?: string;
};
export type ReviewColumn = { key: string; label: string; type: 'text' | 'boolean' | 'number' | 'date' | 'enum'; options?: string[] };
export type CampaignIntentInput = {
  schemaVersion: 1; offeringId: string; outcome: { label: string; evidenceRequired: string[] };
  signalIds: string[]; audienceRationale: string; reviewColumns: ReviewColumn[];
};
export type RecordAnchor = { id: string; revision: number; digest: string };
export type CampaignIntent = {
  schemaVersion: 1; offering: RecordAnchor; outcome: CampaignIntentInput['outcome']; signalAnchors: RecordAnchor[];
  audienceRationale: string; reviewColumns: ReviewColumn[]; reviewedAt: string; reviewedBy: string;
};
export type BusinessDiscovery = { requestDigest: string; offeringIds: string[]; signalIds: string[]; questions: string[]; runId: string; model: string; usage: { inputTokens: number; outputTokens: number }; createdBy: string };
