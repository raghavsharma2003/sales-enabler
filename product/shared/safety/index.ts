// The safety contract: the reply door (RD1-RD11, every outgoing sentence), caller-side signals, and the compile
// lints (T-L1..T-L4, every creation path). Safety is by predicate, never by instruction: these functions decide,
// the prompt only helps. The rules and their test vectors live as data in rules.json and cases.json so the
// TypeScript door (here) and the Python door (product/voice) are held to the same cases.
//
// STATUS: interface stub written by the kernel. The safety module replaces the bodies; the signatures are the contract.
import type { AgentConfig, CallCategory, Fact, SectorPack } from '../agent-config.ts';
import type { SafetyRuleId } from '../runtime-protocol.ts';

export interface DoorContext {
  category: CallCategory;
  sectorPacks: SectorPack[];
  brand: { name: string; verifiedDomains: string[] };
  facts: Fact[];                       // what she may state; amounts and offers outside this are suspect
  neverSay: string[];
  disclosed: boolean;                  // RD1 ledger: has the AI clause been heard on this call
  identityVerified: boolean;           // RD11
  recordingRefused: boolean;           // RD10
  crisis: boolean;                     // RD3: goal suspended
  turnIndex: number;
}

export type DoorVerdict =
  | { action: 'pass' }
  | { action: 'replace'; rule: SafetyRuleId; text: string; reason: string }     // say this instead
  | { action: 'block'; rule: SafetyRuleId; reason: string };                    // regenerate; never say the draft

/** Check one outgoing sentence before it is spoken. */
export function replyDoor(_text: string, _ctx: DoorContext): DoorVerdict {
  return { action: 'pass' };
}

export interface CallerSignals {
  crisis: boolean;                     // self-harm or danger language -> RD3
  asksIfAi: boolean;                   // "aap AI ho?" -> honest answer (RD2)
  refusesRecording: boolean;           // "record mat karo" -> RD10
  optOut: boolean;                     // "call mat karna" -> suppression (A3 contact.suppress_after_opt_out)
  readingSensitiveDigits: boolean;     // OTP / card / PIN digits -> stop kindly and redact (RD4)
  wantsHuman: boolean;
}

/** Read one caller utterance (transcript text) for signals the runtime must act on. */
export function callerSignals(_text: string): CallerSignals {
  return { crisis: false, asksIfAi: false, refusesRecording: false, optOut: false, readingSensitiveDigits: false, wantsHuman: false };
}

/** Mask spans that must never be stored (OTP, card, CVV, UPI PIN, full Aadhaar). */
export function redact(text: string): string {
  return text;
}

export interface LintFinding { rule: 'T-L1' | 'T-L2' | 'T-L3' | 'T-L4'; path: string; message: string; effect: 'refuse' | 'drop' }

/** Lint an agent config on every creation path (form, chat, API, import, learning proposal). A 'refuse' blocks
 *  publishing; a 'drop' removes the offending fact from the compiled brief. */
export function lintAgentConfig(_cfg: AgentConfig): LintFinding[] {
  return [];
}
