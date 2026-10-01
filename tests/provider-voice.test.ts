import assert from "node:assert/strict";
import test from "node:test";
import { getVoiceConfiguration, normalizeAzureRealtimeEndpoint } from "../lib/voice/config";
import { getVoiceServerAdapter, VoiceConnectionError } from "../lib/voice/server";
import { createGeminiEventState, getVoiceClientAdapter, parseGeminiServerMessage } from "../lib/voice/client-adapters";
import { resamplePcm16 } from "../lib/voice/gemini-browser";
import { createBrowserVoiceSession } from "../lib/voice/browser-session";

test("Azure GA WebRTC adapter exchanges SDP with server key and configured deployment", async () => {
  let calls = 0;
  const adapter = getVoiceServerAdapter({
    VOICE_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/openai/v1",
    AZURE_OPENAI_API_KEY: "server-only", AZURE_OPENAI_REALTIME_DEPLOYMENT: "my-realtime",
  }, (async (url, init) => {
    calls++;
    if (calls === 1) {
      assert.equal(url, "https://example.openai.azure.com/openai/v1/realtime/client_secrets");
      assert.equal((init?.headers as Record<string, string>)["api-key"], "server-only");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.expires_after.seconds, 60);
      assert.equal(body.session.model, "my-realtime");
      assert.deepEqual(body.session.audio.input.turn_detection, { type: "semantic_vad", eagerness: "low", create_response: false, interrupt_response: true });
      assert.deepEqual(body.session.tools, []);
      assert.match(body.session.instructions, /Identify yourself as AI/);
      return Response.json({ value: "one-use-token" });
    }
    assert.equal(url, "https://example.openai.azure.com/openai/v1/realtime/calls");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer one-use-token");
    assert.equal((init?.headers as Record<string, string>)["Content-Type"], "application/sdp");
    assert.equal(init?.body, "v=0\r\nm=audio");
    return new Response("v=0\r\nm=audio", { status: 201, headers: { "Content-Type": "application/sdp" } });
  }) as typeof fetch);
  assert.deepEqual(await adapter.connect({ sdp: "v=0\r\nm=audio", instructions: "Approved context", userId: "u", organizationId: "o" }), { provider: "azure", transport: "webrtc", sdp: "v=0\r\nm=audio" });
  assert.equal(calls, 2);
});

test("Azure endpoint normalization accepts the resource URL and documented API base once", () => {
  assert.equal(normalizeAzureRealtimeEndpoint("https://example.openai.azure.com"), "https://example.openai.azure.com/openai/v1");
  assert.equal(normalizeAzureRealtimeEndpoint("https://example.openai.azure.com/openai/v1/"), "https://example.openai.azure.com/openai/v1");
  assert.equal(normalizeAzureRealtimeEndpoint("https://example.openai.azure.com/openai/v1/realtime/calls"), null);
  assert.equal(normalizeAzureRealtimeEndpoint("https://attacker.example/openai/v1"), null);
  assert.equal(getVoiceConfiguration({ VOICE_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/openai/v1", AZURE_OPENAI_API_KEY: "x", AZURE_OPENAI_REALTIME_DEPLOYMENT: "live" }).configured, true);
});

test("Azure connection errors identify auth, deployment and configuration without leaking upstream body", async () => {
  for (const [status, pattern] of [[401, /API key/], [404, /deployment/], [400, /session configuration/], [429, /usage limit/]] as const) {
    const adapter = getVoiceServerAdapter({ VOICE_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/openai/v1", AZURE_OPENAI_API_KEY: "server-only", AZURE_OPENAI_REALTIME_DEPLOYMENT: "live" }, (async () => new Response("private upstream detail", { status })) as typeof fetch);
    await assert.rejects(adapter.connect({ sdp: "v=0\r\nm=audio", instructions: "", userId: "u", organizationId: "o" }), (error: unknown) => {
      assert.ok(error instanceof VoiceConnectionError);
      assert.match(error.message, pattern);
      assert.equal(error.message.includes("private upstream detail"), false);
      return true;
    });
  }
  const negotiation = getVoiceServerAdapter({ VOICE_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/openai/v1", AZURE_OPENAI_API_KEY: "server-only", AZURE_OPENAI_REALTIME_DEPLOYMENT: "live" }, (async url =>
    String(url).endsWith("client_secrets") ? Response.json({ value: "ephemeral-only" }) : new Response("private upstream detail", { status: 401 })) as typeof fetch);
  await assert.rejects(negotiation.connect({ sdp: "v=0\r\nm=audio", instructions: "", userId: "u", organizationId: "o" }), (error: unknown) => {
    assert.ok(error instanceof VoiceConnectionError);
    assert.match(error.message, /short-lived Realtime session token/);
    assert.equal(error.message.includes("private upstream detail"), false);
    return true;
  });
});

test("first response speaks the approved opening message without a planning preamble", () => {
  for (const provider of ["azure", "openai"]) {
    const adapter = getVoiceClientAdapter(provider);
    assert.deepEqual(adapter.openingEvents(), [{ type: "response.create" }]);
    const opening = adapter.openingEvents("Namaste, I am an AI assistant. How may I help?") as Array<{ type: string; response: { instructions: string } }>;
    assert.equal(opening.length, 1);
    assert.equal(opening[0].type, "response.create");
    assert.match(opening[0].response.instructions, /speak the following approved opening message exactly/);
    assert.match(opening[0].response.instructions, /Namaste, I am an AI assistant/);
    assert.match(opening[0].response.instructions, /Do not narrate your plan/);
  }
});

test("Realtime error diagnostics expose only finite protocol codes and field names", () => {
  for (const provider of ["azure", "openai"]) {
    const adapter = getVoiceClientAdapter(provider);
    const known = adapter.parseEvent({ type: "error", error: { code: "string_above_max_length", param: "item.id", message: "PRIVATE_PROVIDER_DETAIL", event_id: "PRIVATE_EVENT_ID" } });
    assert.ok(known?.type === "error");
    assert.match(known.message, /code: string_above_max_length; field: item.id/);
    assert.doesNotMatch(known.message, /PRIVATE/);
    const unknown = adapter.parseEvent({ type: "error", error: { code: "PRIVATE_CODE", param: "PRIVATE_FIELD", message: "PRIVATE_MESSAGE", type: "PRIVATE_TYPE" } });
    assert.ok(unknown?.type === "error");
    assert.equal(unknown.message, "The voice provider reported an error. End the conversation and try again.");
  }
});

test("Gemini issues one-use short-lived constrained token and never returns long-lived key", async () => {
  const adapter = getVoiceServerAdapter({ VOICE_PROVIDER: "gemini", GEMINI_API_KEY: "server-only", GEMINI_LIVE_MODEL: "gemini-3.8-live" }, (async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/auth_tokens");
    assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "server-only");
    const request = JSON.parse(init?.body as string);
    assert.equal(request.uses, 1);
    assert.ok(Date.parse(request.newSessionExpireTime) - Date.now() <= 61_000);
    assert.ok(Date.parse(request.expireTime) - Date.now() <= 11 * 60_000 + 1000);
    assert.equal(request.bidiGenerateContentSetup.model, "models/gemini-3.8-live");
    assert.deepEqual(request.bidiGenerateContentSetup.generationConfig.responseModalities, ["AUDIO"]);
    assert.deepEqual(request.bidiGenerateContentSetup.inputAudioTranscription, {});
    assert.deepEqual(request.bidiGenerateContentSetup.outputAudioTranscription, {});
    assert.equal(request.bidiGenerateContentSetup.tools, undefined);
    assert.match(request.bidiGenerateContentSetup.systemInstruction.parts[0].text, /Approved fact/);
    return Response.json({ name: "ephemeral-once" });
  }) as typeof fetch);
  const result = await adapter.connect({ instructions: "Approved fact", userId: "u", organizationId: "o" });
  assert.equal(result.transport, "websocket");
  assert.equal(JSON.stringify(result).includes("server-only"), false);
  assert.equal(result.provider, "gemini");
  if (result.transport === "websocket") assert.equal(result.token, "ephemeral-once");
});

test("provider configuration and errors fail closed without upstream detail", async () => {
  assert.equal(getVoiceConfiguration({ VOICE_PROVIDER: "azure", AZURE_OPENAI_API_KEY: "x", AZURE_OPENAI_ENDPOINT: "http://unsafe.test" }).configured, false);
  assert.equal(getVoiceConfiguration({ VOICE_PROVIDER: "azure", AZURE_OPENAI_API_KEY: "x", AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com" }).configured, false);
  assert.equal(getVoiceConfiguration({ VOICE_PROVIDER: "gemini", GEMINI_API_KEY: "x", VOICE_TRANSPORT: "webrtc" }).configured, false);
  const adapter = getVoiceServerAdapter({ VOICE_PROVIDER: "gemini", GEMINI_API_KEY: "server-only" }, (async () => new Response("private provider detail", { status: 401 })) as typeof fetch);
  await assert.rejects(adapter.connect({ instructions: "", userId: "u", organizationId: "o" }), (error: unknown) => {
    assert.ok(error instanceof VoiceConnectionError);
    assert.equal(error.message.includes("private"), false);
    return true;
  });
});

test("Gemini events preserve transcript turns and signal playback interruption", () => {
  const state = createGeminiEventState();
  assert.equal(parseGeminiServerMessage({ setupComplete: {} }, state).ready, true);
  const first = parseGeminiServerMessage({ serverContent: { inputTranscription: { text: "Hello" }, outputTranscription: { text: "Hi" }, modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAABAA==" } }] } } }, state);
  assert.deepEqual(first.audioChunks, ["AAABAA=="]);
  assert.ok(first.events.some(event => event.type === "transcript" && event.entry.role === "user" && event.entry.text === "Hello"));
  assert.ok(first.events.some(event => event.type === "transcript" && event.entry.role === "assistant" && event.entry.text === "Hi"));
  const interrupted = parseGeminiServerMessage({ serverContent: { interrupted: true, turnComplete: true } }, state);
  assert.equal(interrupted.interrupted, true);
  assert.equal(state.turn, 1);
  const next = parseGeminiServerMessage({ serverContent: { inputTranscription: { text: "Again" } } }, state);
  assert.ok(next.events.some(event => event.type === "transcript" && event.entry.id === "gemini-user-1"));
  assert.equal(parseGeminiServerMessage({ toolCall: { functionCalls: [{ name: "send_email" }] } }, state).events.length, 0);
});

test("microphone PCM conversion down-samples and clips to signed 16-bit", () => {
  const result = resamplePcm16(new Float32Array([1, 0.5, -1, -0.5, 0, 0]), 48_000);
  assert.equal(result.length, 2);
  assert.equal(result[0], 32767);
  assert.equal(result[1], -16384);
});

test("Gemini browser session sends microphone PCM, plays audio, clears it on interruption and tears down", async () => {
  const names = ["window", "navigator", "AudioContext", "WebSocket", "fetch"] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: string[] = [];
  let stoppedTracks = 0;
  let stoppedAudio = 0;
  let processor: { onaudioprocess: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null } | undefined;
  let socket: {
    readyState: number; bufferedAmount: number; onopen?: () => void; onmessage?: (event: { data: string }) => void;
    onerror?: () => void; onclose?: () => void; send: (value: string) => void; close: () => void;
  } | undefined;
  const track = { enabled: true, onended: null as null | (() => void), stop: () => { stoppedTracks++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const mockContext = class {
    sampleRate = 48_000;
    currentTime = 0;
    destination = {};
    resume = async () => {};
    close = async () => {};
    createMediaStreamSource = () => ({ connect: () => {}, disconnect: () => {} });
    createScriptProcessor = () => (processor = { onaudioprocess: null, connect: () => {}, disconnect: () => {} } as typeof processor);
    createGain = () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} });
    createBuffer = (_channels: number, length: number) => ({ duration: length / 24_000, getChannelData: () => new Float32Array(length) });
    createBufferSource = () => ({ buffer: null, onended: null, connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => { stoppedAudio++; } });
  };
  class MockSocket {
    static OPEN = 1;
    readyState = 0;
    bufferedAmount = 0;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onerror?: () => void;
    onclose?: () => void;
    constructor(public url: string) { socket = this; }
    send(value: string) { sent.push(value); }
    close() { this.readyState = 3; }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: mockContext });
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: MockSocket });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => Response.json({ provider: "gemini", transport: "websocket", token: "once", model: "gemini-3.8-live", setup: { model: "models/gemini-3.8-live" }, previewId: "p1" }) });
  const connected: Array<{ previewId?: string } | undefined> = [];
  const session = createBrowserVoiceSession({ provider: "gemini", mode: "preview", onConnected: meta => connected.push(meta), onEvent: () => {}, onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    assert.ok(socket);
    assert.match((socket as MockSocket).url, /access_token=once/);
    socket!.readyState = 1;
    socket!.onopen?.();
    socket!.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    assert.deepEqual(connected, [{ previewId: "p1" }]);
    processor?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.5) } });
    assert.ok(sent.some(message => JSON.parse(message).realtimeInput?.audio?.mimeType === "audio/pcm;rate=16000"));
    socket!.onmessage?.({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAABAA==" } }] } } }) });
    socket!.onmessage?.({ data: JSON.stringify({ serverContent: { interrupted: true } }) });
    assert.equal(stoppedAudio, 1);
    session.setMuted(true);
    assert.equal(track.enabled, false);
    assert.ok(sent.some(message => JSON.parse(message).realtimeInput?.audioStreamEnd === true));
  } finally {
    session.close();
    assert.equal(stoppedTracks, 1);
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
