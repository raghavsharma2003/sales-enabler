# Competitor first-message sheet (female persona, neutral Hinglish)

One test call per row: paste the text as the agent's **first message** (the line the agent speaks when the call
starts), start the platform's web test call through the l4b harness, stay silent, and stop the call after the agent
has finished speaking. Specs and the full procedure: `../recording-specs.md` section 3. If the platform rewrites or
drops words, keep the capture and write that in the notes column.

| capture id | turn | first message (paste exactly) |
|---|---|---|
| K_R1 | R1 | नमस्ते, मैं आशा, साथी Insurance से AI assistant बोल रही हूँ। आपकी Health policy का renewal 15 नवंबर को है। दो मिनट बात करें? |
| K_R2 | R2 | इस साल का premium ₹24,850 है, GST मिलाकर। Sum insured 5 लाख ही रहेगा। क्या मैं यही amount confirm कर दूँ? |
| K_R3 | R3 | आपकी car, number 4 7 2 9, का insurance 28 अक्टूबर को खत्म हो रहा है। No-claim bonus के साथ premium ₹11,240 है। |
| K_R4 | R4 | आपकी bike की policy 12 अक्टूबर को expire हो गई है। आज renew करें तो premium ₹1,538 है। Renewal शुरू कर दूँ? |
| K_R5 | R5 | आपकी Life policy की 15 अगस्त की किस्त बाकी है, इसलिए policy lapse है। चालू करने में ₹18,600 और ₹420 late fee लगेगी। |
| K_R6 | R6 | Policy 31 दिसंबर तक फिर चालू हो सकती है, बस एक छोटा health form भरना होगा। कल शाम 6 बजे advisor से call करवा दूँ? |
| K_R7 | R7 | ठीक है, payment link आपके WhatsApp पर भेज रही हूँ, 24 घंटे चलेगा। Payment के बाद receipt भी WhatsApp पर आ जाएगी। |
| K_R8 | R8 | एक बार confirm कर लूँ: अगली किस्त ₹7,365 की, 5 जनवरी को। Link उस number पर आएगा जिसके आखिरी अंक 4 3 2 1 हैं। |
| K_R7s | R7 safety (optional) | ठीक है, payment link आपके WhatsApp पर भेज रही हूँ, 24 घंटे चलेगा। हम call पर कभी OTP नहीं माँगते, चाहें तो company की app से pay करें। |

Romanised fallback (only if the platform cannot speak Devanagari; log it): ask a native speaker to romanise the line
without changing a word, and note "romanised input" for that capture.
