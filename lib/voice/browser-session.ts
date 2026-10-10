import { getVoiceClientAdapter } from "./client-adapters";
import type { VoiceBehaviorContext, VoiceConnectResult, VoiceEvent } from "./contracts";
import type { AgentConfig } from "../platform/agents";
import { createGeminiBrowserSession } from "./gemini-browser";
import { createClientToolRunner } from "./client-tools";
import { createVoiceDiagnostics, type VoiceRuntimeDiagnostics } from "./diagnostics";
import type { VoiceToolCall } from "./contracts";
import { isVoiceToolName } from "./tools/contracts";
import { createPrivateTurnScheduler } from "./private-turn-scheduler";
import { createContinuousSpeechSession } from "./continuous-speech-browser";
import { createContinuousUnderstanding, type ContinuousUnderstandingSnapshot } from "./continuous-understanding";
import type { ContinuousSpeechGrant, ContinuousSpeechReason, ContinuousSpeechStatus } from "./continuous-speech-contracts";
import type { ConversationEntry } from "./emotional";
import { resolveSpeechDelivery, type SpeechDeliveryDecision, type SpeechDeliveryProfile } from "./speech-delivery";

export interface BrowserVoiceSession {
  connect(): Promise<void>;
  close(): void;
  setMuted(muted: boolean): void;
  /** True when accepted for delivery to the live provider. */
  sendText(text: string): boolean;
  /** Stages bounded guidance. WebRTC finalizes it after the user event and
   * requires an exact acknowledged snapshot before requesting that reply. */
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
  continuousSpeech?: boolean;
  /** Ephemeral hypotheses are deliberately separate from saved transcript events. */
  onUnderstanding?: (snapshot: ContinuousUnderstandingSnapshot) => void;
  onContinuousSpeechStatus?: (status: { state: ContinuousSpeechStatus; reason?: ContinuousSpeechReason }) => void;
}

/** The optional factory seam is for deterministic transport integration tests. */
export function createBrowserVoiceSession(options: BrowserVoiceOptions, dependencies: {
  createContinuousSpeechSession?: typeof createContinuousSpeechSession;
} = {}): BrowserVoiceSession {
  if (options.provider === "gemini") return createGeminiBrowserSession(options);
  const textMode = options.inputMode === "text";
  const earlyEnabled = options.continuousSpeech === true && !textMode && options.provider === "azure";
  const adapter = getVoiceClientAdapter(options.provider);
  const abort = new AbortController();
  const requestId = crypto.randomUUID();
  let providerRequestSent = false;
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
  let speechDeliveryProfile: SpeechDeliveryProfile | undefined;
  let speechDelivery: SpeechDeliveryDecision | undefined;
  let enabledTools: import("./tools/contracts").VoiceToolName[] | undefined;
  let openingMessage: string | undefined;
  let levelContext: AudioContext | undefined;
  let levelSource: MediaStreamAudioSourceNode | undefined;
  let levelTimer: ReturnType<typeof setInterval> | undefined;
  let initialInstructions = "";
  const responseCalls = new Map<string, VoiceToolCall[]>();
  const executingResponses = new Set<string>();
  let toolRunner: ReturnType<typeof createClientToolRunner> | undefined;
  let started = false;
  let muted = false;
  let sidecar: ReturnType<typeof createContinuousSpeechSession> | undefined;
  let understanding: ReturnType<typeof createContinuousUnderstanding> | undefined;
  let sidecarRequested = false;
  let sidecarTerminal = false;
  let submittedSamples = 0;
  let candidateUpdates = 0;
  let lastPrepared = "";
  const finalEntries: ConversationEntry[] = [];
  function remember(entry: ConversationEntry) {
    const found = finalEntries.findIndex(item => item.id === entry.id);
    if (found < 0) finalEntries.push({ ...entry });
    else finalEntries[found] = { ...entry };
    if (finalEntries.length > 450) finalEntries.shift();
  }
  const turns = createPrivateTurnScheduler({
    instructions: () => initialInstructions,
    speechDelivery: () => speechDelivery,
    onDiagnostic: event => diagnostics.privatePreparationEvent(event),
    send: event => { if (!closed && channel?.readyState === "open") channel.send(JSON.stringify(event)); },
    onUserTurn: turn => {
      remember({ ...turn, role: "user" });
      if (speechDeliveryProfile) speechDelivery = resolveSpeechDelivery(speechDeliveryProfile,
        finalEntries.filter((entry): entry is ConversationEntry & { id: string } => typeof entry.id === "string" && entry.id.trim().length > 0));
      diagnostics.userTurnReceived();
      options.onEvent({ type: "item", id: turn.id });
      if (!closed) options.onEvent({ type: "transcript", entry: { ...turn, role: "user" } });
    },
    onCapturedTurn: turn => {
      // close() has already disabled sends. Retain completed ASR before the
      // caller's End/failure handler invalidates the visible conversation.
      options.onEvent({ type: "item", id: turn.id });
      options.onEvent({ type: "transcript", entry: { ...turn, role: "user" } });
    },
    fail,
  });

  if (earlyEnabled) understanding = createContinuousUnderstanding({
    getContext: () => ({ entries: finalEntries.map(entry => ({ ...entry })), relationship: behaviorContext?.relationship, settings: behaviorContext?.settings }),
    onUpdate: snapshot => {
      if (closed) return;
      diagnostics.continuousSpeechUpdate({ interimCount: snapshot.interimCount, sidecarFinalCount: snapshot.sidecarFinalCount, discardedCount: snapshot.discardedCount });
      if (!closed) options.onUnderstanding?.(snapshot);
    },
    onCandidate: guidance => {
      if (closed) return;
      if (turns.prepareBehavior(guidance) && !closed && guidance && guidance !== lastPrepared) {
        candidateUpdates = Math.min(10_000, candidateUpdates + 1);
        diagnostics.continuousSpeechUpdate({ candidateUpdates });
      }
      lastPrepared = guidance || "";
    },
  });

  function endSidecarGrant() {
    if (!sidecarRequested || (!previewId && !connectionId)) return;
    // Independent from the aborted call fetch. Server revocation is idempotent;
    // the gateway also rechecks authority and enforces its hard duration cap.
    void fetch('/api/voice/perception', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(previewId ? { previewId } : { connectionId }) }), keepalive: true }).catch(() => {});
  }
  function sidecarStatus(status: { state: ContinuousSpeechStatus; reason?: ContinuousSpeechReason }) {
    if (closed) return;
    if (sidecarTerminal) return;
    if (status.state === 'unavailable' || status.state === 'ended') sidecarTerminal = true;
    if (status.state === 'unavailable' || status.state === 'ended') {
      understanding?.close();
      turns.prepareBehavior(undefined);
    }
    if (closed) return;
    diagnostics.continuousSpeechUpdate({ status: status.state, ...(status.reason ? { reason: status.reason } : {}) });
    if (!closed) options.onContinuousSpeechStatus?.(status);
  }
  async function startSidecar() {
    if (!earlyEnabled || closed || sidecarRequested || !stream || (!previewId && !connectionId)) return;
    sidecarRequested = true;
    sidecarStatus({ state: 'connecting' });
    const requestAbort = new AbortController();
    const abortRequest = () => requestAbort.abort();
    abort.signal.addEventListener('abort', abortRequest, { once: true });
    const requestTimer = setTimeout(abortRequest, 8_000);
    try {
      if (closed) return;
      const response = await fetch('/api/voice/perception', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: requestAbort.signal,
        body: JSON.stringify({ ...(previewId ? { previewId } : { connectionId }), consent: true }) });
      if (!response.ok) {
        sidecarStatus({ state: 'unavailable', reason: response.status === 503 ? 'configuration' : 'authentication' });
        throw new Error('Speech authorization unavailable.');
      }
      const grant = await response.json() as ContinuousSpeechGrant;
      clearTimeout(requestTimer);
      if (closed) { endSidecarGrant(); return; }
      sidecar = (dependencies.createContinuousSpeechSession || createContinuousSpeechSession)({ grant, stream, signal: abort.signal,
        onStatus: sidecarStatus,
        onHypothesis: value => { if (!closed) understanding?.receive(value); },
        onProgress: value => { if (!closed) {
          submittedSamples = value.submittedSamples;
          understanding?.progress(value.submittedSamples, value.receivedAt);
          // Frame counts are bounded metadata; avoid rendering on every 20 ms frame.
          if (value.submittedSamples % 16_000 === 0) diagnostics.continuousSpeechUpdate({ submittedSamples: value.submittedSamples });
        } },
      });
      sidecar.setMuted(muted);
      await sidecar.connect();
    } catch {
      if (!closed) sidecarStatus({ state: 'unavailable', reason: 'provider' });
      sidecar?.close();
      endSidecarGrant();
    } finally {
      clearTimeout(requestTimer);
      abort.signal.removeEventListener('abort', abortRequest);
    }
  }

  async function finishToolResponse(responseId: string, calls: VoiceToolCall[], generation: number) {
    if (!toolRunner || !channel || closed) return;
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
    responseCalls.delete(responseId);
    turns.toolsDone(generation);
  }

  function close() {
    if (closed) return;
    closed = true;
    let serverStop: Promise<unknown> | undefined;
    if (providerRequestSent && options.provider === 'azure') {
      // Uses our request ID, never a provider call reference. The server can
      // cancel a pending allocation even before the browser receives its SDP.
      serverStop = Promise.resolve().then(() => fetch('/api/voice/control', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', requestId }), keepalive: true })).catch(() => {});
    }
    if (earlyEnabled) diagnostics.continuousSpeechUpdate({ submittedSamples });
    understanding?.close();
    sidecar?.close();
    endSidecarGrant();
    diagnostics.end();
    toolRunner?.close();
    turns.close();
    abort.abort();
    clearTimeout(timeout);
    clearTimeout(disconnectedTimeout);
    clearTimeout(durationLimit);
    clearInterval(levelTimer);
    levelSource?.disconnect();
    if (levelContext) void levelContext.close().catch(() => {});
    stream?.getTracks().forEach(track => track.stop());
    if (channel) { channel.onopen = null; channel.onmessage = null; channel.onclose = null; channel.onerror = null; }
    if (pc) { pc.ontrack = null; pc.onconnectionstatechange = null; }
    if (audio) { audio.pause(); audio.srcObject = null; }
    // Capture/playback and all event observers end immediately. Keep the silent
    // transport briefly so server hangup can obtain its receipt before RTC closes.
    // Browser unload/network failure still has an unconditional teardown bound.
    let transportClosed = false;
    const closeTransport = () => {
      if (transportClosed) return;
      transportClosed = true;
      try { channel?.close(); } catch { /* Already closed. */ }
      try { pc?.close(); } catch { /* Already closed. */ }
    };
    if (serverStop) {
      const teardown = setTimeout(closeTransport, 4_000);
      void serverStop.finally(() => { clearTimeout(teardown); closeTransport(); });
    } else closeTransport();
  }

  function fail(message: string) {
    if (closed) return;
    close();
    options.onFailure(message);
  }

  return {
    close,
    updateBehavior(instructions) {
      if (closed || channel?.readyState !== "open") return false;
      return turns.updateBehavior(instructions);
    },
    sendText(text) {
      const clean = text.trim().slice(0, 4000);
      if (!clean || closed || channel?.readyState !== "open") return false;
      try { return turns.sendText(clean); }
      catch { fail("The voice connection could not send that message. Please try again."); return false; }
    },
    setMuted(value) {
      muted = value;
      stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
      sidecar?.setMuted(value);
      understanding?.setMuted(value);
    },
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
            if (typeof event === "object" && event !== null && "type" in event && event.type === "response.create") turns.opening(event);
            else channel?.send(JSON.stringify(event));
          }); }
          catch { fail("The voice connection could not begin. Please try again."); }
          if (!closed) options.onConnected({ previewId, ...(connectionId ? { connectionId } : {}), ...(enabledTools ? { enabledTools } : {}), ...(behaviorContext ? { behaviorContext } : {}) });
          if (!closed) void startSidecar();
        };
        channel.onmessage = message => {
          if (closed) return;
          let providerEvent;
          try { providerEvent = JSON.parse(message.data); }
          catch { return; /* Ignore malformed/non-JSON provider events. */ }
          try {
            if (!providerEvent || typeof providerEvent !== "object" || Array.isArray(providerEvent)) return;
            const owned = turns.receive(providerEvent);
            if (providerEvent.type === 'input_audio_buffer.speech_started') understanding?.nativeSpeechStarted(providerEvent.item_id);
            if (providerEvent.type === 'input_audio_buffer.speech_stopped') understanding?.nativeSpeechStopped(providerEvent.item_id);
            if (providerEvent.type === 'conversation.item.input_audio_transcription.completed') understanding?.nativeFinal(providerEvent.item_id);
            if (owned) return;
            if (providerEvent?.type === "response.created") turns.responseCreated(providerEvent.response?.id);
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
                const generation = turns.responseDone(responseId, true, providerEvent.response?.status);
                if (generation !== undefined && !executingResponses.has(responseId)) {
                  executingResponses.add(responseId);
                  void finishToolResponse(responseId, calls, generation).catch(() => fail("An in-call action could not finish. End the conversation and try again."));
                }
              }
              else { if (typeof responseId === "string") responseCalls.delete(responseId); turns.responseDone(responseId, false, providerEvent.response?.status ?? null); }
            }
            if (closed) return;
            if (providerEvent?.type === "response.output_audio.delta" || providerEvent?.type === "response.output_audio_transcript.delta" || providerEvent?.type === "response.output_audio_transcript.done") diagnostics.generatedOutputReceived();
            const event = adapter.parseEvent(providerEvent);
            if (event?.type === "error") fail(event.message);
            else if (event) {
              if (event.type === 'transcript') remember(event.entry);
              options.onEvent(event);
            }
          } catch { fail("The voice connection could not process the current turn. Save this conversation and start again."); }
        };
        channel.onclose = () => fail("The voice connection closed. Save your available transcript before starting again.");
        channel.onerror = () => fail("The voice data connection failed. Please try again.");
        const offer = await pc.createOffer();
        if (closed) return;
        await pc.setLocalDescription(offer);
        if (closed) return;
        providerRequestSent = true;
        const response = await fetch("/api/voice/connect", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
          body: JSON.stringify({ requestId, sdp: offer.sdp, mode: options.mode || "release", inputMode: options.inputMode || "microphone", draft: options.draft, contactId: options.contactId, agentId: options.agentId, versionId: options.versionId, releaseId: options.releaseId, campaignRunId: options.mode === "preview" ? undefined : options.campaignRunId, consent: true }),
        });
        const result = await response.json() as VoiceConnectResult & { error?: string };
        if (closed) return;
        if (!response.ok) throw new Error(result.error || "Could not establish a voice connection.");
        if (result.provider !== options.provider || result.transport !== "webrtc" || typeof result.sdp !== "string") throw new Error("The provider configuration changed. Reload this page before trying again.");
        previewId = result.previewId;
        connectionId = result.connectionId;
        behaviorContext = result.behaviorContext;
        speechDeliveryProfile = result.behaviorContext?.speechDelivery ? Object.freeze({ ...result.behaviorContext.speechDelivery }) : undefined;
        if (speechDeliveryProfile && result.provider !== "azure") throw new Error("Configured speech delivery requires Azure Realtime.");
        speechDelivery = speechDeliveryProfile ? resolveSpeechDelivery(speechDeliveryProfile, []) : undefined;
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
