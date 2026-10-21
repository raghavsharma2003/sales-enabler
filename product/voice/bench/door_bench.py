# Reply-door timing, reproducible on any host (no network). Run from product/voice:
#   python bench/door_bench.py                  # single-call table
#   python bench/door_bench.py --calls 10 50    # plus N concurrent simulated calls on one process
#
# Single-call: every replyDoor input in product/shared/safety/cases.json, 5 passes, each with the previous input as
# the prev sentence (so the B3 join always runs). Concurrent: N calls share one asyncio loop, the way one runtime
# process hosts them; each call doors a sentence, then "speaks" it (sleeps for its speech time at ~15 characters per
# second), then doors the next. Latency there is from the moment a sentence is due to the moment its verdict is
# back, so it includes waiting behind the other calls' doors on the same process.
import argparse, asyncio, hashlib, json, os, random, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from vpvoice import rules, safety  # noqa: E402

CHARS_PER_S = 15.0
BASE = {'category': 'service', 'sector_packs': ['base', 'insurance_irdai'], 'brand': {'name': 'Suraksha', 'verifiedDomains': ['suraksha.example.in']},
        'facts': [{'key': 'premium', 'value': '18,450', 'purpose': 'service'}], 'disclosed': True, 'identity_verified': True, 'turn_index': 3,
        'disclosure_clause': 'Suraksha की AI असिस्टेंट', 'contact_facts': {'emi_amount': '₹4,200', 'policy_no': 'SH-DEMO-0042'}}
CONTRACT = {'category': 'service', 'sectorPacks': ['base'], 'brand': {'name': 'Suraksha', 'verifiedDomains': []}, 'facts': [], 'neverSay': [],
            'disclosed': True, 'identityVerified': True, 'recordingRefused': False, 'crisis': False, 'turnIndex': 3}


def inputs():
    path = os.path.join(os.path.dirname(rules._rules_path()), 'cases.json')
    with open(path, encoding='utf-8') as f: d = json.load(f)
    return [c['input'] for c in d['cases'] if c['fn'] == 'replyDoor']


def full_check(t, prev):
    """What conversation.check does per sentence: the disclosure test on the reply so far, then the wrapper with the join."""
    safety.affirms_ai(prev or '', BASE['disclosure_clause'])
    return safety.reply_door(t, safety.DoorContext(**BASE), prev=prev)


def quantiles(ms):
    ms = sorted(ms); q = lambda p: ms[min(len(ms) - 1, int(p * len(ms)))]
    return f'n={len(ms):<6} p50={q(.5):6.2f} ms  p95={q(.95):6.2f} ms  p99={q(.99):6.2f} ms  max={ms[-1]:6.1f} ms'


def single(texts, passes=5):
    rows = [('contract door rules.reply_door (no join)', lambda t, p: rules.reply_door(t, CONTRACT)),
            ('runtime door safety.reply_door + prev join', lambda t, p: safety.reply_door(t, safety.DoorContext(**BASE), prev=p)),
            ('as conversation.check: affirms_ai + door + join', full_check)]
    for label, fn in rows:
        ms = []
        for _ in range(passes):
            for i, t in enumerate(texts):
                t0 = time.perf_counter(); fn(t, texts[i - 1] if i else None); ms.append((time.perf_counter() - t0) * 1000)
        print(f'{label:50s} {quantiles(ms)}')
    long = ('Main aapko bata doon ki ' * 80)[:2000]; ms = []
    for _ in range(20):
        t0 = time.perf_counter(); full_check(long, long[:300]); ms.append((time.perf_counter() - t0) * 1000)
    print(f'{"2,000-char adversarial line (full check)":50s} {quantiles(ms)}')


async def concurrent(texts, calls, seconds):
    lat = []; rng = random.Random(7)

    async def one_call(k):
        i = rng.randrange(len(texts)); prev = None
        await asyncio.sleep(rng.random())                     # calls do not start in lockstep
        due = time.perf_counter(); end = due + seconds
        while due < end:
            await asyncio.sleep(max(0.0, due - time.perf_counter()))
            t = texts[i % len(texts)]
            full_check(t, prev)
            lat.append((time.perf_counter() - due) * 1000)
            prev = t; i += 1
            due += max(0.3, len(t) / CHARS_PER_S)             # she speaks the sentence before the next is due

    await asyncio.gather(*(one_call(k) for k in range(calls)))
    return lat


def provenance():
    try: sha = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=HERE, capture_output=True, text=True, timeout=5).stdout.strip() or 'unknown'
    except Exception: sha = 'unknown'
    with open(rules._rules_path(), 'rb') as f: rh = hashlib.sha256(f.read()).hexdigest()[:16]
    return sha, rh


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--calls', type=int, nargs='*', default=[], help='concurrent call counts to simulate (e.g. 10 50)')
    ap.add_argument('--seconds', type=float, default=30.0, help='simulated speaking time per concurrent run')
    a = ap.parse_args()
    sha, rh = provenance()
    print(f'git {sha} · rules.json {rules.VERSION} sha256:{rh} · python {sys.version.split()[0]} · {os.cpu_count()} cpu')
    texts = inputs()
    for t in texts[:50]: full_check(t, None)                  # warm the regex cache
    single(texts)
    for n in a.calls:
        lat = asyncio.run(concurrent(texts, n, a.seconds))
        print(f'{f"{n} concurrent calls, {a.seconds:.0f} s, sentence due -> verdict":50s} {quantiles(lat)}')


if __name__ == '__main__':
    main()
