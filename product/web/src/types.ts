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

export interface AgentRow { id: string; name: string; job: string; category: string; status: 'draft' | 'testing' | 'live'; version: number; publishedVersion: number | null; stackId: string | null; languages: string[]; updatedAt: string; calls7d?: number | null }
export interface AgentDoc { id: string; name: string; version: number; publishedVersion: number | null; unsavedHint?: never; config: AgentConfigDraft; updatedAt: string; versions: { version: number; at: string; by: string; state: 'live' | 'draft' | 'old'; note?: string }[] }
export interface AgentConfigDraft {
  brand: { name: string; spokenName: string };
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
  voice: { stackId: string | null; voiceId?: string; speed?: number };
  recording: { enabled: boolean; announce: boolean };
}
export interface SimResult { id: string; scenario: string; verdict: 'pass' | 'fail' | 'invalid'; reason?: string; ran?: string; turns: { who: 'caller' | 'agent'; text: string; gapMs?: number }[]; costMilli: number; checks: { label: string; ok: boolean }[] }

export interface ContactRow { id: string; name: string; phone: string; language: string; city?: string; consent: 'granted' | 'unknown' | 'revoked'; dnd: 'clear' | 'listed' | 'unknown'; attempts: number; lastOutcome?: string | null; suppressed?: string | null; audiences: string[] }
export interface ContactDoc extends ContactRow {
  attributes: Record<string, string>;
  consentDetail: { basis: string; source: string; at: string; state: string };
  dndDetail: { state: string; checkedAt: string | null; registry: string };
  attemptHistory: { at: string; outcome: string; callId?: string; campaign?: string }[];
  memory: { status: 'on' | 'off' | 'not_loaded'; facts: { id: string; text: string; quote: string; callId: string; atSec: number; status: 'proposed' | 'approved' }[] };
}
export interface ImportColumn { name: string; sample: string[]; field: string | null; confidence: number }
export interface ImportRowVerdict { n: number; raw: Record<string, string>; verdict: 'ok' | 'fixed' | 'skipped' | 'suppressed' | 'review'; reason?: string; shown?: string }
export interface ImportPreview { columns: ImportColumn[]; fields: { key: string; label: string; required?: boolean }[]; rows: ImportRowVerdict[]; counts: { in: number; callable: number; fixed: number; skipped: number; suppressed: number; review: number }; question?: { text: string; defaultAnswer: string } | null }
export interface AudienceRow { id: string; name: string; count: number; callable: number; description: string }

export interface CampaignRow { id: string; name: string; agentId: string; agentName: string; category: string; status: 'draft' | 'scheduled' | 'running' | 'paused' | 'done'; audience: string; contacts: number; dialled: number; connected: number; done: number; spendMilli: number; capMilli: number | null; startAt?: string | null }
export interface Check { id: string; label: string; state: 'ok' | 'fail' | 'warn' | 'pending'; detail?: string; fix?: { label: string; href: string } }
export interface CampaignDoc extends CampaignRow {
  window: { start: string; end: string; days: string[] }; pace: { concurrency: number; maxConcurrency: number }; retries: { max: number; gapMin: number };
  live: { live: number; ringing: number; queued: number; updatedAt: string }; checks: Check[];
  funnel: FunnelStage[]; versionPill: string;
}
export interface CampaignDraftInput { name: string; agentId: string; audienceId: string; category: 'service' | 'transactional' | 'promotional'; window: { start: string; end: string; days: string[] }; pace: { concurrency: number }; retries: { max: number; gapMin: number }; capMilli: number }
export interface Estimate { contacts: number; callable: number; minutesRange: [number, number]; costRangeMilli: [number, number] | null; perMinuteMilli: number | null; gstNote: string; outcomeRange: [number, number] | null; basis: string; finishBy: string; sampleOpening?: { row: number; text: string; language: string } | null; checks: Check[] }

export interface CallRow { id: string; contactName: string; phone: string; campaign: string; agent: string; version: string; startedAt: string; durationS: number; outcome: string; outcomeReason?: string; costMilli: number | null; gapMs: number | null; ran: string }
export interface CallTurn { i: number; who: 'caller' | 'agent'; t0: number; t1: number; text: string; roman?: string; en?: string; gapMs?: number; cutIn?: boolean }
export interface CallDoc extends CallRow {
  summary: string; outcomeDetail: { key: string; label: string; reason: string; carrierCode?: string };
  turns: CallTurn[]; moments: { atSec: number; kind: 'disclosure' | 'objection' | 'commitment' | 'optout' | 'cutin' | 'handoff'; label: string }[];
  quotes: { atSec: number; text: string; tag: string }[]; peaks: { caller: number[]; agent: number[] }; totalSec: number;
  trace: { label: string; ok: boolean; detail: string }[]; memoryUsed: { text: string; atSec: number }[]; audioUrl: string | null;
  mood?: { atSec: number; label: string }[]; cost: { telephonyMilli: number; voiceMilli: number; brainMilli: number; earsMilli: number; basis: string } | null;
}
export interface FunnelStage { key: string; label: string; n: number | null; drops?: { code: string; label: string; n: number }[] }
export interface Issue { id: string; severity: 'high' | 'medium' | 'low'; title: string; cause: string; calls: number; firstSeen: string; fix?: string }
export interface Proposal { id: string; title: string; hypothesis: string; evidence: string; state: 'proposed' | 'testing' | 'proved' | 'rejected'; callsToProve: number; callsSoFar: number; before?: string; after?: string }

export interface NumberRow { id: string; e164: string; provider: string; kind: 'trial' | 'rented' | 'byo'; series: string; status: 'active' | 'verifying' | 'kyc_pending' | 'paused'; category: string; note?: string; monthlyMilli: number | null }
export interface Wallet { balanceMilli: number; spentTodayMilli: number; capTodayMilli: number | null; runwayDays: number | null }
export interface BillingLine { label: string; qty: string; costMilli: number | null; grade: Grade | 'estimate'; note?: string }
export interface Member { id: string; name: string; email: string; role: string; status: string; lastSeen?: string | null }
export interface ApiKey { id: string; label: string; prefix: string; createdAt: string; lastUsed: string | null; scope: string }
export interface KnowledgeItem { id: string; title: string; kind: 'text' | 'url' | 'file'; status: 'indexed' | 'pending' | 'failed'; facts: number; addedAt: string; purpose: string }
export interface ActivityRow { id: string; at: string; who: string; tool: string; risk: string; mode: string; summary: string; outcome: 'confirmed' | 'not_executed' | 'unknown'; costMilli: number | null; undo?: string }

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
