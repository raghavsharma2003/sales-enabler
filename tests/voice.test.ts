import assert from "node:assert/strict";
import test from "node:test";
import { getVoiceConfiguration, VoiceConfigurationError } from "../lib/voice/config";
import { getVoiceServerAdapter, VoiceConnectionError } from "../lib/voice/server";
import { getVoiceClientAdapter } from "../lib/voice/client-adapters";
import { createBrowserVoiceSession } from "../lib/voice/browser-session";
import { buildVoiceInstructions } from "../lib/voice/prompt";
import { compileRelationshipContext } from "../lib/voice/relationship";

test("released voice prompt adapts allowed Hinglish without impersonation or action claims", () => {
  const instructions = buildVoiceInstructions('{"agent":{"allowedLanguages":["English","Hindi"]}}');
  assert.match(instructions, /naturally mixes Hindi and English/);
  assert.match(instructions, /Never invent biographical details, age, or a human identity/);
  assert.match(instructions, /must never claim you sent a message/);
  assert.match(instructions, /Identify yourself as AI/);
});

test("relationship cues use newest approved contact preferences and only that contact's open work", () => {
  const context = compileRelationshipContext({ contactId: 'c1', allowedLanguages: ['English', 'Hindi'], memories: [
    { id: 'old', contactId: 'c1', status: 'approved', content: 'Prefers formal conversation.', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'corrected', contactId: 'c1', status: 'approved', content: 'Prefers casual conversation. Prefers Hinglish.', createdAt: '2026-02-01T00:00:00Z' },
    { id: 'revoked', contactId: 'c1', status: 'revoked', content: 'Prefers Hindi.', createdAt: '2026-03-01T00:00:00Z' },
    { id: 'other', contactId: 'c2', status: 'approved', content: 'Prefers professional conversation.', createdAt: '2026-04-01T00:00:00Z' },
  ], commitments: [
    { id: 'open1', contactId: 'c1', status: 'open', title: 'Review document status', createdAt: '2026-02-01T00:00:00Z' },
    { id: 'done1', contactId: 'c1', status: 'completed', title: 'Sent the report', createdAt: '2026-02-01T00:00:00Z' },
    { id: 'otherwork', contactId: 'c2', status: 'open', title: 'Private plan', createdAt: '2026-02-01T00:00:00Z' },
  ] });
  assert.equal(context.preferences.find(p => p.kind === 'formality')?.value, 'casual');
  assert.equal(context.preferences.find(p => p.kind === 'language')?.value, 'Hinglish');
  assert.deepEqual(context.openCommitments.map(c => c.id), ['open1']);
  assert.deepEqual(context.sourceIds.sort(), ['corrected', 'open1']);
  assert.equal(context.guidance.includes('Private plan'), false);
  assert.equal(context.guidance.includes('Sent the report'), false);
  assert.match(context.guidance, /without diagnosing an emotion/);
  assert.match(context.guidance, /Never claim it was done/);
});

test("voice is opt-in even when an API key exists", () => {
  assert.equal(getVoiceConfiguration({ OPENAI_API_KEY: "secret" }).configured, false);
  assert.equal(getVoiceConfiguration({}).provider, null);
  assert.throws(() => getVoiceServerAdapter({ OPENAI_API_KEY: "secret" }), VoiceConfigurationError);
});

test("unsupported provider, transport, voice and missing credentials fail closed", () => {
  for (const env of [
    { VOICE_PROVIDER: "uninstalled" },
    { VOICE_PROVIDER: "openai" },
    { VOICE_PROVIDER: "openai", OPENAI_API_KEY: "key", VOICE_TRANSPORT: "sip" },
    { VOICE_PROVIDER: "openai", OPENAI_API_KEY: "key", OPENAI_REALTIME_VOICE: "impersonated-voice" },
  ]) {
    const result = getVoiceConfiguration(env);
    assert.equal(result.configured, false);
    assert.equal(result.capabilities.browserAudio, false);
    assert.ok(result.reason);
  }
  assert.throws(() => getVoiceClientAdapter("uninstalled"), /No browser adapter/);
});

test("public config contains no credentials and makes no telephony/tool claims", () => {
  const config = getVoiceConfiguration({ VOICE_PROVIDER: "openai", OPENAI_API_KEY: "top-secret" });
  assert.equal(config.configured, true);
  assert.equal(config.capabilities.telephony, false);
  assert.equal(config.capabilities.liveHumanTransfer, false);
  assert.equal(config.capabilities.toolExecution, false);
  assert.equal(JSON.stringify(config).includes("top-secret"), false);
});

test("unified interface uses server credentials and returns only neutral SDP result", async () => {
  const adapter = getVoiceServerAdapter({ VOICE_PROVIDER: "openai", OPENAI_API_KEY: "server-secret" }, (async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/realtime/calls");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer server-secret");
    assert.equal((init?.headers as Record<string, string>)["OpenAI-Safety-Identifier"].includes("user-123"), false);
    const form = init?.body as FormData;
    assert.equal(form.get("sdp"), "v=0\r\nm=audio");
    const session = JSON.parse(form.get("session") as string);
    assert.equal(session.type, "realtime");
    assert.equal(session.audio.input.turn_detection.interrupt_response, true);
    assert.equal(session.audio.input.turn_detection.eagerness, "low");
    assert.deepEqual(session.tools, []);
    assert.ok(session.instructions.includes("approved fact"));
    assert.ok(session.instructions.includes("Identify yourself as AI"));
    assert.ok(session.instructions.includes("No action tools are connected"));
    return new Response("v=0\r\nm=audio", { status: 201 });
  }) as typeof fetch);
  const result = await adapter.connect({ sdp: "v=0\r\nm=audio", instructions: "approved fact", userId: "user-123", organizationId: "org-123" });
  assert.deepEqual(result, { provider: "openai", transport: "webrtc", sdp: "v=0\r\nm=audio" });
});

test("provider errors and malformed successes never expose upstream bodies", async () => {
  for (const response of [new Response("sensitive provider error server-secret", { status: 401 }), new Response("{\"client_secret\":\"server-secret\"}")]) {
    const adapter = getVoiceServerAdapter({ VOICE_PROVIDER: "openai", OPENAI_API_KEY: "server-secret" }, (async () => response) as typeof fetch);
    await assert.rejects(adapter.connect({ sdp: "v=0", instructions: "", userId: "1", organizationId: "2" }), (error: unknown) => {
      assert.ok(error instanceof VoiceConnectionError);
      assert.equal(error.message.includes("server-secret"), false);
      return true;
    });
  }
});

test("normalizes only supported events, never executes provider tool calls", () => {
  const adapter = getVoiceClientAdapter("openai");
  assert.deepEqual(adapter.parseEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "one", transcript: "  Hello  " }), { type: "transcript", entry: { id: "one", role: "user", text: "Hello" } });
  assert.deepEqual(adapter.parseEvent({ type: "response.output_audio_transcript.done", item_id: "two", transcript: "Hi." }), { type: "transcript", entry: { id: "two", role: "assistant", text: "Hi." } });
  assert.equal(adapter.parseEvent({ type: "response.function_call_arguments.done", name: "send_email", arguments: "{}" }), null);
  assert.equal(adapter.parseEvent({ type: "response.output_audio_transcript.done", transcript: "Missing id" }), null);
  assert.equal(adapter.parseEvent(null), null);
  assert.deepEqual(adapter.parseEvent({ type: "conversation.item.added", item: { id: "before-transcription" } }), { type: "item", id: "before-transcription" });
  const event = adapter.parseEvent({ type: "error", error: { message: "private upstream details" } });
  assert.equal(JSON.stringify(event).includes("private upstream details"), false);
});

test("ending while microphone permission is pending stops late tracks without opening a peer", async () => {
  const descriptors = ["window", "navigator", "RTCPeerConnection"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let resolveMicrophone!: (stream: MediaStream) => void;
  let stops = 0;
  let peers = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(resolve => { resolveMicrophone = resolve; }) } } });
  Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: class { constructor() { peers += 1; } } });
  const session = createBrowserVoiceSession({ provider: "openai", onConnected: () => assert.fail("must not connect"), onEvent: () => assert.fail("must not emit"), onFailure: () => assert.fail("explicit close must not fail") });
  try {
    const pending = session.connect();
    session.close();
    resolveMicrophone({ getTracks: () => [{ stop: () => { stops += 1; } }] } as unknown as MediaStream);
    await pending;
    assert.equal(stops, 1);
    assert.equal(peers, 0);
  } finally {
    session.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("voice routes reject unauthenticated and cross-origin requests before provider use", async () => {
  const { GET } = await import("../app/api/voice/config/route");
  const { POST } = await import("../app/api/voice/connect/route");
  const config = await GET(new Request("http://localhost/api/voice/config"));
  assert.equal(config.status, 401);
  const noOrigin = await POST(new Request("http://localhost/api/voice/connect", { method: "POST" }));
  assert.equal(noOrigin.status, 403);
  const wrongOrigin = await POST(new Request("http://localhost/api/voice/connect", { method: "POST", headers: { Origin: "https://other.example" } }));
  assert.equal(wrongOrigin.status, 403);
});
