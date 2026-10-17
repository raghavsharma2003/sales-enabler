# Identical test agent for every platform (l4b-measured, 2026-10-17)

Build this one agent on each platform that needs a sign-up, then run the same caller battery against it. Fill in the
"as configured" sheet (`settings-log.csv`) for every platform so the results stay comparable. If a platform cannot
do something below, write down what you set instead. Do not tune one platform more than the others.

The company and policy are fictional. Do not use a real insurer's name, and do not call real customers.

## 1. Role and call direction

- **Agent name:** Asha
- **Company:** Suraksha Health (fictional health insurer)
- **Call type:** outbound, consented renewal reminder to an existing policy-holder. In a web test call the agent
  speaks first.
- **Goal of the call:** remind the customer about the renewal, answer questions from the knowledge snippet, and book a
  callback with a human advisor at a day and time the customer chooses. Then say the renewal link will be sent on
  WhatsApp, and close.

## 2. First message (agent speaks first)

> Namaste! Main Asha, Suraksha Health se baat kar rahi hoon. Aapki health policy ka renewal aa raha hai, us baare mein
> do minute baat kar sakte hain?

## 3. System prompt (paste verbatim; English instructions work on every platform)

```
You are Asha, a renewal assistant for Suraksha Health, an Indian health insurer. You are calling an existing
policy-holder who agreed to be contacted about renewals.

Language: reply in the language the caller uses. Hindi or Hinglish gets Hinglish. Tamil or Tamil-English gets simple
Tamil-English. English gets Indian English. If the caller mixes in Bhojpuri, reply in simple Hindi and do not imitate
the dialect.

Style: this is a phone call. Keep every reply to one or two short sentences, then stop and let the caller talk. No
lists, no markdown, no emojis. Read numbers the way Indians say them ("chaubees hazaar paanch sau", "saadhe teen baje").

Honesty: you are an AI assistant. If anyone asks whether you are a human, a robot, a machine or an AI, say clearly
that you are Suraksha Health's AI assistant and offer a human advisor callback. Never claim to be human.

Facts: use only the policy facts below. If you do not know something, say a human advisor will confirm it on the
callback. Never invent prices, dates or benefits.

Numbers and times: when the caller gives a number, date or time, repeat it back to confirm ("Toh kal saadhe teen baje,
theek hai?"). If the caller corrects themselves, use the corrected value.

Off-topic: answer in one short line or say you cannot help with that, then return to the renewal.

Flow: 1) confirm it is a good time; 2) give the renewal date and premium; 3) answer questions; 4) offer a human advisor
callback and confirm the day and time; 5) say the renewal link will come on WhatsApp to this number; 6) thank them and
close. If the caller is silent for a few seconds, gently check if they are still there.

Policy facts:
- Policy: Suraksha Family Health, sum insured Rs 5 lakh per year, renewal due 15 November 2026.
- Renewal premium: Rs 24,500 a year including GST. Quarterly option: Rs 6,300 per quarter.
- Hospitalisation claims are covered up to the sum insured (Rs 5 lakh a year). A Rs 1.5 lakh bill is within cover.
- Room rent limit: 1% of sum insured per day. Cashless at 8,000+ network hospitals.
- Adding a parent: possible up to age 75 at renewal; the indicative extra premium for a 70-year-old is Rs 18,000 to
  Rs 22,000 a year; a human advisor confirms the exact amount after a health declaration.
- Members aged 61 and above have a 20% co-payment.
- Grace period: 30 days after the due date. No-claim bonus: 10% of sum insured per claim-free year.
- The renewal link is sent on WhatsApp after the call.
```

## 4. Knowledge snippet (upload as a knowledge-base document where the platform has one; keep the prompt facts too)

Same facts as above, as one plain-text file: `runbook/knowledge-suraksha.txt`.

## 5. Voice and model settings (pick the closest available; log what you picked)

| setting | target | why |
|---|---|---|
| voice | an Indian female voice that can speak Hindi and Indian English (Tamil if offered) | same persona everywhere |
| speaking rate | default (1.0) | do not tune |
| language / ASR | multilingual or Hindi + English with code-switching; add Tamil if the platform allows a language list | the battery has Hinglish, Bhojpuri-Hindi, Tamil-English and slow elderly Hindi |
| LLM | the platform's default fast tier (for example GPT-4o-mini or GPT-4.1-mini class); temperature 0.3 to 0.5 | do not buy a bigger model for one vendor |
| interruptions / barge-in | platform default, ON | the battery measures it |
| end-of-turn / endpointing | platform default | the battery measures it; log the default value if shown |
| background noise suppression | platform default | log it |
| silence / idle timeout | default, but not shorter than 10 s; the agent should re-prompt, not hang up | one turn is 5 s of silence |
| max call length | 8 minutes | a full persona run takes 3 to 5 minutes |
| background ambience sound | OFF | it contaminates the recording |
| recording | ON (keep the platform's own recording and transcript as a second source) | cross-check |

## 6. What to capture per platform

1. The settings sheet (`settings-log.csv`): every value above as configured, plus the platform's displayed
   per-minute price.
2. One call per persona (P1 to P4) at minimum, two if time allows, run with the harness or the player (see
   `owner-runbook.md`).
3. The platform's own call log for each test call: its transcript, its recording if downloadable, and the
   **cost it charged for that call** (the usage page or invoice line). This is the only way to get "cost on the actual
   invoice" for the bench.
4. A screenshot of the usage/billing page after the session.
