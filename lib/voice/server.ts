import { createHash } from "node:crypto";
import { activeMayaGoogleKeyEntries, getVoiceConfiguration, normalizeAzureRealtimeEndpoint, VoiceConfigurationError } from "./config";
import type { VoiceConnectResult, VoiceProfile } from "./contracts";
import { MAYA_VOICE_PROFILE } from "./maya";
import type { SpeechDeliveryProfile } from "./speech-delivery";
import { voiceToolDefinitions, type VoiceToolName } from "./tools/contracts";
import { buildProviderInstructions, buildVoiceSession } from './session-config';
import { classifyAzureCallLocation, parseAzureCallLocation, type AzureCallLocationClassification, type AzureCallReference } from './call-control';
export { buildProviderInstructions } from './session-config';

export class VoiceConnectionError extends Error {}

/** Explicit evidence that this adapter did not allocate a provider call. */
export class VoiceAllocationNotStartedError extends VoiceConnectionError {
  readonly allocationNotStarted = true;
}

export function voiceAllocationNotStarted(error: unknown): error is VoiceAllocationNotStartedError {
  return error instanceof VoiceAllocationNotStartedError;
}

export class VoiceCallAllocationError extends VoiceConnectionError {
  readonly allocationUncertain = true;
  readonly providerCallRef?: string;
  readonly providerConfigurationDigest?: string;
  readonly locationClassification?: AzureCallLocationClassification;
  constructor(message: string, reference?: AzureCallReference, locationClassification?: AzureCallLocationClassification) {
    super(message);
    this.locationClassification = locationClassification;
    Object.defineProperties(this, {
      providerCallRef: { value: reference?.providerCallRef, enumerable: false },
      providerConfigurationDigest: { value: reference?.providerConfigurationDigest, enumerable: false },
    });
  }
}

/** Server-only result: the API must remove both private fields before serialization. */
export type VoiceServerConnectResult = VoiceConnectResult & Partial<AzureCallReference>;

export interface VoiceServerAdapter {
  connect(input: { sdp?: string; instructions: string; userId: string; organizationId: string; enabledTools?: VoiceToolName[]; speechVocabulary?: readonly string[]; speechDelivery?: SpeechDeliveryProfile; signal?: AbortSignal }): Promise<VoiceServerConnectResult>;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000);
}

/** Gemini's `parameters` field is its restricted OpenAPI Schema protobuf.
 * `parametersJsonSchema` is the documented field for full JSON Schema keywords. */
export function geminiVoiceToolDeclarations(enabledTools: VoiceToolName[]) {
  return voiceToolDefinitions(enabledTools).map(({ name, description, parameters }) => ({
    name, description, parametersJsonSchema: parameters,
  }));
}

function providerHttpError(provider: "openai" | "azure" | "gemini", status: number, phase: "provision" | "negotiate" = "provision"): VoiceConnectionError {
  if (status === 429) return new VoiceConnectionError("The voice provider is at its usage limit. Try again later.");
  if (provider === "gemini") {
    if (status === 401 || status === 403) return new VoiceConnectionError("Gemini rejected access to the selected Live model. Check the Maya key project's model access and billing settings.");
    if (status === 400 || status === 404 || status === 422) return new VoiceConnectionError("Gemini rejected the Live session setup. Check the model and Despina voice availability.");
    if (status >= 500) return new VoiceConnectionError("Gemini Live is temporarily unavailable. Try again later.");
  }
  if (provider === "azure") {
    if (status === 401 || status === 403) return new VoiceConnectionError(phase === "negotiate"
      ? "Azure rejected the short-lived Realtime session token. Try again; check resource and deployment access if it persists."
      : "Azure rejected this resource's API key or access. Check the key and resource permissions.");
    if (status === 404) return new VoiceConnectionError("Azure Realtime could not find the endpoint or deployment. Check the resource URL and Realtime deployment name.");
    if (status === 400 || status === 422) return new VoiceConnectionError("Azure rejected the Realtime session configuration. Check the deployment model and voice settings.");
    if (status >= 500) return new VoiceConnectionError("Azure Realtime is temporarily unavailable. Try again later.");
  }
  return new VoiceConnectionError("The voice provider could not start the session. Check its account access and model configuration.");
}

async function connectWebRtc(
  provider: "openai" | "azure", env: Record<string, string | undefined>, transport: typeof fetch,
  input: Parameters<VoiceServerAdapter["connect"]>[0], profile: VoiceProfile,
): Promise<VoiceServerConnectResult> {
  if (!input.sdp?.startsWith("v=0") || !input.sdp.includes("m=audio") || input.sdp.length > 128_000) throw new VoiceAllocationNotStartedError("A browser audio offer is required.");
  const azure = provider === "azure";
  if (input.speechDelivery && !azure) throw new VoiceAllocationNotStartedError("Configured speech delivery requires Azure Realtime. Choose the Azure voice provider to use this profile.");
  const session = buildVoiceSession(
    azure ? env.AZURE_OPENAI_REALTIME_DEPLOYMENT!.trim() : env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2.1",
    input.instructions,
    azure ? env.AZURE_OPENAI_REALTIME_VOICE || "marin" : env.OPENAI_REALTIME_VOICE || "marin",
    profile,
    input.enabledTools,
    input.speechVocabulary,
    { speechDelivery: input.speechDelivery },
  );
  const url = azure
    ? `${normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT)!}/realtime/calls`
    : "https://api.openai.com/v1/realtime/calls";
  let allocationStarted = false;
  let reference: AzureCallReference | undefined;
  try {
    let response: Response;
    if (azure) {
      // Azure's GA WebRTC flow authenticates /calls with a short-lived client secret
      // and sends raw application/sdp. The resource key remains on this server.
      const secretResponse = await transport(`${normalizeAzureRealtimeEndpoint(env.AZURE_OPENAI_ENDPOINT)!}/realtime/client_secrets`, {
        method: "POST",
        headers: { "api-key": env.AZURE_OPENAI_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 60 }, session }),
        signal: requestSignal(input.signal),
        redirect: 'error',
      });
      if (!secretResponse.ok) throw providerHttpError("azure", secretResponse.status, "provision");
      const secret = await secretResponse.json() as { value?: unknown };
      if (typeof secret.value !== "string" || !secret.value || secret.value.length > 8_000) throw new VoiceConnectionError("Azure did not issue a valid Realtime session token. Try again.");
      if (input.signal?.aborted) throw new VoiceAllocationNotStartedError('The voice connection was cancelled before call allocation.');
      allocationStarted = true;
      response = await transport(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret.value}`, "Content-Type": "application/sdp" },
        body: input.sdp,
        // A browser disconnect must not discard a late provider allocation handle.
        signal: requestSignal(),
        redirect: 'error',
      });
      reference = parseAzureCallLocation(response.headers.get('Location'), env) ?? undefined;
      if (!response.ok) {
        // A call handle, timeout or non-rejection response cannot prove no allocation.
        if (reference || response.status < 400 || response.status >= 500 || response.status === 408) throw new VoiceCallAllocationError('Azure could not confirm the call allocation.', reference);
        allocationStarted = false;
        throw providerHttpError("azure", response.status, "negotiate");
      }
      if (!reference) throw new VoiceCallAllocationError('Azure did not return a controllable call reference.', undefined, classifyAzureCallLocation(response.headers.get('Location'), env));
    } else {
      const body = new FormData();
      body.set("sdp", input.sdp);
      body.set("session", JSON.stringify(session));
      response = await transport(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "OpenAI-Safety-Identifier": createHash("sha256").update(`${input.organizationId}:${input.userId}`).digest("hex"),
        },
        body,
        signal: requestSignal(input.signal),
      });
      if (!response.ok) throw providerHttpError("openai", response.status);
    }
    const answer = await response.text();
    if (!answer.startsWith("v=0") || answer.length > 128_000) {
      if (azure) throw new VoiceCallAllocationError('The voice provider returned an invalid connection response.', reference);
      throw new VoiceConnectionError("The voice provider returned an invalid connection response.");
    }
    return { provider, transport: "webrtc", sdp: answer, ...reference };
  } catch (error) {
    if (error instanceof VoiceCallAllocationError) throw error;
    if (azure && allocationStarted) throw new VoiceCallAllocationError('The voice connection allocation could not be confirmed.', reference);
    if (azure) throw new VoiceAllocationNotStartedError(error instanceof VoiceConnectionError ? error.message : 'The voice connection could not be established. Please try again.');
    if (error instanceof VoiceConnectionError) throw error;
    throw new VoiceConnectionError("The voice connection could not be established. Please try again.");
  }
}

let mayaKeyCursor = 0;
const mayaCooldown = new Map<string, number>();

async function connectGemini(env: Record<string, string | undefined>, transport: typeof fetch, input: Parameters<VoiceServerAdapter["connect"]>[0], profile: VoiceProfile): Promise<VoiceConnectResult> {
  if (input.speechDelivery) throw new VoiceAllocationNotStartedError("Configured speech delivery requires Azure Realtime. Choose the Azure voice provider to use this profile.");
  const maya = profile === "maya-despina";
  const model = maya ? env.MAYA_GEMINI_MODEL?.trim() || MAYA_VOICE_PROFILE.liveModel : env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live";
  if (!/^[a-zA-Z0-9._-]{2,100}$/.test(model)) throw new VoiceConnectionError("The configured Gemini Live model is invalid.");
  const setup = {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: maya ? MAYA_VOICE_PROFILE.preset : env.GEMINI_LIVE_VOICE || "Kore" } } },
    },
    systemInstruction: { parts: [{ text: buildProviderInstructions(input.instructions, profile, input.enabledTools) }] },
    inputAudioTranscription: {}, outputAudioTranscription: {},
    ...(input.enabledTools?.length ? { tools: [{ functionDeclarations: geminiVoiceToolDeclarations(input.enabledTools) }] } : {}),
  };
  try {
    // The setup is fixed inside a one-use token; the browser never receives the long-lived key.
    const requestBody = JSON.stringify({
        uses: 1,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        expireTime: new Date(Date.now() + 11 * 60_000).toISOString(),
        bidiGenerateContentSetup: setup,
    });
    const keys = maya ? activeMayaGoogleKeyEntries(env).map(item => item.key) : [env.GEMINI_API_KEY!];
    const start = maya ? mayaKeyCursor++ % keys.length : 0;
    const attempts = maya ? Math.min(3, keys.length) : 1;
    const signal = requestSignal(input.signal);
    let response: Response | undefined;
    let rejectedKeys = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const key = keys[(start + attempt) % keys.length];
      // Do not reuse a quota-limited project immediately; all cooldown state stays in server memory.
      if (maya && (mayaCooldown.get(key) || 0) > Date.now()) continue;
      response = await transport("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: requestBody,
        signal,
      });
      if (response.ok) break;
      if (maya && (response.status === 400 || response.status === 401)) {
        // Google's ErrorInfo reason identifies a bad key; do not conflate it
        // with malformed session setup or expose provider diagnostics to clients.
        let invalidKey = false;
        try {
          const error = await response.clone().json() as { error?: { details?: Array<{ reason?: unknown }> } };
          invalidKey = error.error?.details?.some(detail => detail.reason === "API_KEY_INVALID") === true;
        } catch { /* A non-JSON failure remains a deterministic request error. */ }
        if (invalidKey) {
          rejectedKeys++;
          mayaCooldown.set(key, Number.POSITIVE_INFINITY);
          if (attempt === attempts - 1) throw new VoiceConnectionError("The configured Maya Google API keys were rejected. Check the free key pool.");
          continue;
        }
      }
      if (!maya || (response.status !== 429 && response.status < 500)) throw providerHttpError("gemini", response.status);
      if (response.status === 429) mayaCooldown.set(key, Date.now() + 60_000);
      if (attempt === attempts - 1) throw providerHttpError("gemini", response.status);
    }
    if (!response || !response.ok) throw new VoiceConnectionError(rejectedKeys
      ? "The configured Maya Google API keys were rejected. Check the free key pool."
      : "The Maya Google key pool is temporarily at its usage limit. Try again later.");
    const result = await response.json() as { name?: unknown };
    if (typeof result.name !== "string" || !result.name || result.name.length > 8_000) throw new VoiceConnectionError("The voice provider returned an invalid connection response.");
    // The token's embedded setup is authoritative; the browser's required first message is ignored by the constrained endpoint.
    return { provider: "gemini", transport: "websocket", token: result.name, model, setup: { model: setup.model } };
  } catch (error) {
    if (error instanceof VoiceConnectionError) throw error;
    throw new VoiceConnectionError("The voice connection could not be established. Please try again.");
  }
}

export function getVoiceServerAdapter(env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch, profile: VoiceProfile = "provider-default"): VoiceServerAdapter {
  // Bind negotiation and its private control fingerprint to the same configuration.
  env = { ...env };
  const configuration = getVoiceConfiguration(env, profile);
  if (!configuration.configured) throw new VoiceConfigurationError(configuration.reason);
  if (configuration.provider === "openai" || configuration.provider === "azure") return {
    connect: input => connectWebRtc(configuration.provider as "openai" | "azure", env, transport, input, profile),
  };
  if (configuration.provider === "gemini") return { connect: input => connectGemini(env, transport, input, profile) };
  throw new VoiceConfigurationError("No server adapter is installed for this provider.");
}
