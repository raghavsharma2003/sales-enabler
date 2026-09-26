import assert from "node:assert/strict";
import test from "node:test";
import { activeMayaGoogleKeyEntries, getVoiceConfiguration, mayaGoogleKeys } from "../lib/voice/config";
import { getVoiceServerAdapter, VoiceConnectionError } from "../lib/voice/server";
import { createBrowserVoiceSession } from "../lib/voice/browser-session";

const freeKeys = ["AQ.A" + "a".repeat(49), "AQ.A" + "b".repeat(49), "AQ.A" + "c".repeat(49)];
const mayaEnv = {
  VOICE_PROVIDER: "azure",
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_REALTIME_DEPLOYMENT: "mini",
  AZURE_OPENAI_API_KEY: "azure-only",
  MAYA_GEMINI_ENABLED: "true",
  MAYA_GOOGLE_KEYS: freeKeys.map((key, index) => `free-${index + 1}~${key}`).join(","),
};

test("Maya profile selects exact Gemini Despina while default agent remains Azure", async () => {
  assert.deepEqual(mayaGoogleKeys({ MAYA_GOOGLE_KEYS: `'one~${freeKeys[0]},two~${freeKeys[1]},bad~AQ.A\\paste,duplicate~${freeKeys[0]}'` }), freeKeys.slice(0, 2));
  assert.deepEqual(activeMayaGoogleKeyEntries({ MAYA_GOOGLE_KEYS: mayaEnv.MAYA_GOOGLE_KEYS, MAYA_GOOGLE_ACTIVE_LABELS: "free-2" }).map(item => item.key), [freeKeys[1]]);
  assert.equal(getVoiceConfiguration({ ...mayaEnv, MAYA_GOOGLE_ACTIVE_LABELS: "missing" }, "maya-despina").configured, false);
  const defaultConfig = getVoiceConfiguration(mayaEnv);
  assert.equal(defaultConfig.provider, "azure");
  assert.equal(defaultConfig.configured, true);
  const maya = getVoiceConfiguration(mayaEnv, "maya-despina");
  assert.equal(maya.provider, "gemini");
  assert.equal(maya.voice, "Despina");
  assert.equal(maya.model, "gemini-3.1-flash-live-preview");
  assert.equal(JSON.stringify(maya).includes(freeKeys[0]), false);
  let calls = 0;
  const adapter = getVoiceServerAdapter(mayaEnv, (async (_url, init) => {
    calls++;
    const headers = init?.headers as Record<string, string>;
    assert.ok(freeKeys.includes(headers["x-goog-api-key"]));
    assert.equal(headers["x-goog-api-key"] === "azure-only", false);
    const body = JSON.parse(init?.body as string);
    assert.equal(body.bidiGenerateContentSetup.model, "models/gemini-3.1-flash-live-preview");
    assert.equal(body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Despina");
    assert.match(body.bidiGenerateContentSetup.systemInstruction.parts[0].text, /SPEECH DELIVERY FOR MAYA/);
    return calls === 1 ? new Response("quota detail", { status: 429 }) : Response.json({ name: "ephemeral" });
  }) as typeof fetch, "maya-despina");
  const result = await adapter.connect({ instructions: "Approved company fact", userId: "u", organizationId: "o" });
  assert.equal(calls, 2);
  assert.equal(result.provider, "gemini");
  assert.equal(JSON.stringify(result).includes(freeKeys[0]), false);
  const selected = getVoiceServerAdapter({ ...mayaEnv, MAYA_GOOGLE_ACTIVE_LABELS: "free-2" }, (async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], freeKeys[1]);
    return Response.json({ name: "ephemeral-selected" });
  }) as typeof fetch, "maya-despina");
  const chosen = await selected.connect({ instructions: "Approved company fact", userId: "u", organizationId: "o" });
  assert.equal(chosen.provider, "gemini");
});

test("Maya is explicit opt-in and deterministic access failures do not rotate the key pool", async () => {
  const disabled = getVoiceConfiguration({ ...mayaEnv, MAYA_GEMINI_ENABLED: "false" }, "maya-despina");
  assert.equal(disabled.configured, false);
  assert.match(disabled.reason || "", /disabled/);
  const noKeys = getVoiceConfiguration({ ...mayaEnv, MAYA_GOOGLE_KEYS: "" }, "maya-despina");
  assert.equal(noKeys.configured, false);
  let calls = 0;
  const adapter = getVoiceServerAdapter(mayaEnv, (async () => {
    calls++;
    return new Response("private provider detail", { status: 403 });
  }) as typeof fetch, "maya-despina");
  await assert.rejects(adapter.connect({ instructions: "", userId: "u", organizationId: "o" }), (error: unknown) => {
    assert.ok(error instanceof VoiceConnectionError);
    assert.match(error.message, /model access/);
    assert.doesNotMatch(error.message, /private provider detail/);
    return true;
  });
  assert.equal(calls, 1);
});

test("Azure in-call guidance retains baseline safety and approved context", async () => {
  const names = ["window", "navigator", "RTCPeerConnection", "Audio", "fetch"] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: unknown[] = [];
  const connected: Array<{ behaviorContext?: { settings: { primaryLanguage: string } } } | undefined> = [];
  const behaviorContext = { settings: { allowedLanguages: ["English", "Hindi"], primaryLanguage: "Hindi", responseStyle: "warm" },
    relationship: { preferences: [], openCommitments: [], sourceIds: [], guidance: "", omittedCount: 0 } };
  const channel = { readyState: "connecting", onopen: null as null | (() => void), onmessage: null, onclose: null, onerror: null,
    send(data: string) { sent.push(JSON.parse(data)); }, close() {} };
  class Peer {
    ontrack = null; onconnectionstatechange = null;
    addTransceiver() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: "v=0\r\nm=audio" }; }
    async setLocalDescription() {}
    async setRemoteDescription() { channel.readyState = "open"; channel.onopen?.(); }
    close() {}
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: Peer });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: class { autoplay = false; srcObject = null; pause() {} } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => Response.json({ provider: "azure", transport: "webrtc", sdp: "v=0\r\nm=audio", connectionId: "connection-1", initialInstructions: "Identify yourself as AI. Approved company fact.", behaviorContext }) });
  const session = createBrowserVoiceSession({ provider: "azure", inputMode: "text", onConnected: meta => connected.push(meta), onEvent: () => {}, onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    assert.equal(connected[0]?.behaviorContext?.settings.primaryLanguage, "Hindi");
    assert.equal((connected[0] as { connectionId?: string })?.connectionId, "connection-1");
    assert.equal(session.updateBehavior("Acknowledge the correction briefly."), true);
    assert.equal(session.updateBehavior("Acknowledge the correction briefly."), false);
    const update = sent.find(value => (value as { type?: string }).type === "session.update") as { session: { instructions: string } };
    assert.match(update.session.instructions, /Identify yourself as AI/);
    assert.match(update.session.instructions, /Approved company fact/);
    assert.match(update.session.instructions, /Acknowledge the correction briefly/);
  } finally {
    session.close();
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  }
});

test("Gemini behavior update waits for speech turn completion", async () => {
  const names = ["window", "AudioContext", "WebSocket", "fetch"] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: unknown[] = [];
  let socket: { readyState: number; onopen?: () => void; onmessage?: (event: { data: string }) => void } | undefined;
  class Socket {
    static OPEN = 1;
    readyState = 0;
    onopen?: () => void; onmessage?: (event: { data: string }) => void;
    constructor() { socket = this; }
    send(data: string) { sent.push(JSON.parse(data)); }
    close() {}
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: class { currentTime = 0; destination = {}; resume = async () => {}; close = async () => {}; } });
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: Socket });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => Response.json({ provider: "gemini", transport: "websocket", token: "once", model: "gemini-3.1-flash-live-preview", setup: { model: "models/gemini-3.1-flash-live-preview" } }) });
  const session = createBrowserVoiceSession({ provider: "gemini", inputMode: "text", onConnected: () => {}, onEvent: () => {}, onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    socket!.readyState = 1;
    socket!.onopen?.();
    socket!.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    assert.equal(session.updateBehavior("Acknowledge a spoken correction."), true);
    assert.equal(sent.filter(value => (value as { clientContent?: unknown }).clientContent).length, 0);
    socket!.onmessage?.({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
    const guidance = sent.find(value => (value as { clientContent?: unknown }).clientContent) as { clientContent: { turns: Array<{ parts: Array<{ text: string }> }>; turnComplete: boolean } };
    assert.equal(guidance.clientContent.turnComplete, false);
    assert.match(guidance.clientContent.turns[0].parts[0].text, /Acknowledge a spoken correction/);
  } finally {
    session.close();
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  }
});
