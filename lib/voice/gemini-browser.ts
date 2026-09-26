import { createGeminiEventState, parseGeminiServerMessage } from "./client-adapters";
import type { VoiceConnectResult } from "./contracts";
import type { BrowserVoiceOptions, BrowserVoiceSession } from "./browser-session";
import { createClientToolRunner } from "./client-tools";
import { createVoiceDiagnostics } from "./diagnostics";
import { isVoiceToolName } from "./tools/contracts";

const LIVE_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export function resamplePcm16(input: Float32Array, sourceRate: number, targetRate = 16_000): Int16Array {
  if (!Number.isFinite(sourceRate) || sourceRate < targetRate || targetRate <= 0) throw new Error("Unsupported microphone sample rate.");
  const output = new Int16Array(Math.floor(input.length * targetRate / sourceRate));
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < output.length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const sample = input[left] + (input[Math.min(left + 1, input.length - 1)] - input[left]) * (position - left);
    output[i] = Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767));
  }
  return output;
}

function encodePcm(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function decodePcm(base64: string): Float32Array {
  const binary = atob(base64);
  if (binary.length % 2) throw new Error("Invalid provider audio.");
  const output = new Float32Array(binary.length / 2);
  for (let index = 0; index < output.length; index++) {
    const value = binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8);
    output[index] = (value >= 0x8000 ? value - 0x10000 : value) / 32768;
  }
  return output;
}

export function createGeminiBrowserSession(options: BrowserVoiceOptions): BrowserVoiceSession {
  const textMode = options.inputMode === "text";
  const abort = new AbortController();
  const diagnostics = createVoiceDiagnostics(options.onDiagnostics);
  const eventState = createGeminiEventState();
  const activeSources = new Set<AudioBufferSourceNode>();
  let closed = false;
  let connected = false;
  let muted = false;
  let stream: MediaStream | undefined;
  let socket: WebSocket | undefined;
  let context: AudioContext | undefined;
  let microphone: MediaStreamAudioSourceNode | undefined;
  let processor: ScriptProcessorNode | undefined;
  let silent: GainNode | undefined;
  let connectLimit: ReturnType<typeof setTimeout> | undefined;
  let durationLimit: ReturnType<typeof setTimeout> | undefined;
  let nextPlaybackAt = 0;
  let lastLevelAt = 0;
  let pendingBehavior = "";
  let lastBehavior = "";
  const incomingFrames: unknown[] = [];
  let decodingBlob = false;
  let toolRunner: ReturnType<typeof createClientToolRunner> | undefined;
  const seenToolIds = new Set<string>();
  const cancelledToolIds = new Set<string>();
  const markedUserTurnIds = new Set<string>();
  let started = false;

  function stopPlayback() {
    for (const source of activeSources) { try { source.stop(); } catch { /* Already stopped. */ } }
    activeSources.clear();
    nextPlaybackAt = context?.currentTime || 0;
  }

  function close() {
    if (closed) return;
    closed = true;
    diagnostics.end();
    toolRunner?.close();
    abort.abort();
    incomingFrames.length = 0;
    clearTimeout(connectLimit); clearTimeout(durationLimit);
    stopPlayback();
    if (processor) { processor.onaudioprocess = null; processor.disconnect(); }
    microphone?.disconnect(); silent?.disconnect();
    stream?.getTracks().forEach(track => track.stop());
    if (socket) { socket.onopen = null; socket.onmessage = null; socket.onclose = null; socket.onerror = null; socket.close(); }
    if (context) void context.close().catch(() => {});
  }

  function fail(message: string) {
    if (closed) return;
    close(); options.onFailure(message);
  }

  function playChunk(base64: string) {
    if (!context || closed) return;
    const samples = decodePcm(base64);
    if (!samples.length) return;
    const buffer = context.createBuffer(1, samples.length, 24_000);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => { activeSources.delete(source); source.disconnect(); };
    activeSources.add(source);
    nextPlaybackAt = Math.max(nextPlaybackAt, context.currentTime + 0.02);
    source.start(nextPlaybackAt);
    nextPlaybackAt += buffer.duration;
  }

  function send(message: unknown): boolean {
    if (socket?.readyState !== WebSocket.OPEN || closed) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function flushBehavior() {
    if (!connected || !pendingBehavior || pendingBehavior === lastBehavior) return;
    // Gemini cannot mutate setup while connected. Client content becomes guidance for
    // the next turn; sending only after turnComplete avoids interrupting speech.
    const next = pendingBehavior;
    if (send({ clientContent: { turns: [{ role: "user", parts: [{ text:
      `Session behavior guidance for subsequent turns; this is not a caller utterance. Follow the original system instruction if anything conflicts.\n${next}` }] }], turnComplete: false } })) {
      lastBehavior = next;
      pendingBehavior = "";
    }
  }

  function handleProviderMessage(raw: string) {
    if (closed) return;
    try {
      const parsed = parseGeminiServerMessage(JSON.parse(raw), eventState);
      if (parsed.tooManyToolCalls) { fail("The voice provider requested too many actions at once. End the conversation and try again."); return; }
      if (parsed.ready && !connected) {
        connected = true;
        diagnostics.ready();
        clearTimeout(connectLimit);
        durationLimit = setTimeout(() => fail("The 10-minute conversation limit was reached. Save this transcript before starting another session."), 10 * 60_000);
        const enabledTools = (connectionResult?.enabledTools || []).filter((tool): tool is import("./tools/contracts").VoiceToolName => isVoiceToolName(tool));
        options.onConnected({ previewId: connectionResult?.previewId, ...(connectionResult?.connectionId ? { connectionId: connectionResult.connectionId } : {}),
          ...(enabledTools.length ? { enabledTools } : {}),
          ...(connectionResult?.behaviorContext ? { behaviorContext: connectionResult.behaviorContext } : {}) });
        const greeting = typeof connectionResult?.openingMessage === "string" ? connectionResult.openingMessage.trim().slice(0, 2_000) : "";
        send({ realtimeInput: { text: greeting
          ? `For your first spoken response, say this approved opening message exactly as written, without planning or extra questions: ${JSON.stringify(greeting)}`
          : "Begin with your configured opening message and AI disclosure. If no opening message is supplied, greet briefly and ask one question." } });
      }
      if (parsed.interrupted) stopPlayback();
      for (const id of parsed.cancelledToolIds) cancelledToolIds.add(id);
      toolRunner?.cancel(parsed.cancelledToolIds);
      if (parsed.toolCalls.length && toolRunner) {
        const calls = parsed.toolCalls.filter(call => { if (seenToolIds.has(call.id)) return false; seenToolIds.add(call.id); return true; });
        if (calls.length) void Promise.all(calls.map(async call => {
          diagnostics.toolRequested();
          if (isVoiceToolName(call.name)) options.onEvent({ type: "tool", phase: "requested", id: call.id, name: call.name });
          const result = await toolRunner!.run(call);
          if (closed || cancelledToolIds.has(call.id)) return null;
          diagnostics.toolResult(result.status);
          if (isVoiceToolName(call.name)) options.onEvent({ type: "tool", phase: "result", id: call.id, name: call.name,
            status: result.status as "available" | "not_available" | "awaiting_review",
            message: typeof result.message === "string" ? result.message.slice(0, 300) : undefined,
            actionId: typeof result.actionId === "string" ? result.actionId.slice(0, 100) : undefined });
          return { id: call.id, name: call.name, response: result };
        })).then(functionResponses => {
          if (!closed && functionResponses.some(Boolean)) send({ toolResponse: { functionResponses: functionResponses.filter(Boolean) } });
        }).catch(() => { /* Tool failures are returned as bounded unavailable results. */ });
      }
      for (const event of parsed.events) {
        if (event.type === "transcript" && event.entry.role === "user" && !markedUserTurnIds.has(event.entry.id)) { markedUserTurnIds.add(event.entry.id); diagnostics.userTurnReceived(); }
        if (event.type === "transcript" && event.entry.role === "assistant") diagnostics.generatedOutputReceived();
        options.onEvent(event);
      }
      if (parsed.audioChunks.length) diagnostics.generatedOutputReceived();
      for (const chunk of parsed.audioChunks) playChunk(chunk);
      if (parsed.turnComplete) flushBehavior();
    } catch { /* Ignore malformed provider events; never execute provider tool calls. */ }
  }

  function drainIncomingFrames() {
    if (closed || decodingBlob) return;
    while (incomingFrames.length) {
      const frame = incomingFrames.shift();
      if (typeof frame === "string") { if (frame.length <= 2_000_000) handleProviderMessage(frame); continue; }
      if (frame instanceof ArrayBuffer || ArrayBuffer.isView(frame)) {
        const bytes = frame instanceof ArrayBuffer ? new Uint8Array(frame) : new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
        if (bytes.byteLength <= 2_000_000) {
          try { handleProviderMessage(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { /* Ignore invalid UTF-8. */ }
        }
        continue;
      }
      if (typeof Blob !== "undefined" && frame instanceof Blob && frame.size <= 2_000_000) {
        decodingBlob = true;
        void frame.text().then(text => { if (!closed) handleProviderMessage(text); })
          .catch(() => { /* Ignore unreadable provider frame. */ })
          .finally(() => { decodingBlob = false; drainIncomingFrames(); });
        return;
      }
    }
  }

  let connectionResult: Extract<VoiceConnectResult, { provider: "gemini" }> | undefined;

  async function connect() {
    if (closed || started) return;
    started = true;
    diagnostics.start();
    try {
      if (!window.isSecureContext || typeof AudioContext === "undefined" || typeof WebSocket === "undefined" || (!textMode && !navigator.mediaDevices?.getUserMedia)) throw new Error(textMode
        ? "Use a browser with audio support over HTTPS or localhost."
        : "Use a browser with microphone and audio support over HTTPS or localhost.");
      connectLimit = setTimeout(() => fail(textMode
        ? "The connection timed out. Check your connection, then try again."
        : "The connection timed out. Check your microphone permission and connection, then try again."), 40_000);
      // Resume while the call-start gesture is still active, before mic and network awaits.
      context = new AudioContext();
      let resumeLimit: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([context.resume(), new Promise<never>((_, reject) => {
          resumeLimit = setTimeout(() => reject(new Error("Audio playback did not start. Click Start again and allow audio for this site.")), 6_000);
        })]);
      } finally { clearTimeout(resumeLimit); }
      if (closed) return;
      if (!textMode) {
        const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (closed) { captured.getTracks().forEach(track => track.stop()); return; }
        stream = captured;
      }
      const response = await fetch("/api/voice/connect", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ mode: options.mode || "release", inputMode: options.inputMode || "microphone", draft: options.draft, contactId: options.contactId, agentId: options.agentId, versionId: options.versionId, releaseId: options.releaseId, campaignRunId: options.mode === "preview" ? undefined : options.campaignRunId, consent: true }),
      });
      const result = await response.json() as VoiceConnectResult & { error?: string };
      if (closed) return;
      if (!response.ok) throw new Error(result.error || "Could not establish a voice connection.");
      if (result.provider !== "gemini" || result.transport !== "websocket" || typeof result.token !== "string" || !result.token || !result.setup || typeof result.setup !== "object") throw new Error("The provider configuration changed. Reload this page before trying again.");
      connectionResult = result;
      toolRunner = createClientToolRunner({ connectionId: result.connectionId, previewId: result.previewId, enabledTools: result.enabledTools }, abort.signal);
      if (stream) {
        microphone = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(2048, 1, 1);
        silent = context.createGain(); silent.gain.value = 0;
        microphone.connect(processor); processor.connect(silent); silent.connect(context.destination);
        processor.onaudioprocess = event => {
          if (closed || !connected || muted || socket?.readyState !== WebSocket.OPEN) return;
          const samples = event.inputBuffer.getChannelData(0);
          if (Date.now() - lastLevelAt > 100) {
            let energy = 0;
            for (const sample of samples) energy += sample * sample;
            options.onEvent({ type: "audiolevel", level: Math.min(1, Math.sqrt(energy / samples.length) * 5) });
            lastLevelAt = Date.now();
          }
          // Bound memory growth on a congested WebSocket instead of buffering raw speech indefinitely.
          if (socket.bufferedAmount > 1_000_000) return;
          const pcm = resamplePcm16(samples, context!.sampleRate);
          if (pcm.length) send({ realtimeInput: { audio: { data: encodePcm(pcm), mimeType: "audio/pcm;rate=16000" } } });
        };
        stream.getTracks().forEach(track => { track.onended = () => fail("Microphone access ended. Check your microphone and start again."); });
      }
      socket = new WebSocket(`${LIVE_URL}?access_token=${encodeURIComponent(result.token)}`);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => send({ setup: result.setup });
      socket.onmessage = message => { if (!closed) { incomingFrames.push(message.data); drainIncomingFrames(); } };
      socket.onerror = () => fail("The voice data connection failed. Please try again.");
      socket.onclose = () => fail("The voice connection closed. Save your available transcript before starting again.");
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      fail(denied ? "Microphone access was denied. Allow microphone access in your browser, then try again." : error instanceof Error ? error.message : "Could not start the voice conversation.");
    }
  }

  return {
    connect, close,
    updateBehavior(instructions) {
      const next = instructions.trim().slice(0, 4_000);
      if (!connected || closed || !next || next === lastBehavior) return false;
      pendingBehavior = next;
      return true;
    },
    setMuted(nextMuted) {
      if (textMode) return;
      muted = nextMuted;
      stream?.getAudioTracks().forEach(track => { track.enabled = !nextMuted; });
      if (nextMuted) { send({ realtimeInput: { audioStreamEnd: true } }); options.onEvent({ type: "audiolevel", level: 0 }); }
    },
    sendText(text) {
      const clean = text.trim().slice(0, 4000);
      if (!connected || closed || !clean) return false;
      try {
        if (send({ realtimeInput: { text: clean } })) {
          diagnostics.userTurnReceived();
          const id = `typed-${crypto.randomUUID()}`;
          options.onEvent({ type: "item", id });
          options.onEvent({ type: "transcript", entry: { id, role: "user", text: clean } });
          return true;
        }
      } catch { fail("The voice connection could not send that message. Please try again."); }
      return false;
    },
  };
}
