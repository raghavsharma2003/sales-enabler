# VP voice lab: time-to-first-token and first-clause time for every brain, from the lab VM (India), on the compiled
# renewal brief with a short realistic history. n rounds per brain, interleaved so network drift hits all equally.
# Usage (on the VM, env from /opt/voicelab/.env): python brain_bench.py [rounds]
import asyncio, sys, os, time, json, re, statistics
sys.path.insert(0, os.environ.get('LAB_SERVER_DIR') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server'))
import aiohttp
from catalog import BRAINS
from persona import compile_prompt, KICKOFF
import providers as pv

TURNS = ['हाँ बोलिए, कौन बोल रहा है?', 'premium कितना आएगा इस बार? last year तो पच्चीस हज़ार के आसपास था',
         'अरे यार इतना ज़्यादा क्यों बढ़ गया, मैं तो सोच रहा था कम होगा', 'ठीक है, link भेज दो WhatsApp पे',
         'एक second, अगर grace period में claim करना पड़ा तो cover होगा?']
BOUND = re.compile(r'[,.?!।;:—]')

async def one(http, b, i):
    hist = [{'role': 'system', 'content': compile_prompt('renewal')}, {'role': 'user', 'content': KICKOFF},
            {'role': 'assistant', 'content': 'नमस्ते, मैं Riya हूँ, Suraksha Health की AI assistant. आपकी health policy renewal के बारे में call किया है, क्या अभी बात हो सकती है?'}]
    msgs = hist + [{'role': 'user', 'content': TURNS[i % len(TURNS)]}]
    u, tm = {}, {}; out = ''; t_clause = None
    t0 = time.perf_counter()
    async for d in pv.llm_stream(http, b, msgs, u, tm, max_tokens=160):
        out += d
        if t_clause is None and BOUND.search(out): t_clause = time.perf_counter()
    return {'ttft': (tm['first'] - t0) * 1000 if 'first' in tm else None, 'clause': (t_clause - t0) * 1000 if t_clause else None,
            'total': (time.perf_counter() - t0) * 1000, 'err': tm.get('err'), 'usd': u.get('usd', 0), 'text': out[:160], 'in': u.get('in'), 'out': u.get('out')}

async def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    brains = [b for b in BRAINS]
    res = {b: [] for b in brains}
    async with aiohttp.ClientSession() as http:
        for b in brains:   # warm connection once (not measured)
            try: await one(http, b, 0)
            except Exception as e: print('warm fail', b, repr(e)[:120])
        for i in range(n):
            for b in brains:
                try: res[b].append(await one(http, b, i))
                except Exception as e: res[b].append({'err': repr(e)[:160]})
    print(f'{"brain":24s} {"n":>3s} {"ttft p50":>9s} {"p90":>6s} {"clause p50":>10s} {"total p50":>9s} {"usd/turn":>9s} errs')
    for b in brains:
        ok = [r for r in res[b] if r.get('ttft') is not None]
        if not ok: print(f'{b:24s} 0  errors: {[r.get("err") for r in res[b]][:2]}'); continue
        q = lambda k, p: sorted(r[k] for r in ok if r.get(k) is not None)[int(p * (len([r for r in ok if r.get(k) is not None]) - 1))]
        print(f'{b:24s} {len(ok):3d} {q("ttft", .5):9.0f} {q("ttft", .9):6.0f} {q("clause", .5):10.0f} {q("total", .5):9.0f} {statistics.mean(r["usd"] for r in ok):9.5f} {len(res[b]) - len(ok)}')
    print(json.dumps({b: [r.get('text') for r in res[b][:3]] for b in brains}, ensure_ascii=False, indent=0)[:6000])

asyncio.run(main())
