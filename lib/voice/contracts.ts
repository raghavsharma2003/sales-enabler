export interface VoiceCapabilities {
  browserAudio: boolean;
  transcription: boolean;
  interruption: boolean;
  toolExecution: boolean;
  telephony: boolean;
  liveHumanTransfer: boolean;
}

export interface VoiceConfiguration {
  configured: boolean;
  provider: string | null;
  capabilities: VoiceCapabilities;
  reason?: string;
  profile?: VoiceProfile;
  label?: string;
  voice?: string;
  model?: string;
  engine?: 'azure-openai-realtime' | 'azure-voice-live';
  source?: string;
  continuousSpeech?: { configured: boolean; reason?: string };
}

export type VoiceProfile = "provider-default" | "maya-despina";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Local event receipt time; not a provider speech timestamp or latency metric. */
  receivedAt?: string;
}

export type VoiceEvent =
  | { type: "transcript"; entry: TranscriptEntry }
  | { type: "item"; id: string }
  | { type: "activity"; activity: "listening" | "thinking" | "speaking" }
  | { type: "audiolevel"; level: number }
  | { type: "tool"; phase: "requested" | "result"; id: string; name: import("./tools/contracts").VoiceToolName; status?: "available" | "not_available" | "awaiting_review"; message?: string; actionId?: string }
  | { type: "error"; message: string };

export interface VoiceClientAdapter {
  dataChannelName: string;
  parseEvent(data: unknown): VoiceEvent | null;
  openingEvents(greeting?: string): unknown[];
}

export interface VoiceToolCall {
  id: string;
  name: string;
  arguments: unknown;
  responseId?: string;
}

export type VoiceProvider = "openai" | "azure" | "gemini";

export interface VoiceBehaviorContext {
  /** Validated server profile, frozen for this call. Absent keeps legacy delivery. */
  speechDelivery?: import("./speech-delivery").SpeechDeliveryProfile;
  settings: { allowedLanguages: string[]; primaryLanguage: string; responseStyle: string };
  relationship: import("./relationship").RelationshipContext;
}

export type VoiceConnectResult =
  | { provider: "openai" | "azure"; transport: "webrtc"; sdp: string; previewId?: string; connectionId?: string; enabledTools?: string[]; campaignRunId?: string; campaignDigest?: string; openingMessage?: string; initialInstructions?: string; behaviorContext?: VoiceBehaviorContext }
  | {
      provider: "gemini";
      transport: "websocket";
      /** Single-use short-lived Gemini Live token. Never a long-lived API key. */
      token: string;
      model: string;
      setup: Record<string, unknown>;
      previewId?: string;
      connectionId?: string;
      enabledTools?: string[];
      openingMessage?: string;
      initialInstructions?: string;
      behaviorContext?: VoiceBehaviorContext;
    };
