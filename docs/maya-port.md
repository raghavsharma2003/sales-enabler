# Maya voice source port

The source project's displayed character is **Maya**, with stable internal slug `meera`. Its current shipped voice selection is Google Gemini's prebuilt **Despina** preset. This port records that acoustic identity and extracts the source text-to-speech frontend. Azure Realtime `marin` has a different provider voice and cannot reproduce Despina by renaming it or changing its prompt.

## Pinned source

Repository: `research-sources/html-portfolio`, `origin/main` at `3a9217981b27636745fc70ac490aacf9ef3f392d`. The same `spokenText.ts` blob is present on companion `f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21` and Gurukul `771feef9c124184a56abaea662bc16a079069ee1`. The source tree has no root `LICENSE`, `COPYING`, or `NOTICE` file. The root project owns the source repository; this document identifies copied and adapted code for review.

| Source file (blob SHA) | Concrete source behavior | Port |
| --- | --- | --- |
| `src/voice/liveCall.ts` (`7c3758434864bce9a4dee5c1c1aed049dc2dd0b8`) | Native speech-to-speech `speechConfig.voiceName = "Despina"`, `languageCode = "hi-IN"`; backchannel `ACK_VOICE = "Despina"`. | `MAYA_VOICE_PROFILE`; voice-specific cache namespace. |
| `api/live-token.js` (`9b6d531a070e9307c576b90f006b645c8a941301`) | Live model `models/gemini-3.1-flash-live-preview`. | `MAYA_VOICE_PROFILE.liveModel`. |
| `src/voice/speech.ts` (`a46e6b6ac3aa1296697faf103698599d6effe8d2`) | `MEERA_VOICE = "Despina"`; `gm-Despina` cache tag; one synthesis engine for an utterance. | `MAYA_VOICE_PROFILE`; `prepareMayaSpeech().cacheNamespace`. |
| `api/speech.js` (`7695b82945f43d4e774a32c16b0ad7f651e5534f`) | `DEFAULT_VOICE = "Despina"`; Gemini TTS model `gemini-3.1-flash-tts-preview`; per-utterance style scrub; text-to-speech prompt; written-text-to-audio seam. | `MAYA_VOICE_PROFILE.cascadeTtsModel`; `prepareMayaSpeech()`. |
| `src/voice/spokenText.ts` (`2b9e0ff75304b32d1c4417ed6d696c1c41aad9eb`) | `st1` spoken-text core for Unicode, markup, tags, dashes, URLs, pauses and silence when nothing speakable remains. | Core copied into `lib/voice/maya/spoken-text.ts`; comments surrounding the core replaced with integration guidance. |
| `src/engine/agents/characters/maya.ts` (`af23a0abbeeee47b0876bdf0789e9ef3eb2b5b3c`); `src/engine/persona.ts` (`ec7116ba7f14a9b827e8ba56d20e1e1df749d436`) | Speech rhythm, short turns, full spoken Hindi spellings, punctuation as timing, responsive repair and a separate character sheet. | `mayaDeliveryInstructions()` adapts the delivery mechanics to a disclosed business AI. |

Some source comments still discuss earlier Aoede, Leda, Autonoe and Kore revisions. The executable voice constants at the pinned tip agree on **Despina**. The preset name aligns identity across the live and TTS lanes; the two model families can still render it differently. Neither source comments nor this port prove identical waveforms or production quality in this app.

## Integration contract and boundaries

Import from `lib/voice/maya`. `mayaPresetFor("gemini")` returns `Despina`; for Azure and OpenAI it returns `null`, so the UI and logs should never present those providers as Maya's exact sound. `mayaDeliveryInstructions()` is safe to append below the app's identity, company, authorization and disclosure rules. It preserves the source's timing and conversational mechanics while omitting the personal companion's age, life, relationship claims and instructions to present as a human.

For text-to-speech, parse and act on any action or protocol tags first. Then call `prepareMayaSpeech({ displayedText, protocolHandled: true, style })`. Keep `displayedText` for the transcript and pass only `spokenText` to synthesis; if `geminiTtsPrompt` is `null`, emit no audio. The source sanitizer removes residual tags, so applying it before an action is handled could silently lose that action. Native Gemini Live audio has no text-to-speech seam; its prosody comes from the prompt and model.

This pure source module does not issue provider requests. The app's Gemini adapter now recognizes Despina and selects the source model when an agent uses `maya-despina`. The user's existing free Gemini pool is configured privately, with only a label verified for Live access enabled. The default Azure route remains the only authorized paid inference path; there is no automatic paid fallback. A real browser Listen & type test connected, received Maya's greeting, answered in Hinglish, and saved its transcript. Separate Live and TTS audio smoke artifacts verify the source voice preset. Microphone input and comparative voice quality remain unverified.
