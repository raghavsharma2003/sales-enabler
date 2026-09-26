import type { VoiceCapabilities, VoiceConfiguration, VoiceProfile } from "./contracts";
import { MAYA_VOICE_PROFILE } from "./maya";
import { normalizeVoiceTools } from "./tools/contracts";

const unavailable: VoiceCapabilities = {
  browserAudio: false, transcription: false, interruption: false,
  toolExecution: false, telephony: false, liveHumanTransfer: false,
};

export const openaiCapabilities: VoiceCapabilities = {
  ...unavailable, browserAudio: true, transcription: true, interruption: true,
};
export const azureCapabilities: VoiceCapabilities = { ...openaiCapabilities };
export const geminiCapabilities: VoiceCapabilities = { ...openaiCapabilities };

/** Call-specific capability; provider configuration alone does not authorize actions. */
export function capabilitiesForEnabledVoiceTools(configuration: VoiceConfiguration, enabledTools: unknown): VoiceCapabilities {
  return { ...configuration.capabilities, toolExecution: configuration.configured && normalizeVoiceTools(enabledTools).length > 0 };
}

export class VoiceConfigurationError extends Error {}

/** A separate, explicit opt-in protects the user's Azure-only paid path. */
export function mayaGoogleKeyEntries(env: Record<string, string | undefined>): Array<{ label: string; key: string }> {
  const raw = env.MAYA_GOOGLE_KEYS?.trim();
  if (!raw) return [];
  // The source GOOGLE_KEYS pool is comma/newline separated label~key entries.
  // Keep only the value after the first tilde; labels are never sent as keys.
  const entries = raw.split(/[,\r\n]+/).map(entry => entry.trim().replace(/^['"]|['"]$/g, "").trim());
  const parsed = entries.map(entry => {
    const divider = entry.indexOf("~");
    return { label: divider >= 0 ? entry.slice(0, divider).trim() : entry,
      key: divider >= 0 ? entry.slice(divider + 1).trim() : entry };
  }).filter(item => /^[A-Za-z0-9._-]{21,}$/.test(item.key));
  return parsed.filter((item, index) => parsed.findIndex(candidate => candidate.key === item.key) === index).slice(0, 64);
}

export function mayaGoogleKeys(env: Record<string, string | undefined>): string[] {
  return mayaGoogleKeyEntries(env).map(item => item.key);
}

/** Restrict a deployment to named, verified free-key families without copying key values. */
export function activeMayaGoogleKeyEntries(env: Record<string, string | undefined>): Array<{ label: string; key: string }> {
  const entries = mayaGoogleKeyEntries(env);
  const raw = env.MAYA_GOOGLE_ACTIVE_LABELS?.trim();
  if (!raw) return entries;
  const labels = new Set(raw.split(/[,\r\n]+/).map(label => label.trim()).filter(Boolean));
  return entries.filter(entry => labels.has(entry.label));
}

/** Accept either an Azure resource origin or the documented /openai/v1 base URL. */
export function normalizeAzureRealtimeEndpoint(raw?: string): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (!/^[a-z0-9][a-z0-9.-]*\.(?:openai\.azure\.com|services\.ai\.azure\.com)$/.test(url.hostname)) return null;
    const path = url.pathname.replace(/\/+$/, "");
    if (path && path !== "/openai/v1") return null;
    return `${url.origin}/openai/v1`;
  } catch { return null; }
}

export function getVoiceConfiguration(env: Record<string, string | undefined> = process.env, profile: VoiceProfile = "provider-default"): VoiceConfiguration {
  if (profile === "maya-despina") {
    const identity = { profile, provider: "gemini", label: "Maya · Gemini Despina", voice: MAYA_VOICE_PROFILE.preset,
      model: env.MAYA_GEMINI_MODEL?.trim() || MAYA_VOICE_PROFILE.liveModel, source: "html-portfolio Maya/Meera voice profile" };
    if (env.MAYA_GEMINI_ENABLED !== "true") return { ...identity, configured: false, capabilities: unavailable,
      reason: "Maya's exact Despina voice is disabled. Set MAYA_GEMINI_ENABLED=true only after confirming Gemini usage and billing." };
    if (!activeMayaGoogleKeyEntries(env).length) return { ...identity, configured: false, capabilities: unavailable,
      reason: env.MAYA_GOOGLE_ACTIVE_LABELS?.trim()
        ? "The selected Maya free-key labels have no valid keys in MAYA_GOOGLE_KEYS. Check the server selection."
        : "Add at least one Maya Google API key in MAYA_GOOGLE_KEYS to use the Despina voice." };
    if (!/^[a-zA-Z0-9._-]{2,100}$/.test(identity.model)) return { ...identity, configured: false, capabilities: unavailable,
      reason: "The configured Maya Gemini Live model is invalid." };
    return { ...identity, configured: true, capabilities: geminiCapabilities };
  }
  const provider = env.VOICE_PROVIDER?.trim().toLowerCase();
  if (!provider || provider === "none") return {
    configured: false, provider: null, capabilities: unavailable,
    reason: "Choose a voice provider in the server configuration to enable browser conversations.",
  };
  if (!["openai", "azure", "gemini"].includes(provider)) return {
    configured: false, provider: null, capabilities: unavailable,
    reason: "This voice provider has no installed adapter. Add its server and browser adapters before enabling it.",
  };
  const expectedTransport = provider === "gemini" ? "websocket" : "webrtc";
  if (env.VOICE_TRANSPORT && env.VOICE_TRANSPORT !== expectedTransport) return {
    configured: false, provider, capabilities: unavailable,
    reason: `Unsupported voice transport. This adapter supports browser ${expectedTransport} only.`,
  };
  const voice = provider === "azure" ? env.AZURE_OPENAI_REALTIME_VOICE : provider === "openai" ? env.OPENAI_REALTIME_VOICE : env.GEMINI_LIVE_VOICE;
  const supportedVoices = provider === "gemini" ? ["Aoede", "Charon", "Fenrir", "Kore", "Orus", "Puck", "Zephyr"] : ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];
  if (voice && !supportedVoices.includes(voice)) return {
    configured: false, provider, capabilities: unavailable,
    reason: "The configured voice is unsupported by the installed adapter.",
  };
  if (provider === "azure" && !normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT)) return {
    configured: false, provider, capabilities: unavailable,
    reason: "Set an HTTPS Azure OpenAI resource endpoint for browser voice.",
  };
  if (provider === "azure" && !env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim()) return {
    configured: false, provider, capabilities: unavailable,
    reason: "Set the Azure OpenAI Realtime deployment name for browser voice.",
  };
  const key = provider === "azure" ? env.AZURE_OPENAI_API_KEY : provider === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
  if (!key?.trim()) return {
    configured: false, provider, capabilities: unavailable,
    reason: "The selected voice provider needs a server API key before conversations can start.",
  };
  return { configured: true, provider, capabilities: provider === "azure" ? azureCapabilities : provider === "gemini" ? geminiCapabilities : openaiCapabilities };
}
