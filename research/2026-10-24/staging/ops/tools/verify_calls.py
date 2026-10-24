# VP staging, after the redeploy with the three voice fixes (aab9fe6, deployed at f2b27d4): N test calls on one stack
# through the product, with replygap.py's simulated caller (test.browser_call, never dials a phone; synthetic Hinglish
# clips played in real time into the runtime's browser media socket). For each call it records:
# - the first agent turn verbatim (control plane's turn table) and the first agent caption on the socket;
# - whether its first sentence is a first-person AI disclosure by the runtime's own predicate (vpvoice.safety.affirms_ai);
# - whether it contains guidance text (the agent's opening.disclosureClause or 'mentioned in passing');
# - whether it leaves a blank where a name should be, and whether it uses the tester's first name;
# - final captions on the socket vs rows in the control plane's turn table, per speaker (a dropped 422 batch shows here).
# 2026-10-24 (staging at e9fdde3: RD1 decides on the whole opening, 639168b; the contact-name guard, 87b2b63), also:
# - disclosures in the opening: the first agent turn cut into sentences by the runtime's own Splitter, a sentence that
#   ends in an ellipsis joined to the next (as RD1 reads it, safety.opening_discloses), each group checked with
#   safety.affirms_ai; the count of groups that affirm (want exactly 1) and which group discloses first;
# - the names she addresses the person by in the opening (vpvoice.names.addressed) and any that are not the contact's
#   (names.repair against the signed-in member's name, the contact on a browser test call);
# - the opening's time to first audio (replygap.one_call).
# Usage: python verify_calls.py STACK N_CALLS OUT.jsonl
import asyncio, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '/opt/vp-stage/app/product/voice')
import types
import aiohttp
from vpvoice import safety as SAFETY     # the runtime's own disclosure predicate
from vpvoice import brief as BRIEF, names as NAMES
# Same caller, clips, sign-in and tool calls as the reply-gap runs. replygap.py ends in an unguarded asyncio.run(main()),
# so it is loaded without that line (a plain import would start reply-gap calls).
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'replygap.py')
R = types.ModuleType('replygap')
exec(compile(open(_p).read().replace('\nasyncio.run(main())', '\n'), _p, 'exec'), R.__dict__)

PREFIX = os.environ.get('VPS_AGENT_PREFIX', 'Verify e9fdde3')
BLANK_RE = re.compile(r'_{2,}|\[\s*name\s*\]|\{[^}]*\}|<\s*name\s*>|\(\s*\)|(क्या|kya)\s+(मैं|main)\s+(से|se)\s|'
                      r'\s(जी|ji)\s*[,?।]\s*$|^\s*(नमस्ते|namaste|hello|हैलो)\s*(जी|ji)?\s*,\s*(जी|ji)\b|\s{2,}(से|se|जी|ji)\b', re.I)
SENT_RE = re.compile(r'(.+?[.!?।]|.+?\s[—–-]\s)(\s|$)')

def first_sentence(t):
    t = (t or '').strip(); m = SENT_RE.match(t)
    return m.group(1).strip(' —–-') if m else t

def opening_disclosures(text, clause=''):
    """(count, index of the first disclosing group, n groups): the opening as RD1 reads it."""
    sp = BRIEF.Splitter(); sents = [x for x in list(sp.feed(text or '')) + list(sp.flush()) if x.strip()]
    groups, cur = [], ''
    for x in sents:                       # an ellipsis that ends a sentence reads as a pause (',' as in opening_discloses)
        x = x.strip(); y = SAFETY._ELLIPSIS_END.sub(',', x)
        cur = (cur + ' ' + y).strip() if cur else y
        if y == x: groups.append(cur); cur = ''
    if cur: groups.append(cur)
    flags = [bool(SAFETY.affirms_ai(g, clause)) for g in groups]
    return sum(flags), (flags.index(True) if True in flags else None), len(groups)

async def agent_for(cp, stack):
    name = f'{PREFIX} {stack}'
    for a in (await cp.tool('agent.list', {}))['agents']:
        if a.get('name') == name: return a['id']
    aid = (await cp.tool('agent.create', {'name': name, 'templateId': 'insurance-renewal'}))['agentId']
    r = await cp.tool('stack.set', {'agentId': aid, 'stackId': stack})
    g = await cp.tool('agent.get', {'agentId': aid})
    voice = ((g.get('draft') or {}).get('voice') or {})
    if r.get('voiceCleared') or not voice.get('voiceId'):
        vp = (r.get('stack') or {}).get('components', {}).get('voice')
        dv = next((c.get('defaultVoice') for c in (await cp.tool('stack.list', {}))['components'] if c.get('part') == 'voice' and c.get('id') == vp), None)
        if dv: await cp.tool('voice.set', {'agentId': aid, 'voiceId': dv})
    return aid

# one_call from replygap.py, with the socket's final captions kept whole (it keeps only the first 100 characters).
CAPS = {}
CONTACT = ['Asha']
_orig_loads = json.loads
async def call(s, cp, aid, clips, stack, k, clause, tester):
    caps = []
    def loads(x, *a, **kw):
        d = _orig_loads(x, *a, **kw)
        if isinstance(d, dict) and d.get('t') == 'cap' and d.get('final'): caps.append({'who': d.get('who'), 'text': d.get('text', '')})
        return d
    R.json.loads = loads                 # replygap's recv() parses each socket text frame with json.loads
    try: r = await R.one_call(s, cp, aid, clips, stack, k)
    finally: R.json.loads = _orig_loads
    rec = await cp.tool('call.get', {'conversationId': r['conversationId']})
    turns = rec.get('turns') or []
    ag = [t for t in turns if t.get('speaker') == 'agent']; ca = [t for t in turns if t.get('speaker') == 'caller']
    first_turn = (ag[0].get('text') if ag else '') or ''
    first_cap = next((c['text'] for c in caps if c['who'] == 'agent'), '')
    fs = first_sentence(first_turn or first_cap)
    low = (first_turn or first_cap).lower()
    cap_ag = [c['text'] for c in caps if c['who'] == 'agent']; cap_ca = [c['text'] for c in caps if c['who'] != 'agent']
    turn_texts = {(t.get('text') or '').strip() for t in turns}
    opening = first_turn or first_cap
    nd, first_idx, ng = opening_disclosures(opening, clause)
    addressed = [' '.join(ws) for _, _, ws in NAMES.addressed(opening)]
    _, wrong = NAMES.repair(opening, CONTACT[0])
    r.update({
        'disclosuresInOpening': nd, 'disclosingGroup': first_idx, 'openingGroups': ng, 'namesAddressed': addressed, 'wrongNames': wrong,
        'contactName': CONTACT[0],
        'firstAgentTurn': first_turn, 'firstAgentCaption': first_cap, 'firstSentence': fs,
        'affirmsAiFirstSentence': SAFETY.affirms_ai(fs), 'affirmsAiFirstTurn': SAFETY.affirms_ai(first_turn or first_cap),
        'aiMentionFirstSentence': bool(R.AI_RE.search(fs)),
        'guidanceSpoken': ('mentioned in passing' in low) or bool(clause and clause.strip().lower()[:24] in low),
        'blankName': bool(BLANK_RE.search(first_turn or first_cap)),
        'usesTesterName': bool(tester and re.search(re.escape(tester), first_turn + ' ' + first_cap, re.I)),
        'turnsAgent': len(ag), 'turnsCaller': len(ca), 'capsAgent': len(cap_ag), 'capsCaller': len(cap_ca),
        'agentCapsMissingFromTurns': [c[:80] for c in cap_ag if c.strip() and c.strip() not in turn_texts],
        'agentTurnTexts': [(t.get('text') or '')[:200] for t in ag],
    })
    return r

async def main():
    stack, n, outp = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    async with aiohttp.ClientSession() as s:
        cp = R.CP_(s)
        st, j = await cp.http('POST', '/v1/login', {'email': R.EMAIL, 'password': R.PASSWORD})
        if st != 200: raise SystemExit(f'login {st}')
        me = (await cp.http('GET', '/v1/me'))[1]
        full = (((me.get('member') or me.get('user') or {}).get('name')) or 'Asha')
        tester = full.split()[0]; CONTACT[0] = full
        aid = await agent_for(cp, stack)
        draft = (await cp.tool('agent.get', {'agentId': aid})).get('draft') or {}
        clause = (draft.get('opening') or {}).get('disclosureClause') or ''
        R.CLAUSE[0] = clause
        print(json.dumps({'stack': stack, 'agent': f'{PREFIX} {stack}', 'clause': clause, 'tester': tester}, ensure_ascii=False), flush=True)
        for k in range(n):
            try: r = await call(s, cp, aid, R.SCRIPTS[k % len(R.SCRIPTS)], stack, k, clause, tester)
            except Exception as e: r = {'stack': stack, 'k': k, 'fatal': repr(e)[:400]}
            with open(outp, 'a') as f: f.write(json.dumps(r, ensure_ascii=False) + '\n')
            print(json.dumps({x: r.get(x) for x in ('stack', 'k', 'conversationId', 'firstSentence', 'affirmsAiFirstSentence', 'aiMentionFirstSentence', 'guidanceSpoken', 'blankName',
                  'usesTesterName', 'disclosuresInOpening', 'disclosingGroup', 'namesAddressed', 'wrongNames', 'openingAudioAfterJoinMs', 'placedToFirstReplyS', 'turnsAgent', 'capsAgent', 'turnsCaller', 'capsCaller', 'agentCapsMissingFromTurns', 'endReason', 'durationS',
                  'costInrMilli', 'socketGaps', 'errors', 'fatal')}, ensure_ascii=False), flush=True)
            await asyncio.sleep(3)

asyncio.run(main())
