/** Private WebRTC turn ordering. The provider retains VAD interruption/playback
 * truncation; only response creation is client controlled. No provider payloads
 * or caller content are logged here. */
export function createPrivateTurnScheduler(options: {
  send: (event: object) => void;
  instructions: () => string;
  /** Synchronous: the owner stages current-turn guidance inside this callback. */
  onUserTurn: (turn: { id: string; text: string }) => void;
  /** Preserve already captured ASR on close without preparing another reply.
   * Defaults to onUserTurn; all scheduler mutations are disabled first. */
  onCapturedTurn?: (turn: { id: string; text: string }) => void;
  fail: (message: string) => void;
}) {
  type Turn = { id: string; text?: string; committed: boolean; published?: boolean; timer?: ReturnType<typeof setTimeout> };
  let closed = false;
  let busy = false;
  let toolsBusy = false;
  let speakingItem: string | undefined;
  let generation = 0;
  let responseGeneration = 0;
  let revision = 0;
  let behavior = "";
  let responseBehavior = "";
  let activeResponse: string | undefined;
  let interruptionTimer: ReturnType<typeof setTimeout> | undefined;
  const finishedResponses = new Set<string>();
  const seenAudio = new Set<string>();
  const cancellationEvents = new Set<string>();
  const audioTurns: Turn[] = [];
  const typed: Array<{ id: string; text: string }> = [];
  let gate: { instructions: string; behavior: string; generation: number; timer: ReturnType<typeof setTimeout> } | undefined;

  function clearGate() { if (gate) clearTimeout(gate.timer); gate = undefined; }
  function fail(message: string) { if (!closed) options.fail(message); }
  function sendResponse(guidance: string) {
    if (closed) return;
    busy = true;
    responseGeneration = generation;
    responseBehavior = guidance;
    activeResponse = undefined;
    options.send({ type: "response.create" });
  }
  function requestReply(guidance = behavior) {
    if (closed) return;
    const baseline = options.instructions();
    if (!baseline) { fail("The approved voice context is unavailable. Save this conversation and start again."); return; }
    const instructions = `${baseline}${guidance ? `\n<live_behavior_update>\n${guidance}\n</live_behavior_update>` : ""}\n<live_turn_revision>${++revision}</live_turn_revision>`;
    clearGate();
    gate = { instructions, behavior: guidance, generation, timer: setTimeout(() => {
      clearGate();
      fail("The voice provider did not confirm the current turn guidance. Save this conversation and start again.");
    }, 5_000) };
    options.send({ type: "session.update", session: { type: "realtime", instructions } });
  }
  function pump() {
    if (closed || busy || toolsBusy || gate || speakingItem) return;
    if (audioTurns.length) {
      // ASR completion order need not match speech order. Compile guidance only
      // once every pending committed utterance is available, in speech order.
      if (audioTurns.some(turn => !turn.committed || turn.text === undefined)) return;
      const turns = audioTurns.slice();
      for (const turn of turns) clearTimeout(turn.timer);
      for (const turn of turns) {
        turn.published = true;
        options.onUserTurn({ id: turn.id, text: turn.text! });
        if (closed) return;
      }
      audioTurns.splice(0, turns.length);
      requestReply();
    } else if (typed.length) {
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
      closed = true; clearGate(); typed.length = 0;
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
        const current = gate.generation === generation;
        const guidance = gate.behavior;
        clearGate();
        if (current && !speakingItem) sendResponse(guidance);
        else pump();
        return true;
      }
      if (event.type === "input_audio_buffer.speech_started") {
        const existing = audioTurns.find(turn => turn.id === event.item_id);
        if (existing || seenAudio.has(event.item_id)) return false;
        const turn = audioTurn(event.item_id);
        if (!turn) return false;
        speakingItem = turn.id;
        generation++;
        clearGate();
        if (busy && !interruptionTimer) interruptionTimer = setTimeout(() => fail("The voice provider did not finish interrupting the previous reply. Save this conversation and start again."), 5_000);
        // interrupt_response:true leaves cancellation and WebRTC playback/history
        // truncation with the provider. Wait for its response.done before reuse.
        return false;
      }
      if (event.type === "input_audio_buffer.speech_stopped") {
        const turn = audioTurn(event.item_id);
        if (speakingItem === event.item_id) speakingItem = undefined;
        if (turn) awaitTranscript(turn);
        pump(); return false;
      }
      if (event.type === "input_audio_buffer.committed") {
        const turn = audioTurn(event.item_id);
        if (turn) {
          turn.committed = true;
          if (turn.text === undefined) awaitTranscript(turn);
          else { clearTimeout(turn.timer); turn.timer = undefined; }
        }
        pump(); return true;
      }
      if (event.type === "conversation.item.input_audio_transcription.completed") {
        // Uncorrelated or previously-consumed ASR must not create a new turn.
        const turn = audioTurns.find(turn => turn.id === event.item_id);
        if (!turn || turn.text !== undefined) return true;
        if (typeof event.transcript !== "string" || !event.transcript.trim()) {
          fail("The voice transcript was empty. Save this conversation and start again."); return true;
        }
        turn.text = event.transcript.trim().slice(0, 10_000);
        if (turn.committed) { clearTimeout(turn.timer); turn.timer = undefined; }
        pump(); return true;
      }
      return false;
    },
  };
}
