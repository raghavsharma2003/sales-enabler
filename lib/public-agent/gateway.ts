import { createServer, type IncomingMessage } from 'node:http';
import { performance } from 'node:perf_hooks';
import WebSocket, { WebSocketServer } from 'ws';
import { resolvePublicSession, closePublicSession } from '../deployments/engine';
import { HttpError } from '../server/http';
import { appendPublicTranscript, claimVoiceSession, finishPublicConversation, instructionsFor, persistPublicVoiceEvidence, setPublicInputMode, type PublicAuthority } from './service';
import { azureRealtimeConnection, MAX_CLIENT_MESSAGE_BYTES, parseClientEvent, publicContinuationInstructions, publicGreetingInstructions, publicVoiceInstructions, realtimeSession, safeProviderDiagnostic, safeResponseDiagnostic, type PublicProviderDiagnostic, type PublicResponseDiagnostic } from './protocol';
import { compileRelationalRuntime } from '../voice/relational-runtime';
import type { ConversationEntry } from '../voice/emotional';
import { compileSpeechVocabularyPrompt } from '../voice/speech-vocabulary';
import { PublicVoiceEvidenceRecorder, type PublicVoiceResponseEvidence } from './evidence';
import { assertInferenceAccess } from '../usage/service';
import { createContinuousSpeechGateway, CONTINUOUS_SPEECH_MAX_PAYLOAD, type ContinuousSpeechGatewayDependencies } from '../voice/continuous-speech-gateway';

export type GatewayDependencies = {
  authorize: typeof resolvePublicSession;
  claim: (authority: PublicAuthority) => Promise<void>;
  close: (token: string, origin: string) => Promise<void>;
  transcript: typeof appendPublicTranscript;
  finish: typeof finishPublicConversation;
  connect: () => { socket: WebSocket; model: string; voice: string };
  recheckMs?: number;
  sessionUpdateTimeoutMs?: number;
  inputMode?: typeof setPublicInputMode;
  diagnostic?: (diagnostic: PublicProviderDiagnostic) => void;
  responseDiagnostic?: (diagnostic: PublicResponseDiagnostic) => void;
  evidence?: (authority: PublicAuthority, evidence: PublicVoiceResponseEvidence) => Promise<void>;
  clock?: () => number;
};

const EVIDENCE_FINAL_FLUSH_MS = 200;
const SESSION_UPDATE_TIMEOUT_MS = 5000;

export const productionGatewayDependencies: GatewayDependencies = {
  authorize: async (...args) => { const authority = await resolvePublicSession(...args); await assertInferenceAccess(authority.user); return authority; }, claim: claimVoiceSession, close: closePublicSession,
  transcript: appendPublicTranscript, finish: finishPublicConversation, inputMode: setPublicInputMode,
  evidence: persistPublicVoiceEvidence,
  diagnostic: diagnostic => { console.warn('Public Azure voice provider error', diagnostic); },
  responseDiagnostic: diagnostic => { console.info('Public Azure voice response', diagnostic); },
  connect: () => { const config = azureRealtimeConnection(); return { socket: new WebSocket(config.url, { headers: { 'api-key': config.key }, handshakeTimeout: 10000, maxPayload: 1_000_000, followRedirects: false }), model: config.model, voice: config.voice }; },
};

/** One browser transport owns one upstream. A transport failure never reconnects or replays. */
export function attachVoiceBridge(client: WebSocket, request: Pick<IncomingMessage, 'headers'>, dependencies: GatewayDependencies = productionGatewayDependencies) {
  let upstream: WebSocket | undefined, authority: PublicAuthority | undefined;
  let token = '', nonce = '', done = false, authenticated = false, ready = false, responding = false, ownsSession = false;
  let finalizationScheduled = false, finalOutcome = 'visitor_disconnected';
  type ResponseSlot = { id?: string; ordinal: number; cancelled: boolean; completed: boolean; discardUnheardItems?: boolean };
  const responseSlots: ResponseSlot[] = [];
  let activeResponse: ResponseSlot | undefined;
  type AudioItem = { id: string; response: ResponseSlot; samples: number; contentIndex: number; trimmed: boolean; heardLimitMs?: number };
  const audioItems: AudioItem[] = [];
  let playbackResponse: ResponseSlot | undefined;
  const connectedAt = Date.now();
  const evidenceClock = dependencies.clock || (() => performance.now());
  let evidenceStartedAt: number | undefined;
  try { const sample = evidenceClock(); if (Number.isFinite(sample)) evidenceStartedAt = sample; } catch { /* Missing timing evidence is explicit through absent offsets. */ }
  const evidence = new PublicVoiceEvidenceRecorder(evidenceStartedAt, evidenceClock);
  let totalInput = 0, totalOutput = 0, windowStart = Date.now(), frames = 0, responses = 0;
  let currentItem = '', sawMicrophoneFrame = false;
  const requestIds = new Set<string>();
  const inputTranscriptIds = new Set<string>();
  const entries: ConversationEntry[] = [];
  let baseInstructions = '', openingInstructions = '';
  // Interrupts and newer caller turns invalidate replies across both configuration and authorization awaits.
  // Configuration acknowledgement is separate from response completion/cancellation.
  let generation = 0, acknowledgedInstructions: string | undefined;
  const microphoneGenerations = new Map<string, number>();
  type PendingUpdate = { instructions: string; timer: ReturnType<typeof setTimeout>; resolve: (confirmed: boolean) => void };
  let pendingUpdate: PendingUpdate | undefined;
  const acknowledgedUpdateIds = new Set<string>();
  const transcriptionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  let work: Promise<void> = Promise.resolve();
  let evidenceWork: Promise<void> = Promise.resolve();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let recheck: ReturnType<typeof setInterval> | undefined;
  const authTimer = setTimeout(() => stop('authentication_timeout', 'The connection timed out before it was authorized.'), 5000);
  const send = (value: unknown) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 1_000_000) { stop('slow_client', 'Audio playback could not keep up. The session ended.'); return; }
    client.send(JSON.stringify(value));
  };
  const provider = (value: unknown) => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN || upstream.bufferedAmount > 250_000) throw new Error('Voice transport is unavailable.');
    upstream.send(JSON.stringify(value));
  };
  function finalizeOwnedSession() {
    if (!done || !authority || !ownsSession || finalizationScheduled) return;
    finalizationScheduled = true;
    const captured = authority;
    // The claim may become owned after stop(). Persist once, behind the current operation.
    work = work.catch(() => undefined).then(async () => {
      await dependencies.close(token, origin).catch(() => undefined);
      for (const turn of evidence.snapshot().turns) queueEvidence(turn, captured);
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, EVIDENCE_FINAL_FLUSH_MS);
        void evidenceWork.then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); resolve(); });
      });
      await dependencies.finish(captured, 'public_web_voice', finalOutcome).catch(() => undefined);
    });
  }
  function stop(outcome: string, message: string) {
    if (done) return; done = true; finalOutcome = outcome;
    generation++;
    settleUpdate(false);
    clearTimeout(authTimer); if (watchdog) clearTimeout(watchdog); if (recheck) clearInterval(recheck);
    for (const timer of transcriptionTimers.values()) clearTimeout(timer);
    // terminate closes the provider socket immediately, including when browser close handshakes stall.
    if (upstream && upstream.readyState !== WebSocket.CLOSED) upstream.terminate();
    send({ type: 'ended', outcome, message });
    if (client.readyState === WebSocket.OPEN) client.close(1000, outcome.slice(0, 100));
    setTimeout(() => { if (client.readyState !== WebSocket.CLOSED) client.terminate(); }, 500).unref();
    finalizeOwnedSession();
  }
  function queue(action: () => Promise<void>, retainCapturedEvidence = false) {
    work = work.then(async () => { if (!done || retainCapturedEvidence) await action(); }).catch(error => {
      const message = error instanceof HttpError && error.status === 429 ? 'This assistant has reached its conversation or usage limit.' : 'The conversation was interrupted. No automatic reconnect was made.';
      stop(error instanceof HttpError && error.status === 429 ? 'limit_reached' : 'uncertain', message);
    });
  }
  function queueEvidence(turn: PublicVoiceResponseEvidence | undefined, evidenceAuthority = authority) {
    if (!turn || !evidenceAuthority || !dependencies.evidence) return;
    const capturedAuthority = evidenceAuthority;
    evidenceWork = evidenceWork.then(() => Promise.resolve().then(() => dependencies.evidence!(capturedAuthority, turn)).catch(() => undefined)).catch(() => undefined);
  }
  function settleUpdate(confirmed: boolean) {
    const pending = pendingUpdate; if (!pending) return;
    pendingUpdate = undefined; clearTimeout(pending.timer);
    if (confirmed) acknowledgedInstructions = pending.instructions;
    pending.resolve(confirmed);
  }
  function updateInstructions(instructions: string, update: unknown = { type: 'session.update', session: { type: 'realtime', instructions } }): Promise<boolean> {
    if (done) return Promise.resolve(false);
    if (pendingUpdate) throw new Error('A voice configuration update is already pending.');
    if (acknowledgedInstructions === instructions) return Promise.resolve(true);
    // Realtime session.updated carries the resulting state, not the client event_id.
    // Keep one update in flight and compare instructions before releasing its waiter.
    const configuredTimeout = dependencies.sessionUpdateTimeoutMs;
    const timeout = configuredTimeout !== undefined && Number.isFinite(configuredTimeout) ? Math.max(1, Math.min(configuredTimeout, SESSION_UPDATE_TIMEOUT_MS)) : SESSION_UPDATE_TIMEOUT_MS;
    return new Promise<boolean>(resolve => {
      pendingUpdate = { instructions, resolve, timer: setTimeout(() => stop('session_update_timeout', 'The voice configuration was not confirmed in time. No automatic retry was made.'), timeout) };
      try { provider(update); } catch { stop('provider_transport', 'The voice configuration could not be sent. No automatic reconnect was made.'); }
    });
  }
  async function response(greeting = false, reserved = false, expectedGeneration = generation) {
    if (done || expectedGeneration !== generation) return;
    if (responding) throw new HttpError(409, 'Wait for the current response.');
    if (!authority) throw new Error('Unauthorized.');
    if (!greeting && !reserved) {
      const fresh = await dependencies.authorize(token, { origin, nonce, consume: true, purpose: 'voice' });
      nonce = fresh.nextNonce!; authority = fresh;
    }
    if (done || expectedGeneration !== generation) return;
    if (++responses > authority.deployment.data.limits.maxTurnsPerConversation) throw new HttpError(429, 'Turn limit reached.');
    responding = true;
    activeResponse = { ordinal: responses, cancelled: false, completed: false }; responseSlots.push(activeResponse);
    provider({ type: 'response.create', ...(greeting ? { response: { instructions: openingInstructions } } : {}) });
    evidence.requested(activeResponse.ordinal);
  }
  function cancelActiveResponse() {
    if (responding) provider({ type: 'response.cancel', ...(activeResponse?.id ? { response_id: activeResponse.id } : {}) });
    if (activeResponse) { activeResponse.cancelled = true; activeResponse.discardUnheardItems = true; evidence.cancelRequested(activeResponse.ordinal); }
    activeResponse = undefined; responding = false;
  }
  function interrupt() {
    cancelActiveResponse();
    send({ type: 'interrupted', itemId: currentItem || undefined });
  }
  function trimUnheardAudio(item: AudioItem, playedMs: number) {
    if (item.trimmed) return;
    provider({ type: 'conversation.item.truncate', item_id: item.id, content_index: item.contentIndex, audio_end_ms: Math.max(0, Math.min(playedMs, Math.floor(item.samples / 24))) });
    item.trimmed = true; item.response.discardUnheardItems = true;
    for (const later of audioItems.slice(audioItems.indexOf(item) + 1)) {
      if (later.response !== item.response || later.trimmed) continue;
      provider({ type: 'conversation.item.delete', item_id: later.id }); later.trimmed = true;
    }
  }
  async function adapt(role: 'user' | 'assistant', text: string, id: string) {
    if (!entries.some(entry => entry.id === id)) entries.push({ id, role, text });
    if (role !== 'user') return;
    const runtime = compileRelationalRuntime({ entries, settings: authority!.config, callId: authority!.sessionId });
    const instructions = publicContinuationInstructions(`${baseInstructions}\n${runtime.instructions}`);
    if (instructions.length > 12000) throw new HttpError(429, 'The conversation context limit was reached.');
    await updateInstructions(instructions);
  }
  function providerEvent(raw: WebSocket.RawData) {
    let event: Record<string, any>;
    try { event = JSON.parse(raw.toString()); } catch { stop('provider_protocol', 'The voice provider returned an invalid message.'); return; }
    if (done || !event || typeof event.type !== 'string') return;
    const type = event.type;
    const eventResponse = typeof event.response_id === 'string' ? responseSlots.find(candidate => candidate.id === event.response_id) : undefined;
    // An item can have been generated just before cancellation but arrive on this transport afterward.
    // It was never played. Delete its provider history instead of merely dropping its audio event.
    if (type === 'response.output_item.added' && eventResponse?.discardUnheardItems && event.item?.type === 'message') {
      const id = event.item.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) { stop('provider_protocol', 'The voice provider returned an invalid audio item.'); return; }
      if (audioItems.some(item => item.id === id)) return;
      if (audioItems.length >= 100) { stop('provider_protocol', 'The voice provider exceeded the message item limit.'); return; }
      try { provider({ type: 'conversation.item.delete', item_id: id }); audioItems.push({ id, response: eventResponse, samples: 0, contentIndex: 0, trimmed: true }); }
      catch { stop('uncertain', 'The interrupted voice history could not be updated.'); }
      return;
    }
    // Azure can finish a cancelled response after the replacement has already started.
    // Neither its terminal event nor its late audio may mutate the active response.
    if (typeof event.response_id === 'string') {
      const slot = eventResponse;
      if (slot && slot !== activeResponse && (slot.cancelled || slot.completed)) {
        if (type === 'response.done' && slot.cancelled && !slot.completed) {
          const summary = safeResponseDiagnostic('response.done', event.response, responseSlots.indexOf(slot) + 1);
          dependencies.responseDiagnostic?.(summary); slot.completed = true; evidence.terminal(slot.ordinal, summary);
        }
        if (slot.discardUnheardItems && ['response.output_audio.delta', 'response.audio.delta'].includes(type) && typeof event.delta === 'string' && Buffer.from(event.delta, 'base64').length > 0) {
          const item = audioItems.find(candidate => candidate.id === event.item_id && candidate.response === slot);
          if (item && !item.trimmed && item.heardLimitMs !== undefined) {
            // The browser's queue drained before this already-generated suffix crossed the transport.
            // Keep the previously heard prefix; never deliver or retain the late unheard suffix.
            try { trimUnheardAudio(item, item.heardLimitMs); } catch { stop('uncertain', 'The interrupted voice history could not be updated.'); }
          }
        }
        return;
      }
    }
    if (type === 'session.updated') {
      if (!pendingUpdate || event.session?.type !== 'realtime' || event.session.instructions !== pendingUpdate.instructions) return;
      if (typeof event.event_id === 'string') {
        if (acknowledgedUpdateIds.has(event.event_id)) return;
        acknowledgedUpdateIds.add(event.event_id);
      }
      settleUpdate(true);
    } else if (type === 'response.created' && typeof event.response?.id === 'string') {
      if (responseSlots.some(candidate => candidate.id === event.response.id)) return;
      const slot = responseSlots.find(candidate => !candidate.id && !candidate.completed);
      if (slot) slot.id = event.response.id;
      if (slot) evidence.providerCreated(slot.ordinal);
      dependencies.responseDiagnostic?.(safeResponseDiagnostic('response.created', event.response, slot ? responseSlots.indexOf(slot) + 1 : 0));
    } else if (type === 'error') {
      if (event.error?.code === 'response_cancel_not_active') return;
      dependencies.diagnostic?.(safeProviderDiagnostic(event.error));
      const quota = /rate_limit|quota/.test(String(event.error?.code));
      stop(quota ? 'provider_quota' : 'provider_error', quota ? 'Azure has reached its usage limit. Please try again later.' : 'The voice provider could not continue. No automatic reconnect was made.');
    } else if (type === 'input_audio_buffer.speech_started') {
      generation++;
      if (typeof event.item_id === 'string') microphoneGenerations.set(event.item_id, generation);
      try { interrupt(); } catch { stop('uncertain', 'The audio connection was interrupted.'); }
    } else if (type === 'input_audio_buffer.committed') {
      const id = String(event.item_id);
      if (!microphoneGenerations.has(id)) microphoneGenerations.set(id, ++generation);
      transcriptionTimers.set(id, setTimeout(() => stop('transcription_timeout', 'Speech could not be transcribed in time. Please use Listen & type or text chat.'), 10000));
    } else if (type === 'response.output_item.added' && typeof event.item?.id === 'string' && event.item.type === 'message') {
      const owner = typeof event.response_id === 'string' ? responseSlots.find(slot => slot.id === event.response_id) : activeResponse || responseSlots.at(-1);
      if (!owner || !/^[A-Za-z0-9_-]{1,100}$/.test(event.item.id) || audioItems.length >= 100) { stop('provider_protocol', 'The voice provider returned an invalid audio item.'); return; }
      currentItem = event.item.id;
      if (!audioItems.some(item => item.id === currentItem)) audioItems.push({ id: currentItem, response: owner, samples: 0, contentIndex: 0, trimmed: false });
    } else if (type === 'response.output_audio.delta' || type === 'response.audio.delta') {
      if (typeof event.delta !== 'string' || event.delta.length > 500_000) { stop('provider_protocol', 'The audio response was invalid.'); return; }
      const bytes = Buffer.from(event.delta, 'base64').length;
      const itemId = typeof event.item_id === 'string' ? event.item_id : currentItem;
      const item = audioItems.find(item => item.id === itemId);
      const contentIndex = Number.isInteger(event.content_index) ? event.content_index : 0;
      if (!item || !item.response.id || bytes % 2 || contentIndex < 0 || contentIndex > 15 || (item.samples > 0 && item.contentIndex !== contentIndex)) { stop('provider_protocol', 'The voice provider returned audio without a valid message binding.'); return; }
      if (item.trimmed) return;
      item.contentIndex = contentIndex; item.samples += bytes / 2; playbackResponse = item.response;
      totalOutput += bytes;
      if (totalOutput > 24_000_000) { stop('output_limit', 'This conversation reached its audio limit.'); return; }
      evidence.audio(item.response.ordinal, bytes);
      send({ type: 'audio', audio: event.delta, itemId: item.id, responseId: item.response.id });
    } else if (type === 'conversation.item.input_audio_transcription.completed') {
      if (typeof event.transcript !== 'string' || event.transcript.length > 12000) { stop('transcript_limit', 'This conversation reached its transcript limit.'); return; }
      const text = event.transcript.trim(); if (!text) return;
      const id = String(event.item_id); clearTimeout(transcriptionTimers.get(id)); transcriptionTimers.delete(id);
      const eventId = `input:${id.slice(0, 100)}`;
      if (inputTranscriptIds.has(eventId)) return;
      inputTranscriptIds.add(eventId);
      // ASR completions may arrive after a newer speech start or out of order. Their arrival
      // cannot create a new generation and revive an interrupted/older microphone turn.
      const expectedGeneration = microphoneGenerations.get(id) ?? ++generation;
      microphoneGenerations.delete(id);
      queue(async () => {
        await dependencies.transcript(authority!, 'public_web_voice', { role: 'user', text, eventId });
        if (done) return;
        if (expectedGeneration !== generation) { send({ type: 'transcript', role: 'user', text }); return; }
        if (responding) interrupt();
        await adapt('user', text, eventId);
        if (done) return;
        send({ type: 'transcript', role: 'user', text });
        await response(false, false, expectedGeneration);
      }, true);
    } else if (type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done') {
      if (typeof event.transcript !== 'string' || event.transcript.length > 12000) { stop('transcript_limit', 'This conversation reached its transcript limit.'); return; }
      const text = event.transcript.trim(); if (!text) return;
      queue(async () => { const eventId = `output:${String(event.item_id || event.response_id).slice(0, 100)}`; if (entries.some(entry => entry.id === eventId)) return; await dependencies.transcript(authority!, 'public_web_voice', { role: 'assistant', text, eventId }); await adapt('assistant', text, eventId); send({ type: 'transcript', role: 'assistant', text }); }, true);
    } else if (type === 'conversation.item.input_audio_transcription.failed') {
      stop('transcription_failed', 'Speech could not be transcribed. Please use Listen & type or text chat.');
    } else if (type === 'response.done') {
      const id = typeof event.response?.id === 'string' ? event.response.id : undefined;
      let slot = id ? responseSlots.find(candidate => candidate.id === id) : responseSlots.find(candidate => !candidate.completed);
      if (!slot && id) {
        const unidentified = responseSlots.filter(candidate => !candidate.id && !candidate.completed);
        if (unidentified.length === 1) { slot = unidentified[0]; slot.id = id; }
      }
      const summary = safeResponseDiagnostic('response.done', event.response, slot ? responseSlots.indexOf(slot) + 1 : 0);
      dependencies.responseDiagnostic?.(summary);
      if (!slot) return;
      slot.completed = true;
      evidence.terminal(slot.ordinal, summary);
      if (slot !== activeResponse || slot.cancelled) return;
      activeResponse = undefined; responding = false;
      if (event.response?.status === 'failed') { stop('provider_error', 'The voice reply failed. No automatic retry was made.'); return; }
      if (event.response?.status === 'incomplete') { stop('response_incomplete', summary.reason === 'max_output_tokens' ? 'The voice reply reached its length limit and may be unfinished. The conversation ended; no automatic retry was made.' : 'The voice provider returned an unfinished reply. The conversation ended; no automatic retry was made.'); return; }
      send({ type: 'turn_done' });
    }
  }
  client.on('message', (raw, binary) => {
    if (done) return;
    const now = Date.now(); if (now - windowStart > 1000) { windowStart = now; frames = 0; }
    if (++frames > 60 || binary || Buffer.byteLength(raw.toString()) > MAX_CLIENT_MESSAGE_BYTES) { stop('invalid_input', 'The browser exceeded the message limit.'); return; }
    if (!authenticated) {
      authenticated = true; // Claim before awaiting, preventing concurrent auth messages.
      queue(async () => {
        let auth: Record<string, unknown>; try { auth = JSON.parse(raw.toString()); } catch { throw new Error('Invalid authentication.'); }
        if (auth.type !== 'authenticate' || typeof auth.token !== 'string' || typeof auth.nonce !== 'string' || !origin) throw new Error('Invalid authentication.');
        token = auth.token; nonce = auth.nonce;
        authority = await dependencies.authorize(token, { origin, purpose: 'voice' });
        if (done) return;
        await dependencies.claim(authority);
        ownsSession = true;
        if (done) { finalizeOwnedSession(); return; }
        authority = await dependencies.authorize(token, { origin, nonce, consume: true, purpose: 'voice' });
        nonce = authority.nextNonce!;
        if (done) { finalizeOwnedSession(); return; }
        await dependencies.inputMode?.(authority, auth.inputMode === 'text' ? 'text' : 'microphone');
        if (done) { finalizeOwnedSession(); return; }
        const transcriptionPrompt = compileSpeechVocabularyPrompt(authority.config.speechVocabulary);
        const instructions = publicVoiceInstructions(instructionsFor(authority)); baseInstructions = instructions; openingInstructions = publicGreetingInstructions(instructions, authority.deployment.data.brand.welcomeMessage);
        if (done) return;
        clearTimeout(authTimer);
        const remaining = Math.min(Date.parse(authority.expiresAt) - Date.now(), authority.deployment.data.limits.maxSessionSeconds * 1000);
        if (remaining <= 0) throw new Error('Expired.');
        watchdog = setTimeout(() => stop('duration_limit', 'This conversation reached its time limit.'), remaining);
        let checking = false;
        recheck = setInterval(() => {
          if (checking || done) return; checking = true;
          void dependencies.authorize(token, { origin, purpose: 'voice' }).catch(() => stop('authority_changed', 'The company paused or changed this assistant. The conversation has ended.')).finally(() => { checking = false; });
        }, dependencies.recheckMs || 2000);
        const connected = dependencies.connect(); upstream = connected.socket;
        const connectionTimer = setTimeout(() => stop('connection_timeout', 'Voice could not connect. No automatic retry was made.'), 12000);
        upstream.on('open', () => {
          if (done) { upstream?.terminate(); return; }
          void updateInstructions(instructions, realtimeSession(connected.model, connected.voice, instructions, transcriptionPrompt)).then(confirmed => {
            if (!confirmed || done) return;
            clearTimeout(connectionTimer);
            ready = true; send({ type: 'ready', expiresAt: authority!.expiresAt, disclosure: `You are speaking with an AI assistant for ${authority!.deployment.data.brand.name}.` });
            const expectedGeneration = generation;
            queue(() => response(true, false, expectedGeneration));
          });
        });
        upstream.on('message', raw => { if (ready) clearTimeout(connectionTimer); providerEvent(raw); });
        upstream.on('error', () => { clearTimeout(connectionTimer); stop('provider_transport', 'Voice could not connect. Try text chat or start again explicitly.'); });
        upstream.on('unexpected-response', (_req, res) => { res.resume(); clearTimeout(connectionTimer); stop(res.statusCode === 429 ? 'provider_quota' : 'provider_access', res.statusCode === 429 ? 'Azure has reached its usage limit.' : 'Voice is temporarily unavailable. Please use text chat.'); });
        upstream.on('close', () => { clearTimeout(connectionTimer); if (!done) stop('uncertain', 'The voice connection ended unexpectedly. No automatic reconnect was made.'); });
      });
      return;
    }
    let event: ReturnType<typeof parseClientEvent>;
    try { event = parseClientEvent(raw.toString()); } catch { stop('invalid_input', 'The browser sent an unsupported message.'); return; }
    if (event.type === 'stop') { stop('visitor_stopped', 'Conversation ended.'); return; }
    if (!ready) { stop('not_ready', 'Wait for the assistant to connect before sending audio.'); return; }
    if (event.type === 'audio') {
      if (!sawMicrophoneFrame) { sawMicrophoneFrame = true; queue(async () => { await dependencies.inputMode?.(authority!, 'microphone'); }); }
      totalInput += Buffer.from(event.audio, 'base64').length;
      if (totalInput > authority!.deployment.data.limits.maxSessionSeconds * 48000 || totalInput > (Date.now() - connectedAt + 2000) * 48) { stop('input_limit', 'This conversation reached its audio limit.'); return; }
      try { provider({ type: 'input_audio_buffer.append', audio: event.audio }); } catch { stop('uncertain', 'The voice connection was interrupted.'); }
    } else if (event.type === 'interrupt') {
      generation++;
      try {
        cancelActiveResponse();
        const targetId = event.itemId || event.lastHeardItemId;
        const item = targetId ? audioItems.find(item => item.id === targetId) : undefined;
        // A heard watermark only trims an actually generated in-transit suffix. Fully heard history stays intact.
        // Never trust foreign or older response IDs.
        if (item && !item.trimmed && item.response === playbackResponse) {
          item.heardLimitMs = Math.max(0, Math.min(event.playedMs, Math.floor(item.samples / 24)));
          item.response.discardUnheardItems = true;
          if (event.playedMs < Math.floor(item.samples / 24)) trimUnheardAudio(item, item.heardLimitMs);
        }
      } catch { stop('uncertain', 'The voice connection was interrupted.'); }
    } else {
      const expectedGeneration = ++generation;
      queue(async () => {
        if (requestIds.has(event.requestId)) throw new HttpError(409, 'Message already submitted.');
        requestIds.add(event.requestId);
        if (responding) interrupt();
        // Reserve quota and fresh authority before sending visitor text to Azure.
        const fresh = await dependencies.authorize(token, { origin, nonce, consume: true, purpose: 'voice' }); nonce = fresh.nextNonce!; authority = fresh;
        if (done) return;
        await dependencies.transcript(authority, 'public_web_voice', { role: 'user', text: event.text, eventId: event.requestId });
        if (done) return;
        await adapt('user', event.text, event.requestId);
        if (done) return;
        provider({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: event.text }] } });
        send({ type: 'transcript', role: 'user', text: event.text });
        await response(false, true, expectedGeneration);
      });
    }
  });
  client.on('close', () => stop('visitor_disconnected', 'Conversation ended.'));
  client.on('error', () => stop('visitor_disconnected', 'Conversation ended.'));
  return { stop };
}

export function createVoiceGateway(dependencies: GatewayDependencies = productionGatewayDependencies, speechDependencies?: ContinuousSpeechGatewayDependencies) {
  const speech = createContinuousSpeechGateway(speechDependencies);
  const server = createServer((request, response) => { if (request.method === 'GET' && request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end('{"status":"ok","service":"public-voice-gateway","privateSpeech":"application-authorized"}'); } else { response.writeHead(404); response.end(); } });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES, perMessageDeflate: false });
  const speechSockets = new WebSocketServer({ noServer: true, maxPayload: CONTINUOUS_SPEECH_MAX_PAYLOAD, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/private-speech' && request.headers.origin && speechSockets.clients.size < 20) {
      speechSockets.handleUpgrade(request, socket, head, client => speech.attach(client, request)); return;
    }
    if (request.url !== '/voice' || !request.headers.origin || sockets.clients.size >= 100) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, client => attachVoiceBridge(client, request, dependencies));
  });
  return { server, sockets, speechSockets, shutdown: () => { speech.shutdown(); for (const socket of speechSockets.clients) socket.terminate(); speechSockets.close(); for (const socket of sockets.clients) socket.terminate(); sockets.close(); server.close(); } };
}
