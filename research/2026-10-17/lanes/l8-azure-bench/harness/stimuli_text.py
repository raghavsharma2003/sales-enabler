# Generate H6 listener-panel stimulus texts (l8-azure-bench, 2026-10-17) with gpt-6-sol (DataZone EU deployment).
# Same content per turn across registers; fictional brands. Output: stimuli/stimuli-text.json
import os, json, time, requests
FRC = 'https://vp-research-ai-frc.openai.azure.com/openai/v1/chat/completions'
import sys
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None   # regenerate only these turn ids (others kept from the existing file)
TURNS = {
 'T1_sales_opening': 'Greeting; the caller is Priya, an AI assistant from Shree Ram Motors (say AI assistant explicitly); the customer filled an enquiry form yesterday for a Hero Splendor bike on EMI; ask if now is a good time for two minutes.',
 'T2_sales_price': 'On-road price is Rs 82,500 and the EMI is about Rs 2,950 a month for 24 months; ask if that works for them. (Shortened 2026-10-17: the first version with the Rs 15,000 down payment ran 15.8-17.6 s.)',
 'T3_sales_objection': 'The customer just said it is expensive. Acknowledge it; there is also a 36-month plan with an EMI of about Rs 2,200; offer a free test ride on Saturday at 11 am.',
 'T4_postsales_cod': 'Their order of a pressure cooker worth Rs 1,299, cash on delivery, will arrive tomorrow between 10 am and 2 pm; ask whether someone will be at home to receive it.',
 'T5_postsales_ndr': 'Our delivery partner could not reach them today; ask whether to try again tomorrow evening or whether they want to change the delivery address.',
 'T6_postsales_renewal': 'Their health policy renewal is due on 15 November; the premium is Rs 24,500 a year; offer to send the payment link on WhatsApp now.',
}
SYS = 'You write test stimuli for a blind listening study on Indian voice agents. Output strict JSON only. Write natural SPOKEN register exactly as a real telecaller from that region speaks on the phone to a customer from the same region, not written or literary language, and not a caricature.'
USER = '''For each turn below write ONE agent turn of 24 to 30 words (it must take 8 to 15 seconds to speak), with exactly the same content in every register. Use digits for amounts, dates and times.
Registers (keys):
"neutral_hinglish": neutral urban Hindi-English as a Delhi or Mumbai telecaller speaks; Hindi in Devanagari, English loanwords (EMI, down payment, test ride, order, delivery, policy, premium, WhatsApp, link) in Latin script.
"bhojpuri_mix": for a customer in Siwan or Chhapra, Bihar: Bhojpuri-dominant with Hindi and the English loanwords a Bhojpuri-speaking telecaller in Patna really uses; genuine Bhojpuri grammar (raua, bani, ba, hamni, rahi, kaile) not Hindi with one Bhojpuri word; Devanagari script with the English loanwords also in Devanagari.
"marathi_mix": for a customer in Pune or Nashik: colloquial spoken Marathi as a Marathi telecaller speaks, mixing in the Hindi and English words people really use; Devanagari script including the loanwords.
"tamil_english": for a customer in Madurai: colloquial spoken Tamil-English code-mix; everything in Tamil script, with the English loanwords transliterated into Tamil script (no Latin letters at all, digits allowed).
"indian_english": Indian English as a Chennai or Bengaluru telecaller speaks, Latin script.
Also give "gloss_en": a plain English translation of the content.
Return JSON: {"<turn_id>": {"neutral_hinglish": ..., "bhojpuri_mix": ..., "marathi_mix": ..., "tamil_english": ..., "indian_english": ..., "gloss_en": ...}, ...}
Turns:
''' + '\n'.join(f'{k}: {v}' for k, v in TURNS.items() if not ONLY or k in ONLY)
body = {'model': 'l8-gpt-6-sol-dz', 'messages': [{'role': 'system', 'content': SYS}, {'role': 'user', 'content': USER}], 'max_completion_tokens': 8000, 'reasoning_effort': 'medium', 'response_format': {'type': 'json_object'}}
for attempt in range(3):
  t = time.time(); r = requests.post(FRC, headers={'api-key': os.environ['FRC_KEY']}, json=body, timeout=600); r.raise_for_status(); d = r.json()
  c = d['choices'][0]
  print('finish', c.get('finish_reason'), d.get('usage', {}).get('completion_tokens'), (c.get('message') or {}).get('refusal'), c.get('content_filter_results', '')) 
  if (c.get('message') or {}).get('content'): break
  body['reasoning_effort'] = 'low'
out = {'model': d.get('model'), 'deployment': 'l8-gpt-6-sol-dz', 'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'latency_s': round(time.time() - t, 1),
       'usage': d.get('usage'), 'prompt_system': SYS, 'prompt_user': USER, 'turn_specs': TURNS, 'content': json.loads(d['choices'][0]['message']['content'])}
P = os.path.join(os.path.dirname(__file__), '..', 'stimuli', 'stimuli-text.json')
if ONLY and os.path.exists(P):
  old = json.load(open(P, encoding='utf-8'))
  old.setdefault('superseded', {}).update({k: old['content'][k] for k in ONLY if k in old['content']})
  old['content'].update(out['content']); old.setdefault('regenerations', []).append({k: out[k] for k in ('generated_at', 'usage', 'prompt_user')})
  old['turn_specs'] = TURNS; out = old
json.dump(out, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in out['content'].items():
  print(k); [print('  ', kk, '|', vv) for kk, vv in v.items()]
