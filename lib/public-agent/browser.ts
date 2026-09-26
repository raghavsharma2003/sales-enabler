export type PublicVoiceEvent = { type: 'ready' | 'ended' | 'transcript' | 'turn_done'; message?: string; role?: 'user' | 'assistant'; text?: string };
export type PublicVoiceClient = { sendText: (text: string) => void; interrupt: () => void; stop: () => void; setMuted: (muted: boolean) => void };

const processorCode = `class PublicPcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.frame = new Int16Array(2400); this.index = 0; this.phase = 0; this.sum = 0; this.samples = 0; }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (input) for (let i = 0; i < input.length; i++) {
      this.sum += input[i]; this.samples++; this.phase += 24000 / sampleRate;
      if (this.phase >= 1) { this.phase -= 1; const value = Math.max(-1, Math.min(1, this.sum / this.samples)); this.sum = 0; this.samples = 0;
        this.frame[this.index++] = value < 0 ? value * 32768 : value * 32767;
        if (this.index === this.frame.length) { this.port.postMessage(this.frame.buffer, [this.frame.buffer]); this.frame = new Int16Array(2400); this.index = 0; }
      }
    }
    return true;
  }
} registerProcessor('public-pcm-capture', PublicPcmCapture);`;

export async function connectPublicVoice(input: { url: string; token: string; nonce: string; microphone: boolean; onEvent: (event: PublicVoiceEvent) => void }): Promise<PublicVoiceClient> {
  const audio = new AudioContext({ sampleRate: 24000 });
  let stream: MediaStream | undefined, node: AudioWorkletNode | undefined, source: MediaStreamAudioSourceNode | undefined;
  let socket: WebSocket | undefined, active = false, stopped = false, muted = false;
  let nextPlayback = 0;
  const playback = new PublicPlaybackLedger();
  const playing = new Set<AudioBufferSourceNode>();
  function clearPlayback() { for (const sound of playing) { try { sound.stop(); } catch {} } playing.clear(); nextPlayback = audio.currentTime; }
  function release() { active = false; stopped = true; stream?.getTracks().forEach(track => track.stop()); node?.disconnect(); source?.disconnect(); clearPlayback(); void audio.close().catch(() => undefined); }
  function send(value: unknown) {
    if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 128000) throw new Error('The voice connection cannot keep up. Stop and start a new conversation.');
    socket.send(JSON.stringify(value));
  }
  function interrupt() {
    const target = playback.interrupt(audio.currentTime);
    clearPlayback(); if (active) send({ type: 'interrupt', ...target });
  }
  try {
    await audio.resume();
    if (input.microphone) {
      if (!navigator.mediaDevices?.getUserMedia || !audio.audioWorklet) throw new Error('Microphone voice needs a secure browser with audio support. Use Listen & type or text chat.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const blob = URL.createObjectURL(new Blob([processorCode], { type: 'text/javascript' }));
      try { await audio.audioWorklet.addModule(blob); } finally { URL.revokeObjectURL(blob); }
      source = audio.createMediaStreamSource(stream); node = new AudioWorkletNode(audio, 'public-pcm-capture');
      const sink = audio.createGain(); sink.gain.value = 0; source.connect(node); node.connect(sink); sink.connect(audio.destination);
      node.port.onmessage = (message: MessageEvent<ArrayBuffer>) => {
        if (!active || muted || stopped) return;
        const bytes = new Uint8Array(message.data); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        try { send({ type: 'audio', audio: btoa(binary) }); } catch { socket?.close(); release(); input.onEvent({ type: 'ended', message: 'The audio connection slowed down. No automatic reconnect was made.' }); }
      };
    }
    socket = new WebSocket(input.url);
    socket.onopen = () => { if (stopped) { socket?.close(); return; } send({ type: 'authenticate', token: input.token, nonce: input.nonce, inputMode: input.microphone ? 'microphone' : 'text' }); };
    socket.onmessage = event => {
      if (stopped || typeof event.data !== 'string' || event.data.length > 1_000_000) return;
      let message: Record<string, unknown>; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'ready') { active = true; input.onEvent({ type: 'ready' }); }
      else if (message.type === 'audio' && typeof message.audio === 'string') {
        try {
          const binary = atob(message.audio); if (binary.length % 2) throw new Error();
          const pcm = new DataView(new ArrayBuffer(binary.length)); for (let i = 0; i < binary.length; i++) pcm.setUint8(i, binary.charCodeAt(i));
          const buffer = audio.createBuffer(1, binary.length / 2, 24000), samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768;
          const start = Math.max(audio.currentTime + 0.015, nextPlayback);
          if (start - audio.currentTime > 20) throw new Error('Playback queue full.');
          if (!playback.schedule({ itemId: String(message.itemId || ''), responseId: String(message.responseId || ''), start, duration: buffer.duration, now: audio.currentTime })) return;
          const sound = audio.createBufferSource(); sound.buffer = buffer; sound.connect(audio.destination); sound.onended = () => playing.delete(sound); playing.add(sound); sound.start(start); nextPlayback = start + buffer.duration;
        } catch { socket?.close(); release(); input.onEvent({ type: 'ended', message: 'Audio playback was interrupted. Please use text chat.' }); }
      } else if (message.type === 'interrupted') { try { interrupt(); } catch {} }
      else if (message.type === 'transcript' && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string') input.onEvent({ type: 'transcript', role: message.role, text: message.text });
      else if (message.type === 'turn_done') input.onEvent({ type: 'turn_done' });
      else if (message.type === 'ended') { release(); socket?.close(); input.onEvent({ type: 'ended', message: typeof message.message === 'string' ? message.message : 'Conversation ended.' }); }
    };
    socket.onclose = () => { if (stopped) return; release(); input.onEvent({ type: 'ended', message: 'The connection ended. No automatic reconnect was made.' }); };
    socket.onerror = () => { if (stopped) return; release(); socket?.close(); input.onEvent({ type: 'ended', message: 'Voice could not connect. Please use text chat or start again.' }); };
    return {
      sendText(text) { if (!active) throw new Error('Wait for the assistant to connect.'); interrupt(); send({ type: 'text', text, requestId: crypto.randomUUID() }); },
      interrupt,
      setMuted(value) { muted = value; stream?.getAudioTracks().forEach(track => { track.enabled = !value; }); },
      stop() { if (socket?.readyState === WebSocket.OPEN) { try { send({ type: 'stop' }); } catch {} } release(); socket?.close(); },
    };
  } catch (error) { release(); socket?.close(); throw error; }
}
import { PublicPlaybackLedger } from './playback';
