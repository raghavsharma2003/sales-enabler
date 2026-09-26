import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserVoiceSession } from "../lib/voice/browser-session";

test("Gemini browser decodes ordered Blob and ArrayBuffer frames after resuming audio on call start", async () => {
  const names = ["window", "AudioContext", "WebSocket", "fetch"] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  let resumed = false;
  let fetched = false;
  let audioStarted = 0;
  const connected: Array<{ previewId?: string; connectionId?: string } | undefined> = [];
  const sent: unknown[] = [];
  let socket: {
    binaryType: string;
    readyState: number;
    onopen?: () => void;
    onmessage?: (event: { data: string | Blob | ArrayBuffer }) => void;
  } | undefined;
  class MockAudioContext {
    currentTime = 0;
    destination = {};
    resume = async () => { resumed = true; };
    close = async () => {};
    createBuffer(_channels: number, length: number) { return { duration: length / 24_000, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return { buffer: null, onended: null, connect: () => {}, disconnect: () => {}, start: () => { audioStarted++; }, stop: () => {} }; }
  }
  class MockSocket {
    static OPEN = 1;
    binaryType = "blob";
    readyState = 0;
    onopen?: () => void;
    onmessage?: (event: { data: string | Blob | ArrayBuffer }) => void;
    constructor() { socket = this; }
    send(data: string) { sent.push(JSON.parse(data)); }
    close() {}
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: MockAudioContext });
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: MockSocket });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => {
    assert.equal(resumed, true);
    fetched = true;
    return Response.json({ provider: "gemini", transport: "websocket", token: "ephemeral", model: "gemini-3.1-flash-live-preview",
      setup: { model: "models/gemini-3.1-flash-live-preview" }, previewId: "preview-1", connectionId: "connection-1",
      openingMessage: "Namaste, I am an AI assistant." });
  } });
  const session = createBrowserVoiceSession({ provider: "gemini", inputMode: "text", onConnected: meta => connected.push(meta),
    onEvent: () => {}, onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    assert.equal(fetched, true);
    assert.equal(socket?.binaryType, "arraybuffer");
    socket!.readyState = 1;
    socket!.onopen?.();
    const setup = new Blob([JSON.stringify({ setupComplete: {} })], { type: "application/json" });
    const audio = new TextEncoder().encode(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: {
      mimeType: "audio/pcm;rate=24000", data: "AAABAA==",
    } }] } } })).buffer;
    socket!.onmessage?.({ data: setup });
    socket!.onmessage?.({ data: audio });
    assert.equal(audioStarted, 0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(connected.length, 1);
    assert.equal(connected[0]?.previewId, "preview-1");
    assert.equal(connected[0]?.connectionId, "connection-1");
    assert.equal(audioStarted, 1);
    assert.ok(sent.some(item => (item as { realtimeInput?: { text?: string } }).realtimeInput?.text?.includes("Namaste")));
  } finally {
    session.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
