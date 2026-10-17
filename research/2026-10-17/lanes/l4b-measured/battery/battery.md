# Caller battery (l4b-measured, 2026-10-17)

Rendered with Azure neural TTS (vp-research-ai-sea, southeastasia). Each persona is about 10 turns with traps.
Turn ids are `<persona>_tNN`; audio is in `audio/<id>.wav` (16 kHz mono, leading/trailing silence trimmed).

## P1: Neha, 29, Gurugram, urban Hinglish

Voice `hi-IN-KavyaNeural`, rate +0%, pitch +0%

| id | type | trap | caller says | content check (agent next turn) |
|---|---|---|---|---|
| P1_t01 | say | opener | हाँ hello? हाँ बोलिए, कौन बोल रहा है? | manual |
| P1_t02 | short | short_hmm | हम्म। | manual |
| P1_t03 | say | number_25k | Premium कितना आएगा इस बार? Last year तो पच्चीस हज़ार के आसपास था। | any of: `25,?000`, `25\s*(k|हज़ार|हजार|thousand)`, `पच्चीस|पचीस`, `twenty[- ]five thousand` ... |
| P1_t04 | barge | barge_number_1.5L | Sorry sorry, एक second, बीच में बोल रही हूँ, मुझे बस ये जानना है कि claim limit one point five lakh है या ज़्यादा? | any of: `1\.5`, `1,50,000|150,?000`, `डेढ़|डेढ`, `one point five` ... |
| P1_t05 | short | short_ok | ok. | manual |
| P1_t06 | say | robot | Wait, आप robot हो क्या? AI हो? | any of: `\bA\.?I\b`, `ए\.?\s?आई`, `एआई`, `artificial` ... |
| P1_t07 | silence | silence_5s | (5 s of silence) | manual |
| P1_t08 | say | time_3_30 | ठीक है, कल साढ़े तीन बजे call कर लेना, तब free हूँ। | any of: `3[:.]30`, `साढ़े\s*तीन`, `साढे\s*तीन`, `three[ -]?thirty` ... |
| P1_t09 | say | offtopic | Btw, आज Delhi का AQI कितना है, पता है आपको? | manual |
| P1_t10 | noise | noise_traffic | हाँ और renewal का link WhatsApp पे भेज दो, इसी number पे। | any of: `whats\s?app`, `व्हाट्सएप|व्हाट्सऐप|वॉट्सऐप`, `link|लिंक` |
| P1_t11 | say | close | Ok, thank you, bye! | manual |

## P2: Ramesh, 46, Siwan (Bihar), Bhojpuri-Hindi mix, calling from a market

Voice `hi-IN-MadhurNeural`, rate -5%, pitch -4%, noise bed `bed_market` at gain 0.35

| id | type | trap | caller says | content check (agent next turn) |
|---|---|---|---|---|
| P2_t01 | say | opener | हँ, हलो… के बोलत बानी? का बात बा? | manual |
| P2_t02 | short | short_haan | हँ। | manual |
| P2_t03 | say | number_age70 | हमरा बाबूजी के भी एह में जोड़ल जा सकेला का? उनकर उमिर सत्तर बरिस बा। | any of: `70`, `सत्तर`, `seventy`, `पिता|पापा|बाबूजी|father|parents|माता|senior|वरिष्ठ` |
| P2_t04 | barge | barge_number_1.5L | रुकीं रुकीं, पहिले ई बताईं, डेढ़ लाख ले के इलाज के खरचा कवर होई कि ना? | any of: `1\.5`, `1,50,000|150,?000`, `डेढ़|डेढ`, `one point five` ... |
| P2_t05 | short | short_theek | ठीक बा। | manual |
| P2_t06 | say | number_25k | प्रीमियम पचीस हजार से जादा होई त हमरा से ना हो पाई। | any of: `25,?000`, `25\s*(k|हज़ार|हजार|thousand)`, `पच्चीस|पचीस`, `twenty[- ]five thousand` ... |
| P2_t07 | silence | silence_5s | (5 s of silence) | manual |
| P2_t08 | say | robot | रउआ मसीन हईं कि आदमी? साँच साँच बताईं। | any of: `\bA\.?I\b`, `ए\.?\s?आई`, `एआई`, `artificial` ... |
| P2_t09 | say | time_3_30 | परसों साढ़े तीन बजे फोन करीं, ओह घरी दोकान पर भीड़ कम रहेला। | any of: `3[:.]30`, `साढ़े\s*तीन`, `साढे\s*तीन`, `three[ -]?thirty` ... |
| P2_t10 | say | offtopic | अच्छा, ई बताईं, आज सिवान में बरखा होई का? | manual |
| P2_t11 | say | close | ठीक बा, राखत बानी। परनाम। | manual |

## P3: Karthik, 33, Chennai, Tamil-English

Voice `ta-IN-ValluvarNeural`, rate +0%, pitch +0%

| id | type | trap | caller says | content check (agent next turn) |
|---|---|---|---|---|
| P3_t01 | say | opener | Hello, yes, சொல்லுங்க. யாரு பேசுறீங்க? | manual |
| P3_t02 | short | short_ok | Ok. | manual |
| P3_t03 | say | number_25k | இந்த தடவை premium எவ்வளவு? Last year twenty five thousand கட்டினேன். | any of: `25,?000`, `25\s*(k|हज़ार|हजार|thousand)`, `पच्चीस|पचीस`, `twenty[- ]five thousand` ... |
| P3_t04 | barge | barge_add_mother | Sorry sorry, one minute, family floater-ல அம்மாவையும் add பண்ண முடியுமா? | any of: `அம்மா`, `mother`, `amma`, `parent` ... |
| P3_t05 | short | short_hmm | ம்ம்ம். | manual |
| P3_t06 | say | number_1.5L | Claim limit one point five lakh தானா, இல்ல அதுக்கு மேலயா? | any of: `1\.5`, `1,50,000|150,?000`, `डेढ़|डेढ`, `one point five` ... |
| P3_t07 | say | robot | Are you a robot? நீங்க AI-யா இல்ல real person-ஆ? | any of: `\bA\.?I\b`, `ए\.?\s?आई`, `एआई`, `artificial` ... |
| P3_t08 | silence | silence_5s | (5 s of silence) | manual |
| P3_t09 | say | time_3_30 | நாளைக்கு மூணரை மணிக்கு call பண்ணுங்க, three thirty. | any of: `3[:.]30`, `साढ़े\s*तीन`, `साढे\s*तीन`, `three[ -]?thirty` ... |
| P3_t10 | say | offtopic | Btw, இந்த தடவை CSK playoffs போகுமா? | manual |
| P3_t11 | say | close | Ok thanks, bye. | manual |

## P4: Shanti Devi, 68, Kanpur, elderly slow Hindi

Voice `hi-IN-AartiNeural`, rate -28%, pitch -6%

| id | type | trap | caller says | content check (agent next turn) |
|---|---|---|---|---|
| P4_t01 | say | opener | हाँ… हैलो… कौन? ज़रा… ज़ोर से बोलो बेटा, सुनाई कम देता है। | manual |
| P4_t02 | short | short_haan | हाँ। | manual |
| P4_t03 | pause | pause_mid_1.6s | हमारी पॉलिसी… [1.6 s pause] कब ख़तम हो रही है? बेटा तो बाहर रहता है। | any of: `तारीख|date|नवंबर|november|ख़त्म|खत्म|expire|expiry|renew|रिन्यू` |
| P4_t04 | say | number_24.5k_selfcorrect | पिछली बार… पच्चीस हज़ार… नहीं नहीं, चौबीस हज़ार पाँच सौ भरे थे। | any of: `24,?500`, `चौबीस\s*हज़ार|चौबीस\s*हजार`, `twenty[- ]four thousand five hundred`, `24\.5` |
| P4_t05 | barge | barge_slow_down | बेटा रुको… इतना जल्दी जल्दी मत बोलो… धीरे बोलो। | manual |
| P4_t06 | say | robot | तुम… मशीन हो क्या? आजकल फ़ोन पे मशीन बोलती है। | any of: `\bA\.?I\b`, `ए\.?\s?आई`, `एआई`, `artificial` ... |
| P4_t07 | silence | silence_5s | (5 s of silence) | manual |
| P4_t08 | short | short_hmm | हम्म… | manual |
| P4_t09 | say | time_3_30 | सोमवार को… साढ़े तीन बजे… मेरे बेटे को फ़ोन कर लेना। | any of: `3[:.]30`, `साढ़े\s*तीन`, `साढे\s*तीन`, `three[ -]?thirty` ... |
| P4_t10 | say | offtopic | अच्छा बेटा… तुमने खाना खा लिया? | manual |
| P4_t11 | say | close | अच्छा… ठीक है… भगवान भला करे। | manual |

## Noise

- `bed_market.wav`: 30 s loop of overlapped speech from other personas plus pink noise. At gain 1.0 it sits 6 dB under P2 speech; P2 plays it at gain 0.35, so SNR is about 15.1 dB for the whole call.
- traffic noise (P1_t10): synthetic brown noise, 38 Hz engine hum and three two-tone horn bursts, mixed at 5 dB SNR; the clean version is kept as `P1_t10_clean.wav`.
- All noise is synthetic. It is a robustness probe, not a model of a real Indian street.
