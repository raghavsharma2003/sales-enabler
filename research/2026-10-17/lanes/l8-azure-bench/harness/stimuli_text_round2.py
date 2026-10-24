# Round-2 listener-panel stimulus texts (r2-listener-panel, 2026-10-17). Renewal-centred (critic item A13).
#
# The neutral-Hinglish texts (the primary arm, the product's default register) and the English gloss are written here
# by hand so that number formats and product rules are controlled: AI disclosure in the opening only, no promotion or
# cross-sell, short telephone register, identifiers read digit by digit ("4 7 2 9"), amounts and dates as digits.
# The regional registers (Bhojpuri mix, Tamil-English, Marathi mix, Indian English) are written by gpt-6-sol from these
# texts with identical content, as in round 1, and are checked here for the key tokens. All companies are fictional.
# None of this text has had a native-speaker review (protocol M3).
#
#   python stimuli_text_round2.py            write stimuli-round2/stimuli-text.json from the hand-written texts only
#   python stimuli_text_round2.py --llm      also generate the regional registers (needs FRC_KEY in the environment
#                                            and a gpt-6-sol deployment named in R2P_DEPLOYMENT)
import os, sys, json, time, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'stimuli-round2', 'stimuli-text.json')

# Turn specs. key_tokens drive the automatic ASR round-trip QA: kind 'num' = a number that must be heard exactly
# (digits only, Indian grouping removed), 'date' = day number plus month, 'word' = a word with spelling alternatives.
TURNS = {
 'R1': dict(topic='health renewal: opening, AI disclosure, due date', line='health',
            gloss_en='Hello, this is Asha (male voice: Amit), an AI assistant from Saathi Insurance. Your health policy is due for renewal on 15 November. Can we talk for two minutes?',
            key_tokens=[{'kind': 'word', 'id': 'ai_disclosure', 'alts': ['AI', 'A.I', 'एआई', 'ए आई', 'ஏஐ', 'ஏ ஐ', 'एआय', 'ए आय', 'artificial']},
                        {'kind': 'date', 'id': 'due_date', 'day': 15, 'month': 11}]),
 'R2': dict(topic='health premium and sum insured, confirmation question', line='health',
            gloss_en='This year the premium is Rs 24,850 including GST. The sum insured stays at 5 lakh. Shall I confirm this amount?',
            key_tokens=[{'kind': 'num', 'id': 'premium', 'value': 24850}, {'kind': 'num', 'id': 'sum_insured', 'value': 500000}]),
 'R3': dict(topic='motor 4W renewal: vehicle number, expiry date, premium with NCB', line='motor_4w',
            gloss_en='The insurance of your car, number 4 7 2 9, ends on 28 October. With the no-claim bonus, the renewal premium is Rs 11,240.',
            key_tokens=[{'kind': 'num', 'id': 'vehicle_digits', 'value': 4729}, {'kind': 'date', 'id': 'expiry', 'day': 28, 'month': 10},
                        {'kind': 'num', 'id': 'premium', 'value': 11240}]),
 'R4': dict(topic='motor 2W policy already expired, premium today', line='motor_2w',
            gloss_en='Your bike policy expired on 12 October. If you renew today the premium is Rs 1,538. Shall I start the renewal?',
            key_tokens=[{'kind': 'date', 'id': 'expired_on', 'day': 12, 'month': 10}, {'kind': 'num', 'id': 'premium', 'value': 1538}]),
 'R5': dict(topic='life lapse revival: missed instalment, revival amount and late fee', line='life',
            gloss_en='The 15 August instalment of your life policy is unpaid, so the policy is lapsed now. To restart it you pay Rs 18,600 and a late fee of Rs 420.',
            key_tokens=[{'kind': 'date', 'id': 'missed_instalment', 'day': 15, 'month': 8}, {'kind': 'num', 'id': 'revival_amount', 'value': 18600},
                        {'kind': 'num', 'id': 'late_fee', 'value': 420}]),
 'R6': dict(topic='life revival deadline and advisor callback', line='life',
            gloss_en='The policy can be restarted until 31 December; only a short health form is needed. Shall I arrange a call from an advisor tomorrow at 6 pm?',
            key_tokens=[{'kind': 'date', 'id': 'deadline', 'day': 31, 'month': 12}, {'kind': 'num', 'id': 'callback_hour', 'value': 6}]),
 'R7': dict(topic='payment-link hand-off on WhatsApp', line='health',
            gloss_en='Alright, I am sending the payment link to your WhatsApp; it works for 24 hours. After payment the receipt will also come on WhatsApp.',
            gloss_en_safety='Alright, I am sending the payment link to your WhatsApp; it works for 24 hours. We never ask for an OTP on a call; if you prefer, pay in the company\'s own app.',
            key_tokens=[{'kind': 'word', 'id': 'whatsapp', 'alts': ['WhatsApp', 'Whatsapp', 'whatsapp', 'व्हाट्सएप', 'वॉट्सऐप', 'व्हाट्सऐप', 'वाट्सएप', 'व्हॉट्सॲप', 'व्हाट्सॲप', 'व्हॉट्सअ\u200dॅप', 'व्हॉट्सअॅप', 'வாட்ஸ்அப்', 'வாட்ஸ்ஆப்', 'வாட்ஸப்']},
                        {'kind': 'num', 'id': 'link_hours', 'value': 24}],
            key_tokens_safety_extra=[{'kind': 'word', 'id': 'otp', 'alts': ['OTP', 'ओटीपी', 'ओ टी पी', 'ஓடிபி', 'ஓ.டி.பி']}]),
 'R8': dict(topic='number confirmation read-back: instalment amount, date, phone-number last digits', line='life',
            gloss_en='Let me confirm once: the next instalment is Rs 7,365, on 5 January. The link will come to the number ending 4 3 2 1.',
            key_tokens=[{'kind': 'num', 'id': 'instalment', 'value': 7365}, {'kind': 'date', 'id': 'next_due', 'day': 5, 'month': 1},
                        {'kind': 'num', 'id': 'phone_last4', 'value': 4321}]),
 # Block C: human-or-computer texts (no AI disclosure, so the judgement is about the voice). Owner records the human
 # versions (protocol 3.6). One number each, except C4.
 'C1': dict(topic='Block C: instalment option', line='health', gloss_en='I understand. If you like, you can pay the premium in three instalments; each instalment will be about Rs 8,300.',
            key_tokens=[{'kind': 'num', 'id': 'instalment', 'value': 8300}]),
 'C2': dict(topic='Block C: callback promise', line='health', gloss_en='No problem, take your time with the documents. I will call again the day after tomorrow at 10 in the morning, all right?',
            key_tokens=[{'kind': 'num', 'id': 'hour', 'value': 10}]),
 'C3': dict(topic='Block C: adding a parent', line='health', gloss_en='Yes, your father can also be added to this policy. He is 70, so the premium will go up a little.',
            key_tokens=[{'kind': 'num', 'id': 'age', 'value': 70}]),
 'C4': dict(topic='Block C: already renewed, close', line='motor_4w', gloss_en='Oh, you have already renewed? Very good. Then I will remove your name from the list. Thank you.',
            key_tokens=[]),
}

# Hand-written neutral Hinglish (Hindi in Devanagari, English loanwords in Latin script, as in round 1).
# F = female persona Asha, M = male persona Amit; only first-person verb forms and the name differ.
HINGLISH = {
 'R1': {'F': 'नमस्ते, मैं आशा, साथी Insurance से AI assistant बोल रही हूँ। आपकी Health policy का renewal 15 नवंबर को है। दो मिनट बात करें?',
        'M': 'नमस्ते, मैं अमित, साथी Insurance से AI assistant बोल रहा हूँ। आपकी Health policy का renewal 15 नवंबर को है। दो मिनट बात करें?'},
 'R2': {'F': 'इस साल का premium ₹24,850 है, GST मिलाकर। Sum insured 5 लाख ही रहेगा। क्या मैं यही amount confirm कर दूँ?'},
 'R3': {'F': 'आपकी car, number 4 7 2 9, का insurance 28 अक्टूबर को खत्म हो रहा है। No-claim bonus के साथ premium ₹11,240 है।'},
 'R4': {'F': 'आपकी bike की policy 12 अक्टूबर को expire हो गई है। आज renew करें तो premium ₹1,538 है। Renewal शुरू कर दूँ?'},
 'R5': {'F': 'आपकी Life policy की 15 अगस्त की किस्त बाकी है, इसलिए policy lapse है। चालू करने में ₹18,600 और ₹420 late fee लगेगी।'},
 'R6': {'F': 'Policy 31 दिसंबर तक फिर चालू हो सकती है, बस एक छोटा health form भरना होगा। कल शाम 6 बजे advisor से call करवा दूँ?'},
 'R7': {'F': 'ठीक है, payment link आपके WhatsApp पर भेज रही हूँ, 24 घंटे चलेगा। Payment के बाद receipt भी WhatsApp पर आ जाएगी।',
        'M': 'ठीक है, payment link आपके WhatsApp पर भेज रहा हूँ, 24 घंटे चलेगा। Payment के बाद receipt भी WhatsApp पर आ जाएगी।'},
 'R8': {'F': 'एक बार confirm कर लूँ: अगली किस्त ₹7,365 की, 5 जनवरी को। Link उस number पर आएगा जिसके आखिरी अंक 4 3 2 1 हैं।'},
 'C1': {'F': 'जी, मैं समझ सकती हूँ। आप चाहें तो premium तीन किस्तों में दे सकते हैं, हर किस्त लगभग ₹8,300 की होगी।',
        'M': 'जी, मैं समझ सकता हूँ। आप चाहें तो premium तीन किस्तों में दे सकते हैं, हर किस्त लगभग ₹8,300 की होगी।'},
 'C2': {'F': 'कोई बात नहीं, आप आराम से documents देख लीजिए। मैं परसों सुबह 10 बजे फिर से call कर लूँगी, ठीक है?',
        'M': 'कोई बात नहीं, आप आराम से documents देख लीजिए। मैं परसों सुबह 10 बजे फिर से call कर लूँगा, ठीक है?'},
 'C3': {'F': 'हाँ जी, आपके पिताजी को भी इसी policy में जोड़ सकते हैं। उनकी उम्र 70 साल है, तो premium थोड़ा बढ़ जाएगा।'},
 'C4': {'F': 'अच्छा, आपने renewal पहले ही कर दिया? बहुत बढ़िया। तो मैं आपका नाम इस list से हटा देती हूँ। धन्यवाद।',
        'M': 'अच्छा, आपने renewal पहले ही कर दिया? बहुत बढ़िया। तो मैं आपका नाम इस list से हटा देता हूँ। धन्यवाद।'},
}
# The payment-link turn with a fraud-safety line (script contrast S1, hindi set only). Same facts as R7 (WhatsApp,
# 24 hours) plus: we never ask for an OTP on a call; you can also pay in the insurer's own app. The plain version
# carries the receipt clause so the two differ by about 2-3 s, not 5.
HINGLISH_SAFETY = {
 'R7': {'F': 'ठीक है, payment link आपके WhatsApp पर भेज रही हूँ, 24 घंटे चलेगा। हम call पर कभी OTP नहीं माँगते, चाहें तो company की app से pay करें।',
        'M': 'ठीक है, payment link आपके WhatsApp पर भेज रहा हूँ, 24 घंटे चलेगा। हम call पर कभी OTP नहीं माँगते, चाहें तो company की app से pay करें।'},
}

REGISTERS = ['bhojpuri_mix', 'tamil_english', 'marathi_mix', 'indian_english']
# Edits applied after generation, each with its reason (kept in the output as 'manual_edits').
MANUAL_EDITS = {
 ('R1', 'bhojpuri_mix', 'F'): ('एआय', 'एआई', 'the model used the Marathi spelling of AI; Bhojpuri/Hindi readers write एआई'),
 ('R1', 'bhojpuri_mix', 'M'): ('एआय', 'एआई', 'the model used the Marathi spelling of AI; Bhojpuri/Hindi readers write एआई'),
 ('R3', 'tamil_english', 'F'): ('4 7 2 9', '4, 7, 2, 9', 'automatic QA, 2026-10-17: with plain spaces the ta-IN text normaliser merged the digits with the '
                                 'following date in 4/4 voices (Pallavi, Valluvar, Meera HD, Arjun HD); both ASR engines heard "47 September 2,928". '
                                 'Commas fixed it in a probe (2 voices x 2 engines). The Hinglish and other registers read the spaced digits correctly.'),
}
SYS = ('You write test stimuli for a blind listening study on Indian voice agents. Output strict JSON only. Write natural '
       'SPOKEN register exactly as a real insurance renewal telecaller from that region speaks on the phone to an existing '
       'policy-holder from the same region: polite, short, not written or literary language, and not a caricature.')
REG_RULES = '''Registers (keys):
"bhojpuri_mix": for a customer in Siwan or Chhapra, Bihar: Bhojpuri-dominant with the Hindi and English loanwords a Bhojpuri-speaking telecaller in Patna really uses; genuine Bhojpuri grammar (raua, bani, ba, hamni, rahi, kaile) not Hindi with one Bhojpuri word; Devanagari script, English loanwords also in Devanagari.
"tamil_english": for a customer in Madurai: colloquial spoken Tamil-English code-mix; everything in Tamil script, English loanwords transliterated into Tamil script (no Latin letters at all; digits and the rupee sign allowed).
"marathi_mix": for a customer in Pune or Nashik: colloquial spoken Marathi as a Marathi telecaller speaks, mixing in the Hindi and English words people really use; Devanagari script including the loanwords (write AI as एआय, EMI-style abbreviations in Devanagari).
"indian_english": Indian English as a Chennai or Bengaluru telecaller speaks, Latin script.
Hard rules for every register:
- Exactly the same facts as the Hinglish source, nothing added or dropped, no sales or cross-sell line, no extra greeting.
- Keep every number exactly as in the source and write it with digits: amounts as in the source with the rupee sign (for example ₹24,850, ₹1,538), dates as day digits plus the month word in that language, times as digits ("6"), the sum insured as "5" plus the word for lakh. Keep digit-by-digit identifiers exactly as space-separated digits: "4 7 2 9" and "4 3 2 1".
- The company name is "Saathi Insurance": transliterate it in the register's script. The caller is Asha (female) or Amit (male).
- In R1 the caller must say clearly that they are an AI assistant.
- Similar length to the source (it must take 8 to 13 seconds to speak at a normal pace).
- Give a "F" version (caller Asha, female) and, only where the register's grammar or the name differs, an "M" version (caller Amit, male). If the two would be identical apart from nothing, give only "F".'''


def check_tokens(text, spec):
    """Text-level check that every key token is present in a written text (before any audio exists)."""
    digits = re.sub(r'(?<=\d)[,٬](?=\d)', '', text)
    missing = []
    for t in spec['key_tokens']:
        if t['kind'] == 'num':
            v = str(t['value'])
            if t['value'] == 500000:
                ok = re.search(r'\b5\b', digits) is not None
            elif t['id'] in ('vehicle_digits', 'phone_last4'):
                ok = ' '.join(v) in text
            else:
                ok = re.search(r'(?<!\d)' + v + r'(?!\d)', digits) is not None
        elif t['kind'] == 'date':
            ok = re.search(r'(?<!\d)' + str(t['day']) + r'(?!\d)', digits) is not None
        else:
            ok = any(a in text for a in t['alts'])
        if not ok:
            missing.append(t['id'])
    return missing


def build(llm):
    content = {}
    for tid, spec in TURNS.items():
        c = {'neutral_hinglish': dict(HINGLISH[tid]), 'gloss_en': spec['gloss_en']}
        if tid in HINGLISH_SAFETY:
            c['neutral_hinglish_safety'] = dict(HINGLISH_SAFETY[tid]); c['gloss_en_safety'] = spec['gloss_en_safety']
        content[tid] = c
    out = {'schema': 'vp-stimuli-text/2', 'written_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'authors': {'neutral_hinglish': 'hand-written for r2-listener-panel (no native review yet)',
                       'neutral_hinglish_safety': 'hand-written for r2-listener-panel (no native review yet)'},
           'turn_specs': TURNS, 'content': content, 'text_checks': {}}
    if llm:
        import requests
        dep = os.environ.get('R2P_DEPLOYMENT', 'r2p-gpt-6-sol-dz')
        url = 'https://vp-research-ai-frc.openai.azure.com/openai/v1/chat/completions'
        src = {tid: {'hinglish_F': HINGLISH[tid]['F'], 'hinglish_M': HINGLISH[tid].get('M', HINGLISH[tid]['F']), 'meaning': TURNS[tid]['gloss_en']}
               for tid in TURNS if tid.startswith('R')}
        user = ('For each turn below, rewrite the Hinglish source in each register. ' + REG_RULES +
                '\nReturn JSON: {"<turn_id>": {"bhojpuri_mix": {"F": ..., "M": ...}, "tamil_english": {...}, "marathi_mix": {...}, "indian_english": {...}}, ...}\n'
                'Turns (JSON):\n' + json.dumps(src, ensure_ascii=False, indent=1))
        body = {'model': dep, 'messages': [{'role': 'system', 'content': SYS}, {'role': 'user', 'content': user}],
                'max_completion_tokens': 16000, 'reasoning_effort': 'medium', 'response_format': {'type': 'json_object'}}
        t0 = time.time()
        r = requests.post(url, headers={'api-key': os.environ['FRC_KEY']}, json=body, timeout=900)
        r.raise_for_status(); d = r.json()
        msg = d['choices'][0]['message']['content']
        gen = json.loads(msg)
        for tid, regs in gen.items():
            if tid not in content: continue
            for reg in REGISTERS:
                if reg in regs:
                    v = regs[reg]
                    content[tid][reg] = v if isinstance(v, dict) else {'F': v}
        out['authors'].update({reg: f'gpt-6-sol ({dep}, DataZone EU), from the hand-written Hinglish' for reg in REGISTERS})
        out['llm'] = {'deployment': dep, 'model': d.get('model'), 'usage': d.get('usage'), 'latency_s': round(time.time() - t0, 1),
                      'finish_reason': d['choices'][0].get('finish_reason'), 'prompt_system': SYS, 'prompt_user': user,
                      'raw_output': gen}
    elif os.path.exists(OUT):
        # keep the LLM registers from the earlier --llm run; only the hand-written texts and the edits are re-applied
        old = json.load(open(OUT, encoding='utf-8'))
        if 'llm' in old:
            out['llm'] = old['llm']; out['authors'].update({k: v for k, v in old['authors'].items() if k in REGISTERS})
            for tid, regs in old['llm']['raw_output'].items():
                for reg in REGISTERS:
                    if tid in content and reg in regs:
                        v = regs[reg]; content[tid][reg] = dict(v) if isinstance(v, dict) else {'F': v}
    out['manual_edits'] = []
    for (tid, reg, g), (a, b, why) in MANUAL_EDITS.items():
        if tid in content and reg in content[tid] and g in content[tid][reg] and a in content[tid][reg][g]:
            content[tid][reg][g] = content[tid][reg][g].replace(a, b)
            out['manual_edits'].append({'turn': tid, 'register': reg, 'gender': g, 'from': a, 'to': b, 'why': why})
    for tid, c in content.items():
        for reg, v in c.items():
            if reg.startswith('gloss'): continue
            spec = dict(TURNS[tid])
            if reg.endswith('_safety'):
                spec = dict(spec, key_tokens=spec['key_tokens'] + spec.get('key_tokens_safety_extra', []))
            for g, txt in v.items():
                miss = check_tokens(txt, spec)
                if miss:
                    out['text_checks'][f'{tid}|{reg}|{g}'] = miss
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote', OUT, 'text-check misses:', out['text_checks'] or 'none')
    return out


if __name__ == '__main__':
    o = build('--llm' in sys.argv)
    for tid, c in o['content'].items():
        print(tid)
        for reg, v in c.items():
            if reg.startswith('gloss'): continue
            for g, txt in v.items():
                print(f'  {reg}/{g} ({len(txt)} ch) | {txt}')
