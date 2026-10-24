# Vendor language lists for VP voice-stack parts

Checked on 2026-10-24 from public vendor documentation pages only (no keys, no API calls, no sign-in). Each source page is saved as a .md file in this folder with its URL, fetch date, title and the relevant excerpt; the machine-readable result is lists.json.

Caveats: pages were read through the WebFetch tool, which returns model-processed text (excerpts are as returned, some table rows condensed); several large Microsoft and Google pages were truncated and read in chunks. Language codes: Sarvam's `od-IN` is recorded as `or-IN`; Google's Gemini/Live lists use bare codes (hi, en, ...), recorded as the matching -IN code; Bengali listed only as bn-BD is recorded as bn-IN with a note. `listPublished` false means the vendor publishes no per-language list for that model.

| part id | supported VP codes | list published | source files |
|---|---|---|---|
| ears azure | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | azure-speech-language-support-stt.md |
| ears sarvam | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | sarvam-models.md, sarvam-saaras.md |
| brain gemini-3.5-flash-lite | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | google-vertex-models-gemini-languages.md, google-vertex-gemini-3-5-flash-lite.md, google-gemini-api-models.md |
| brain gemini-3.6-flash | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | google-vertex-models-gemini-languages.md, google-vertex-gemini-3-5-flash-lite.md, google-gemini-api-models.md |
| brain gemini-3.8-flash | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | google-vertex-models-gemini-languages.md, google-vertex-gemini-3-5-flash-lite.md, google-gemini-api-models.md |
| brain gpt-5.4-mini | (none) | no | openai-model-pages.md, openai-mmmlu.md |
| brain gpt-4.1-mini-in | (none) | no | openai-model-pages.md, openai-mmmlu.md |
| brain gpt-4.1 | hi-IN, bn-IN | no | openai-model-pages.md, openai-mmmlu.md |
| brain gpt-6-luna@or | (none) | no | openai-model-pages.md, openai-mmmlu.md |
| brain gpt-6-sol@or | (none) | no | openai-model-pages.md, openai-mmmlu.md |
| brain gpt-oss-120b | (none) | no | openai-model-pages.md, openai-mmmlu.md |
| brain llama-4-maverick | hi-IN, en-IN | yes | meta-llama-4-maverick-card.md |
| brain kimi-k2.6 | (none) | no | moonshot-kimi-k2-6.md |
| brain sarvam-105b | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | sarvam-105b.md, sarvam-models.md |
| voice gemini-lite | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | google-cloud-gemini-tts.md, google-gemini-api-speech-generation.md |
| voice gemini | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | google-cloud-gemini-tts.md, google-gemini-api-speech-generation.md |
| voice azure | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | azure-speech-language-support-tts.md |
| voice azure-hd | en-IN, hi-IN | yes | azure-speech-language-support-tts.md |
| voice azure-mai | hi-IN, en-IN | yes | azure-mai-voices.md, azure-speech-language-support-tts.md |
| voice sarvam | hi-IN, en-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN | yes | sarvam-bulbul.md, sarvam-models.md |
| s2s gemini-3.8-live | hi-IN, en-IN, ta-IN, te-IN, mr-IN, bn-IN | yes | google-vertex-live-configure-language-voice.md, google-vertex-live-overview.md, google-gemini-api-live-capabilities.md, google-gemini-api-live-overview.md, google-cloud-blog-gemini-3-8-live.md |

Main conflicts and gaps are in the notes field of lists.json: Gemini 3.8 Live (Vertex 24 languages vs 97/99/70 elsewhere), azure-hd (DragonHDOmniIndic voices in components.ts not on the public page), Sarvam Bulbul v3 vs v4 Flash, azure-mai (2.1 page lists only hi-IN and en-IN), and OpenAI/Kimi (no per-language list).
