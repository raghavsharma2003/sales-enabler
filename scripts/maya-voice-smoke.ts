// One bounded synthetic Maya/Despina Live check using the normal server adapter.
// Usage: node --env-file=.env.local --import tsx scripts/maya-voice-smoke.ts
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { activeMayaGoogleKeyEntries, getVoiceConfiguration, mayaGoogleKeyEntries } from "../lib/voice/config";
import { getVoiceServerAdapter } from "../lib/voice/server";

const require = createRequire(import.meta.url);
const WebSocket = require("next/dist/compiled/ws");
const started = Date.now();
const deadline = started + 30_000;
const directory = resolve(".impeccable/review");
const reportPath = resolve(directory, "maya-despina-smoke.json");
const audioPath = resolve(directory, "maya-despina-smoke.wav");
const pool = mayaGoogleKeyEntries(process.env);
const independent = pool.filter((item, index) => pool.findIndex(candidate => candidate.label === item.label) === index);
const requestedIndex = process.env.MAYA_LIVE_SMOKE_INDEX;
const selected = requestedIndex === undefined
  ? activeMayaGoogleKeyEntries(process.env)[0]
  : independent[Math.min(2, Math.max(0, Number(requestedIndex) || 0))];
const keyIndex = independent.findIndex(item => item.key === selected?.key);
const smokeEnv = { ...process.env, MAYA_GOOGLE_KEYS: selected ? `${selected.label}~${selected.key}` : "" };
const config = getVoiceConfiguration(smokeEnv, "maya-despina");
const httpStatuses: number[] = [];
const audioParts: Buffer[] = [];
let audioBytes = 0;
let tokenIssued = false;
let setupComplete = false;
let promptSent = false;
let handshakeStatus: number | undefined;
let wsCloseCode: number | undefined;
let wsCloseCategory: string | undefined;
let wsCloseStatus: number | undefined;
let wsCloseErrorCode: string | undefined;
let safeErrorCode: string | undefined;
let provisionErrorCategory: string | undefined;
let outputTranscriptChars = 0;
let finished = false;
let socket: InstanceType<typeof WebSocket> | undefined;

function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

let finish!: (status: string) => void;
const done = new Promise<void>(resolveDone => {
  finish = status => {
    if (finished) return;
    finished = true;
    try { socket?.close(); } catch { /* Socket already closed. */ }
    void (async () => {
      await mkdir(directory, { recursive: true });
      const audio = Buffer.concat(audioParts);
      if (audio.length) await writeFile(audioPath, wav(audio));
      const report = {
        provider: "gemini", profile: "maya-despina", voice: "Despina", model: config.model, freePoolIndex: keyIndex,
        checkedAt: new Date().toISOString(), status, elapsedMs: Date.now() - started,
        tokenIssued, tokenHttpStatuses: httpStatuses, setupComplete, promptSent,
        handshakeStatus, wsCloseCode, wsCloseCategory, wsCloseStatus, wsCloseErrorCode, providerErrorCode: safeErrorCode,
        provisionErrorCategory,
        outputTranscriptChars, audioBytes: audio.length,
        audioDurationSeconds: Math.round(audio.length / 48_000 * 100) / 100,
        audioFile: audio.length ? ".impeccable/review/maya-despina-smoke.wav" : null,
        verification: status === "audio_received"
          ? "One synthetic text prompt produced PCM audio using a Despina-constrained ephemeral Live session."
          : "Live Despina audio was not verified.",
        limitation: "This synthetic server WebSocket check does not verify browser microphone capture, interruption, or human-rated voice quality.",
      };
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      process.stdout.write(`Maya smoke: ${status}; audioBytes=${audio.length}; report=.impeccable/review/maya-despina-smoke.json\n`);
      process.exitCode = status === "audio_received" ? 0 : 1;
    })().catch(() => { process.stderr.write("Maya smoke: could not save redacted artifacts.\n"); process.exitCode = 1; }).finally(resolveDone);
  };
});

const overallTimer = setTimeout(() => finish("timeout"), 30_000);
async function main() {
try {
  if (!config.configured) {
    finish("not_configured");
  } else {
    const transport = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(url, init);
      httpStatuses.push(response.status);
      if (!response.ok) {
        try {
          const body = await response.clone().json() as { error?: { message?: unknown; status?: unknown } };
          const message = String(body.error?.message || "").toLowerCase();
          const fields = ["bidigeneratecontentsetup", "generationconfig", "speechconfig", "inputaudiotranscription", "outputaudiotranscription", "systeminstruction", "expiretime", "newsessionexpiretime", "model", "voice", "authtoken"];
          provisionErrorCategory = fields.find(field => message.includes(field)) || (typeof body.error?.status === "string" ? body.error.status.slice(0, 60) : "unknown");
        } catch { provisionErrorCategory = "unparseable"; }
      }
      return response;
    }) as typeof fetch;
    const adapter = getVoiceServerAdapter(smokeEnv, transport, "maya-despina");
    let connection: Awaited<ReturnType<typeof adapter.connect>>;
    try {
      connection = await adapter.connect({
        instructions: JSON.stringify({ agent: { name: "Maya", role: "synthetic AI voice check", disclosure: "I am an AI assistant.",
          objective: "Give one short greeting", primaryLanguage: "English", allowedLanguages: ["English", "Hindi"] } }),
        userId: "synthetic-voice-check", organizationId: "synthetic-voice-check",
        signal: AbortSignal.timeout(18_000),
      });
    } catch {
      connection = undefined as never;
      finish("token_provision_failed");
    }
    if (!finished && connection!.transport === "websocket") {
      tokenIssued = true;
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(connection!.token)}`;
      socket = new WebSocket(url, { handshakeTimeout: Math.max(1000, Math.min(7000, deadline - Date.now())), maxPayload: 2_000_000 });
      socket.on("open", () => socket?.send(JSON.stringify({ setup: connection!.setup })));
      socket.on("message", (raw: Buffer) => {
        let event: Record<string, unknown>;
        try { event = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return; }
        if (event.setupComplete && !promptSent) {
          setupComplete = true;
          promptSent = true;
          socket?.send(JSON.stringify({ realtimeInput: { text: "Namaste. In one short sentence, say that you are an AI assistant and greet me in natural Hinglish." } }));
        }
        const content = event.serverContent as Record<string, unknown> | undefined;
        const transcription = content?.outputTranscription as Record<string, unknown> | undefined;
        if (typeof transcription?.text === "string") outputTranscriptChars = Math.max(outputTranscriptChars, transcription.text.length);
        const parts = (content?.modelTurn as { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } | undefined)?.parts;
        for (const part of parts || []) {
          if (!part.inlineData?.mimeType?.startsWith("audio/pcm") || typeof part.inlineData.data !== "string") continue;
          const bytes = Buffer.from(part.inlineData.data, "base64");
          if (audioBytes + bytes.length > 240_000) { finish("audio_limit"); return; }
          audioParts.push(bytes);
          audioBytes += bytes.length;
          if (audioBytes >= 240_000) { finish("audio_received"); return; }
        }
        if (event.error && typeof event.error === "object") {
          const code = (event.error as { code?: unknown }).code;
          safeErrorCode = typeof code === "string" ? code.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) : "provider_error";
          finish("provider_error");
        }
        if (content?.turnComplete === true) finish(audioBytes ? "audio_received" : "no_audio");
      });
      socket.on("unexpected-response", (_request: unknown, response: { statusCode?: number }) => { handshakeStatus = response.statusCode; finish("handshake_failed"); });
      socket.on("error", () => finish("transport_error"));
      socket.on("close", (code: number, reason: Buffer) => {
        wsCloseCode = code;
        const detail = reason?.toString("utf8").toLowerCase() || "";
        try {
          const parsed = JSON.parse(reason.toString("utf8")) as { code?: unknown; status?: unknown; error?: { code?: unknown; status?: unknown } };
          const code = parsed.error?.code ?? parsed.code;
          const status = parsed.error?.status ?? parsed.status;
          if (typeof code === "number") wsCloseStatus = code;
          if (typeof status === "string" && /^[A-Z_]{3,50}$/.test(status)) wsCloseErrorCode = status;
        } catch { /* Close reason is free text; classify without persisting it. */ }
        wsCloseCategory = ["model", "voice", "quota", "permission", "invalid", "internal", "token", "not found", "unsupported", "unavailable", "deadline", "failed", "setup", "resource", "request"]
          .find(category => detail.includes(category)) || (detail ? "other" : "empty");
        if (!finished) finish(audioBytes ? "audio_received" : "closed_early");
      });
    }
  }
} catch {
  finish("unexpected_failure");
}
await done;
clearTimeout(overallTimer);
}
void main();
