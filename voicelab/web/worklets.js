// VP voice lab audio worklets. mic: any input rate -> 16 kHz int16 frames of 320 samples (20 ms), with an optional
// phone-line simulation (G.711 mu-law round trip; the band-pass filters live in the main graph).
// player: 24 kHz float queue tagged by reply id; flush drops a reply; reports when each reply starts playing.
function mulawRound(x) {
  const MU = 255, s = Math.sign(x), a = Math.min(1, Math.abs(x));
  const y = s * Math.log1p(MU * a) / Math.log1p(MU);
  const q = Math.round(y * 127) / 127;                       // 8-bit companded
  return Math.sign(q) * (Math.pow(1 + MU, Math.abs(q)) - 1) / MU;
}

class MicProc extends AudioWorkletProcessor {
  constructor() {
    super(); this.ratio = sampleRate / 16000; this.pos = 0; this.out = new Int16Array(320); this.n = 0; this.phone = false; this.sent = 0;
    this.port.onmessage = (e) => { if (e.data.phone !== undefined) this.phone = e.data.phone; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // linear resample to 16 kHz
    while (this.pos < ch.length - 1) {
      const i = Math.floor(this.pos), f = this.pos - i;
      let v = ch[i] * (1 - f) + ch[i + 1] * f;
      if (this.phone) v = mulawRound(v);
      this.out[this.n++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
      if (this.n === 320) {
        this.sent += 320;
        this.port.postMessage({ pcm: this.out.buffer, upto: this.sent }, [this.out.buffer]);
        this.out = new Int16Array(320); this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('mic-proc', MicProc);

class PlayerProc extends AudioWorkletProcessor {
  constructor() {
    super(); this.q = []; this.cur = null; this.off = 0; this.started = new Set(); this.dropped = new Set(); this.phone = false; this.idle = true;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'push') { if (!this.dropped.has(d.rid)) this.q.push({ rid: d.rid, s: d.samples }); }
      else if (d.type === 'flush') {
        this.dropped.add(d.rid); this.q = this.q.filter((c) => c.rid !== d.rid);
        if (this.cur && this.cur.rid === d.rid) { this.cur = null; this.off = 0; }
      } else if (d.type === 'phone') this.phone = d.phone;
      else if (d.type === 'stopall') { this.q = []; this.cur = null; this.off = 0; }
    };
  }
  process(_, outputs) {
    const out = outputs[0][0]; let i = 0;
    while (i < out.length) {
      if (!this.cur) {
        this.cur = this.q.shift() || null; this.off = 0;
        if (!this.cur) break;
        if (!this.started.has(this.cur.rid)) {
          this.started.add(this.cur.rid);
          this.port.postMessage({ type: 'start', rid: this.cur.rid, t: currentTime + i / sampleRate });
        }
        if (this.idle) { this.idle = false; this.port.postMessage({ type: 'busy' }); }
      }
      const s = this.cur.s; const n = Math.min(out.length - i, s.length - this.off);
      for (let k = 0; k < n; k++) { let v = s[this.off + k]; if (this.phone) v = mulawRound(v); out[i + k] = v; }
      i += n; this.off += n;
      if (this.off >= s.length) this.cur = null;
    }
    for (; i < out.length; i++) out[i] = 0;
    if (!this.cur && this.q.length === 0 && !this.idle) { this.idle = true; this.port.postMessage({ type: 'idle' }); }
    return true;
  }
}
registerProcessor('player-proc', PlayerProc);
