// A test call in the browser: the page joins the voice runtime's browser media socket (/v1/media/browser/{id}, a
// single-use token from test.browser_call) and is the caller. Ported from the voice lab's client (voicelab/web).
//   up:   the microphone, as 16 kHz 16-bit mono PCM frames of 20 ms (an AudioWorklet resamples whatever the device gives)
//   down: binary frames = a little-endian u32 reply id + 24 kHz 16-bit mono PCM; JSON frames = ready, cap (captions),
//         state, reply, flush (barge-in: drop that reply's audio at once) and ended.
// No React here, so the same client can be driven from a test.

export interface Join { kind: string; url: string; token: string; expiresAtMs: number }
export interface Caption { who: 'agent' | 'caller'; text: string; final: boolean; rid?: number }
export type CallState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';
export interface CallHandlers {
  state(s: CallState): void;
  caption(c: Caption): void;
  ended(why: { endReason?: string; error?: string }): void;
}

// The worklets run on the audio thread; they are loaded from a Blob, so the app ships one bundle and no extra file.
const WORKLETS = `
class MicProc extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.out = new Int16Array(320); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length - 1) {
      const i = Math.floor(this.pos), f = this.pos - i, v = ch[i] * (1 - f) + ch[i + 1] * f;
      this.out[this.n++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
      if (this.n === 320) { this.port.postMessage(this.out.buffer, [this.out.buffer]); this.out = new Int16Array(320); this.n = 0; }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('vp-mic', MicProc);
class PlayerProc extends AudioWorkletProcessor {
  constructor() {
    super(); this.q = []; this.cur = null; this.off = 0; this.dropped = new Set();
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'push') { if (!this.dropped.has(d.rid)) this.q.push({ rid: d.rid, s: d.samples }); }
      else if (d.type === 'flush') { this.dropped.add(d.rid); this.q = this.q.filter((c) => c.rid !== d.rid); if (this.cur && this.cur.rid === d.rid) this.cur = null; }
      else if (d.type === 'stop') { this.q = []; this.cur = null; }
    };
  }
  process(_, outputs) {
    const out = outputs[0][0]; let i = 0;
    while (i < out.length) {
      if (!this.cur) { this.cur = this.q.shift() || null; this.off = 0; if (!this.cur) break; }
      const s = this.cur.s, n = Math.min(out.length - i, s.length - this.off);
      for (let k = 0; k < n; k++) out[i + k] = s[this.off + k];
      i += n; this.off += n;
      if (this.off >= s.length) this.cur = null;
    }
    for (; i < out.length; i++) out[i] = 0;
    return true;
  }
}
registerProcessor('vp-player', PlayerProc);
`;

/** Why a call could not start or stopped, in words a person can act on. */
export function callError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Your browser blocked the microphone. Allow it for this site, then start the call again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Connect one, then start the call again.';
  if (name === 'NotReadableError') return 'The microphone is in use by another app. Close it, then start the call again.';
  return 'The browser could not start audio for this call. Reload the page and try again.';
}
export const EXPIRED = 'This call link has expired. Start a new call.';
export const UNREACHABLE = 'The voice engine could not be reached. Try again in a minute.';

function resample(x: Float32Array<ArrayBuffer>, from: number, to: number): Float32Array<ArrayBuffer> {
  if (from === to) return x;
  const n = Math.floor(x.length * to / from), y = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; y[i] = x[k] * (1 - f) + (x[k + 1] ?? x[k]) * f; }
  return y;
}

export class BrowserCall {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private ctxIn: AudioContext | null = null;
  private ctxOut: AudioContext | null = null;
  private player: AudioWorkletNode | null = null;
  private opened = false;
  private done = false;
  private url = '';

  constructor(private join: Join, private on: CallHandlers) {}

  async start(): Promise<void> {
    if (this.join.expiresAtMs && this.join.expiresAtMs < Date.now()) { this.finish({ error: EXPIRED }); return; }
    this.on.state('connecting');
    let mic: AudioWorkletNode;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      try { this.ctxIn = new AudioContext({ sampleRate: 16000 }); } catch { this.ctxIn = new AudioContext(); }
      try { this.ctxOut = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' }); } catch { this.ctxOut = new AudioContext({ latencyHint: 'interactive' }); }
      this.url = URL.createObjectURL(new Blob([WORKLETS], { type: 'text/javascript' }));
      await Promise.all([this.ctxIn.audioWorklet.addModule(this.url), this.ctxOut.audioWorklet.addModule(this.url)]);
      await this.ctxIn.resume(); await this.ctxOut.resume();
      mic = new AudioWorkletNode(this.ctxIn, 'vp-mic');
      this.ctxIn.createMediaStreamSource(this.stream).connect(mic);
      this.player = new AudioWorkletNode(this.ctxOut, 'vp-player', { outputChannelCount: [1] });
      this.player.connect(this.ctxOut.destination);
    } catch (e) { this.finish({ error: callError(e) }); return; }

    const ws = this.ws = new WebSocket(`${this.join.url}?token=${encodeURIComponent(this.join.token)}`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.opened = true; };
    mic.port.onmessage = (e: MessageEvent<ArrayBuffer>) => { if (this.opened && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
    ws.onmessage = e => (typeof e.data === 'string' ? this.message(JSON.parse(e.data)) : this.audio(e.data as ArrayBuffer));
    // A socket that never opened was refused (a used or expired token) or never reached the runtime: the browser cannot
    // tell the two apart, so the clock decides which to say.
    ws.onclose = () => this.finish(this.opened ? {} : { error: this.join.expiresAtMs && this.join.expiresAtMs < Date.now() ? EXPIRED : UNREACHABLE });
  }

  /** Hang up: the runtime ends the call (caller hung up) and files it; the page stops its audio at once. */
  hangup(): void {
    if (this.ws?.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify({ t: 'hangup' })); } catch { /* closing anyway */ } }
    this.player?.port.postMessage({ type: 'stop' });
    this.ws?.close();
    this.finish({ endReason: 'caller_hung_up' });
  }

  private message(d: { t: string; [k: string]: unknown }): void {
    switch (d.t) {
      case 'ready': this.on.state('listening'); break;
      case 'state': if (d.s === 'listening' || d.s === 'thinking' || d.s === 'speaking') this.on.state(d.s); break;
      case 'reply': this.on.state('speaking'); break;
      case 'flush': this.player?.port.postMessage({ type: 'flush', rid: d.rid }); this.on.state('listening'); break;     // she was cut off
      case 'cap': this.on.caption({ who: d.who === 'agent' ? 'agent' : 'caller', text: String(d.text ?? ''), final: d.final === true, rid: typeof d.rid === 'number' ? d.rid : undefined }); break;
      case 'ended': this.finish({ endReason: typeof d.endReason === 'string' ? d.endReason : undefined }); break;
    }
  }

  private audio(buf: ArrayBuffer): void {
    if (!this.player || !this.ctxOut || buf.byteLength < 6) return;
    const rid = new DataView(buf, 0, 4).getUint32(0, true);
    const pcm = new Int16Array(buf, 4, (buf.byteLength - 4) >> 1);
    let f: Float32Array<ArrayBuffer> = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768;
    f = resample(f, 24000, this.ctxOut.sampleRate);
    this.player.port.postMessage({ type: 'push', rid, samples: f }, [f.buffer]);
  }

  private finish(why: { endReason?: string; error?: string }): void {
    if (this.done) return;
    this.done = true;
    this.stream?.getTracks().forEach(t => t.stop());
    void this.ctxIn?.close().catch(() => {}); void this.ctxOut?.close().catch(() => {});
    if (this.url) URL.revokeObjectURL(this.url);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    this.on.state('ended');
    this.on.ended(why);
  }
}
