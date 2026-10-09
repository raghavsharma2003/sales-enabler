/** Private, application-authorized recognition. No Azure credentials cross this boundary. */
export const CONTINUOUS_SPEECH_PCM = { sampleRate: 16_000, channels: 1, bitsPerSample: 16, frameMs: 20, frameBytes: 640 } as const;
export const CONTINUOUS_SPEECH_MAX_SECONDS = 600;

export interface ContinuousSpeechGrant {
  transport: 'websocket';
  url: string;
  ticket: string;
  expiresAt: string;
  maxDurationSeconds: number;
  language: string;
  recognitionLanguages?: string[];
  pcm: typeof CONTINUOUS_SPEECH_PCM;
}

/** Offsets belong solely to this recognizer's submitted PCM timeline. */
export interface ContinuousSpeechHypothesis {
  type: 'hypothesis';
  sessionEpoch: string;
  segmentId: number;
  revision: number;
  audioStartSample: number;
  audioEndSample: number;
  text: string;
  state: 'interim' | 'sidecar_final';
}

export type ContinuousSpeechStatus = 'connecting' | 'ready' | 'unavailable' | 'ended';
export type ContinuousSpeechReason = 'configuration' | 'authentication' | 'capacity' | 'backpressure' | 'provider' | 'expired' | 'protocol' | 'input_limit' | 'microphone';
export type ContinuousSpeechServerEvent = ContinuousSpeechHypothesis | {
  type: 'status'; state: Exclude<ContinuousSpeechStatus, 'connecting'>;
  sessionEpoch?: string; reason?: ContinuousSpeechReason;
};
