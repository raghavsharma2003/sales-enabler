import type { PrivatePreparationEvent } from "./diagnostics";
import type { SpeechDeliveryDecision } from "./speech-delivery";

/** Private WebRTC turn ordering. The provider retains VAD interruption/playback
 * truncation; only response creation is client controlled. No provider payloads
 * or caller content are logged here. */
export function createPrivateTurnScheduler(options: {
  send: (event: object) => void;
  instructions: () => string;
  /** Pure decision from authoritative final turns; absent preserves old wire behavior. */
  speechDelivery?: () => SpeechDeliveryDecision | undefined;
  /** Synchronous: the owner stages current-turn guidance inside this callback. */
  onUserTurn: (turn: { id: string; text: string }) => void;
  /** Preserve already captured ASR on close without preparing another reply.
   * Defaults to onUserTurn; all scheduler mutations are disabled first. */
  onCapturedTurn?: (turn: { id: string; text: string }) => void;
  fail: (message: string) => void;
  onDiagnostic?: (event: PrivatePreparationEvent) => void;
  /** Monotonic browser clock, injectable for deterministic race tests. */
  now?: () => number;
}) {
  type Turn = { id: string; text?: string; committed: boolean; published?: boolean; stoppedAt?: number; finalAsrAt?: number; timer?: ReturnType<typeof setTimeout> };
  type Snapshot = { context: string; behavior: string; generation: number; speed?: SpeechDeliveryDecision['speed'] };
  const now = options.now ?? (() => performance.now());
  let closed = false;
  let busy = false;
  let toolsBusy = false;
  let speakingItem: string | undefined;
  let generation = 0;
  let responseGeneration = 0;
  let revision = 0;
  let behavior = "";
  // Reversible preparation only. Final publication alone changes `behavior`.
  let prospectiveBehavior: { guidance: string; generation: number; itemId: string } | undefined;
  let responseBehavior = "";
  let activeResponse: string | undefined;
  let interruptionTimer: ReturnType<typeof setTimeout> | undefined;
  const finishedResponses = new Set<string>();
  const seenAudio = new Set<string>();
  const committedAudio = new Set<string>();
  const cancellationEvents = new Set<string>();
  const audioTurns: Turn[] = [];
  const typed: Array<{ id: string; text: string }> = [];
  let gate: (Snapshot & { instructions: string; speculative: boolean; acknowledgedAt?: number; timer?: ReturnType<typeof setTimeout> }) | undefined;
  let eligible: (Snapshot & { finalAsrAt?: number; audio: boolean }) | undefined;
  let outputAcknowledgedAt: number | undefined;
  let outputRequestedAt: number | undefined;
  let releasing = false;
  let pumping = false;
  let pumpAgain = false;

  function clearGate() { if (gate) clearTimeout(gate.timer); gate = undefined; }
  function fail(message: string) { if (!closed) options.fail(message); }
  function sendResponse(guidance: string, acknowledgedAt: number) {
    if (closed) return;
    busy = true;
    responseGeneration = generation;
    responseBehavior = guidance;
    activeResponse = undefined;
    outputAcknowledgedAt = acknowledgedAt;
    outputRequestedAt = now();
    options.send({ type: "response.create" });
  }
  function snapshot(guidance = behavior): Snapshot | undefined {
    const baseline = options.instructions();
    if (!baseline) { fail("The approved voice context is unavailable. Save this conversation and start again."); return; }
    const delivery = options.speechDelivery?.();
    return { context: `${baseline}${guidance ? `\n<live_behavior_update>\n${guidance}\n</live_behavior_update>` : ""}`, behavior: guidance, generation, ...(delivery ? { speed: delivery.speed } : {}) };
  }
  function matches(a: Snapshot, b: Snapshot) {
    return a.generation === b.generation && a.context === b.context && a.behavior === b.behavior && a.speed === b.speed;
  }
  function sendGate(candidate: Snapshot, speculative: boolean) {
    const instructions = `${candidate.context}\n<live_turn_revision>${++revision}</live_turn_revision>`;
    gate = { ...candidate, instructions, speculative, timer: setTimeout(() => {
      clearGate();
      fail("The voice provider did not confirm the current turn guidance. Save this conversation and start again.");
    }, 5_000) };
    options.send({ type: "session.update", session: { type: "realtime", instructions, ...(candidate.speed !== undefined ? { audio: { output: { speed: candidate.speed } } } : {}) } });
  }
  function releaseEligible() {
    if (!eligible || closed || busy || toolsBusy || speakingItem || releasing) return;
    // Keep exactly one update in flight. A stale ACK can drain that update,
    // but cannot authorize a reply or be mistaken for the replacement ACK.
    if (gate && gate.acknowledgedAt === undefined) return;
    if (!gate || !matches(gate, eligible)) {
      clearGate(); sendGate(eligible, false); return;
    }
    const ready = eligible;
    const acknowledged = gate;
    const acknowledgedAt = acknowledged.acknowledgedAt!;
    const stillEligible = () => !closed && !busy && !toolsBusy && !speakingItem &&
      generation === ready.generation && eligible === ready && gate === acknowledged;
    // Observers are synchronous application callbacks. They can close the
    // session or deliver a newer speech generation; neither may be overwritten
    // by the outer release. Queued input must not recursively release this gate.
    releasing = true;
    try {
      if (ready.audio) {
        options.onDiagnostic?.({ type: "pre_ack", hit: acknowledged.speculative });
        if (!stillEligible()) return;
        if (ready.finalAsrAt !== undefined) options.onDiagnostic?.({ type: "final_asr_to_guidance_ack", ms: Math.max(0, acknowledgedAt - ready.finalAsrAt) });
      }
      if (!stillEligible()) return;
      clearGate(); eligible = undefined;
      sendResponse(acknowledged.behavior, acknowledgedAt);
    } finally {
      releasing = false;
    }
  }
  function requestReply(guidance = behavior, finalAsrAt?: number, audio = false) {
    if (closed) return;
    const current = snapshot(guidance);
    if (!current) return;
    eligible = { ...current, finalAsrAt, audio };
    releaseEligible();
  }
  function prepareCandidate() {
    if (closed || busy || toolsBusy || !speakingItem || eligible) return;
    if (gate && gate.acknowledgedAt === undefined) return;
    const candidate = snapshot(prospectiveBehavior?.generation === generation && prospectiveBehavior.itemId === speakingItem
      ? prospectiveBehavior.guidance : behavior);
    if (!candidate || (gate && matches(gate, candidate))) return;
    clearGate(); sendGate(candidate, true);
  }
  function pump() {
    if (pumping) { pumpAgain = true; return; }
    pumping = true;
    try { pumpOnce(); }
    finally {
      pumping = false;
      if (pumpAgain) { pumpAgain = false; pump(); }
    }
  }
  function pumpOnce() {
    if (closed || busy || toolsBusy) return;
    if (speakingItem) { prepareCandidate(); return; }
    if (eligible) { releaseEligible(); return; }
    if (audioTurns.length) {
      // ASR completion order need not match speech order. Compile guidance only
      // once every pending committed utterance is available, in speech order.
      if (audioTurns.some(turn => !turn.committed || turn.text === undefined)) return;
      const turns = audioTurns.slice();
      const capturedGeneration = generation;
      for (const turn of turns) clearTimeout(turn.timer);
      for (const turn of turns) {
        turn.published = true;
        // Remove only this published turn. A close inside the callback must
        // still retain the remaining already-captured final transcripts.
        const index = audioTurns.indexOf(turn);
        if (index >= 0) audioTurns.splice(index, 1);
        options.onUserTurn({ id: turn.id, text: turn.text! });
        if (closed) return;
        if (generation !== capturedGeneration || speakingItem) { pumpAgain = true; return; }
      }
      if (audioTurns.length) { pumpAgain = true; return; }
      // Only synchronous FINAL publication may compile guidance. Candidate
      // readiness never publishes partial text or bypasses this boundary.
      requestReply(behavior, Math.max(...turns.map(turn => turn.finalAsrAt!)), true);
    } else if (typed.length && !gate) {
      const turn = typed.shift()!;
      generation++;
      // The browser's transcript ID is local bookkeeping, not a provider ID.
      // Let Realtime assign its optional item.id, as in the GA wire contract.
      options.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: turn.text }] } });
      options.onUserTurn(turn);
      if (!closed) requestReply();
    }
  }
  function audioTurn(id: unknown): Turn | undefined {
    if (typeof id !== "string" || !id || id.length > 128 || closed) return;
    let turn = audioTurns.find(turn => turn.id === id);
    if (turn || seenAudio.has(id)) return turn;
    if (seenAudio.size >= 450 || audioTurns.length >= 20) {
      fail("The voice input limit was reached. Save this conversation and start again."); return;
    }
    seenAudio.add(id);
    turn = { id, committed: false };
    audioTurns.push(turn);
    return turn;
  }
  function awaitTranscript(turn: Turn) {
    if (turn.timer) return;
    turn.timer = setTimeout(() => fail("The voice transcript did not arrive in time. Save this conversation and start again."), 10_000);
  }
  return {
    close() {
      if (closed) return;
      closed = true; clearGate(); eligible = undefined; prospectiveBehavior = undefined; outputAcknowledgedAt = undefined; typed.length = 0;
      clearTimeout(interruptionTimer);
      const captured = audioTurns.splice(0);
      for (const turn of captured) clearTimeout(turn.timer);
      for (const turn of captured) {
        if (turn.text !== undefined && !turn.published) {
          (options.onCapturedTurn || options.onUserTurn)({ id: turn.id, text: turn.text });
        }
      }
    },
    updateBehavior(instructions: string) {
      const next = instructions.trim().slice(0, 4_000);
      if (closed || !options.instructions() || !next || next === behavior) return false;
      // Staged, never sent independently: a later update cannot replace the
      // instruction snapshot whose acknowledgement a current turn awaits.
      behavior = next; return true;
    },
    /** May prepare an exact candidate during native speech; never publishes a
     * user turn or changes authoritative behavior/response eligibility. */
    prepareBehavior(instructions: string | undefined) {
      if (closed) return false;
      const next = instructions?.trim().slice(0, 4_000);
      if (!next) {
        if (!prospectiveBehavior) return false;
        prospectiveBehavior = undefined;
        pump();
        return true;
      }
      if (!speakingItem || eligible || !options.instructions()) return false;
      if (prospectiveBehavior?.guidance === next && prospectiveBehavior.generation === generation && prospectiveBehavior.itemId === speakingItem) return true;
      prospectiveBehavior = { guidance: next, generation, itemId: speakingItem };
      pump();
      return !closed;
    },
    sendText(text: string) {
      if (closed || typed.length >= 20) return false;
      typed.push({ id: `typed-${crypto.randomUUID()}`, text });
      pump(); return !closed;
    },
    opening(event: object) { busy = true; responseGeneration = generation; options.send(event); },
    responseCreated(id: unknown) {
      if (closed || typeof id !== "string" || !id || id.length > 128 || finishedResponses.has(id)) return;
      if (id === activeResponse) return;
      if (!busy || toolsBusy || gate || activeResponse) {
        fail("The voice provider started an unexpected reply. Save this conversation and start again."); return;
      }
      activeResponse = id;
      // A response.create can cross a VAD start in flight. The provider could
      // not cancel a response that did not exist yet. Cancel that late response
      // explicitly and clear WebRTC playback (which also truncates history).
      if (typeof id === "string" && responseGeneration !== generation) {
        const eventId = `cancel-${crypto.randomUUID()}`;
        cancellationEvents.add(eventId);
        options.send({ type: "response.cancel", response_id: id, event_id: eventId });
        options.send({ type: "output_audio_buffer.clear" });
      }
    },
    responseDone(id: unknown, hasTools: boolean, status: unknown = "completed"): number | undefined {
      if (closed || typeof id !== "string" || !id || id.length > 128 || finishedResponses.has(id) || activeResponse !== id) return;
      // A replay cannot drain a new gate or an already-running tool batch.
      if (!busy || toolsBusy) return;
      if (status !== "completed" && status !== "cancelled") {
        fail("The voice provider could not finish the reply. Save the available transcript and start again."); return;
      }
      finishedResponses.add(id);
      busy = false; activeResponse = undefined;
      clearTimeout(interruptionTimer); interruptionTimer = undefined;
      if (hasTools) { toolsBusy = true; return responseGeneration; }
      pump();
      return undefined;
    },
    toolsDone(capturedGeneration: number) {
      if (closed || !toolsBusy) return;
      toolsBusy = false;
      if (capturedGeneration !== generation || speakingItem || audioTurns.length) { pump(); return; }
      requestReply(responseBehavior);
    },
    /** True means the scheduler owns this event (do not publish ASR twice). */
    receive(event: Record<string, any>): boolean {
      if (closed) return true;
      if (event.type === "error" && event.error?.code === "response_cancel_not_active" && cancellationEvents.delete(event.error?.event_id)) return true;
      if (event.type === "session.updated") {
        if (!gate || event.session?.instructions !== gate.instructions) return true;
        if (gate.speed !== undefined && (event.session?.type !== "realtime" || event.session?.audio?.output?.speed !== gate.speed)) return true;
        if (gate.acknowledgedAt !== undefined) return true;
        clearTimeout(gate.timer); gate.timer = undefined;
        gate.acknowledgedAt = now();
        pump();
        return true;
      }
      if (event.type === "input_audio_buffer.speech_started") {
        const existing = audioTurns.find(turn => turn.id === event.item_id);
        if (existing || seenAudio.has(event.item_id)) return false;
        const turn = audioTurn(event.item_id);
        if (!turn) return false;
        speakingItem = turn.id;
        generation++;
        prospectiveBehavior = undefined;
        options.onDiagnostic?.({ type: "speech_start" });
        eligible = undefined; outputAcknowledgedAt = undefined;
        if (gate?.acknowledgedAt !== undefined) clearGate();
        if (busy && !interruptionTimer) interruptionTimer = setTimeout(() => fail("The voice provider did not finish interrupting the previous reply. Save this conversation and start again."), 5_000);
        // interrupt_response:true leaves cancellation and WebRTC playback/history
        // truncation with the provider. Wait for its response.done before reuse.
        pump(); return false;
      }
      if (event.type === "input_audio_buffer.speech_stopped") {
        const turn = audioTurn(event.item_id);
        if (speakingItem === event.item_id) speakingItem = undefined;
        if (turn) { turn.stoppedAt ??= now(); awaitTranscript(turn); }
        pump(); return false;
      }
      if (event.type === "input_audio_buffer.committed") {
        const turn = audioTurn(event.item_id);
        if (turn) {
          turn.committed = true;
          committedAudio.add(turn.id);
          if (turn.text === undefined) awaitTranscript(turn);
          else { clearTimeout(turn.timer); turn.timer = undefined; }
        }
        pump(); return true;
      }
      if (event.type === "conversation.item.input_audio_transcription.delta") {
        // Observe capability only. Delta strings never enter guidance, tools,
        // transcript persistence or the response eligibility calculation.
        if (seenAudio.has(event.item_id) && typeof event.delta === "string" && event.delta.length > 0) {
          options.onDiagnostic?.({ type: "asr_delta", beforeCommit: !committedAudio.has(event.item_id), duringSpeech: speakingItem === event.item_id });
        }
        return true;
      }
      if (event.type === "conversation.item.input_audio_transcription.completed") {
        // Uncorrelated or previously-consumed ASR must not create a new turn.
        const turn = audioTurns.find(turn => turn.id === event.item_id);
        if (!turn || turn.text !== undefined) return true;
        if (typeof event.transcript !== "string" || !event.transcript.trim()) {
          fail("The voice transcript was empty. Save this conversation and start again."); return true;
        }
        turn.text = event.transcript.trim().slice(0, 10_000);
        turn.finalAsrAt = now();
        if (turn.stoppedAt !== undefined && turn.finalAsrAt >= turn.stoppedAt) options.onDiagnostic?.({ type: "speech_stop_to_final_asr", ms: turn.finalAsrAt - turn.stoppedAt });
        if (turn.committed) { clearTimeout(turn.timer); turn.timer = undefined; }
        pump(); return true;
      }
      if ((event.type === "response.output_audio.delta" || event.type === "response.output_audio_transcript.delta" || event.type === "response.output_audio_transcript.done") &&
          activeResponse && event.response_id === activeResponse && responseGeneration === generation && outputAcknowledgedAt !== undefined) {
        options.onDiagnostic?.({ type: "guidance_ack_to_first_output", ms: now() - outputAcknowledgedAt });
        if (outputRequestedAt !== undefined) options.onDiagnostic?.({ type: "response_request_to_first_output", ms: now() - outputRequestedAt });
        outputAcknowledgedAt = undefined;
      }
      return false;
    },
  };
}
