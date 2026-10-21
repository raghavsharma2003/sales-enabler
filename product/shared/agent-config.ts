// The materialised agent: what one published agent_version holds, and the only thing the voice runtime
// reads about an agent. It is industry-neutral on purpose: an insurer's renewal agent, a lender's EMI
// reminder, a clinic's appointment confirmer and a D2C brand's COD verifier are the same shape with
// different jobs, facts and sector packs. Persona fields are SHAPES and notes, never lines to say
// (inherited law: sentence-shaped prompt text gets recited).
import type { RiskClass } from './approval.ts';

/** What the call is for. 'custom' lets a business describe its own job in plain words. */
export const JOBS = [
  'renewal_reminder', 'payment_reminder', 'lead_qualification', 'appointment_confirmation', 'appointment_booking',
  'order_verification', 'delivery_coordination', 'feedback_survey', 'onboarding_welcome', 'win_back',
  'event_invitation', 'document_collection', 'service_follow_up', 'inbound_support', 'custom',
] as const;
export type Job = (typeof JOBS)[number];

/** TRAI call categories. Set once per campaign; enforced at the dial gate, the reply door and the follow-up template. */
export const CALL_CATEGORIES = ['service', 'transactional', 'promotional'] as const;
export type CallCategory = (typeof CALL_CATEGORIES)[number];

/** Sector packs add rules on top of the base. A workspace may have none (generic business). */
export const SECTOR_PACKS = ['base', 'insurance_irdai', 'lending_rbi', 'securities_sebi', 'healthcare', 'education', 'ecommerce', 'real_estate', 'telecom', 'travel'] as const;
export type SectorPack = (typeof SECTOR_PACKS)[number];

export const LANGUAGES = ['hi-IN', 'en-IN', 'hinglish', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'bn-IN', 'pa-IN', 'or-IN'] as const;
export type Language = (typeof LANGUAGES)[number];

/** A fact the agent may state. Every fact carries where it came from and what it is for; T-L3 drops facts whose purpose
 *  does not match the call category, so an offer never leaks into a service call. */
export interface Fact {
  key: string;                 // 'premium_due', 'clinic_address'
  value: string;               // as the business wrote it; amounts in rupees as text, e.g. "18,450"
  purpose: 'service' | 'offer' | 'identity' | 'logistics';
  source: string;              // 'kb:policy-faq.pdf#p3', 'contact.attribute', 'agent.form'
  perContact?: boolean;        // filled per contact at dial time from attributes, not stored here
}

export interface Goal {
  id: string;                  // 'confirm_renewal_intent'
  description: string;         // plain words: what counts as done
  outcome: string;             // the outcome_definition key it records, e.g. 'renewal_intent'
  required: boolean;
}

/** The person she is: a shape, not a script. */
export interface Persona {
  name: string;                // 'Riya'
  gender: 'female' | 'male' | 'neutral';
  register: 'warm_peer' | 'polite_professional' | 'crisp_efficient' | 'gentle_elder_respect';
  energy: 1 | 2 | 3 | 4 | 5;   // 1 calm .. 5 bright
  humour: 0 | 1 | 2;           // 0 none, 1 light, 2 playful (never on dues or crisis)
  honorific: 'aap' | 'tum' | 'mirror';
  notes: string[];             // shapes the business adds: "explain like to a first-time buyer"
}

export interface ToolGrant {
  name: string;                // 'end_call', 'transfer', 'send_whatsapp_link', 'book_slot', 'mark_callback', 'lookup_order'
  risk: RiskClass;
  config?: Record<string, unknown>;
}

export interface HandOff {
  when: ('asks_for_human' | 'crisis' | 'complaint' | 'legal_threat' | 'out_of_scope' | 'payment_dispute' | 'repeated_misunderstanding')[];
  target: { kind: 'phone' | 'queue' | 'callback'; value?: string };   // a phone number is an E.164 the workspace owns
  warmSummary: boolean;        // say a one-line summary to the human before bridging
}

export interface AgentConfig {
  schema: 1;
  agentId: string;
  version: number;
  versionHash: string;         // sha256 of the canonical config minus this field; the run manifest records it
  brand: { name: string; spokenName: string; verifiedDomains: string[] };
  job: Job;
  jobDescription?: string;     // required when job = 'custom'
  category: CallCategory;
  sectorPacks: SectorPack[];
  languages: { primary: Language; allowed: Language[]; mirrorCaller: boolean };
  persona: Persona;
  goals: Goal[];
  facts: Fact[];
  neverSay: string[];          // business-specific: competitor names, unapproved claims
  opening: { disclosureClause: string; usefulFirst: string };   // RD1: brand + one AI clause + something useful; shapes
  objections: { trigger: string; approach: string }[];          // approach is a note, never a line
  tools: ToolGrant[];
  handOff: HandOff;
  memory: { read: boolean; write: boolean; briefMaxBytes: 1200 };
  limits: { maxDurationS: number; maxSilenceS: number; maxTurns: number };
  voice: { stackId: string; voiceId?: string; speed?: number };  // stackId must name a stack in shared/stacks.ts; no default
  recording: { enabled: boolean; announce: boolean };
}

export const BRIEF_MAX_BYTES = 1200;
