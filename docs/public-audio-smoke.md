# Public synthetic-audio smoke

This one-session harness checks the public voice audio path with a fictional, locally synthesized WAV. It is synthetic transport/STT evidence only: it does not test a real microphone, device audio processing, speaker playback, or human listening quality.

The harness obtains an anonymous voice session from the local public API with origin `http://localhost:3000`, then uses the returned public WebSocket address. It sends no owner cookie or provider credential. It waits for the opening assistant turn, streams 24 kHz mono 16-bit PCM in real-time 100 ms frames followed by one second of silence, and requires a server-captured caller transcript plus assistant audio and a completed reply turn. It makes one attempt, has a 45-second total cap, and prints counts/status plus an optional keyword match; it never prints capabilities, gateway addresses, transcripts, or provider messages.

Windows System.Speech creates the fictional fixture on first use under ignored `data/qa-v7/`, alongside a provenance JSON file. Check fixture generation, WAV conversion, and client-frame parsing without contacting the app or provider:

```powershell
node --import tsx scripts/smoke-public-audio.ts --offline-check
```

After the local app and public voice gateway are already running and the gateway owner has cleared live testing, run exactly one live smoke with the published web-voice deployment ID:

```powershell
node --import tsx scripts/smoke-public-audio.ts <publicId> --expected-keyword office
```

The expected keyword is optional and only reports a boolean. A mismatch does not replace the required transport evidence. Do not rerun automatically after any failure because session issuance and connection can invoke the paid Azure provider.
