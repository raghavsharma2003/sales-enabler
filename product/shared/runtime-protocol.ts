// The seam between the control plane (TypeScript) and the voice runtime (Python, product/voice).
//
// Control plane -> runtime:  POST {runtime}/v1/calls with a CallTicket, signed.
// Runtime -> control plane:  POST {control}/hooks/runtime with RuntimeEvent batches, signed.
// Signature: header "x-vp-signature: t=<unix_ms>,v1=<hex hmac_sha256(secret, t + '.' + raw_body)>". Reject if
// |now - t| > 5 min or the signature mismatches (constant-time compare). The shared secret is VP_RUNTIME_SECRET,
// set in both services' environments, never in the repo.
//
// Events carry a per-call monotonically increasing seq. The control plane is idempotent on (conversationId, seq),
// so the runtime may retry a batch safely. The runtime must flush call.ended last; cost lines may arrive before it.
import type { AgentConfig, Language } from './agent-config.ts';

export const PROTOCOL_VERSION = 1;

export interface CallTicket {
  protocol: 1;
  conversationId: string;
  attemptId: string | null;            // null for browser test calls and inbound
  workspaceId: string;
  direction: 'outbound' | 'inbound';
  transport:
    | { kind: 'webrtc'; offerUrl: string }           // browser test call: the runtime hosts the media session
    | { kind: 'sip'; to: string; from: string; trunk: string }
    | { kind: 'sim'; simCallerId: string };          // simulated caller, text or synthesised audio
  agent: AgentConfig;
  stack: { id: string; combinationId: string };      // the runtime refuses a stack it does not know; it never substitutes
  contact: {
    displayName: string;                 // what she may call them; may be '' (then no name is used)
    language?: Language;
    timezone: string;
    facts: Record<string, string>;       // per-contact fact values (Fact.perContact), already purpose-filtered
    memoryBrief: string;                 // <= 1200 bytes, compiled by the memory module; '' when none or not loaded
    memoryStatus: 'loaded' | 'none' | 'not_loaded_timeout' | 'disabled';
  };
  consent: { basis: 'consent' | 'contract' | 'legitimate_use' | 'inbound'; recordId?: string };
  limits: { maxDurationS: number; maxCostInrMilli: number };   // the runtime ends the call when either is reached (A3 call.end_runaway)
  test: boolean;                         // test calls never count toward outcomes or learning
}

export interface RunManifest {
  combinationId: string;
  stackId: string;
  agentVersionHash: string;
  components: { stt?: string; llm?: string; tts?: string; s2s?: string; voice?: string };
  fallbacksUsed: { at_ms: number; component: string; from: string; to: string; reason: string }[];  // must be [] on a test call
  memory: CallTicket['contact']['memoryStatus'];
  runtimeVersion: string;
}

export type EndReason =
  | 'completed' | 'caller_hung_up' | 'agent_ended' | 'no_answer' | 'busy' | 'failed' | 'voicemail'
  | 'max_duration' | 'max_cost' | 'silence_timeout' | 'handed_off' | 'crisis_handoff' | 'opt_out' | 'error';

export type SafetyRuleId = 'RD1' | 'RD2' | 'RD3' | 'RD4' | 'RD5' | 'RD6' | 'RD7' | 'RD8' | 'RD9' | 'RD10' | 'RD11';

export type RuntimeEvent =
  | { seq: number; type: 'call.started'; at: string; manifest: RunManifest }
  | { seq: number; type: 'turn'; at: string; speaker: 'agent' | 'caller'; text: string; startMs: number; endMs: number;
      interrupted?: boolean; latencyMs?: number; tone?: string }
  | { seq: number; type: 'cost'; at: string; component: 'stt' | 'llm' | 'tts' | 's2s' | 'telephony' | 'other'; provider: string;
      quantity: number; unit: 'audio_s' | 'tokens_in' | 'tokens_out' | 'chars' | 'minutes' | 'requests'; inrMilli: number }
  | { seq: number; type: 'safety'; at: string; rule: SafetyRuleId; action: 'blocked' | 'replaced' | 'flagged' | 'redacted' | 'suspended_goal';
      detail: string }                                    // detail never contains the blocked text verbatim if it held secrets
  | { seq: number; type: 'moment'; at: string; kind: 'objection' | 'question' | 'commitment' | 'opt_out' | 'callback_request' | 'confusion' | 'laughter'; atMs: number; note: string }
  | { seq: number; type: 'tool'; at: string; name: string; args: Record<string, unknown>; status: 'requested' | 'done' | 'failed' }
  | { seq: number; type: 'hand_off'; at: string; reason: string; target: string; summary: string }
  | { seq: number; type: 'call.ended'; at: string; endReason: EndReason; durationS: number; recordingUri?: string;
      transcript: { speaker: 'agent' | 'caller'; text: string; startMs: number }[]; manifest: RunManifest };

export interface RuntimeEventBatch { protocol: 1; conversationId: string; events: RuntimeEvent[] }
