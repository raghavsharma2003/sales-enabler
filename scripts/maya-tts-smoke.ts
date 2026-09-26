// One bounded synthetic Despina TTS check with the first configured free key.
// Usage: node --env-file=.env.local --import tsx scripts/maya-tts-smoke.ts
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { activeMayaGoogleKeyEntries, mayaGoogleKeyEntries } from "../lib/voice/config";

const directory = resolve(".impeccable/review");
const started = Date.now();
const model = "gemini-3.1-flash-tts-preview";
const voice = "Despina";

function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24); header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function main() {
  const pool = mayaGoogleKeyEntries(process.env);
  const independent = pool.filter((item, index) => pool.findIndex(candidate => candidate.label === item.label) === index);
  const requestedIndex = process.env.MAYA_TTS_SMOKE_INDEX;
  const selected = requestedIndex === undefined
    ? activeMayaGoogleKeyEntries(process.env)[0]
    : independent[Math.min(2, Math.max(0, Number(requestedIndex) || 0))];
  const keyIndex = independent.findIndex(item => item.key === selected?.key);
  const key = selected?.key;
  let status = "not_configured";
  let httpStatus: number | undefined;
  let providerReason: string | undefined;
  let mimeType: string | undefined;
  let pcm = Buffer.alloc(0);
  if (key && process.env.MAYA_GEMINI_ENABLED === "true") {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say naturally and briefly: Namaste, I am an AI assistant. Aap kaise hain?" }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: {
            languageCode: "hi-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          } },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      httpStatus = response.status;
      const body = await response.json() as { error?: { status?: unknown; details?: Array<{ reason?: unknown }> };
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: unknown; data?: unknown } }> } }> };
      if (!response.ok) {
        const reason = body.error?.details?.find(detail => typeof detail.reason === "string")?.reason || body.error?.status;
        providerReason = typeof reason === "string" && /^[A-Z_]{3,50}$/.test(reason) ? reason : "unknown";
        status = "provider_rejected";
      } else {
        const inline = body.candidates?.[0]?.content?.parts?.find(part => typeof part.inlineData?.data === "string")?.inlineData;
        mimeType = typeof inline?.mimeType === "string" ? inline.mimeType.slice(0, 80) : undefined;
        if (typeof inline?.data === "string" && mimeType?.startsWith("audio/")) {
          pcm = Buffer.from(inline.data, "base64").subarray(0, 240_000);
          status = pcm.length ? "audio_received" : "no_audio";
        } else status = "no_audio";
      }
    } catch { status = "transport_or_parse_failure"; }
  }
  await mkdir(directory, { recursive: true });
  if (pcm.length) await writeFile(resolve(directory, "maya-despina-tts-smoke.wav"), wav(pcm));
  const report = { provider: "gemini", path: "generateContent", model, voice, freePoolIndex: keyIndex, checkedAt: new Date().toISOString(),
    status, httpStatus, providerReason, mimeType, elapsedMs: Date.now() - started, audioBytes: pcm.length,
    audioDurationSeconds: Math.round(pcm.length / 48_000 * 100) / 100,
    audioFile: pcm.length ? ".impeccable/review/maya-despina-tts-smoke.wav" : null,
    verification: pcm.length ? "One synthetic line produced PCM audio with the Despina TTS preset." : "Despina TTS audio was not verified.",
    limitation: "Synthetic text-to-speech only; this does not verify an in-call cascade, microphone input, or human-rated voice quality." };
  await writeFile(resolve(directory, "maya-despina-tts-smoke.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`Maya Despina TTS: ${status}; HTTP ${httpStatus || 0}; audioBytes=${pcm.length}; report=.impeccable/review/maya-despina-tts-smoke.json\n`);
  process.exitCode = pcm.length ? 0 : 1;
}
void main();
