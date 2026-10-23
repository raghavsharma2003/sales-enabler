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
import type { StackComponents } from './stacks.ts';

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
  // The static brief, compiled ONCE by the control plane's compile() (inherited law: one compile() for every lane).
  // The runtime never re-words it; per turn it appends only its generic LAST block (position is mechanism).
  brief: { text: string; hash: string; bytes: number };
  // The parts travel with every ticket, curated or built ('custom'): the runtime runs exactly these, refuses a curated id
  // whose parts differ from its own table, and never substitutes a part.
  stack: { id: string; combinationId: string; components: StackComponents };
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
  // component uses the cost_line vocabulary: ears = speech-to-text, brain = LLM (a speech-to-speech model reports as
  // brain with detail.s2s = true), voice = text-to-speech.
  | { seq: number; type: 'cost'; at: string; component: 'telephony' | 'ears' | 'brain' | 'voice' | 'platform'; provider: string;
      quantity: number; unit: 'second' | 'token' | 'char' | 'call' | 'request'; inrMilli: number; detail?: Record<string, unknown> }
  | { seq: number; type: 'safety'; at: string; rule: SafetyRuleId; action: 'blocked' | 'replaced' | 'flagged' | 'redacted' | 'suspended_goal';
      detail: string }                                    // detail never contains the blocked text verbatim if it held secrets
  // Supervisor moments (live_listen_started/ended, whisper, takeover) mark what a person did on the live call, for the
  // call page's timeline. A whisper moment NEVER carries the whisper: its note must be absent or empty.
  | { seq: number; type: 'moment'; at: string;
      kind: 'objection' | 'question' | 'commitment' | 'opt_out' | 'callback_request' | 'confusion' | 'laughter'
        | 'live_listen_started' | 'live_listen_ended' | 'whisper' | 'takeover';
      atMs: number; note?: string }
  | { seq: number; type: 'tool'; at: string; name: string; args: Record<string, unknown>; status: 'requested' | 'done' | 'failed' }
  | { seq: number; type: 'hand_off'; at: string; reason: string; target: string; summary: string }
  // What a model judge did on a caller turn, for analysis only: never caller text, never a safety signal. A real raise
  // ALSO arrives as its own 'safety' event (RD3 suspended_goal), which is what drives crisis handling; this event is the
  // judge's record. Shadow and unavailable are counted nowhere that affects a call, a flag, a monitor or an experiment.
  // One verdict of the live judge (shared/judge-event.json is the contract, rules included). label: what it judged; absent
  // means 'crisis'. An 'opt_out' verdict is raised or shadow with a confidence; a shadow one is log-only, never a suppression.
  | { seq: number; type: 'judge'; at: string; judge: 'caller_crisis'; label?: 'crisis' | 'opt_out'; mode: 'shadow' | 'raise';
      outcome: 'raised' | 'shadow' | 'unavailable'; kind?: 'direct' | 'indirect'; confidence?: number; reason?: 'timeout' | 'error' | 'bad_output'; latencyMs: number }
  | { seq: number; type: 'call.ended'; at: string; endReason: EndReason; durationS: number; recordingUri?: string;
      transcript: { speaker: 'agent' | 'caller'; text: string; startMs: number }[]; manifest: RunManifest };

export interface RuntimeEventBatch { protocol: 1; conversationId: string; events: RuntimeEvent[] }
