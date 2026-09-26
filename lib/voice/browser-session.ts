import { getVoiceClientAdapter } from "./client-adapters";
import type { VoiceBehaviorContext, VoiceConnectResult, VoiceEvent } from "./contracts";
import type { AgentConfig } from "../platform/agents";
import { createGeminiBrowserSession } from "./gemini-browser";
import { createClientToolRunner } from "./client-tools";
import { createVoiceDiagnostics, type VoiceRuntimeDiagnostics } from "./diagnostics";
import type { VoiceToolCall } from "./contracts";
import { isVoiceToolName } from "./tools/contracts";

export interface BrowserVoiceSession {
  connect(): Promise<void>;
  close(): void;
  setMuted(muted: boolean): void;
  /** True when accepted for delivery to the live provider. */
  sendText(text: string): boolean;
  /** Applies bounded in-call guidance to later model turns. */
  updateBehavior(instructions: string): boolean;
}

export interface BrowserVoiceOptions {
  provider: string;
  inputMode?: "microphone" | "text";
  mode?: "preview" | "release";
  draft?: AgentConfig;
  contactId?: string;
  agentId?: string;
  versionId?: string;
  releaseId?: string;
  campaignRunId?: string;
  onConnected: (meta?: { previewId?: string; connectionId?: string; enabledTools?: import("./tools/contracts").VoiceToolName[]; behaviorContext?: VoiceBehaviorContext }) => void;
  onEvent: (event: VoiceEvent) => void;
  onFailure: (message: string) => void;
  onDiagnostics?: (snapshot: VoiceRuntimeDiagnostics) => void;
}

export function createBrowserVoiceSession(options: BrowserVoiceOptions): BrowserVoiceSession {
  if (options.provider === "gemini") return createGeminiBrowserSession(options);
  const textMode = options.inputMode === "text";
  const adapter = getVoiceClientAdapter(options.provider);
  const abort = new AbortController();
  const diagnostics = createVoiceDiagnostics(options.onDiagnostics);
  let closed = false;
  let pc: RTCPeerConnection | undefined;
  let stream: MediaStream | undefined;
  let channel: RTCDataChannel | undefined;
  let audio: HTMLAudioElement | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let disconnectedTimeout: ReturnType<typeof setTimeout> | undefined;
  let durationLimit: ReturnType<typeof setTimeout> | undefined;
  let previewId: string | undefined;
  let connectionId: string | undefined;
  let behaviorContext: VoiceBehaviorContext | undefined;
  let enabledTools: import("./tools/contracts").VoiceToolName[] | undefined;
  let openingMessage: string | undefined;
  let levelContext: AudioContext | undefined;
  let levelSource: MediaStreamAudioSourceNode | undefined;
  let levelTimer: ReturnType<typeof setInterval> | undefined;
  let responsePending = false;
  let initialInstructions = "";
  let lastBehavior = "";
  const typedQueue: Array<{ id: string; text: string }> = [];
  const responseCalls = new Map<string, VoiceToolCall[]>();
  const executingResponses = new Set<string>();
  let toolRunner: ReturnType<typeof createClientToolRunner> | undefined;
  let started = false;

  async function finishToolResponse(responseId: string, calls: VoiceToolCall[]) {
    if (!toolRunner || !channel || closed) return;
    responsePending = true;
    await Promise.all(calls.map(async call => {
      diagnostics.toolRequested();
      if (isVoiceToolName(call.name)) options.onEvent({ type: "tool", phase: "requested", id: call.id, name: call.name });
      const result = await toolRunner!.run(call);
      if (closed || channel?.readyState !== "open") return;
      diagnostics.toolResult(result.status);
      if (isVoiceToolName(call.name)) options.onEvent({ type: "tool", phase: "result", id: call.id, name: call.name,
        status: result.status as "available" | "not_available" | "awaiting_review",
        message: typeof result.message === "string" ? result.message.slice(0, 300) : undefined,
        actionId: typeof result.actionId === "string" ? result.actionId.slice(0, 100) : undefined });
      channel.send(JSON.stringify({ type: "conversation.item.create", item: {
        type: "function_call_output", call_id: call.id, output: JSON.stringify(result),
      } }));
    }));
    if (closed || channel?.readyState !== "open") return;
    // One continuation after the entire response's function calls have outputs.
    channel.send(JSON.stringify({ type: "response.create" }));
    responseCalls.delete(responseId);
  }

  function sendNextTypedTurn() {
    if (closed || responsePending || channel?.readyState !== "open" || !typedQueue.length) return;
    const next = typedQueue[0];
    try {
      // Realtime permits one active response. Keep the next typed turn queued
      // until the previous response.done, including the automatic greeting.
      responsePending = true;
      channel.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: next.text }] } }));
      channel.send(JSON.stringify({ type: "response.create" }));
      typedQueue.shift();
      diagnostics.userTurnReceived();
      options.onEvent({ type: "item", id: next.id });
      options.onEvent({ type: "transcript", entry: { id: next.id, role: "user", text: next.text } });
    } catch { fail("The voice connection could not send that message. Please try again."); }
  }

  function close() {
    if (closed) return;
    closed = true;
    diagnostics.end();
    toolRunner?.close();
    typedQueue.length = 0;
    abort.abort();
    clearTimeout(timeout);
    clearTimeout(disconnectedTimeout);
    clearTimeout(durationLimit);
    clearInterval(levelTimer);
    levelSource?.disconnect();
    if (levelContext) void levelContext.close().catch(() => {});
    stream?.getTracks().forEach(track => track.stop());
    if (channel) { channel.onopen = null; channel.onmessage = null; channel.onclose = null; channel.onerror = null; channel.close(); }
    if (pc) { pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    if (audio) { audio.pause(); audio.srcObject = null; }
  }

  function fail(message: string) {
    if (closed) return;
    close();
    options.onFailure(message);
  }

  return {
    close,
    updateBehavior(instructions) {
      const next = instructions.trim().slice(0, 4_000);
      if (closed || !initialInstructions || !next || next === lastBehavior || channel?.readyState !== "open") return false;
      try {
        channel.send(JSON.stringify({ type: "session.update", session: { instructions: `${initialInstructions}\n<live_behavior_update>\n${next}\n</live_behavior_update>` } }));
        lastBehavior = next;
        return true;
      } catch { return false; }
    },
    sendText(text) {
      const clean = text.trim().slice(0, 4000);
      if (!clean || closed || channel?.readyState !== "open" || typedQueue.length >= 20) return false;
      typedQueue.push({ id: `typed-${crypto.randomUUID()}`, text: clean });
      sendNextTypedTurn();
      return !closed;
    },
    setMuted(muted) { stream?.getAudioTracks().forEach(track => { track.enabled = !muted; }); },
    async connect() {
      if (closed || started) return;
      started = true;
      diagnostics.start();
      try {
        if (!window.isSecureContext || typeof RTCPeerConnection === "undefined" || (!textMode && !navigator.mediaDevices?.getUserMedia)) throw new Error(textMode
          ? "Use a browser with WebRTC audio support over HTTPS or localhost."
          : "Use a browser with microphone support over HTTPS or localhost.");
        timeout = setTimeout(() => fail(textMode
          ? "The connection timed out. Check your connection, then try again."
          : "The connection timed out. Check your microphone permission and connection, then try again."), 40_000);
        if (!textMode) {
          const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          // A permission prompt can resolve after the operator has already pressed End.
          if (closed) { microphone.getTracks().forEach(track => track.stop()); return; }
          stream = microphone;
          if (typeof AudioContext !== "undefined") {
            try {
              levelContext = new AudioContext();
              void levelContext.resume().catch(() => {});
              levelSource = levelContext.createMediaStreamSource(microphone);
              const analyser = levelContext.createAnalyser();
              analyser.fftSize = 512;
              levelSource.connect(analyser);
              const samples = new Float32Array(analyser.fftSize);
              levelTimer = setInterval(() => {
                if (closed) return;
                analyser.getFloatTimeDomainData(samples);
                let energy = 0;
                for (const sample of samples) energy += sample * sample;
                options.onEvent({ type: "audiolevel", level: Math.min(1, Math.sqrt(energy / samples.length) * 5) });
              }, 100);
            } catch { /* Audio level is informational; connection must still work. */ }
          }
        }
        pc = new RTCPeerConnection();
        audio = new Audio();
        audio.autoplay = true;
        pc.ontrack = event => {
          if (closed || !audio) return;
          audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
          void audio.play().catch(() => fail("Your browser blocked voice playback. Allow audio for this site and start again."));
        };
        if (textMode) pc.addTransceiver("audio", { direction: "recvonly" });
        else stream!.getTracks().forEach(track => {
          pc?.addTrack(track, stream!);
          track.onended = () => fail("Microphone access ended. Check your microphone and start again.");
        });
        pc.onconnectionstatechange = () => {
          if (closed || !pc) return;
          if (pc.connectionState === "failed" || pc.connectionState === "closed") fail("The voice connection ended. Your available transcript is still here to save.");
          if (pc.connectionState === "disconnected" && !disconnectedTimeout) disconnectedTimeout = setTimeout(() => fail("The voice connection was interrupted. Save the available transcript before reconnecting."), 8_000);
          if (pc.connectionState === "connected") { clearTimeout(disconnectedTimeout); disconnectedTimeout = undefined; }
        };
        channel = pc.createDataChannel(adapter.dataChannelName);
        channel.onopen = () => {
          if (closed) return;
          diagnostics.ready();
          clearTimeout(timeout);
          durationLimit = setTimeout(() => fail("The 10-minute conversation limit was reached. Save this transcript before starting another session."), 10 * 60_000);
          try { adapter.openingEvents(openingMessage).forEach(event => {
            if (typeof event === "object" && event !== null && "type" in event && event.type === "response.create") responsePending = true;
            channel?.send(JSON.stringify(event));
          }); }
          catch { fail("The voice connection could not begin. Please try again."); }
          if (!closed) options.onConnected({ previewId, ...(connectionId ? { connectionId } : {}), ...(enabledTools ? { enabledTools } : {}), ...(behaviorContext ? { behaviorContext } : {}) });
        };
        channel.onmessage = message => {
          if (closed) return;
          try {
            const providerEvent = JSON.parse(message.data);
            if (providerEvent?.type === "response.created") responsePending = true;
            if (providerEvent?.type === "response.function_call_arguments.done" && typeof providerEvent.call_id === "string" && typeof providerEvent.name === "string" && typeof providerEvent.response_id === "string" && !executingResponses.has(providerEvent.response_id)) {
              if (providerEvent.call_id.length > 128 || providerEvent.name.length > 100 || providerEvent.response_id.length > 128 || typeof providerEvent.arguments !== "string" || providerEvent.arguments.length > 12_000) { fail("The voice provider sent an oversized in-call action. End the conversation and try again."); return; }
              const calls = responseCalls.get(providerEvent.response_id) || [];
              if (calls.length >= 16 && !calls.some(call => call.id === providerEvent.call_id)) { fail("The voice provider requested too many actions at once. End the conversation and try again."); return; }
              if (!calls.some(call => call.id === providerEvent.call_id)) calls.push({ id: providerEvent.call_id, name: providerEvent.name, arguments: providerEvent.arguments, responseId: providerEvent.response_id });
              responseCalls.set(providerEvent.response_id, calls);
            }
            if (providerEvent?.type === "response.done") {
              const responseId = providerEvent.response?.id;
              if (typeof responseId === "string" && executingResponses.has(responseId)) return;
              const calls = typeof responseId === "string" ? responseCalls.get(responseId) : undefined;
              if (calls?.length && providerEvent.response?.status === "completed") {
                if (!executingResponses.has(responseId)) {
                  executingResponses.add(responseId);
                  void finishToolResponse(responseId, calls).catch(() => fail("An in-call action could not finish. End the conversation and try again."));
                }
              }
              else { if (typeof responseId === "string") responseCalls.delete(responseId); responsePending = false; sendNextTypedTurn(); }
            }
            if (providerEvent?.type === "conversation.item.input_audio_transcription.completed") diagnostics.userTurnReceived();
            if (providerEvent?.type === "response.output_audio.delta" || providerEvent?.type === "response.output_audio_transcript.delta" || providerEvent?.type === "response.output_audio_transcript.done") diagnostics.generatedOutputReceived();
            const event = adapter.parseEvent(providerEvent);
            if (event?.type === "error") fail(event.message);
            else if (event) options.onEvent(event);
          } catch { /* Ignore malformed/non-JSON provider events, never execute them. */ }
        };
        channel.onclose = () => fail("The voice connection closed. Save your available transcript before starting again.");
        channel.onerror = () => fail("The voice data connection failed. Please try again.");
        const offer = await pc.createOffer();
        if (closed) return;
        await pc.setLocalDescription(offer);
        if (closed) return;
        const response = await fetch("/api/voice/connect", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
          body: JSON.stringify({ sdp: offer.sdp, mode: options.mode || "release", inputMode: options.inputMode || "microphone", draft: options.draft, contactId: options.contactId, agentId: options.agentId, versionId: options.versionId, releaseId: options.releaseId, campaignRunId: options.mode === "preview" ? undefined : options.campaignRunId, consent: true }),
        });
        const result = await response.json() as VoiceConnectResult & { error?: string };
        if (closed) return;
        if (!response.ok) throw new Error(result.error || "Could not establish a voice connection.");
        if (result.provider !== options.provider || result.transport !== "webrtc" || typeof result.sdp !== "string") throw new Error("The provider configuration changed. Reload this page before trying again.");
        previewId = result.previewId;
        connectionId = result.connectionId;
        behaviorContext = result.behaviorContext;
        enabledTools = (result.enabledTools || []).filter((tool): tool is import("./tools/contracts").VoiceToolName => isVoiceToolName(tool));
        toolRunner = createClientToolRunner({ connectionId: result.connectionId, previewId: result.previewId, enabledTools: result.enabledTools }, abort.signal);
        openingMessage = typeof result.openingMessage === "string" ? result.openingMessage.slice(0, 2_000) : undefined;
        initialInstructions = typeof result.initialInstructions === "string" ? result.initialInstructions.slice(0, 60_000) : "";
        await pc.setRemoteDescription({ type: "answer", sdp: result.sdp });
      } catch (error) {
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        fail(denied ? "Microphone access was denied. Allow microphone access in your browser, then try again." : error instanceof Error ? error.message : "Could not start the voice conversation.");
      }
    },
  };
}
