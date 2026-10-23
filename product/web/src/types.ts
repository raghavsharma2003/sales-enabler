// The data shapes the pages read from tools. The real modules should return these; where they differ, the page degrades
// (missing fields show "not measured", never 0). Every id here is a tool id used by the UI (see TOOLS in tools.ts).
import type { Grade } from '../../shared/stacks.ts';
export type { Grade };

export interface Metric { value: string; n?: number; asOf?: string; grade: Grade | 'estimate'; source?: string }

/** brief.today as the Operator module returns it (server/modules/operator/tools.ts). */
export interface Brief {
  asOf: string; since: string;
  needsTap: { n: number; items: { id: string; tool: string; summary: string | null; risk: string; created_at: string; expires_at: string | null }[] };
  liveCampaigns: { n: number; items: { id: string; name: string; state: string; pause_cause: string | null; updated_at: string }[] };
  spendToday: { inrMilli: number; byComponent: Record<string, number>; timezone: string };
  wallet: { balanceInrMilli: number; state: string } | null;
  issues: { n: number; items: { id: string; category: string; severity: string; subject_type: string; subject_id: string; created_at: string }[] };
  changed: { n: number; byAction: { action: string; n: number }[] };
}

export interface AgentRow { id: string; name: string; job: string; status: 'draft' | 'published'; latestVersion: number | null; updatedAt: string; category: string; stackId: string | null; components?: { ears?: string; brain?: string; voice?: string; s2s?: string }; languages: string[] }
export interface LintItem { message: string; severity?: string }
export interface AgentDoc {
  id: string; name: string; updatedAt: string; draftHash: string; config: AgentConfigDraft; compiles: boolean; lint: LintItem[]; briefBytes: number | null;
  versions: { id: string; number: number; note: string | null; createdAt: string; by: string }[]; latestVersionId: string | null; latestVersion: number | null;
}
export interface AgentConfigDraft {
  brand: { name: string; spokenName: string; verifiedDomains?: string[] };
  job: string; jobDescription?: string; category: 'service' | 'transactional' | 'promotional'; sectorPacks: string[];
  languages: { primary: string; allowed: string[]; mirrorCaller: boolean };
  persona: { name: string; gender: 'female' | 'male' | 'neutral'; register: 'warm_peer' | 'polite_professional' | 'crisp_efficient' | 'gentle_elder_respect'; energy: 1 | 2 | 3 | 4 | 5; humour: 0 | 1 | 2; honorific: 'aap' | 'tum' | 'mirror'; notes: string[] };
  goals: { id: string; description: string; outcome: string; required: boolean }[];
  facts: { key: string; value: string; purpose: 'service' | 'offer' | 'identity' | 'logistics'; source: string; perContact?: boolean }[];
  neverSay: string[];
  opening: { disclosureClause: string; usefulFirst: string };
  objections: { trigger: string; approach: string }[];
  tools: { name: string; risk: string }[];
  handOff: { when: string[]; target: { kind: 'phone' | 'queue' | 'callback'; value?: string }; warmSummary: boolean };
  limits: { maxDurationS: number; maxSilenceS: number; maxTurns: number };
  voice: { stackId: string | null; components?: { ears?: string; brain?: string; voice?: string; s2s?: string }; voiceId?: string; speed?: number };
  recording: { enabled: boolean; announce: boolean };
}
export interface PracticeCaller { id: string; label: string; persona: string; trap: string; source: 'default' | 'workspace' }
export interface SimResult { id: string; scenario: string; verdict: 'pass' | 'fail' | 'invalid' | 'inconclusive'; reason?: string; turns: { who: string; text: string }[]; checks: { label: string; ok: boolean; detail?: string }[]; endedBy?: string }

export interface ContactRow { id: string; name: string; phone: string; language: string; suppressed: boolean; dnd: string; dndCheckedAt: string | null }
export interface ContactDoc {
  id: string; name: string; phone: string; language: string; timezone: string; dnd: { status: string; checkedAt: string | null; fresh: boolean };
  attributes: { key: string; value: unknown; authority: string; observedAt: string; stale: boolean }[];
  consent: { id: string; purpose: string; channel: string; basis: string; source: string | null; granted: boolean; created_at: string }[];
  suppressions: { id: string; reason: string; scope: string; created_at?: string }[];
  service: { allowed: boolean; reasons: string[] }; promotional: { allowed: boolean; reasons: string[] };
  attempts: { id: string; status: string; blocked_by: string | null; precheck: { allowed?: boolean; code?: string; explain?: { message: string; why?: string } } | null; outcome_class: string | null; dialed_at: string | null; created_at: string; conversation_id: string | null; campaign_id: string }[];
  memory: { optedOut: boolean; facts: { id: string; conversationId: string | null; key: string; value: string; quote: string | null; purpose: string; basis: string; status: string; usable: boolean; saidAt: string | null }[] } | null;
}
export interface ImportColumn { header: string; sample: string[]; field: string; key?: string; confidence: number; why: string }
export interface ImportRowVerdict { row: number; phone: string | null; verdict: 'ok' | 'duplicate' | 'skipped' | 'suppressed' | 'review'; reason?: string; name?: string }
export interface ImportPreview { uploadId: string; columns: ImportColumn[]; rows: ImportRowVerdict[]; counts: { in: number; callable: number; duplicate: number; skipped: number }; questions: { text: string }[] }
export interface AudienceRow { id: string; name: string; matched: number | null; callable: number | null; suppressed: number | null; dndUnknown: number | null; note: string }

export interface CampaignRow { id: string; name: string; category: string; state: string; pauseCause: string | null; attempts: number; blocked: number; launchedAt: string | null }
export interface Blocker { code: string; message: string; why?: string; fix?: string | { tool: string; label: string; role?: string }; role?: string }
export interface CampaignDoc {
  id: string; name: string; category: string; state: string; policyVersion: number; agentVersionId: string | null; audienceId: string | null;
  window: { days: number[]; ranges: { start: string; end: string }[] }; concurrency: number | null; capInrMilli: number | null; preset?: string;
  counts: { status: string; n: number; code?: string | null }[]; blockers: Blocker[]; version: string;
}
export interface Estimate { people: number; attempts: number; connectedMinutes: number; perMinuteInrMilli: number | null; p10InrMilli: number; p90InrMilli: number; suggestedCapInrMilli: number | null; basis: string; gstIncluded: boolean }
export interface FunnelStage { key: string; label: string; n: number | null; note?: string }

export interface CallRow { id: string; contactName: string; startedAt: string; durationS: number | null; outcome: string | null; grade: string | null; reasonLabel: string | null; costMilli: number | null; flagged: boolean; channel: string; status: string }
export interface CallTurn { idx: number; who: 'caller' | 'agent'; text: string; startMs: number | null; endMs: number | null; latencyMs: number | null; interrupted: boolean }
export interface CallDoc {
  id: string; contactId: string | null; contactName: string; test: boolean; status: string; startedAt: string | null; durationS: number | null; endReason: string | null;
  reason: { code: string; label: string; action: string } | null; outcome: string | null; recordingUri: string | null; ran: string | null; ranParts: { ears?: string; brain?: string; voice?: string; s2s?: string } | null;
  turns: CallTurn[]; moments: { source: string; kind: string; atMs: number | null; note: string | null; quote: string | null }[];
  safety: { seq: number; rule: string; action: string; detail: string }[];
  judgeMarks: { seq: number; label: string; outcome: 'raised' | 'shadow' | 'unavailable'; text: string }[]; tools: { seq: number; name: string; status: string }[]; handOffs: { destination: string; status: string }[];
  outcomes: { value: string; grade: string; source: string }[]; costTotal: number; costLines: { component: string; provider: string; inr_milli: number; unit: string; quantity: number }[]; settlement: string | null;
  analysis: { status: string; summary?: string; reason?: string } | null; totalMs: number;
}
export interface CallExplain { headline: string; because: { point: string; evidence: Record<string, unknown> }[]; outcome: { value: string; grade: string; note: string | null } | null; notes: string[] }

export interface Wallet { state: string; balanceMilli: number; heldMilli: number; availableMilli: number; runwayDays: number | null; caps: { scope: string; period: string; capInrMilli: number; spentInrMilli?: number }[]; warnings: string[]; priceNotSet: boolean; priceText: string }
export interface Member { id: string; name: string; email: string; role: string; status: string }
export interface ApiKey { id: string; name: string; prefix: string; createdAt: string; lastUsed: string | null; revoked: boolean }
export interface KnowledgeItem { id: string; title: string; status: string; passages: number; createdAt: string }
export interface ActivityRow { id: string; at: string; line: string; action: string; who: string; subject?: string | null }

export interface OperatorCard {
  id: string; type: 'plan' | 'diff' | 'launch' | 'call' | 'chart' | 'approval' | 'issue' | 'receipt' | 'question' | 'progress';
  title: string; body?: string; state?: 'fresh' | 'waiting' | 'approved' | 'rejected' | 'stale' | 'expired' | 'failed';
  steps?: { label: string; risk: string; when: 'now' | 'waits'; done?: boolean; refused?: boolean }[];
  mode?: 'A2' | 'A0'; approvers?: string[]; expiresAt?: string;
  diff?: { field: string; before?: string; after: string; reason?: string }[];
  actionId?: string; summary?: string; risk?: string; costLabel?: string; provenance?: string; by?: string;
  outcome?: 'confirmed' | 'not_executed' | 'unknown'; undo?: string; href?: string; options?: { label: string; value: string }[]; defaultValue?: string;
  progress?: { label: string; pct: number | null }; quote?: string; metric?: Metric;
}

export interface NumberLine { id: string; e164: string; series: string; trial: boolean; status: string; kycStatus: string | null; a2pStatus: string | null; carrier: string | null; byo: boolean; displayName: string | null; pauseCause: string | null; campaigns: { id: string; name: string; state: string }[] }
