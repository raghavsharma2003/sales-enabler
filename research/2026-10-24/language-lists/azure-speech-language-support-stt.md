# azure-speech-language-support-stt

- URL: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt
- Fetch date: 2026-10-24
- Page title: Language and voice support for the Speech service - Foundry Tools (speech to text tab)
- Fetched 2026-10-24 with the WebFetch tool (public page, no sign-in). The fetch tool returns page text processed by a small model, so excerpts are as returned by the tool; where a page was truncated this is stated.

## Speech-to-text locales table, India rows (columns: Locale | Language | Fast transcription | Monolingual post-stream refinement | Multilingual post-stream refinement (preview))

```
| `hi-IN` | Hindi (India) | yes | yes | yes |
| `en-IN` | English (India) | yes | yes | yes |
| `ta-IN` | Tamil (India) | yes |  |  |
| `te-IN` | Telugu (India) | yes | yes |  |
| `kn-IN` | Kannada (India) | yes |  |  |
| `ml-IN` | Malayalam (India) | yes |  |  |
| `mr-IN` | Marathi (India) | yes | yes |  |
| `gu-IN` | Gujarati (India) | yes |  |  |
| `bn-IN` | Bengali (India) | yes | yes |  |
| `pa-IN` | Punjabi (India) | yes | yes |  |
| `or-IN` | Odia (India) | yes |  |  |
```

Notes: bn-BD does not appear in the STT table (it appears only in the TTS table). The page text is 165,178 characters; the first 100,000 were read for STT. The table as returned shows fast-transcription and refinement columns; a separate real-time-only or batch-only column was not distinguished in the fetch output, so per-feature support (real-time vs fast vs batch) per locale is not verified here.
