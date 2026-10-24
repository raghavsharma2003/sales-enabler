# azure-mai-voices

- URL: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-voices
- Fetch date: 2026-10-24
- Page title: MAI-Voice-2.1 and MAI-Voice-2.1-Flash - Speech Service - Foundry Tools | Microsoft Learn
- Fetched 2026-10-24 with the WebFetch tool (public page, no sign-in). The fetch tool returns page text processed by a small model, so excerpts are as returned by the tool; where a page was truncated this is stated.

Page metadata: ms.date 2026-09-30, updated_at 2026-10-01. Public preview.

Headline: "MAI-Voice-2.1 produces natural, expressive speech from text or a short reference clip ... in 23 different languages."
Also: "Multilingual support | Supports synthesis across 23 languages." The page does not print a standalone list of the 23 languages; locale coverage is only visible in the "Managed voices and styles" table.

India rows of the managed voices table (all support `MAI-Voice-2.1` and `MAI-Voice-2.1-Flash`):
```
| `en-IN-Dhruv` | `en-IN` | English (India) | Male | neutral |
| `en-IN-Priya` | `en-IN` | English (India) | Female | neutral |
| `hi-IN-Arjun` | `hi-IN` | Hindi (India) | Male | angry, confused, disgusted, embarrassed, excited, fearful, happy, hopeful, jealous, joyful, neutral, regretful, sad, surprised |
| `hi-IN-Dhruv` | `hi-IN` | Hindi (India) | Male | (19 styles incl. shouting, softvoice, whispering) |
| `hi-IN-Grant` | `hi-IN` | Hindi | Male | audiobook, neutral |
| `hi-IN-Harper` | `hi-IN` | Hindi | Female | agent, customer_call_center, educational, narrator, neutral |
| `hi-IN-Kavya` | `hi-IN` | Hindi (India) | Female | (19 styles) |
| `hi-IN-Priya` | `hi-IN` | Hindi (India) | Female | (19 styles) |
```
No ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN or or-IN rows exist in the table.
"Note: Microsoft adds more locales and managed voices as they become available."
Regions list includes Central India (`centralindia`).

Secondary context (search-result snippets only, not fetched pages): the original MAI-Voice-2 was described inconsistently: Azure update AZ563217 "more than 10 languages", Foundry catalog "10+ languages", third-party sites "15 languages". The MAI-Voice-2 model card PDF (https://microsoft.ai/pdf/MAI-Voice-2-Model-Card.PDF) was fetched but its text could not be decoded, so its locale list was not read.
