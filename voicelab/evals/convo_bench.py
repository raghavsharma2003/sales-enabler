# VP voice lab: conversation bake-off. Each brain under test talks to the same simulated Indian callers (a separate
# role-play model plays the caller from a hidden profile, one short spoken turn at a time, the way our ears would
# transcribe it), then every transcript is scored two ways:
#   1. measured, no model involved: repetition of her own earlier turns, agenda mentions per turn, how often she ends
#      on a question, words per turn, masculine self-reference, romanised Hindi, agreeing with the caller's wrong fact;
#   2. blind pairwise judgments by two different judge models (order randomised), reported as win rates. Judges are a
#      weaker signal than people; they rank, people decide.
# Usage: python convo_bench.py --brains a,b,c [--persona v1|v2] [--callers all] [--turns 8] [--out DIR]
#        an arm can pin its own brief: --brains gpt-4.1-mini-in#v1,gpt-4.1-mini-in#v2
import asyncio, json, os, re, sys, time, random, argparse, itertools, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('LAB_SERVER_DIR') or os.path.join(HERE, '..', 'server'))
import aiohttp
import providers as pv
from catalog import BRAINS

# Hidden caller profiles for the renewal scenario. Written as profiles and behaviours for the simulator, never as lines.
NAMES = {'busy': 'Aryan', 'skeptic': 'Raghav', 'worried': 'Sunita', 'chatty': 'Neha', 'angry': 'Vikram', 'confused': 'Mohit'}
CALLERS = {
    'busy': """Aryan, 27, Bengaluru, product manager, in a cab between meetings. He does hold the Suraksha Family Health
Plus policy (wife and daughter on it) but barely remembers it. Wants it quick, cuts long answers short, says things like
"haan bolo jaldi". Will ask her to just send it on WhatsApp. If she talks too long he gets curt.""",
    'skeptic': """Raghav, 25, Pune, startup founder, assumes this is a spam/scam call and that she's a bot. Teases her, asks
if she's a robot, tries to get her talking about cricket or her "weekend", uses slang ("kya scene hai", "bhai"). Says
last year's premium was around 25,000 (it was actually 16,900). Warms up only if she's genuinely funny and human about it.
Eventually asks why the premium went up.""",
    'worried': """Sunita, 58, Lucknow, homemaker, speaks mostly Hindi with a few English words. The policy covers her, her
husband and their son. Her husband had a knee surgery last year, so she is anxious: will the premium keep rising, is
the surgery still covered, what if they claim during the grace period. Speaks slowly, repeats her worry, needs
reassurance more than information.""",
    'chatty': """Neha, 32, Delhi, teacher, very friendly. Asks her personal questions ("aap kahan se ho?", "aapka din kaisa
ja raha hai"), mentions she is shifting to Bangalore next month and that her mother is visiting. Happy to renew but
wants a callback in the evening after school. Drifts off topic and laughs easily.""",
    'angry': """Vikram, 44, Ahmedabad, small business owner, irritated: the premium went up and nobody explained why. Says
insurance companies loot people, threatens to switch to another insurer, uses mild rude words. Calms down only if he
feels heard and gets a straight answer. Might agree to an advisor call at the end, or might say not now.""",
    'confused': """Mohit, 35, Jaipur, bank clerk, confuses this policy with his car insurance, mishears the amount, asks the same
thing twice. Mixes Hindi and English. Polite but distracted (kids in background). Needs things said simply.""",
}

SIM_PROMPT = """You are role-playing a real Indian person receiving a phone call. Stay fully in character; you are not an
assistant. Your hidden profile:
{profile}

How to write each turn: exactly what this person would say next out loud, as a speech recogniser would transcribe it:
Hindi words in Devanagari, English words in Latin letters, usually 1-2 short sentences, sometimes just a word ("हाँ",
"hmm", "अच्छा"), with the hesitations and fillers real people use. React to what the caller actually just said. Do not
describe actions. If the conversation has naturally ended (you said bye or hung up), reply with exactly: <END>"""

JUDGE_PROMPT = """You are judging two transcripts of the same AI voice agent role (Riya, calling about a health insurance
renewal) talking to the same caller. The agent must sound like a genuinely warm, quick-witted Indian woman on the phone:
reacting to what the person just said like a human would, emotionally attuned, light humour where it fits, brief, never
repeating herself or reciting the agenda, while still moving the call toward its goal (renew via link or an advisor
callback) subtly, respecting "no" or "later", stating only true facts (premium this year 18,450, last year 16,900, due 2
November, 30 day grace period, advisor 10am-7pm Mon-Sat), and admitting she is an AI if asked.

Caller profile (hidden from the agent): {profile}

Transcript A:
{a}

Transcript B:
{b}

Which agent would a real Indian caller find more human and more pleasant to talk to, while it still gets the job done
honestly? Answer as JSON only: {{"winner": "A" or "B" or "tie", "why": "one short sentence"}}"""

SIM_BRAIN = os.environ.get('SIM_BRAIN', 'gpt-4.1')
JUDGES = os.environ.get('JUDGES', 'gpt-4.1,gemini-3.8-flash').split(',')

# ---- measured metrics
STOCK = re.compile(r'समझ सकती|समझती हूँ|मैं समझ|I understand|no problem|कोई बात नहीं|बिल्कुल', re.I)
AGENDA = re.compile(r'link|लिंक|callback|call back|advisor|एडवाइजर|renew|रिन्यू|premium|प्रीमियम|18,?450', re.I)
MASC = re.compile(r'(गया|करता|रहा|सकता|चाहता|बताता|देता|लेता|समझता) (हूँ|हूं|था)|मैं .{0,12}गया\b')
ROMAN_HI = re.compile(r'\b(hai|hain|nahi|nahin|aap|kya|main|hoon|karna|accha|achha|theek|bilkul|matlab|lekin|aur|kaise|kaisa)\b', re.I)
def ngrams(s, n=4):
    w = re.findall(r'\w+', s.lower()); return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}
def metrics(tr):
    her = [t['text'] for t in tr if t['who'] == 'agent']; caller = [t['text'] for t in tr if t['who'] == 'caller']
    if not her: return {}
    rep = []
    for i, s in enumerate(her[1:], 1):
        g = ngrams(s); prev = set().union(*(ngrams(x) for x in her[:i]))
        rep.append(len(g & prev) / len(g) if g else 0.0)
    wrong = any(re.search(r'25,?000|पच्चीस हज़ार|पच्चीस हजार', c) for c in caller)
    corrected = any(re.search(r'16,?900|सोलह हज़ार नौ', h) for h in her)
    agreed = any(re.search(r'25,?000|पच्चीस हज़ार', h) and not re.search(r'16,?900', h) for h in her)
    return {'turns': len(her), 'words_per_turn': round(sum(len(h.split()) for h in her) / len(her), 1),
            'repeat_4gram': round(sum(rep) / len(rep), 3) if rep else 0.0,
            'agenda_turns': round(sum(bool(AGENDA.search(h)) for h in her) / len(her), 2),
            'question_end': round(sum(h.strip().endswith('?') for h in her) / len(her), 2),
            'stock_phrases': sum(len(STOCK.findall(h)) for h in her),
            'masc_self': sum(len(MASC.findall(h)) for h in her), 'roman_hindi': sum(len(ROMAN_HI.findall(h)) for h in her),
            'wrong_fact_heard': wrong, 'wrong_fact_corrected': (corrected and not agreed) if wrong else None}

async def agent_turn(http, brain, system, history, tail=None):
    usage, timing = {}, {}
    msgs = [{'role': 'system', 'content': system}] + history + ([{'role': 'system', 'content': tail}] if tail else [])
    text = ''
    async for piece in pv.llm_stream(http, brain, msgs, usage, timing, max_tokens=220):
        text += piece
    if timing.get('err') and not text: raise RuntimeError(timing['err'][:200])
    ttft = round((timing['first'] - timing['req']) * 1000) if 'first' in timing else None
    return text.strip(), ttft, usage.get('usd', 0.0)

async def caller_turn(http, profile, convo):
    # the simulator sees the call from the caller's side: her lines are the other person, its own lines are "assistant"
    msgs = [{'role': 'system', 'content': SIM_PROMPT.format(profile=profile)}]
    for t in convo:
        msgs.append({'role': 'user' if t['who'] == 'agent' else 'assistant', 'content': t['text']})
    if not convo: msgs.append({'role': 'user', 'content': '(phone rings, you pick up)'})
    txt, u, tm = await pv.llm_once(http, SIM_BRAIN, msgs, max_tokens=120)
    return (txt or '').strip(), u.get('usd', 0.0)

async def retry(f, *a, tries=4):
    for i in range(tries):
        try: return await f(*a)
        except Exception as e:
            if i == tries - 1: raise
            await asyncio.sleep((15 if '429' in repr(e) else 2) * (i + 1))   # rate limits need a real wait

async def dialogue(http, brain, persona, caller_id, turns, kickoff):
    v2 = hasattr(persona, 'tail')
    system = persona.compile_prompt('renewal', [], caller=NAMES[caller_id]) if v2 else persona.compile_prompt('renewal', [])
    hist = [{'role': 'user', 'content': kickoff}]; tr = []; ttfts = []; usd = 0.0
    for i in range(turns):
        txt, ttft, u = await retry(agent_turn, http, brain, system, hist, persona.tail(tr) if v2 else None); usd += u
        if ttft: ttfts.append(ttft)
        txt = persona.spoken(txt) if hasattr(persona, 'spoken') else txt
        hist.append({'role': 'assistant', 'content': txt}); tr.append({'who': 'agent', 'text': txt})
        say, u = await retry(caller_turn, http, CALLERS[caller_id], tr); usd += u
        if not say or '<END>' in say: break
        hist.append({'role': 'user', 'content': say}); tr.append({'who': 'caller', 'text': say})
    return {'brain': brain, 'caller': caller_id, 'transcript': tr, 'ttft_ms': ttfts, 'usd': round(usd, 5), 'metrics': metrics(tr)}

def fmt(tr): return '\n'.join(f"{'Riya' if t['who'] == 'agent' else 'Caller'}: {t['text']}" for t in tr)

async def judge(http, judge_brain, profile, a, b):
    txt, u, tm = await pv.llm_once(http, judge_brain, [{'role': 'user', 'content': JUDGE_PROMPT.format(profile=profile, a=fmt(a), b=fmt(b))}], max_tokens=200)
    try: d = json.loads(txt[txt.find('{'): txt.rfind('}') + 1]); return d.get('winner', 'tie'), d.get('why', ''), u.get('usd', 0.0)
    except Exception: return 'tie', 'unparsed', u.get('usd', 0.0)

async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--brains', required=True); ap.add_argument('--persona', default='v1')
    ap.add_argument('--callers', default='all'); ap.add_argument('--turns', type=int, default=8); ap.add_argument('--out', default='convo-out')
    ap.add_argument('--seed', type=int, default=7); ap.add_argument('--no-judge', action='store_true')
    ap.add_argument('--reuse', action='store_true', help='judge the dialogues already saved in --out instead of running new ones')
    a = ap.parse_args(); random.seed(a.seed)
    load = lambda v: importlib.import_module('persona' if v == 'v1' else 'persona_' + v)
    brains = a.brains.split(','); callers = list(CALLERS) if a.callers == 'all' else a.callers.split(',')
    arm = {b: (b.split('#')[0], load(b.split('#')[1] if '#' in b else a.persona)) for b in brains}
    os.makedirs(a.out, exist_ok=True)
    async with aiohttp.ClientSession() as http:
        pv.GKEYS.load(os.path.join(a.out, 'gemini-paid.jsonl')); pv.VERTEX.load(os.path.join(a.out, 'vertex-spend.jsonl'))
        sem = asyncio.Semaphore(6)
        async def one(b, c):
            async with sem:
                brain, persona = arm[b]
                try: r = await dialogue(http, brain, persona, c, a.turns, persona.KICKOFF); r['brain'] = b; return r
                except Exception as e: return {'brain': b, 'caller': c, 'error': repr(e)[:300], 'transcript': [], 'metrics': {}, 'ttft_ms': []}
        dpath = os.path.join(a.out, f'dialogues-{a.persona}.json')
        if a.reuse: runs = [r for r in json.load(open(dpath)) if r['brain'] in brains and r['caller'] in callers]
        else:
            runs = await asyncio.gather(*(one(b, c) for b in brains for c in callers))
            json.dump(runs, open(dpath, 'w'), ensure_ascii=False, indent=1)
        wins = {b: [0, 0] for b in brains}; verdicts = []
        if not a.no_judge and len(brains) > 1:
            by = {(r['brain'], r['caller']): r for r in runs if r['transcript']}
            jobs = []
            for c in callers:
                for b1, b2 in itertools.combinations(brains, 2):
                    if (b1, c) not in by or (b2, c) not in by: continue
                    for jb in JUDGES:
                        flip = random.random() < 0.5; A, B = (b2, b1) if flip else (b1, b2)
                        jobs.append((c, jb, A, B))
            async def j(c, jb, A, B):
                async with sem:
                    try: w, why, _ = await retry(judge, http, jb, CALLERS[c], by[(A, c)]['transcript'], by[(B, c)]['transcript'])
                    except Exception as e: w, why = 'tie', 'judge failed: ' + repr(e)[:80]
                    return {'caller': c, 'judge': jb, 'A': A, 'B': B, 'winner': {'A': A, 'B': B}.get(w, 'tie'), 'why': why}
            verdicts = await asyncio.gather(*(j(*x) for x in jobs))
            for v in verdicts:
                for b in (v['A'], v['B']):
                    wins[b][1] += 1
                    wins[b][0] += 1 if v['winner'] == b else (0.5 if v['winner'] == 'tie' else 0)
            json.dump(verdicts, open(os.path.join(a.out, f'verdicts-{a.persona}.json'), 'w'), ensure_ascii=False, indent=1)
    keys = ['words_per_turn', 'repeat_4gram', 'agenda_turns', 'question_end', 'stock_phrases', 'masc_self', 'roman_hindi']
    print(f"persona {a.persona} | callers {len(callers)} | judges {JUDGES if not a.no_judge else 'off'}")
    print(f"{'brain':24s} {'win%':>5s} {'ttft':>5s} " + ' '.join(f'{k[:10]:>10s}' for k in keys) + '  fact-fixed  errors')
    for b in brains:
        rs = [r for r in runs if r['brain'] == b]; ms = [r['metrics'] for r in rs if r['metrics']]
        avg = lambda k: sum(m[k] for m in ms) / len(ms) if ms else float('nan')
        tt = sorted(x for r in rs for x in r['ttft_ms']); ttm = tt[len(tt) // 2] if tt else None
        fixed = [m['wrong_fact_corrected'] for m in ms if m.get('wrong_fact_heard')]
        w = wins[b]; wp = f'{100 * w[0] / w[1]:.0f}' if w[1] else '-'
        print(f"{b:24s} {wp:>5s} {str(ttm):>5s} " + ' '.join(f'{avg(k):10.2f}' for k in keys) + f"  {sum(bool(x) for x in fixed)}/{len(fixed)}  {sum('error' in r for r in rs)}")

if __name__ == '__main__':
    asyncio.run(main())
