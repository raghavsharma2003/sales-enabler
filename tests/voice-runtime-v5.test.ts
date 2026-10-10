import assert from "node:assert/strict";
import test from "node:test";
import { createClientToolRunner } from "../lib/voice/client-tools";
import { createGeminiEventState, parseGeminiServerMessage } from "../lib/voice/client-adapters";
import { createVoiceDiagnostics, normalizeVoiceDiagnostics } from "../lib/voice/diagnostics";
import { getVoiceServerAdapter } from "../lib/voice/server";
import { createBrowserVoiceSession } from "../lib/voice/browser-session";

test("provider setup declares only explicit bounded tools; default stays empty", async () => {
  const azure = getVoiceServerAdapter({ VOICE_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com", AZURE_OPENAI_API_KEY: "secret", AZURE_OPENAI_REALTIME_DEPLOYMENT: "live" }, (async (_url, init) => {
    if (typeof init?.body === "string" && init.body.includes("expires_after")) {
      const session = JSON.parse(init.body).session;
      assert.deepEqual(session.tools.map((tool: { name: string }) => tool.name), ["search_company_knowledge"]);
      assert.match(session.instructions, /search_company_knowledge/);
      assert.doesNotMatch(session.instructions, /No action tools are connected/);
      return Response.json({ value: "ephemeral" });
    }
    return new Response("v=0\r\nm=audio", { status: 201, headers: { Location: '/openai/v1/realtime/calls/rtc_fixture' } });
  }) as typeof fetch);
  await azure.connect({ sdp: "v=0\r\nm=audio", instructions: "", userId: "u", organizationId: "o", enabledTools: ["search_company_knowledge"] });
  const gemini = getVoiceServerAdapter({ VOICE_PROVIDER: "gemini", GEMINI_API_KEY: "secret" }, (async (_url, init) => {
    const setup = JSON.parse(init?.body as string).bidiGenerateContentSetup;
    assert.deepEqual(setup.tools[0].functionDeclarations.map((tool: { name: string }) => tool.name), ["search_company_knowledge", "recall_customer_context", "request_follow_up"]);
    assert.deepEqual(setup.tools[0].functionDeclarations[0].parametersJsonSchema, { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 500, description: "A short factual company question." } }, required: ["query"], additionalProperties: false });
    assert.equal(setup.tools[0].functionDeclarations[0].parameters, undefined);
    assert.match(setup.systemInstruction.parts[0].text, /recall_customer_context/);
    assert.doesNotMatch(setup.systemInstruction.parts[0].text, /No action tools are connected/);
    return Response.json({ name: "ephemeral" });
  }) as typeof fetch);
  await gemini.connect({ instructions: "", userId: "u", organizationId: "o", enabledTools: ["search_company_knowledge", "recall_customer_context", "request_follow_up"] });
});

test("client runner transports fixed same-origin calls once and revokes on close", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const transport = (async (url, init) => {
    const body = JSON.parse(init?.body as string);
    requests.push({ url: String(url), body });
    return Response.json({ requestId: body.requestId, name: body.name, status: "available", message: "Found", citations: [] });
  }) as typeof fetch;
  const runner = createClientToolRunner({ previewId: "preview-1", enabledTools: ["search_company_knowledge"] }, new AbortController().signal, transport);
  const call = { id: "call_1", name: "search_company_knowledge", arguments: '{"query":"hours"}' };
  const [first, repeat] = await Promise.all([runner.run(call), runner.run(call)]);
  assert.deepEqual(first, repeat);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/voice/tools");
  assert.deepEqual(requests[0].body, { previewId: "preview-1", requestId: "voice-call_1", name: "search_company_knowledge", arguments: { query: "hours" } });
  assert.equal((await runner.run({ id: "call_2", name: "send_email", arguments: {} })).status, "not_available");
  assert.equal(requests.length, 1);
  runner.close();
  assert.deepEqual(requests[1].body, { action: "end", previewId: "preview-1" });
  assert.equal((await runner.run({ id: "call_3", name: "search_company_knowledge", arguments: {} })).status, "not_available");
});

test("Gemini parses multiple calls and cancellations without treating tools as transcripts", () => {
  const parsed = parseGeminiServerMessage({ toolCall: { functionCalls: [
    { id: "a", name: "search_company_knowledge", args: { query: "hours" } },
    { id: "b", name: "recall_customer_context", args: {} },
  ] }, toolCallCancellation: { ids: ["b"] } }, createGeminiEventState());
  assert.deepEqual(parsed.toolCalls.map(call => call.id), ["a", "b"]);
  assert.deepEqual(parsed.cancelledToolIds, ["b"]);
  assert.deepEqual(parsed.events, []);
});

test("client diagnostics retain bounded observed samples and reject invented measurements", () => {
  let clock = 0;
  const snapshots: unknown[] = [];
  const recorder = createVoiceDiagnostics(snapshot => snapshots.push(snapshot), () => clock);
  recorder.start();
  clock = 20; recorder.ready();
  clock = 30; recorder.userTurnReceived();
  clock = 45; recorder.generatedOutputReceived();
  recorder.toolRequested(); recorder.toolResult("awaiting_review"); recorder.end();
  assert.deepEqual(normalizeVoiceDiagnostics(recorder.snapshot()), {
    status: "ended", measurement: "client_observed_events", clientObservedConnectMs: 20,
    clientObservedTurnMs: [15], toolCalls: { requested: 1, available: 0, awaitingReview: 1, unavailable: 0 },
  });
  assert.equal(normalizeVoiceDiagnostics({ ...recorder.snapshot(), clientObservedTurnMs: [Number.NaN] }), undefined);
  assert.equal(normalizeVoiceDiagnostics({ ...recorder.snapshot(), measurement: "acoustic_latency" }), undefined);
  assert.ok(snapshots.length >= 4);
});

test("Azure browser returns multiple function outputs before one continuation", async () => {
  const names = ["window", "RTCPeerConnection", "Audio", "fetch"] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Array<Record<string, unknown>> = [];
  let channel: { readyState: string; onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void; onerror?: () => void; send: (value: string) => void; close: () => void } | undefined;
  class MockChannel {
    readyState = "open";
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;
    onerror?: () => void;
    constructor() { channel = this; }
    send(value: string) { sent.push(JSON.parse(value)); }
    close() { this.readyState = "closed"; }
  }
  class MockPeer {
    connectionState = "connected";
    ontrack: unknown;
    onconnectionstatechange: unknown;
    addTransceiver() {}
    createDataChannel() { return new MockChannel(); }
    async createOffer() { return { sdp: "v=0\r\nm=audio" }; }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    close() {}
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: MockPeer });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: class { autoplay = false; srcObject = null; pause() {} } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string, init: RequestInit) => {
    if (url === "/api/voice/connect") return Response.json({ provider: "azure", transport: "webrtc", sdp: "v=0\r\nm=audio", previewId: "p", initialInstructions: "Immutable approved context. Disclose AI.", enabledTools: ["search_company_knowledge", "recall_customer_context"] });
    const body = JSON.parse(init.body as string);
    if (body.action === "end") return Response.json({ ok: true });
    return Response.json({ requestId: body.requestId, name: body.name, status: "available", message: "OK", citations: [] });
  } });
  const session = createBrowserVoiceSession({ provider: "azure", inputMode: "text", onConnected: () => {}, onEvent: () => {}, onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    channel!.onopen?.();
    sent.length = 0;
    channel!.onmessage?.({ data: JSON.stringify({ type: "response.created", response: { id: "r1" } }) });
    for (const [id, name, argumentsText] of [["a", "search_company_knowledge", '{"query":"hours"}'], ["b", "recall_customer_context", "{}"]]) {
      channel!.onmessage?.({ data: JSON.stringify({ type: "response.function_call_arguments.done", response_id: "r1", call_id: id, name, arguments: argumentsText }) });
    }
    channel!.onmessage?.({ data: JSON.stringify({ type: "response.done", response: { id: "r1", status: "completed" } }) });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(sent.filter(event => event.type === "conversation.item.create").length, 2);
    assert.equal(sent.filter(event => event.type === "response.create").length, 0, "tool continuation waits for the instruction snapshot acknowledgement");
    const update = sent.find(event => event.type === "session.update")!;
    channel!.onmessage?.({ data: JSON.stringify({ type: "session.updated", session: update.session }) });
    assert.equal(sent.filter(event => event.type === "response.create").length, 1);
  } finally {
    session.close();
    for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
  }
});

test("Gemini browser sends one response batch for multiple calls and omits cancelled calls", async () => {
  const names = ["window", "AudioContext", "WebSocket", "fetch"] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Array<Record<string, unknown>> = [];
  let socket: { readyState: number; onopen?: () => void; onmessage?: (event: { data: string }) => void; send: (value: string) => void; close: () => void } | undefined;
  const releaseRequests: Array<() => void> = [];
  class MockSocket {
    static OPEN = 1;
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor() { socket = this; }
    send(value: string) { sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
  }
  class MockAudioContext {
    currentTime = 0;
    destination = {};
    resume = async () => {};
    close = async () => {};
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: MockAudioContext });
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: MockSocket });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string, init: RequestInit) => {
    if (url === "/api/voice/connect") return Response.json({ provider: "gemini", transport: "websocket", token: "one-use", model: "live", setup: { model: "models/live" }, previewId: "p", enabledTools: ["search_company_knowledge", "recall_customer_context"] });
    const body = JSON.parse(init.body as string);
    if (body.action === "end") return Response.json({ ok: true });
    await new Promise<void>(resolve => { releaseRequests.push(resolve); });
    return Response.json({ status: "available", message: "Found", citations: [], requestId: body.requestId, name: body.name });
  } });
  const session = createBrowserVoiceSession({ provider: "gemini", inputMode: "text", onConnected: () => {}, onEvent: () => {}, onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    socket!.onopen?.();
    socket!.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    sent.length = 0;
    socket!.onmessage?.({ data: JSON.stringify({ toolCall: { functionCalls: [
      { id: "a", name: "search_company_knowledge", args: { query: "hours" } },
      { id: "b", name: "recall_customer_context", args: {} },
    ] } }) });
    socket!.onmessage?.({ data: JSON.stringify({ toolCallCancellation: { ids: ["b"] } }) });
    releaseRequests.forEach(release => release());
    await new Promise(resolve => setTimeout(resolve, 10));
    const responses = sent.filter(event => "toolResponse" in event);
    assert.equal(responses.length, 1);
    assert.deepEqual(((responses[0].toolResponse as { functionResponses: Array<{ id: string }> }).functionResponses).map(item => item.id), ["a"]);
  } finally {
    session.close();
    for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
  }
});
