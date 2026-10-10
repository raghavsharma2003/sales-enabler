import type { VoiceProfile } from './contracts';
import { buildVoiceInstructions } from './prompt';
import { mayaDeliveryInstructions } from './maya';
import { normalizeVoiceTools, voiceToolDefinitions, type VoiceToolName } from './tools/contracts';
import { compileSpeechVocabularyPrompt } from './speech-vocabulary';
import { resolveSpeechDelivery, type SpeechDeliveryProfile } from './speech-delivery';

export function buildProviderInstructions(context: string, profile: VoiceProfile = 'provider-default', enabledTools: VoiceToolName[] = []): string {
  const base = buildVoiceInstructions(context, normalizeVoiceTools(enabledTools));
  return profile === 'maya-despina' ? `${base}\n${mayaDeliveryInstructions()}` : base;
}

/** Shared provider session envelope for live WebRTC and bounded audio proof. */
export function buildVoiceSession(model: string, instructions: string, voice: string, profile: VoiceProfile = 'provider-default', enabledTools: VoiceToolName[] = [], speechVocabulary?: readonly string[], options?: { speechDelivery?: SpeechDeliveryProfile }) {
  const transcriptionPrompt = compileSpeechVocabularyPrompt(speechVocabulary);
  return {
    type: 'realtime', model, instructions: buildProviderInstructions(instructions, profile, enabledTools), output_modalities: ['audio'],
    audio: {
      input: {
        transcription: { model: 'gpt-4o-mini-transcribe', ...(transcriptionPrompt ? { prompt: transcriptionPrompt } : {}) },
        // Committed ASR and exact runtime-guidance acknowledgement own response.create.
        turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: false, interrupt_response: true },
      },
      output: { voice, ...(options?.speechDelivery ? { speed: resolveSpeechDelivery(options.speechDelivery, []).speed } : {}) },
    },
    tools: voiceToolDefinitions(enabledTools).map(tool => ({ type: 'function', ...tool })),
  };
}
