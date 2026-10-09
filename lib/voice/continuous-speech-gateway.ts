import type { IncomingMessage } from 'node:http';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { claimContinuousSpeechTicket, recheckContinuousSpeechAuthority, closeContinuousSpeechAuthority, type ContinuousSpeechAuthority, type ContinuousSpeechSummary } from './continuous-speech-authority';
import { createAzureContinuousSpeechProvider, type ContinuousSpeechProvider, type ContinuousSpeechProviderOptions } from './continuous-speech-provider';
import { CONTINUOUS_SPEECH_MAX_SECONDS, CONTINUOUS_SPEECH_PCM, type ContinuousSpeechReason, type ContinuousSpeechServerEvent } from './continuous-speech-contracts';

export const CONTINUOUS_SPEECH_MAX_PAYLOAD = 8192;
export type ContinuousSpeechGatewayDependencies = {
  claim(ticket: string, origin: string): Promise<ContinuousSpeechAuthority>;
  recheck(authority: ContinuousSpeechAuthority): Promise<void>;
  close(authority: ContinuousSpeechAuthority, summary: ContinuousSpeechSummary): Promise<void>;
  createProvider(options: ContinuousSpeechProviderOptions): Promise<ContinuousSpeechProvider>;
  authTimeoutMs?: number; startTimeoutMs?: number; idleTimeoutMs?: number; recheckMs?: number;
  maxSessions?: number; maxPerUser?: number;
  now?: () => number;
};
export const productionContinuousSpeechDependencies: ContinuousSpeechGatewayDependencies = {
  claim: claimContinuousSpeechTicket, recheck: recheckContinuousSpeechAuthority,
  close: closeContinuousSpeechAuthority, createProvider: createAzureContinuousSpeechProvider,
};

/** Each gateway owns bounded slots; durable claim authority also enforces per-user leases. */
export function createContinuousSpeechGateway(dependencies: ContinuousSpeechGatewayDependencies = productionContinuousSpeechDependencies) {
  const sessions = new Set<() => void>(), users = new Map<string, number>();
  const now = dependencies.now || (() => performance.now());
  const maximum = Math.min(20, Math.max(1, dependencies.maxSessions || 20));
  let shuttingDown = false;
  function attach(client: WebSocket, request: Pick<IncomingMessage, 'headers'>) {
    let done = false, receivedStart = false, ready = false, ownsSlot = false, finalized = false;
    let authority: ContinuousSpeechAuthority | undefined, provider: ContinuousSpeechProvider | undefined;
    let audioBytes = 0, hypotheses = 0, tokens = 25, lastFrameAt = now(), lastRefillAt = now();
    const began = now(), timers = new Set<ReturnType<typeof setTimeout>>();
    let finalReason: ContinuousSpeechReason | 'ended' = 'ended';
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
    const later = (action: () => void, ms: number) => { const timer = setTimeout(() => { timers.delete(timer); action(); }, ms); timers.add(timer); return timer; };
    const clear = (timer: ReturnType<typeof setTimeout>) => { clearTimeout(timer); timers.delete(timer); };
    function finalize() {
      if (!done || !authority || finalized) return;
      finalized = true;
      if (ownsSlot) {
        const remaining = (users.get(authority.concurrencyKey) || 1) - 1;
        if (remaining) users.set(authority.concurrencyKey, remaining); else users.delete(authority.concurrencyKey);
      }
      void dependencies.close(authority, { reason: finalReason, audioBytes, hypotheses, durationMs: Math.min(600_000, Math.max(0, Math.round(now() - began))) }).catch(() => undefined);
    }
    function stop(reason?: ContinuousSpeechReason) {
      if (done) { finalize(); return; }
      done = true; finalReason = reason || 'ended';
      for (const timer of timers) clearTimeout(timer);
      timers.clear(); sessions.delete(shutdown);
      try { provider?.close(); } catch { /* Never expose provider diagnostics. */ }
      finalize();
      if (client.readyState === WebSocket.OPEN) {
        // No attempt to enqueue even a terminal event for an already slow client.
        if (client.bufferedAmount <= 32_768) {
          try { client.send(JSON.stringify({ type: 'status', state: reason ? 'unavailable' : 'ended', ...(authority ? { sessionEpoch: authority.sessionEpoch } : {}), ...(reason ? { reason } : {}) })); } catch { /* Socket already closed. */ }
        }
        client.close(1000);
        const timer = setTimeout(() => client.terminate(), 250); timer.unref();
      }
    }
    function send(event: ContinuousSpeechServerEvent) {
      if (done || client.readyState !== WebSocket.OPEN) return;
      if (client.bufferedAmount > 32_768) { stop('backpressure'); return; }
      try { client.send(JSON.stringify(event), error => { if (error) stop('backpressure'); }); } catch { stop('backpressure'); }
    }
    function shutdown() { stop(); }
    client.on('close', () => stop()); client.on('error', () => stop('protocol'));
    if (shuttingDown || !origin || sessions.size >= maximum) { stop('capacity'); return { stop }; }
    sessions.add(shutdown);
    const authTimer = later(() => stop('authentication'), Math.min(5000, dependencies.authTimeoutMs || 5000));
    function recheck() {
      if (done || !authority) return;
      const deadline = later(() => stop('authentication'), 2000);
      void dependencies.recheck(authority).then(() => {
        clear(deadline);
        if (!done) later(recheck, Math.min(2000, dependencies.recheckMs || 2000));
      }, () => { clear(deadline); stop('authentication'); });
    }
    function idle() {
      if (done) return;
      const timeout = Math.min(5000, dependencies.idleTimeoutMs || 5000);
      const remaining = timeout - (now() - lastFrameAt);
      if (remaining <= 0) stop('input_limit'); else later(idle, remaining);
    }
    async function start(ticket: string) {
      try {
        authority = await dependencies.claim(ticket, origin);
        if (done) { finalize(); return; }
        const count = users.get(authority.concurrencyKey) || 0;
        if (count >= Math.min(2, dependencies.maxPerUser || 1)) { stop('capacity'); return; }
        users.set(authority.concurrencyKey, count + 1); ownsSlot = true;
        const remaining = Math.min(CONTINUOUS_SPEECH_MAX_SECONDS * 1000, Date.parse(authority.expiresAt) - Date.now());
        if (!Number.isFinite(remaining) || remaining <= 0) { stop('expired'); return; }
        later(() => stop('expired'), remaining);
        // Includes asynchronous module loading/allocation; ready does not cancel this.
        const startTimer = later(() => stop('provider'), Math.min(10_000, dependencies.startTimeoutMs || 10_000));
        clear(authTimer);
        const allocated = await dependencies.createProvider({
          language: authority.language, recognitionLanguages: authority.recognitionLanguages, sessionEpoch: authority.sessionEpoch,
          onStarted: () => { if (!done) clear(startTimer); },
          onFailure: reason => stop(reason),
          onHypothesis: event => { if (!done && ready) { hypotheses++; send(event); } },
        });
        if (done) { allocated.close(); return; }
        provider = allocated;
        // Revocation/End during asynchronous allocation must prevent provider start.
        try { await dependencies.recheck(authority); } catch { stop('authentication'); return; }
        if (done) return;
        provider.start();
        if (done) return;
        ready = true; lastFrameAt = now(); lastRefillAt = now();
        // Ready means authorized and accepting PCM, not a successful Azure session:
        // SDK's start callback can require the first input frame to progress.
        send({ type: 'status', state: 'ready', sessionEpoch: authority.sessionEpoch });
        later(idle, Math.min(5000, dependencies.idleTimeoutMs || 5000));
        later(recheck, Math.min(2000, dependencies.recheckMs || 2000));
      } catch (error) {
        stop(authority ? (provider ? 'provider' : 'configuration') : (error as { status?: number })?.status === 429 ? 'capacity' : 'authentication');
      }
    }
    client.on('message', (raw, binary) => {
      if (done) return;
      const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
      if (binary) {
        if (!ready || !provider || bytes.byteLength !== CONTINUOUS_SPEECH_PCM.frameBytes) { stop('protocol'); return; }
        const at = now();
        tokens = Math.min(25, tokens + Math.max(0, at - lastRefillAt) / 20); lastRefillAt = at;
        if (tokens < 1 || audioBytes + 640 > CONTINUOUS_SPEECH_MAX_SECONDS * 32_000) { stop('input_limit'); return; }
        tokens--; audioBytes += 640; lastFrameAt = at;
        try { provider.write(bytes); } catch { stop('provider'); }
        return;
      }
      if (bytes.byteLength > CONTINUOUS_SPEECH_MAX_PAYLOAD) { stop('protocol'); return; }
      let event: Record<string, unknown>;
      try { event = JSON.parse(bytes.toString()); } catch { stop('protocol'); return; }
      if (!event || typeof event !== 'object' || Array.isArray(event)) { stop('protocol'); return; }
      if (event.type === 'stop' && Object.keys(event).length === 1) { stop(); return; }
      if (receivedStart || event.type !== 'start' || Object.keys(event).length !== 2 || typeof event.ticket !== 'string' || !/^[a-f0-9]{64}$/.test(event.ticket)) { stop('protocol'); return; }
      receivedStart = true;
      void start(event.ticket);
    });
    return { stop };
  }
  return { attach, shutdown() { shuttingDown = true; for (const stop of sessions) stop(); }, get size() { return sessions.size; } };
}
