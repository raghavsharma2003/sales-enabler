# azure-speech-language-support-tts

- URL: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
- Fetch date: 2026-10-24
- Page title: Language and voice support for the Speech service - Foundry Tools (text to speech tab)
- Fetched 2026-10-24 with the WebFetch tool (public page, no sign-in). The fetch tool returns page text processed by a small model, so excerpts are as returned by the tool; where a page was truncated this is stated.

## Standard neural voices, India locales (all 11 present)

```
| `hi-IN` | Hindi (India) | Standard | `hi-IN-AaravNeural`, `hi-IN-AnanyaNeural`, `hi-IN-AartiNeural`, `hi-IN-ArjunNeural`, `hi-IN-KavyaNeural`, `hi-IN-KunalNeural`, `hi-IN-RehaanNeural`, `hi-IN-SwaraNeural` (styles cheerful, empathetic, newscast), `hi-IN-MadhurNeural` |
| `en-IN` | English (India) | Standard | `en-IN-AartiIndicNeural`, `en-IN-ArjunIndicNeural`, `en-IN-NeerjaIndicNeural`, `en-IN-PrabhatIndicNeural`, `en-IN-AaravNeural`, `en-IN-AashiNeural`, `en-IN-AartiNeural`, `en-IN-ArjunNeural`, `en-IN-AnanyaNeural`, `en-IN-KavyaNeural`, `en-IN-KunalNeural`, `en-IN-NeerjaNeural`, `en-IN-PrabhatNeural`, `en-IN-RehaanNeural` |
| `ta-IN` | Tamil (India) | Standard | `ta-IN-PallaviNeural` (Female) ; `ta-IN-ValluvarNeural` (Male) |
| `te-IN` | Telugu (India) | Standard | `te-IN-ShrutiNeural` (Female) ; `te-IN-MohanNeural` (Male) |
| `kn-IN` | Kannada (India) | Standard | `kn-IN-SapnaNeural`^3^ (Female) ; `kn-IN-GaganNeural`^3^ (Male) |
| `ml-IN` | Malayalam (India) | Standard | `ml-IN-SobhanaNeural`^3^ (Female) ; `ml-IN-MidhunNeural`^3^ (Male) |
| `mr-IN` | Marathi (India) | Standard | `mr-IN-AarohiNeural` (Female) ; `mr-IN-ManoharNeural` (Male) |
| `gu-IN` | Gujarati (India) | Standard | `gu-IN-DhwaniNeural` (Female) ; `gu-IN-NiranjanNeural` (Male) |
| `bn-IN` | Bengali (India) | Standard | `bn-IN-TanishaaNeural`^3^ (Female) ; `bn-IN-BashkarNeural`^3^ (Male) |
| `pa-IN` | Punjabi (India) | Standard | `pa-IN-VaaniNeural`^3^ (Female) ; `pa-IN-OjasNeural`^3^ (Male) |
| `or-IN` | Odia (India) | Standard | `or-IN-SubhasiniNeural`^3^ (Female) ; `or-IN-SukantNeural`^3^ (Male) |
```
(Rows condensed to one line per locale by me; voice names and tiers are as in the table. bn-BD also appears: `bn-BD-NabanitaNeural`, `bn-BD-PradeepNeural`.)

## HD / DragonHD / MAI rows, India locales

```
| `en-IN` | English (India) | Neural HD | `en-IN-Diya:DragonHDLatestNeural`^1,2^ (Female) |
| `en-IN` | English (India) | Neural HD | `en-IN-Meera:DragonHDLatestNeural`^2,4^ (Female) |
| `en-IN` | English (India) | Neural HD | `en-IN-Aarti:DragonHDLatestNeural`^2,4^ (Female) |
| `en-IN` | English (India) | Neural HD | `en-IN-Arjun:DragonHDLatestNeural`^2,4^ (Male) |
| `en-IN` | English (India) | Neural HD | `en-IN-Neerja:DragonHDLatestNeural`^2,4^ (Female) |
| `en-IN` | English (India) | Neural HD | `en-IN-Lavanya:DragonHDLatestNeural`^1,2^ (Female) |
| `hi-IN` | Hindi (India) | Neural HD | `hi-IN-Arjun:MAI-Voice-2`^1^ (Male) | Styles angry, confused, disgusted, embarrassed, excited, fearful, happy, hopeful, jealous, joyful, regretful, sad, surprised |
| `hi-IN` | Hindi (India) | Neural HD Flash | `hi-IN-Arjun:MAI-Voice-2-Flash`^1^ (Male) |
| `hi-IN` | Hindi (India) | Neural HD | `hi-IN-Dhruv:MAI-Voice-2`^1^ (Male) |
| `hi-IN` | Hindi (India) | Neural HD Flash | `hi-IN-Dhruv:MAI-Voice-2-Flash`^1^ (Male) |
| `hi-IN` | Hindi (India) | Neural HD | `hi-IN-Kavya:MAI-Voice-2`^1^ (Female) |
| `hi-IN` | Hindi (India) | Neural HD Flash | `hi-IN-Kavya:MAI-Voice-2-Flash`^1^ (Female) |
| `hi-IN` | Hindi (India) | Neural HD | `hi-IN-Priya:MAI-Voice-2`^1^ (Female) |
| `hi-IN` | Hindi (India) | Neural HD Flash | `hi-IN-Priya:MAI-Voice-2-Flash`^1^ (Female) |
```
Footnote 1: "The neural voice is available in public preview." Footnote 4: "For the current list of regions where Neural HD voices are generally available, see the table for Azure Speech regions."

No Neural HD, DragonHD or MAI rows were seen for ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN or or-IN (those are Standard only). No row containing "OmniIndic" (for example `hi-in-diya:DragonHDOmniIndicNeural`, used in product/shared/components.ts for azure-hd) was found in the page text searched (all of the page text after character 60,000 grep-checked from a saved copy; characters 0-100,000 read by the fetch tool). The last 5,178 characters of the page were not read.

## MAI-Voice statement on this page
No prose on this page lists which languages MAI-Voice supports; MAI-Voice-2 appears only as voice names. The page's only language-level MAI table is "MAI-Transcribe supported languages", which is speech recognition (listing hi, ta, te, kn, ml, mr, gu, bn, pa, or, en) and does not apply to TTS.
