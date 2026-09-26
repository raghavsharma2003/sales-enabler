import { MAYA_VOICE_PROFILE } from "./profile";
import { spokenText } from "./spoken-text";

export type MayaPreparedSpeech = {
  displayedText: string;
  spokenText: string;
  geminiTtsPrompt: string | null;
  voice: typeof MAYA_VOICE_PROFILE.preset;
  cacheNamespace: string;
};

/**
 * Called at the text-to-audio seam, after action/protocol tags have been
 * parsed and acted on. That ordering is a source invariant: dropping a tag
 * before acting on it could silently discard a requested action.
 */
export function prepareMayaSpeech(input: {
  displayedText: string;
  protocolHandled: true;
  style?: string;
}): MayaPreparedSpeech {
  if (input.protocolHandled !== true) throw new Error("Protocol and action tags must be handled before preparing speech.");
  const spoken = spokenText(input.displayedText);
  // Mirrors api/speech.js's per-utterance style boundary. Style is delivery
  // guidance, never a second spoken sentence or uncontrolled prompt fragment.
  const mood = typeof input.style === "string" && input.style.trim()
    ? input.style.replace(/[\[\]{}<>\n\r"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    : "relaxed, natural, casual";
  return {
    displayedText: input.displayedText,
    spokenText: spoken,
    geminiTtsPrompt: spoken
      ? `Say in a warm, natural Indian-accented Hinglish, ${mood}: ${spoken.slice(0, 1100)}`
      : null,
    voice: MAYA_VOICE_PROFILE.preset,
    cacheNamespace: `gm-${MAYA_VOICE_PROFILE.preset}`,
  };
}
