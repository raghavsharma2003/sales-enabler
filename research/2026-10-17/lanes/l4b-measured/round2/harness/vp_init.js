// vp_init.js: injected into every frame BEFORE page scripts (Playwright addInitScript).
// 1) Replaces the microphone: getUserMedia returns a MediaStream fed from an AudioContext we control,
//    so the harness can play scripted caller clips (and a noise bed) into the page.
// 2) Taps every path the agent's voice can take to the speaker: WebRTC remote tracks (RTCPeerConnection 'track'),
//    page AudioContexts that connect to their destination (WebSocket/AudioWorklet players), and media elements.
// 3) Records a 16 kHz stereo PCM stream (L = what we fed the mic, R = agent audio) and streams it to Node
//    through the exposed binding window.__vpPush, so all scoring is done offline on aligned channels.
// 4) Keeps a live energy VAD on the agent channel so the Node driver knows when the agent stops talking.
(() => {
  if (window.__vp) return;
  const H = window.__vp = {
    ev: [], gum: 0, pcs: 0, taps: 0, playing: 0, clips: {}, lastAgentVoice: 0, agentVoiceMs: 0,
    thr: 0.004, floor: 0, frames16: 0, t0perf: null, t0ctx: null, recording: true, rmsHist: [],
  };
  const now = () => performance.now();
  const log = (k, d) => { H.ev.push([Math.round(now()), k, d === undefined ? '' : String(d).slice(0, 300)]); if (H.ev.length > 4000) H.ev.shift(); };
  H.log = log;
  const OrigAC = window.AudioContext || window.webkitAudioContext;
  if (!OrigAC) return;
  const origConnect = AudioNode.prototype.connect;
  let ctx = null, micGain, micDest, agentSum, merger, proc, bedSrc = null, bedGain = null;
  const tappedTracks = new Set();
  const perCtxDest = new WeakMap();
  let pending = [];
  let carryL = new Float32Array(0), carryR = new Float32Array(0);
  H.pcmRate = 16000; // exact since the carry fix (2026-10-17 ~10:50 UTC); earlier recordings ran at 15984.375 Hz
  let pendingFrames = 0;

  function b64ToBuf(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function bufToB64(u8) { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }

  function onBlock(L, R, ctxTime) {
      if (H.t0perf === null) { H.t0perf = now(); H.t0ctx = ctxTime; log('rec0', ctxTime); log('pcmrate', H.pcmRate); }
      // agent VAD (block = 42.7 ms)
      let s = 0; for (let i = 0; i < R.length; i++) s += R[i] * R[i];
      const rms = Math.sqrt(s / R.length);
      H.rmsHist.push(rms); if (H.rmsHist.length > 120) H.rmsHist.shift();
      const sorted = H.rmsHist.slice().sort((a, b) => a - b);
      H.floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
      const thr = Math.max(H.thr, H.floor * 4);
      if (rms > thr) { H.lastAgentVoice = now(); H.agentVoiceMs += 1000 * R.length / ctx.sampleRate; }
      H.agentRms = rms;
      // downsample 48k -> 16k (3-tap box) and interleave as int16; carry the 2048 % 3 leftover samples to the next
      // block so the output rate is exactly 16000 Hz (dropping them made the stream run at 15984.375 Hz)
      const LL = new Float32Array(carryL.length + L.length); LL.set(carryL); LL.set(L, carryL.length);
      const RR = new Float32Array(carryR.length + R.length); RR.set(carryR); RR.set(R, carryR.length);
      const n = Math.floor(LL.length / 3);
      carryL = LL.slice(3 * n); carryR = RR.slice(3 * n);
      const out = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) {
        const l = (LL[3 * i] + LL[3 * i + 1] + LL[3 * i + 2]) / 3, r = (RR[3 * i] + RR[3 * i + 1] + RR[3 * i + 2]) / 3;
        out[2 * i] = Math.max(-32768, Math.min(32767, l * 32767));
        out[2 * i + 1] = Math.max(-32768, Math.min(32767, r * 32767));
      }
      H.frames16 += n;
      if (H.recording) { pending.push(out); pendingFrames += n; }
      if (pendingFrames >= 8000 && window.__vpPush) { flush(); }
  }
  function ensure() {
    if (ctx) return ctx;
    ctx = new OrigAC({ sampleRate: 48000 });
    ctx.__vpOwn = true;
    micGain = ctx.createGain();
    micDest = ctx.createMediaStreamDestination();
    origConnect.call(micGain, micDest);
    agentSum = ctx.createGain();
    merger = ctx.createChannelMerger(2);
    origConnect.call(micGain, merger, 0, 0);
    origConnect.call(agentSum, merger, 0, 1);
    const sink = ctx.createGain(); sink.gain.value = 0; origConnect.call(sink, ctx.destination);
    // Recorder: an AudioWorklet runs on the audio thread, so busy page JavaScript cannot make it drop audio
    // (a main-thread ScriptProcessor did: periodic clicks and gaps under load). ScriptProcessor is only the fallback
    // when the page's CSP forbids the blob: module.
    const WSRC = "class R extends AudioWorkletProcessor{constructor(){super();this.n=0;this.L=new Float32Array(2048);this.R=new Float32Array(2048);this.t=0}" +
      "process(inp){const i=inp[0];if(!i||!i.length)return true;if(this.n===0)this.t=currentTime;const l=i[0],r=i[1]||i[0];" +
      "this.L.set(l,this.n);this.R.set(r,this.n);this.n+=l.length;if(this.n>=2048){this.port.postMessage([this.L,this.R,this.t],[this.L.buffer,this.R.buffer]);" +
      "this.L=new Float32Array(2048);this.R=new Float32Array(2048);this.n=0}return true}}registerProcessor('vp-rec',R);";
    const useSP = () => {
      if (proc) return;
      proc = ctx.createScriptProcessor(2048, 2, 2);
      origConnect.call(merger, proc); origConnect.call(proc, sink);
      proc.onaudioprocess = (e) => onBlock(e.inputBuffer.getChannelData(0), e.inputBuffer.getChannelData(1), e.playbackTime);
      H.recorder = 'scriptprocessor'; log('recorder', 'scriptprocessor');
    };
    try {
      const url = URL.createObjectURL(new Blob([WSRC], { type: 'application/javascript' }));
      ctx.audioWorklet.addModule(url).then(() => {
        const node = new AudioWorkletNode(ctx, 'vp-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
        node.port.onmessage = (m) => onBlock(m.data[0], m.data[1], m.data[2]);
        origConnect.call(merger, node); origConnect.call(node, sink);
        H.recorder = 'worklet'; log('recorder', 'worklet');
      }).catch((e) => { log('worklet-fail', e); useSP(); });
    } catch (e) { log('worklet-fail', e); useSP(); }
    log('ctx', ctx.sampleRate);
    return ctx;
  }
  function flush() {
    if (!pending.length) return;
    let tot = 0; for (const p of pending) tot += p.length;
    const all = new Int16Array(tot); let o = 0; for (const p of pending) { all.set(p, o); o += p.length; }
    pending = []; pendingFrames = 0;
    try { window.__vpPush(bufToB64(new Uint8Array(all.buffer))); } catch (e) { log('pusherr', e); }
  }
  H.flush = flush;

  function tapTrack(track, why) {
    if (!track || track.kind !== 'audio' || tappedTracks.has(track.id)) return;
    tappedTracks.add(track.id);
    ensure();
    try {
      // Chromium only feeds remote WebRTC audio into WebAudio when the track is also attached to a media element.
      const a = new Audio(); a.muted = true; a.srcObject = new MediaStream([track]); a.play().catch(() => {});
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      origConnect.call(src, agentSum);
      H.taps++; log('tap', why + ':' + track.id);
    } catch (e) { log('taperr', why + ':' + e); }
  }
  H.tapTrack = tapTrack;

  // ---- microphone replacement
  const md = navigator.mediaDevices;
  if (md) {
    const fakeGUM = async (c) => {
      H.gum++; log('gum', JSON.stringify(c || {}));
      ensure(); try { await ctx.resume(); } catch {}
      const t = micDest.stream.getAudioTracks()[0];
      const mt = t.clone(); H.micTrackIds.add(t.id); H.micTrackIds.add(mt.id);
      return new MediaStream([mt]);
    };
    md.getUserMedia = fakeGUM;
    md.enumerateDevices = async () => [
      { deviceId: 'default', kind: 'audioinput', label: 'VP Mic', groupId: 'vp', toJSON() { return this; } },
      { deviceId: 'default', kind: 'audiooutput', label: 'VP Speaker', groupId: 'vp', toJSON() { return this; } },
    ];
  }
  if (navigator.permissions && navigator.permissions.query) {
    const oq = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d) => (d && (d.name === 'microphone' || d.name === 'camera')) ? Promise.resolve({ state: 'granted', onchange: null, addEventListener() {}, removeEventListener() {} }) : oq(d);
  }

  // ---- agent taps
  const OrigPC = window.RTCPeerConnection;
  if (OrigPC) {
    const P = function (cfg, ...r) {
      const pc = new OrigPC(cfg, ...r); H.pcs++;
      try { log('pc', JSON.stringify(((cfg && cfg.iceServers) || []).map(s => s.urls))); } catch {}
      pc.addEventListener('track', e => tapTrack(e.track, 'pc'));
      pc.addEventListener('iceconnectionstatechange', () => log('ice', pc.iceConnectionState));
      pc.addEventListener('connectionstatechange', () => log('pcstate', pc.connectionState));
      pc.addEventListener('icecandidate', e => { if (e.candidate && e.candidate.candidate) log('cand', e.candidate.candidate.split(' ').slice(2, 8).join(' ')); });
      return pc;
    };
    P.prototype = OrigPC.prototype;
    Object.setPrototypeOf(P, OrigPC);
    window.RTCPeerConnection = P;
    if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = P;
  }
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = origConnect.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode && !this.context.__vpOwn && typeof this.context.createMediaStreamDestination === 'function') {
        ensure();
        let mdn = perCtxDest.get(this.context);
        if (!mdn) {
          mdn = this.context.createMediaStreamDestination();
          perCtxDest.set(this.context, mdn);
          const src = ctx.createMediaStreamSource(mdn.stream);
          origConnect.call(src, agentSum);
          H.taps++; log('tapctx', this.context.sampleRate + ' ' + this.constructor.name);
        }
        origConnect.call(this, mdn);
      }
    } catch (e) { log('taperr', 'ctx:' + e); }
    return r;
  };
  // media elements fed a MediaStream (e.g. an SDK routes its worklet output to <audio>.srcObject for setSinkId)
  const micTrackIds = H.micTrackIds = new Set();
  const soDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  if (soDesc && soDesc.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true, enumerable: soDesc.enumerable, get: soDesc.get,
      set(v) {
        try { if (v && v.getAudioTracks) v.getAudioTracks().forEach(t => { if (!micTrackIds.has(t.id)) tapTrack(t, 'el-srcObject-set'); }); } catch (e) { log('taperr', 'so:' + e); }
        return soDesc.set.call(this, v);
      },
    });
  }
  // autoplaying elements never call play(); catch them on the 'play' event
  document.addEventListener('play', (ev) => {
    const el = ev.target;
    try {
      if (!(el instanceof HTMLMediaElement) || el.__vpTapped || el.muted) return;
      if (el.srcObject && el.srcObject.getAudioTracks) { el.srcObject.getAudioTracks().forEach(t => { if (!micTrackIds.has(t.id)) tapTrack(t, 'el-playev'); }); return; }
      if ((el.src || el.currentSrc) && typeof el.captureStream === 'function') {
        el.__vpTapped = true; const st = el.captureStream();
        st.getAudioTracks().forEach(t => tapTrack(t, 'el-playev-cap')); st.addEventListener('addtrack', e => tapTrack(e.track, 'el-playev-cap'));
      }
    } catch (e) { log('taperr', 'playev:' + e); }
  }, true);
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    try {
      if (this.srcObject && this.srcObject.getAudioTracks) {
        this.srcObject.getAudioTracks().forEach(t => { if (!H.micTrackIds.has(t.id)) tapTrack(t, 'el-srcObject'); });
      } else if (!this.__vpTapped && (this.src || this.currentSrc) && typeof this.captureStream === 'function' && !this.muted) {
        this.__vpTapped = true;
        const st = this.captureStream();
        st.getAudioTracks().forEach(t => tapTrack(t, 'el-capture'));
        st.addEventListener('addtrack', e => tapTrack(e.track, 'el-capture'));
        log('elplay', (this.src || '').slice(0, 120));
      }
    } catch (e) { log('taperr', 'el:' + e); }
    return origPlay.apply(this, a);
  };

  // ---- caller playback API used by the Node driver
  H.load = async (id, b64) => { ensure(); H.clips[id] = await ctx.decodeAudioData(b64ToBuf(b64)); return H.clips[id].duration; };
  H.play = async (id, gain = 1.0) => {
    ensure(); try { await ctx.resume(); } catch {}
    const src = ctx.createBufferSource(); src.buffer = H.clips[id];
    const g = ctx.createGain(); g.gain.value = gain;
    origConnect.call(src, g); origConnect.call(g, micGain);
    H.playing++; const t = ctx.currentTime;
    log('play', id + ' ' + t.toFixed(3));
    src.onended = () => { H.playing--; log('end', id + ' ' + ctx.currentTime.toFixed(3)); H.lastClipEnd = now(); };
    src.start();
    return { ctxT: t, dur: src.buffer.duration };
  };
  H.bed = (id, gain) => {
    ensure();
    if (bedSrc) { try { bedSrc.stop(); } catch {} bedSrc = null; }
    if (!id) return;
    bedSrc = ctx.createBufferSource(); bedSrc.buffer = H.clips[id]; bedSrc.loop = true;
    bedGain = ctx.createGain(); bedGain.gain.value = gain;
    origConnect.call(bedSrc, bedGain); origConnect.call(bedGain, micGain); bedSrc.start(); log('bed', id + ' ' + gain);
  };
  H.start = () => { ensure(); H.recording = true; log('recstart', H.frames16); ctx.resume(); return true; };
  H.stop = () => { H.recording = false; flush(); log('recstop', H.frames16); return true; };
  H.state = () => ({ gum: H.gum, pcs: H.pcs, taps: H.taps, playing: H.playing, sinceAgent: H.lastAgentVoice ? Math.round(now() - H.lastAgentVoice) : -1, agentVoiceMs: Math.round(H.agentVoiceMs), rms: H.agentRms, floor: H.floor, frames16: H.frames16, ctxState: ctx ? ctx.state : 'none', ctxT: ctx ? ctx.currentTime : 0 });
})();
