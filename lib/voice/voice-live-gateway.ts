import type { VoiceBehaviorContext, VoiceToolCall } from './contracts';
import type { LiveVoiceProfile } from './live-voice';
import type { VoiceToolName, VoiceToolResult } from './tools/contracts';
import type { VoiceLiveServerEvent } from './voice-live-protocol';
import { parseVoiceLiveClientEvent, VOICE_LIVE_INPUT_FRAME_BYTES, VOICE_LIVE_MAX_AUDIO_BYTES, type VoiceLivePlayedItem } from './voice-live-protocol';
import { buildVoiceLiveSession, matchesVoiceLiveSessionAck, normalizeVoiceLiveEvent, type VoiceLiveSessionUpdate } from './voice-live-session';
import { createPrivateTurnScheduler } from './private-turn-scheduler';
import { getVoiceClientAdapter } from './client-adapters';
import { compileRelationalRuntime } from './relational-runtime';
import { resolveSpeechDelivery } from './speech-delivery';
import { isVoiceToolName } from './tools/contracts';
import type { TranscriptEntry } from './contracts';
import { voiceLivePhaseInstructions, type VoiceLiveConversationPhase } from './voice-live-prompt';

export type VoiceLiveGatewayReason = 'ended' | 'protocol' | 'provider' | 'authentication' | 'expired' | 'backpressure' | 'input_limit' | 'output_limit' | 'session_update_timeout' | 'cancellation_timeout' | 'tool_failed';
/** Projection of a claimed, immutable private-call authority. Never browser input. */
export type VoiceLiveGatewayAuthority = {
  sessionEpoch: string;
  deadlineAt: string;
  inputMode: 'text' | 'microphone';
  model: string;
  liveVoiceProfile: LiveVoiceProfile;
  instructions: string;
  openingMessage: string;
  speechVocabulary?: readonly string[];
  behaviorContext: VoiceBehaviorContext;
  enabledTools: VoiceToolName[];
  previewId?: string;
  connectionId?: string;
};
export type VoiceLiveGatewaySummary = { reason: VoiceLiveGatewayReason; inputBytes: number; outputBytes: number; responseCount: number; durationMs: number };
export type VoiceLiveGatewayOptions = {
  authority: VoiceLiveGatewayAuthority;
  sendProvider(event: Record<string, any>): void;
  sendClient(event: VoiceLiveServerEvent): void;
  closeProvider(): void;
  assertActive(): Promise<void>;
  executeTool(call: VoiceToolCall, signal: AbortSignal): Promise<VoiceToolResult>;
  /** Host confirms its owned upstream socket closed before releasing the durable lease. */
  finish(summary: VoiceLiveGatewaySummary): Promise<void>;
  now?: () => number;
};

type AudioItem = { id: string; contentIndex: number; samples: number; forwarded: number; played: number; sequence: number };
type ResponseState = { id?: string; cancelled: boolean; done: boolean; declaredItems: Set<string>; items: Map<string, AudioItem>; calls: Map<string, VoiceToolCall>; toolsStarted: boolean };
type Update = { envelope: VoiceLiveSessionUpdate; initial: boolean; sent: boolean; acknowledged: boolean; checking: boolean; timer?: ReturnType<typeof setTimeout> };
type Interruption = { response: ResponseState; snapshot: boolean; truncating: boolean; awaiting: Map<string, number>; timer: ReturnType<typeof setTimeout> };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** One claimed private session, using the existing final-turn scheduler. The host
 * owns sockets/admission; this adapter owns only Voice Live wire/playout semantics. */
export function createVoiceLiveGatewaySession(options: VoiceLiveGatewayOptions) {
  const authority = structuredClone(options.authority);
  const now = options.now ?? (() => Date.now());
  const began = now();
  const entries: TranscriptEntry[] = [];
  const responses = new Map<string, ResponseState>();
  const requests = new Map<string, string>();
  const jobs = new Set<AbortController>();
  const adapter = getVoiceClientAdapter('azure');
  let closed = false, started = false, ready = false;
  let pendingResponse: ResponseState | undefined, activeResponse: ResponseState | undefined, playbackResponse: ResponseState | undefined;
  let update: Update | undefined, interruption: Interruption | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined, recheckTimer: ReturnType<typeof setTimeout> | undefined;
  let inputBytes = 0, outputBytes = 0, responseCount = 0, toolCount = 0, controlGeneration = 0;
  let frameTokens = 25, frameRefillAt = now();
  // This Voice Live path has not accepted mid-session rate changes. Freeze the
  // initial selection even for historical configurations that enabled adaptation.
  const delivery = resolveSpeechDelivery(authority.behaviorContext.speechDelivery, []);
  let phase: VoiceLiveConversationPhase = 'continuation';
  const itemKey = (id: string, contentIndex: number) => `${id}:${contentIndex}`;
  // Provider response.done does not mean the browser finished playing its PCM.
  // Keep the existing single-response playback ledger valid across tool replies.
  const blocked = () => !!interruption || [...responses.values()].some(response => !response.cancelled && [...response.items.values()].some(item => item.forwarded > item.played));
  async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Voice Live operation timed out.')), ms); })]); }
    finally { clearTimeout(timer); }
  }

  function emit(event: Omit<VoiceLiveServerEvent, 'sessionEpoch'> | Record<string, unknown>) {
    if (closed) return;
    try { options.sendClient({ ...event, sessionEpoch: authority.sessionEpoch } as VoiceLiveServerEvent); }
    catch { close('backpressure'); }
  }
  function provider(event: Record<string, any>) {
    if (closed) return;
    try { options.sendProvider(event); }
    catch { close('provider'); }
  }
  function remember(entry: TranscriptEntry) {
    const found = entries.findIndex(previous => previous.id === entry.id);
    if (found < 0) entries.push(entry); else entries[found] = entry;
    if (entries.length > 450 || Buffer.byteLength(JSON.stringify(entries)) > 400000) { close('input_limit'); return false; }
    return true;
  }
  function close(reason: VoiceLiveGatewayReason = 'ended') {
    if (closed) return;
    closed = true;
    clearTimeout(deadlineTimer); clearTimeout(recheckTimer); clearTimeout(update?.timer); clearTimeout(interruption?.timer);
    for (const job of jobs) job.abort(); jobs.clear();
    scheduler.close(); responses.clear(); requests.clear();
    update = undefined; interruption = undefined; activeResponse = undefined; playbackResponse = undefined; pendingResponse = undefined;
    try { options.closeProvider(); } catch { /* Host retains uncertain closure authority. */ }
    try { options.sendClient({ type: 'ended', sessionEpoch: authority.sessionEpoch, reason }); } catch { /* Already closed/slow client. */ }
    void options.finish({ reason, inputBytes, outputBytes, responseCount, durationMs: Math.min(600000, Math.max(0, Math.round(now() - began))) }).catch(() => undefined);
  }
  async function recheck() {
    if (closed) return;
    try { await bounded(options.assertActive(), 1000); }
    catch { close('authentication'); return; }
    if (!closed) recheckTimer = setTimeout(() => void recheck(), 1000);
  }
  function beginUpdate(instructions: string, initial: boolean) {
    if (closed) return;
    if (update || authority.liveVoiceProfile.engine !== 'azure-voice-live') { close('protocol'); return; }
    try {
      const envelope = buildVoiceLiveSession({ model: authority.model, instructions, liveVoiceProfile: authority.liveVoiceProfile,
        speechDelivery: delivery, enabledTools: authority.enabledTools, speechVocabulary: authority.speechVocabulary });
      update = { envelope, initial, sent: false, acknowledged: false, checking: false,
        timer: setTimeout(() => close('session_update_timeout'), 5000) };
      flushUpdate();
    } catch { close('protocol'); }
  }
  function flushUpdate() {
    if (closed || !update || blocked()) return;
    if (!update.sent) { update.sent = true; provider(update.envelope); }
    if (update?.acknowledged) void releaseUpdate(update);
  }
  async function releaseUpdate(candidate: Update) {
    if (closed || update !== candidate || blocked() || candidate.checking) return;
    candidate.checking = true;
    try { await bounded(options.assertActive(), 1000); }
    catch { close('authentication'); return; }
    candidate.checking = false;
    if (closed || update !== candidate || blocked()) return;
    clearTimeout(candidate.timer); update = undefined;
    if (candidate.initial) {
      ready = true;
      emit({ type: 'ready', metadata: { ...(authority.previewId ? { previewId: authority.previewId } : {}), ...(authority.connectionId ? { connectionId: authority.connectionId } : {}),
        enabledTools: authority.enabledTools, behaviorContext: { ...authority.behaviorContext,
          ...(authority.behaviorContext.speechDelivery ? { speechDelivery: { ...authority.behaviorContext.speechDelivery, adaptToRequests: false } } : {}) } } });
      if (!closed) adapter.openingEvents(authority.openingMessage).forEach(event => scheduler.opening(event as object));
    } else scheduler.receive({ type: 'session.updated', session: { type: 'realtime', instructions: candidate.envelope.session.instructions,
      audio: { output: { speed: Number(candidate.envelope.session.voice.rate) } } } });
  }
  function abortTools() { controlGeneration++; for (const job of jobs) job.abort(); }
  function beginInterruption(response: ResponseState) {
    if (closed || response.cancelled) return;
    response.cancelled = true;
    abortTools();
    if (!response.id) return; // Late response.created is cancelled by the scheduler.
    if (interruption && interruption.response !== response) { close('protocol'); return; }
    interruption = { response, snapshot: false, truncating: false, awaiting: new Map(), timer: setTimeout(() => close('cancellation_timeout'), 5000) };
    emit({ type: 'interrupted', responseId: response.id });
    if (!response.done) provider({ type: 'response.cancel', response_id: response.id });
  }
  function acceptPlayed(response: ResponseState, items: VoiceLivePlayedItem[]) {
    for (const played of items) {
      const item = response.items.get(itemKey(played.itemId, played.contentIndex));
      if (!item || played.playedSamples < item.played || played.playedSamples > item.forwarded) { close('protocol'); return false; }
      item.played = played.playedSamples;
    }
    return true;
  }
  function finishInterruption() {
    const pending = interruption;
    if (closed || !pending || !pending.snapshot || !pending.response.done) return;
    if (!pending.truncating) {
      pending.truncating = true;
      for (const [key, item] of pending.response.items) {
        const endMs = Math.floor(item.played / 24);
        pending.awaiting.set(key, endMs);
      }
      for (const id of pending.response.declaredItems) {
        if (![...pending.response.items.values()].some(item => item.id === id)) pending.awaiting.set(`delete:${id}`, 0);
      }
      for (const [key, item] of pending.response.items) provider({ type: 'conversation.item.truncate', item_id: item.id, content_index: item.contentIndex, audio_end_ms: pending.awaiting.get(key)! });
      for (const id of pending.response.declaredItems) {
        if (pending.awaiting.has(`delete:${id}`)) provider({ type: 'conversation.item.delete', item_id: id });
      }
    }
    if (pending.awaiting.size || closed || interruption !== pending) return;
    clearTimeout(pending.timer); interruption = undefined; flushUpdate(); scheduler.resume();
  }
  const scheduler = createPrivateTurnScheduler({
    instructions: () => voiceLivePhaseInstructions(authority.instructions, phase),
    speechDelivery: () => delivery,
    canReply: () => !blocked(),
    send(raw) {
      const event = raw as Record<string, any>;
      if (closed) return;
      if (event.type === 'session.update') { beginUpdate(event.session.instructions, false); return; }
      if (event.type === 'response.create') {
        if (!ready || blocked() || update || pendingResponse || responseCount >= 450) { close('protocol'); return; }
        responseCount++;
        pendingResponse = { cancelled: false, done: false, declaredItems: new Set(), items: new Map(), calls: new Map(), toolsStarted: false };
      }
      if (event.type === 'response.cancel') {
        const response = responses.get(event.response_id);
        if (response) beginInterruption(response);
        else { close('protocol'); }
        return;
      }
      if (event.type === 'output_audio_buffer.clear') return; // Voice Live clear is avatar-only.
      provider(event);
    },
    onUserTurn(turn) {
      if (closed || !remember({ ...turn, role: 'user' })) return;
      phase = 'continuation';
      scheduler.updateBehavior(compileRelationalRuntime({ entries, ...authority.behaviorContext, callId: authority.sessionEpoch }).instructions);
      emit({ type: 'item', id: turn.id }); emit({ type: 'transcript', entry: { ...turn, role: 'user' } });
    },
    onCapturedTurn(turn) {
      try { options.sendClient({ type: 'transcript', entry: { ...turn, role: 'user' }, sessionEpoch: authority.sessionEpoch }); } catch { /* Closed transport. */ }
    },
    fail(message) { close(message.includes('interrupt') ? 'cancellation_timeout' : message.includes('confirm') ? 'session_update_timeout' : 'provider'); },
  });
  async function runTools(response: ResponseState, generation: number) {
    const capturedGeneration = controlGeneration;
    const abort = new AbortController(); jobs.add(abort);
    try {
      for (const call of response.calls.values()) {
        if (closed || abort.signal.aborted || capturedGeneration !== controlGeneration) break;
        await bounded(options.assertActive(), 1000);
        if (closed || abort.signal.aborted || capturedGeneration !== controlGeneration) break;
        if (!isVoiceToolName(call.name)) { close('protocol'); return; }
        emit({ type: 'tool', phase: 'requested', id: call.id, name: call.name });
        const result = await bounded(options.executeTool(call, abort.signal), 8000);
        if (closed || abort.signal.aborted || capturedGeneration !== controlGeneration) break;
        await bounded(options.assertActive(), 1000);
        if (closed || abort.signal.aborted || capturedGeneration !== controlGeneration) break;
        if (Buffer.byteLength(JSON.stringify(result)) > 32000) { close('tool_failed'); return; }
        provider({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.id, output: JSON.stringify(result) } });
        emit({ type: 'tool', phase: 'result', id: call.id, name: call.name, status: result.status, message: result.message.slice(0, 2000), ...(result.actionId ? { actionId: result.actionId } : {}) });
      }
    } catch { if (!closed && !abort.signal.aborted) close('tool_failed'); }
    finally {
      jobs.delete(abort);
      if (!closed) {
        if (!abort.signal.aborted && capturedGeneration === controlGeneration) phase = 'tool_continuation';
        scheduler.toolsDone(generation);
      }
    }
  }
  function audioItem(response: ResponseState, id: string, contentIndex: number) {
    const key = itemKey(id, contentIndex);
    let item = response.items.get(key);
    if (!item) {
      if (response.items.size >= 100) { close('output_limit'); return; }
      item = { id, contentIndex, samples: 0, forwarded: 0, played: 0, sequence: 0 };
      response.items.set(key, item);
    }
    return item;
  }
  function providerEvent(raw: unknown) {
    if (closed) return;
    const normalized = normalizeVoiceLiveEvent(raw);
    if (!normalized) {
      if (raw && typeof raw === 'object' && ['response.audio.delta', 'response.audio_transcript.done', 'conversation.item.input_audio_transcription.completed'].includes(String((raw as { type?: unknown }).type))) close('protocol');
      return;
    }
    const event = normalized as Record<string, any>;
    const type = event.type;
    if (type === 'session.created') return;
    if (type === 'session.updated') {
      if (update?.sent && matchesVoiceLiveSessionAck(update.envelope, event)) { update.acknowledged = true; void releaseUpdate(update); }
      return;
    }
    if (type === 'error') {
      if (event.diagnostic?.code === 'response_cancel_not_active' && interruption?.response.done) return;
      close('provider'); return;
    }
    if (type === 'warning') return;
    if (!ready) { close('protocol'); return; }
    if (type === 'response.created') {
      const id = event.response.id;
      if (responses.has(id)) return;
      if (!pendingResponse || !validId(id)) { close('protocol'); return; }
      const response = pendingResponse; pendingResponse = undefined; response.id = id;
      responses.set(id, response); activeResponse = response;
      scheduler.responseCreated(id);
      return;
    }
    if (type === 'input_audio_buffer.speech_started') {
      abortTools();
      const response = activeResponse ?? playbackResponse;
      if (response && !response.cancelled) beginInterruption(response);
      scheduler.receive(event); return;
    }
    if (type === 'conversation.item.truncated') {
      const key = itemKey(event.item_id, event.content_index);
      if (interruption?.truncating && interruption.awaiting.get(key) === event.audio_end_ms) { interruption.awaiting.delete(key); finishInterruption(); }
      return;
    }
    if (type === 'conversation.item.deleted') {
      if (interruption?.truncating && interruption.awaiting.delete(`delete:${event.item_id}`)) finishInterruption();
      return;
    }
    if (scheduler.receive(event)) return;
    const response = typeof event.response_id === 'string' ? responses.get(event.response_id) : undefined;
    if (type === 'response.output_item.added') {
      if (!response || !scheduler.ownsResponse(response.id) || !validId(event.item?.id)) return;
      if (response.declaredItems.size >= 100) { close('output_limit'); return; }
      response.declaredItems.add(event.item.id); return;
    }
    if (type === 'response.output_audio.delta') {
      if (!response || !scheduler.ownsResponse(response.id) || !validId(event.item_id) || response.done) return;
      const contentIndex = event.content_index;
      if (!Number.isInteger(contentIndex) || contentIndex < 0 || contentIndex > 15) { close('protocol'); return; }
      const item = audioItem(response, event.item_id, contentIndex); if (!item) return;
      response.declaredItems.add(item.id);
      const bytes = Buffer.from(event.delta, 'base64'); item.samples += bytes.length / 2; outputBytes += bytes.length;
      if (outputBytes > 28800000 || item.samples > 14400000) { close('output_limit'); return; }
      if (response.cancelled) return;
      playbackResponse = response;
      for (let start = 0; start < bytes.length; start += VOICE_LIVE_MAX_AUDIO_BYTES) {
        const chunk = bytes.subarray(start, start + VOICE_LIVE_MAX_AUDIO_BYTES);
        const sampleStart = item.forwarded; item.forwarded += chunk.length / 2;
        emit({ type: 'audio', responseId: response.id!, itemId: item.id, contentIndex, sequence: item.sequence++, sampleStart, sampleCount: chunk.length / 2, sampleRate: 24000, audio: chunk.toString('base64') });
        if (closed) return;
      }
      return;
    }
    if (type === 'response.function_call_arguments.done') {
      if (!response || response.cancelled || response.done || !scheduler.ownsResponse(response.id)) return;
      if (!isVoiceToolName(event.name) || !authority.enabledTools.includes(event.name) || !validId(event.call_id)) { close('protocol'); return; }
      if (response.calls.has(event.call_id)) return;
      if (response.calls.size >= 16 || ++toolCount > 40) { close('input_limit'); return; }
      let args: unknown;
      try { args = JSON.parse(event.arguments); } catch { close('protocol'); return; }
      if (!args || typeof args !== 'object' || Array.isArray(args)) { close('protocol'); return; }
      response.calls.set(event.call_id, { id: event.call_id, name: event.name, arguments: args, responseId: response.id }); return;
    }
    if (type === 'response.done') {
      const completed = responses.get(event.response.id);
      if (!completed || completed.done || !scheduler.ownsResponse(completed.id)) return;
      completed.done = true;
      if (activeResponse === completed) activeResponse = undefined;
      const hasTools = !completed.cancelled && completed.calls.size > 0 && event.response.status === 'completed';
      const generation = scheduler.responseDone(completed.id, hasTools, event.response.status);
      if (closed) return;
      finishInterruption();
      if (hasTools && generation !== undefined && !completed.toolsStarted) { completed.toolsStarted = true; void runTools(completed, generation); }
      return;
    }
    if (type === 'response.output_audio_transcript.done' && response?.cancelled) return;
    const eventForClient = adapter.parseEvent(event);
    if (eventForClient?.type === 'error') { close('provider'); return; }
    if (eventForClient) {
      if (eventForClient.type === 'transcript' && !remember(eventForClient.entry)) return;
      emit(eventForClient);
    }
  }
  function clientEvent(raw: unknown) {
    if (closed) return;
    try {
      const event = parseVoiceLiveClientEvent(raw);
      if (event.type === 'end') { close(); return; }
      if (!ready || event.type === 'start') { close('protocol'); return; }
      if (event.type === 'text') {
        const prior = requests.get(event.requestId);
        if (prior !== undefined) { if (prior !== event.text) close('protocol'); return; }
        if (requests.size >= 450) { close('input_limit'); return; }
        requests.set(event.requestId, event.text);
        scheduler.interruptResponse(); abortTools();
        const response = activeResponse ?? playbackResponse;
        if (response && !response.cancelled) beginInterruption(response);
        scheduler.sendText(event.text); return;
      }
      if (event.sessionEpoch !== authority.sessionEpoch) { close('protocol'); return; }
      const response = responses.get(event.responseId);
      if (!response || !scheduler.ownsResponse(response.id)) { close('protocol'); return; }
      if (event.type === 'interrupt' && !response.cancelled) { scheduler.interruptResponse(); beginInterruption(response); }
      if (!acceptPlayed(response, event.items)) return;
      if (event.type === 'interrupt' && interruption?.response === response) {
        const reported = new Set(event.items.map(item => itemKey(item.itemId, item.contentIndex)));
        if ([...response.items].some(([key, item]) => item.forwarded > 0 && !reported.has(key))) { close('protocol'); return; }
        interruption.snapshot = true; finishInterruption();
      }
      if (event.type === 'played') { flushUpdate(); scheduler.resume(); }
    } catch { close('protocol'); }
  }
  function pcmFrame(frame: Uint8Array) {
    if (closed) return;
    if (!ready || authority.inputMode !== 'microphone' || frame.byteLength !== VOICE_LIVE_INPUT_FRAME_BYTES) { close('protocol'); return; }
    const elapsed = Math.max(0, now() - frameRefillAt); frameRefillAt = now(); frameTokens = Math.min(25, frameTokens + elapsed * 0.05);
    if (frameTokens < 1 || (inputBytes += frame.byteLength) > 19200000) { close('input_limit'); return; }
    frameTokens--;
    provider({ type: 'input_audio_buffer.append', audio: Buffer.from(frame).toString('base64') });
  }
  async function start() {
    if (closed || started) return;
    started = true;
    const remaining = Date.parse(authority.deadlineAt) - now();
    if (!Number.isFinite(remaining) || remaining <= 0 || authority.liveVoiceProfile.engine !== 'azure-voice-live') { close('expired'); return; }
    deadlineTimer = setTimeout(() => close('expired'), Math.min(600000, remaining));
    try { await bounded(options.assertActive(), 1000); } catch { close('authentication'); return; }
    if (closed) return;
    try { beginUpdate(`${voiceLivePhaseInstructions(authority.instructions, 'opening')}\n<voice_live_initial_revision>1</voice_live_initial_revision>`, true); }
    catch { close('protocol'); }
    if (!closed) recheckTimer = setTimeout(() => void recheck(), 1000);
  }
  return { start, providerEvent, clientEvent, pcmFrame, close };
}
