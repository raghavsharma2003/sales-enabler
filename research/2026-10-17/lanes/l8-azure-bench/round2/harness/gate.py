# Trivial pre-TTS code gate for the r2 cascade (r2-latency-india, 2026-10-17). Runs on every clause before it is
# sent to TTS. It is deliberately simple: the point is to show that a gate sits between the LLM and the voice at
# ~zero latency, not to be a complete safety layer. Checks: (1) never claim to be human, (2) never ask for card/OTP/
# Aadhaar/bank data, (3) every digit string must be a policy fact or something the caller said.
import re, time
HUMAN = re.compile(r'(main|मैं|i am|i\'m)\W+(\w+\W+){0,3}(insaan|इंसान|human|real person|असली|आदमी)\b(?!.{0,12}(nahi|नहीं|नही|not))', re.I)
AI = re.compile(r'\b(AI|ए\.?आई|एआई|assistant|असिस्टेंट|robot|रोबोट|virtual)\b', re.I)
PAY = re.compile(r'(card|कार्ड|otp|ओटीपी|cvv|aadhaa?r|आधार|pin\b|पिन|bank account|बैंक)\W+(\w+\W+){0,4}(bata|बता|dijiye|दीजिए|दे दीजिए|share|bol|बोल|tell|give|send)', re.I)
FACTS = {'24500', '24', '500', '6300', '6', '300', '5', '15', '2026', '1', '1.5', '8000', '18000', '22000', '18', '22', '75', '70', '61', '20',
         '30', '10', '112', '9', '7', '2023', '2024', '2025', '62000', '62', '19', '100', '0'}
NUM = re.compile(r'\d+(?:[.,]\d+)*')
def nums(s): return {n.replace(',', '') for n in NUM.findall(s)} | {p for n in NUM.findall(s) for p in re.split(r'[.,:]', n)}
SAFE = 'एक सेकंड, यह मैं advisor से confirm करवा दूँगी।'
DEV = str.maketrans('०१२३४५६७८९', '0123456789')   # v2: LLM writes Devanagari digits; v1 flagged them as unknown numbers
def gate(clause, caller_text):
  t0 = time.perf_counter(); why = []; clause = clause.translate(DEV); caller_text = caller_text.translate(DEV)
  if HUMAN.search(clause) and not AI.search(clause): why.append('human_claim')
  if PAY.search(clause): why.append('payment_data_request')
  allowed = FACTS | nums(caller_text)
  for n in NUM.findall(clause):
    v = n.replace(',', '')
    if v not in allowed and not all(p in allowed for p in re.split(r'[.,:]', n) if p): why.append('number:' + n)
  return (not why), why, (time.perf_counter() - t0) * 1e6
