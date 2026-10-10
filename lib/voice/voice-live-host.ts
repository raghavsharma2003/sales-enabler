// Node-only private preview host. Credentials and provider transport stay here.
import type { IncomingMessage } from 'node:http';
import WebSocket from 'ws';
import { claimVoiceLiveTicket, recheckVoiceLiveAuthority, activateVoiceLiveAuthority, finishVoiceLiveAuthority, type VoiceLiveAuthority } from './voice-live-authority';
import { createVoiceLiveGatewaySession, type VoiceLiveGatewayOptions, type VoiceLiveGatewayReason, type VoiceLiveGatewaySummary } from './voice-live-gateway';
import { parseVoiceLiveClientEvent, VOICE_LIVE_MAX_CONTROL_BYTES, type VoiceLiveServerEvent } from './voice-live-protocol';
import { voiceLiveConnectionConfig } from './voice-live-session';
import { executeVoiceTool } from './tools/service';
import type { VoiceToolCall } from './contracts';
import type { VoiceToolResult } from './tools/contracts';

export const VOICE_LIVE_HOST_MAX_PAYLOAD = VOICE_LIVE_MAX_CONTROL_BYTES;
const PROVIDER_MAX_PAYLOAD = 1_000_000;
const BUFFER_LIMIT = 262_144;
type Engine = ReturnType<typeof createVoiceLiveGatewaySession>;
export type VoiceLiveHostDependencies = {
  claim(ticket: string, origin: string): Promise<VoiceLiveAuthority>;
  recheck(authority: VoiceLiveAuthority): Promise<void>;
  activate(authority: VoiceLiveAuthority): Promise<void>;
  finish(authority: VoiceLiveAuthority, result: { outcome: 'complete' | 'failed' | 'uncertain' }): Promise<void>;
  connect(authority: VoiceLiveAuthority): WebSocket | Promise<WebSocket>;
  executeTool(authority: VoiceLiveAuthority, call: VoiceToolCall, signal: AbortSignal): Promise<VoiceToolResult>;
  createEngine?: (options: VoiceLiveGatewayOptions) => Engine;
  maxSessions?: number; authTimeoutMs?: number; setupTimeoutMs?: number;
  recheckTimeoutMs?: number; terminateAfterMs?: number; closeTimeoutMs?: number;
};

export const productionVoiceLiveHostDependencies: VoiceLiveHostDependencies = {
  claim: claimVoiceLiveTicket, recheck: recheckVoiceLiveAuthority,
  activate: activateVoiceLiveAuthority, finish: finishVoiceLiveAuthority,
  connect(authority) {
    // Read/validate server configuration only after a successful admission claim.
    const config = voiceLiveConnectionConfig();
    if (authority.model !== config.model) throw new Error('Voice Live configuration changed.');
    return new WebSocket(config.url, {
      headers: { [config.apiKeyHeader]: config.key }, handshakeTimeout: config.setupTimeoutMs,
      maxPayload: PROVIDER_MAX_PAYLOAD, perMessageDeflate: false, followRedirects: false,
    });
  },
  async executeTool(authority, call, signal) {
    if (signal.aborted) throw new Error('Voice Live operation ended.');
    await recheckVoiceLiveAuthority(authority);
    if (signal.aborted) throw new Error('Voice Live operation ended.');
    return executeVoiceTool({ id: authority.userId, organizationId: authority.organizationId, email: '' }, {
      previewId: authority.previewId, requestId: call.id, name: call.name, arguments: call.arguments,
    });
  },
};

/** The engine owns conversation ordering; this host owns sockets and admission settlement. */
export function createVoiceLiveHost(dependencies: VoiceLiveHostDependencies = productionVoiceLiveHostDependencies) {
  type Session = { stop(): void; done: Promise<void>; state(): { claiming: boolean; owned: boolean; closing: boolean } };
  const sessions = new Set<Session>();
  let shuttingDown = false;
  const limit = Math.min(20, Math.max(1, dependencies.maxSessions || 20));
  function attach(client: WebSocket, request: Pick<IncomingMessage, 'headers'>) {
    let authority: VoiceLiveAuthority | undefined, engine: Engine | undefined, upstream: WebSocket | undefined;
    let closingSocket: WebSocket | undefined;
    let started = false, stopped = false, ready = false, claiming = false, allocationPending = false, allocationAttempted = false;
    let confirmedClosed = false, closedClient = false, settled = false, settling: Promise<void> | undefined;
    let settledOutcome: 'complete' | 'failed' | 'uncertain' | undefined, reconciling = false;
    let reason: VoiceLiveGatewayReason = 'ended';
    let resolveDone!: () => void;
    const done = new Promise<void>(resolve => { resolveDone = resolve; });
    let resolveClosed!: () => void;
    const ownedClosed = new Promise<void>(resolve => { resolveClosed = resolve; });
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
    const bounded = (requested: number | undefined, maximum: number) => Math.max(1, Math.min(maximum, requested || maximum));
    const later = (action: () => void, ms: number) => { const timer = setTimeout(() => { timers.delete(timer); action(); }, ms); timers.add(timer); return timer; };
    const clear = (timer: ReturnType<typeof setTimeout>) => { clearTimeout(timer); timers.delete(timer); };
    const authTimer = later(() => stop('authentication'), bounded(dependencies.authTimeoutMs, 5000));
    let setupTimer: ReturnType<typeof setTimeout> | undefined;
    const session: Session = { stop: () => stop('ended'), done, state: () => ({ claiming, owned: !!upstream && !confirmedClosed, closing: stopped && !!upstream && !confirmedClosed }) };

    function closeClient() {
      if (closedClient) return; closedClient = true;
      try { client.close(1000); } catch { /* Socket already ended. */ }
      const timer = setTimeout(() => client.terminate(), 250); timer.unref();
    }
    function terminalWithoutEngine() {
      if (client.readyState === WebSocket.OPEN && client.bufferedAmount < BUFFER_LIMIT) {
        try { client.send(JSON.stringify({ type: 'ended', sessionEpoch: authority?.sessionEpoch || 'pending', reason, message: 'The private voice session ended.' })); } catch { /* Socket already ended. */ }
      }
      closeClient();
    }
    function sendClient(event: VoiceLiveServerEvent) {
      if ((stopped && event.type !== 'ended') || client.readyState !== WebSocket.OPEN) return;
      if (event.type === 'ready') { ready = true; if (setupTimer) clear(setupTimer); }
      if (event.type === 'ended' && setupTimer) clear(setupTimer);
      const serialized = JSON.stringify(event);
      if (client.bufferedAmount + Buffer.byteLength(serialized) > BUFFER_LIMIT) { stop('backpressure'); return; }
      try { client.send(serialized, error => { if (error) stop('backpressure'); }); } catch { stop('backpressure'); }
      if (event.type === 'ended') closeClient();
    }
    function sendProvider(event: Record<string, unknown>) {
      if (stopped || !upstream || upstream.readyState !== WebSocket.OPEN) throw new Error('Voice Live transport ended.');
      const serialized = JSON.stringify(event);
      if (upstream.bufferedAmount + Buffer.byteLength(serialized) > BUFFER_LIMIT) { stop('backpressure'); throw new Error('Voice Live transport backpressure.'); }
      try { upstream.send(serialized, error => { if (error) stop('provider'); }); } catch { stop('provider'); throw new Error('Voice Live transport ended.'); }
    }
    function observedClosed() {
      if (confirmedClosed) return;
      confirmedClosed = true; resolveClosed();
      void reconcileLateClosure();
    }
    async function reconcileLateClosure() {
      if (!authority || !settled || !confirmedClosed || settledOutcome !== 'uncertain' || reconciling) return;
      reconciling = true;
      const outcome = reason === 'ended' ? 'complete' : 'failed';
      try { await dependencies.finish(authority, { outcome }); settledOutcome = outcome; } catch { /* Retain uncertainty if its confirmation cannot be recorded. */ }
      finally { reconciling = false; }
    }
    function closeProvider() {
      if (!upstream) { if (!allocationAttempted && !allocationPending) observedClosed(); return; }
      if (upstream.readyState === WebSocket.CLOSED) { observedClosed(); return; }
      if (closingSocket === upstream) return;
      closingSocket = upstream;
      try { upstream.close(1000); } catch { /* Termination below owns cleanup. */ }
      const owned = upstream;
      const timer = setTimeout(() => { if (owned.readyState !== WebSocket.CLOSED) owned.terminate(); }, bounded(dependencies.terminateAfterMs, 250));
      timer.unref();
    }
    async function settle() {
      if (!authority || settled) return;
      if (settling) return settling;
      settling = (async () => {
        closeProvider();
        if (!confirmedClosed) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([ownedClosed, new Promise<void>(resolve => { timer = setTimeout(resolve, bounded(dependencies.closeTimeoutMs, 2000)); })]);
          if (timer) clearTimeout(timer);
        }
        // Never release the durable lease solely because close()/terminate() ran.
        const outcome = confirmedClosed ? reason === 'ended' ? 'complete' : 'failed' : 'uncertain';
        try { await dependencies.finish(authority!, { outcome }); } catch { /* Durable admission remains fail-closed on write failure. */ }
        settledOutcome = outcome; settled = true; sessions.delete(session); resolveDone();
        void reconcileLateClosure();
      })();
      return settling;
    }
    async function finish(summary: VoiceLiveGatewaySummary) {
      stopped = true; reason = summary.reason;
      for (const timer of timers) clearTimeout(timer); timers.clear();
      closeClient(); await settle();
    }
    function stop(next: VoiceLiveGatewayReason) {
      if (!stopped) {
        stopped = true; reason = next;
        for (const timer of timers) clearTimeout(timer); timers.clear();
        if (engine) engine.close(next); else terminalWithoutEngine();
      }
      closeProvider();
      if (authority) void settle();
      else if (!claiming) { sessions.delete(session); resolveDone(); }
    }
    async function assertActive() {
      if (stopped || !authority) throw new Error('Voice Live authorization ended.');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([dependencies.recheck(authority), new Promise<never>((_resolve, reject) => {
          timer = later(() => { stop('authentication'); reject(new Error('Voice Live authorization timed out.')); }, bounded(dependencies.recheckTimeoutMs, 1000));
        })]);
        if (stopped) throw new Error('Voice Live authorization ended.');
      } finally { if (timer) clear(timer); }
    }
    async function onOpen() {
      if (stopped || !authority || !engine) { closeProvider(); return; }
      try {
        await assertActive(); if (stopped) return;
        await dependencies.activate(authority); if (stopped) return;
        await assertActive(); if (stopped) return;
        await engine.start();
      } catch { stop('authentication'); }
    }
    async function start(ticket: string, inputMode: 'text' | 'microphone') {
      claiming = true;
      setupTimer = later(() => stop('provider'), bounded(dependencies.setupTimeoutMs, 30_000));
      try {
        authority = await dependencies.claim(ticket, origin); claiming = false; clear(authTimer);
        if (stopped) { await settle(); return; }
        if (authority.inputMode !== inputMode) { stop('protocol'); return; }
        const deadlineMs = Date.parse(authority.deadlineAt) - Date.now();
        if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) { stop('expired'); return; }
        later(() => stop('expired'), Math.min(600_000, deadlineMs));
        await assertActive(); if (stopped) return;
        engine = (dependencies.createEngine || createVoiceLiveGatewaySession)({
          authority: { ...authority, behaviorContext: authority.behaviorContext },
          sendClient, sendProvider, closeProvider, assertActive, finish,
          executeTool: async (call, signal) => {
            await assertActive();
            if (stopped || signal.aborted) throw new Error('Voice Live operation ended.');
            const result = await dependencies.executeTool(authority!, call, signal);
            if (stopped || signal.aborted) throw new Error('Voice Live operation ended.');
            return result;
          },
        });
        allocationAttempted = true; allocationPending = true;
        const allocated = await dependencies.connect(authority); allocationPending = false;
        upstream = allocated;
        upstream.on('error', () => stop('provider'));
        upstream.on('unexpected-response', (_request, response) => { response.resume(); stop('provider'); });
        upstream.on('close', () => { observedClosed(); if (!stopped) stop('provider'); });
        upstream.on('message', (raw, binary) => {
          if (stopped || !engine) return;
          const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
          if (binary || bytes.byteLength > PROVIDER_MAX_PAYLOAD) { stop('protocol'); return; }
          try { engine.providerEvent(JSON.parse(bytes.toString())); } catch { stop('protocol'); }
        });
        if (stopped) { closeProvider(); return; }
        if (upstream.readyState === WebSocket.OPEN) void onOpen();
        else if (upstream.readyState === WebSocket.CLOSED) { observedClosed(); stop('provider'); }
        else upstream.once('open', () => { void onOpen(); });
      } catch {
        claiming = false; allocationPending = false; stop(authority ? 'provider' : 'authentication');
      }
    }
    client.on('error', () => stop('protocol')); client.on('close', () => stop('ended'));
    if (shuttingDown || !origin || sessions.size >= limit) { stop('authentication'); return { stop: () => stop('ended'), done }; }
    sessions.add(session);
    client.on('message', (raw, binary) => {
      if (stopped) return;
      const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
      if (binary) {
        if (!ready || !engine || bytes.byteLength !== 640) { stop('protocol'); return; }
        engine.pcmFrame(bytes); return;
      }
      if (bytes.byteLength > VOICE_LIVE_MAX_CONTROL_BYTES) { stop('protocol'); return; }
      try {
        const event = parseVoiceLiveClientEvent(JSON.parse(bytes.toString()));
        if (event.type === 'end') { stop('ended'); return; }
        if (!started) {
          if (event.type !== 'start') { stop('protocol'); return; }
          started = true; void start(event.ticket, event.inputMode); return;
        }
        if (event.type === 'start' || !ready || !engine) { stop('protocol'); return; }
        engine.clientEvent(event);
      } catch { stop('protocol'); }
    });
    return { stop: () => stop('ended'), done };
  }
  return {
    attach,
    async shutdown() {
      shuttingDown = true; const owned = [...sessions]; for (const session of owned) session.stop();
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([Promise.all(owned.map(session => session.done)), new Promise<void>(resolve => { timer = setTimeout(resolve, 2500); })]);
      if (timer) clearTimeout(timer);
    },
    get activeCounts() { const owned = [...sessions].map(session => session.state()); return { sessions: sessions.size, pendingClaims: owned.filter(session => session.claiming).length, upstreams: owned.filter(session => session.owned).length, closing: owned.filter(session => session.closing).length }; },
  };
}
