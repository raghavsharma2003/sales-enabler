import type { VoiceClientAdapter, VoiceEvent, VoiceToolCall } from "./contracts";

export interface GeminiEventState {
  turn: number;
  inputText: string;
  outputText: string;
}

export function createGeminiEventState(): GeminiEventState { return { turn: 0, inputText: "", outputText: "" }; }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseGeminiServerMessage(data: unknown, state: GeminiEventState): {
  ready: boolean; interrupted: boolean; turnComplete: boolean; audioChunks: string[]; events: VoiceEvent[]; toolCalls: VoiceToolCall[]; cancelledToolIds: string[]; tooManyToolCalls: boolean;
} {
  const message = record(data);
  const result: { ready: boolean; interrupted: boolean; turnComplete: boolean; audioChunks: string[]; events: VoiceEvent[]; toolCalls: VoiceToolCall[]; cancelledToolIds: string[]; tooManyToolCalls: boolean } = { ready: false, interrupted: false, turnComplete: false, audioChunks: [], events: [], toolCalls: [], cancelledToolIds: [], tooManyToolCalls: false };
  if (!message) return result;
  result.ready = !!record(message.setupComplete);
  const toolCall = record(message.toolCall);
  const functionCalls = Array.isArray(toolCall?.functionCalls) ? toolCall.functionCalls : [];
  result.tooManyToolCalls = functionCalls.length > 16;
  for (const entry of functionCalls.slice(0, 16)) {
    const call = record(entry);
    if (typeof call?.id === "string" && typeof call.name === "string") result.toolCalls.push({ id: call.id, name: call.name, arguments: call.args ?? {} });
  }
  const cancellation = record(message.toolCallCancellation);
  result.cancelledToolIds = (Array.isArray(cancellation?.ids) ? cancellation.ids : []).filter((id): id is string => typeof id === "string").slice(0, 16);
  const content = record(message.serverContent);
  if (!content) return result;
  result.interrupted = content.interrupted === true;
  result.turnComplete = content.turnComplete === true;
  if (result.interrupted) result.events.push({ type: "activity", activity: "listening" });
  for (const [field, role, key] of [["inputTranscription", "user", "inputText"], ["outputTranscription", "assistant", "outputText"]] as const) {
    const transcription = record(content[field]);
    const text = typeof transcription?.text === "string" ? transcription.text.trim().slice(0, 10_000) : "";
    if (!text) continue;
    const previous = state[key];
    state[key] = (text.startsWith(previous) ? text : `${previous}${previous ? " " : ""}${text}`).slice(0, 10_000);
    result.events.push({ type: "transcript", entry: { id: `gemini-${role}-${state.turn}`, role, text: state[key] } });
    if (role === "user") result.events.push({ type: "activity", activity: "thinking" });
  }
  const modelTurn = record(content.modelTurn);
  const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];
  for (const part of parts) {
    const inline = record(record(part)?.inlineData);
    if (typeof inline?.data === "string" && inline.data.length <= 1_000_000 && (typeof inline.mimeType !== "string" || inline.mimeType.startsWith("audio/pcm"))) result.audioChunks.push(inline.data);
  }
  if (result.audioChunks.length) result.events.push({ type: "activity", activity: "speaking" });
  if (content.turnComplete === true) {
    result.events.push({ type: "activity", activity: "listening" });
    state.turn += 1; state.inputText = ""; state.outputText = "";
  }
  return result;
}

function parseOpenAIEvent(data: unknown): VoiceEvent | null {
  if (!data || typeof data !== "object") return null;
  const event = data as Record<string, unknown>;
  const type = event.type;
  if (type === "conversation.item.added" || type === "conversation.item.created") {
    const item = event.item as Record<string, unknown> | undefined;
    if (item && typeof item.id === "string") return { type: "item", id: item.id };
  }
  if (type === "conversation.item.input_audio_transcription.completed" || type === "response.output_audio_transcript.done") {
    if (typeof event.item_id !== "string" || typeof event.transcript !== "string" || !event.transcript.trim()) return null;
    return { type: "transcript", entry: {
      id: event.item_id, role: type === "conversation.item.input_audio_transcription.completed" ? "user" : "assistant",
      text: event.transcript.trim().slice(0, 10_000),
    } };
  }
  if (type === "input_audio_buffer.speech_started" || type === "output_audio_buffer.stopped") return { type: "activity", activity: "listening" };
  if (type === "input_audio_buffer.speech_stopped" || type === "response.created") return { type: "activity", activity: "thinking" };
  if (type === "output_audio_buffer.started") return { type: "activity", activity: "speaking" };
  if (type === "conversation.item.input_audio_transcription.failed") return { type: "error", message: "Transcription failed. The transcript may be incomplete. End the conversation and try again." };
  if (type === "error") return { type: "error", message: "The voice provider reported an error. End the conversation and try again." };
  return null;
}

export function getVoiceClientAdapter(provider: string): VoiceClientAdapter {
  if (provider !== "openai" && provider !== "azure" && provider !== "gemini") throw new Error("No browser adapter is installed for this voice provider.");
  if (provider === "gemini") {
    const state = createGeminiEventState();
    return { dataChannelName: "", parseEvent: data => parseGeminiServerMessage(data, state).events[0] || null, openingEvents: () => [] };
  }
  return {
    dataChannelName: "oai-events",
    parseEvent: parseOpenAIEvent,
    openingEvents: greeting => [{
      type: "response.create",
      ...(greeting?.trim() ? { response: { instructions:
        `For this first response only, speak the following approved opening message exactly as written. Do not narrate your plan, add a preamble, change its wording, or add another question. Keep the AI identity disclosure in the message. Opening message: ${JSON.stringify(greeting.trim())}` } } : {}),
    }],
  };
}
