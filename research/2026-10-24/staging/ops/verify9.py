# Stage 8 config fix (2026-10-24): verify the control-plane models and the recordings on staging (9b34ff7), ON THE VM.
# One NEW workspace "Config Check" (member "Config Checker", email config+<unix ts>@example.com, a random password made
# here and kept only in this process). The owner's workspace is not touched. Through the product's own API only:
#   1. test.chat: one exchange (her opening from the saved draft, then one typed caller line and her reply);
#   2. test.simulate: one practice-caller run on the default stack (the first library caller), turns and outcome;
#   3. the Operator: "What does this workspace have so far?": the first 300 characters and the tools it called;
#   4. one browser test call driven by the synthetic clips (replygap.one_call, as testbuild-9b34ff7.md; never a phone);
#   5. on that call: the analysis completes with an outcome; the recording link answers 200 through :8443 with an audio
#      content type (basic auth from the protected parameters; the signed link itself is never printed).
# Spend: the job's cap is INR 40. Before each model step the spend so far, read from the DB (calls, priced cost lines,
# token-only cost lines and test runs priced at op7's Azure rates) plus the step's worst case must stay within the cap.
# Usage (VM): /opt/vp-stage/venv/bin/python verify9.py OUT.json JOB_START_UTC
import asyncio, json, os, re, secrets, subprocess, sys, time, types
import aiohttp

CP = os.environ.get('VPS_CP', 'http://127.0.0.1:8091')
PUB = os.environ.get('VPS_PUB', 'https://vp-voicelab-1019.centralindia.cloudapp.azure.com:8443')
TOOLS_DIR = os.environ.get('VPS_TOOLS', '/opt/vp-stage/tools')
PSQL = json.loads(os.environ.get('VPS_PSQL', '["runuser", "-u", "vpstage", "--", "psql", "-d", "vp_stage"]'))   # a local dry run points it elsewhere
OUT, JOB = sys.argv[1], sys.argv[2]
CAP = 40.0
RATE = {'mini': (41.8, 167.2), 'gpt41': (190.0, 760.0)}           # INR per 1M tokens (op7's Azure rates)
STEPS, HTTP, OUTD = [], [], {}
QUESTION = 'What does this workspace have so far?'

def now(): return time.strftime('%H:%M:%S', time.gmtime())
def step(name, ok, status, note, **extra):
    r = {'step': name, 'pass': bool(ok), 'status': status, 'note': str(note)[:400], 'at': now(), **extra}
    STEPS.append(r); print(json.dumps({k: r[k] for k in ('step', 'pass', 'status', 'note', 'at')}, ensure_ascii=False), flush=True)

def rate_of(model):
    m = (model or '').lower()
    return RATE['mini'] if 'mini' in m else RATE['gpt41'] if '4.1' in m or 'gpt41' in m else RATE['gpt41']   # unknown: the dearer rate

def q(sql):
    r = subprocess.run(PSQL + ['-At', '-c', sql], capture_output=True, text=True, cwd='/tmp', timeout=60)
    return r.stdout.strip()

EXTRA = {'chat_inr': 0.0}           # token use the DB does not keep (test.chat answers its usage; nothing stores it)
def db_spend():
    calls = int(q(f"SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE started_at >= '{JOB}+00'") or 0) / 1000
    priced = int(q(f"SELECT coalesce(sum(inr_milli),0) FROM cost_line WHERE conversation_id IS NULL AND inr_milli > 0 AND created_at >= '{JOB}+00'") or 0) / 1000
    tok = 0.0
    for l in q(f"SELECT coalesce(detail->>'model',''), coalesce((detail->>'inputTokens')::int,0), coalesce((detail->>'outputTokens')::int,0), quantity FROM cost_line WHERE unit = 'token' AND inr_milli = 0 AND (component = 'analysis' OR conversation_id IS NULL) AND created_at >= '{JOB}+00'").splitlines():
        m, i, o, qty = l.split('|'); i, o = int(i), int(o)
        if not i and not o: i = int(float(qty))
        pin, pout = rate_of(m); tok += (i * pin + o * pout) / 1e6
    runs = 0.0
    for l in q(f"SELECT coalesce((usage->>'inputTokens')::int,0), coalesce((usage->>'outputTokens')::int,0) FROM agent_test_run WHERE created_at >= '{JOB}+00'").splitlines():
        i, o = map(int, l.split('|')); runs += (i * RATE['mini'][0] + o * RATE['mini'][1]) / 1e6
    total = calls + priced + tok + runs + EXTRA['chat_inr']
    return {'calls': round(calls, 3), 'operatorPriced': round(priced, 3), 'tokenLines': round(tok, 3), 'testRuns': round(runs, 3), 'chat': round(EXTRA['chat_inr'], 3), 'total': round(total, 3)}

def guard(what, worst):
    s = db_spend()
    ok = s['total'] + worst <= CAP
    print(json.dumps({'guard': what, 'spendSoFar': s, 'worstCase': worst, 'go': ok}), flush=True)
    if not ok: step(what, False, None, f"not run: spend so far INR {s['total']:.2f} + worst case {worst} would pass INR {CAP}")
    return ok

class Session:
    def __init__(self, s): self.s = s; self.cookie = ''
    async def http(self, method, path, body=None):
        h = {'content-type': 'application/json'}
        if self.cookie: h['cookie'] = self.cookie
        async with self.s.request(method, CP + path, headers=h, data=None if body is None else json.dumps(body), timeout=aiohttp.ClientTimeout(total=240)) as r:
            sc = r.headers.get('set-cookie') or ''
            if sc.startswith('vp_session='): self.cookie = sc.split(';')[0]
            raw = await r.read(); st = r.status
        HTTP.append({'at': now(), 'm': method, 'p': path.split('?')[0][:80], 's': st})
        try: return st, json.loads(raw or b'{}')
        except Exception: return st, {'_raw': raw[:200].decode('utf8', 'replace')}
    async def tool(self, name, args=None): return await self.http('POST', '/v1/tools/' + name, {'args': args or {}})

def ok(j): return isinstance(j, dict) and j.get('status') == 'confirmed'
def res(j):
    r = (j or {}).get('result') if isinstance(j, dict) else None
    return r if isinstance(r, dict) else {}
def why(j):
    if not isinstance(j, dict): return str(j)[:200]
    e = j.get('error')
    return j.get('reason') or (e.get('message') if isinstance(e, dict) else e) or j.get('status') or json.dumps(j)[:200]

async def main():
    OUTD['started'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()); OUTD['spendBefore'] = db_spend()
    print(json.dumps({'spendBefore': OUTD['spendBefore']}), flush=True)
    async with aiohttp.ClientSession() as s:
        me = Session(s)
        email = f'config+{int(time.time())}@example.com'; password = secrets.token_urlsafe(18)
        st, j = await me.http('POST', '/v1/signup', {'workspace': 'Config Check', 'name': 'Config Checker', 'email': email, 'password': password})
        ws = j.get('workspaceId'); OUTD['workspaceId'] = ws
        step('signup "Config Check"', st == 201 and ws, st, f'workspace {ws}' if ws else why(j))
        if not ws: return finish()
        st, j = await me.tool('wallet.get'); step('wallet (trial credit)', ok(j) and res(j).get('balanceInrMilli') == 5_000_000, st, f"{res(j).get('balanceInrMilli')} milli, state {res(j).get('state')}")
        if not guard('agent.create', 2.0): return finish()
        st, j = await me.tool('agent.create', {'name': 'Config Agent', 'templateId': 'insurance-renewal'})
        a = res(j); aid = a.get('agentId'); rv = a.get('review') or {}
        OUTD['agent'] = {'id': aid, 'review': rv}
        step('agent.create (template; the brief review now has a model)', ok(j) and aid, st,
             f"draft {aid}; compiles {a.get('compiles')}; review mode {rv.get('mode')}: {rv.get('label')}; findings {len(rv.get('findings') or [])}" if ok(j) else why(j))
        if not aid: return finish()
        st, j = await me.tool('agent.get', {'agentId': aid}); g = res(j); draft = g.get('draft') or {}
        stack = (g.get('stack') or {}).get('id') or (draft.get('voice') or {}).get('stackId')
        if not (draft.get('voice') or {}).get('voiceId'):
            st, j = await me.tool('stack.list'); sl = res(j)
            vp = next((x['components'].get('voice') for x in sl.get('stacks', []) if x.get('id') == stack), None)
            dv = next((c.get('defaultVoice') for c in sl.get('components', []) if c.get('part') == 'voice' and c.get('id') == vp), None)
            if dv: st, j = await me.tool('voice.set', {'agentId': aid, 'voiceId': dv})
        OUTD['stack'] = stack

        # ---- 1. test.chat: one exchange
        if guard('test.chat', 2.0):
            st1, j1 = await me.tool('test.chat', {'agentId': aid})
            r1 = res(j1); opening = r1.get('said') or ''
            u = r1.get('usage') or {}
            st2, j2, r2 = None, {}, {}
            if ok(j1):
                st2, j2 = await me.tool('test.chat', {'agentId': aid, 'history': [{'who': 'agent', 'text': opening}], 'message': 'Haan ji, boliye. Aap kaun bol rahi hain?'})
                r2 = res(j2)
            u2 = r2.get('usage') or {}
            EXTRA['chat_inr'] = ((u.get('inputTokens', 0) + u2.get('inputTokens', 0)) * RATE['mini'][0] + (u.get('outputTokens', 0) + u2.get('outputTokens', 0)) * RATE['mini'][1]) / 1e6
            OUTD['chat'] = {'opening': opening[:400], 'reply': (r2.get('said') or '')[:400], 'notes': r2.get('notes'), 'signals': r2.get('signals'),
                            'usage': [u, u2], 'statuses': [st1, st2], 'reasons': [None if ok(j1) else why(j1), None if ok(j2) else why(j2)]}
            step('test.chat (one exchange)', ok(j1) and ok(j2) and bool((r2.get('said') or '').strip()), f'{st1}/{st2}',
                 f"opening {opening[:110]!r} | caller 'Haan ji, boliye. Aap kaun bol rahi hain?' | her reply {(r2.get('said') or '')[:140]!r}" if ok(j1) and ok(j2) else f"{why(j1) if not ok(j1) else why(j2)}")

        # ---- 2. test.simulate: one practice-caller run
        if guard('test.simulate', 4.0):
            st, j = await me.tool('simcaller.list', {'agentId': aid}); callers = res(j).get('callers') or []
            c0 = callers[0] if callers else None
            st, j = await me.tool('test.simulate', {'agentId': aid, 'simCallerId': c0['id'], 'maxTurns': 8}) if c0 else (None, {'reason': 'no practice caller'})
            sm = res(j); tr = sm.get('transcript') or []
            grades = [{'check': g.get('check') or g.get('id') or g.get('name'), 'pass': g.get('pass')} for g in (sm.get('grades') or [])]
            OUTD['simulate'] = {'caller': c0 and c0.get('id'), 'turns': len(tr), 'passed': sm.get('passed'), 'endedBy': sm.get('endedBy'), 'grades': grades,
                                'door': len(sm.get('door') or []), 'usage': sm.get('usage'), 'transcript': [{'who': t.get('who') or t.get('speaker') or t.get('role'), 'text': (t.get('text') or t.get('content') or '')[:160]} for t in tr]}
            step('test.simulate (practice caller, default stack)', ok(j) and len(tr) > 0, st,
                 f"caller {c0 and c0.get('id')}: {len(tr)} turns, ended by {sm.get('endedBy')}, passed {sm.get('passed')} ({sum(1 for g in grades if g['pass'])}/{len(grades)} checks)" if ok(j) else why(j))

        # ---- 3. the Operator
        if guard('Operator chat', 19.0):         # operator/loop.ts CAPS at lab-gpt41: 60,000 tokens in + 8 x 1,200 out = INR 18.7
            st, j = await me.http('POST', '/v1/operator/threads', {'title': 'Config check'})
            tid = ((j or {}).get('thread') or {}).get('id')
            risk = {t['name']: t.get('risk') for t in ((await me.http('GET', '/v1/tools'))[1].get('tools') or [])}
            frames, ans, tools_, errs, done = [], '', [], [], None
            if tid:
                async with s.post(CP + f'/v1/operator/threads/{tid}/messages', headers={'content-type': 'application/json', 'cookie': me.cookie},
                                  data=json.dumps({'text': QUESTION}), timeout=aiohttp.ClientTimeout(total=300)) as r:
                    ost = r.status; buf = (await r.read()).decode('utf8', 'replace')
                HTTP.append({'at': now(), 'm': 'POST', 'p': '/v1/operator/threads/:id/messages', 's': ost})
                for blk in buf.split('\n\n'):
                    d = next((l[6:] for l in blk.split('\n') if l.startswith('data: ')), None)
                    if not d: continue
                    try: e = json.loads(d)
                    except Exception: continue
                    frames.append(e.get('type'))
                    if e.get('type') == 'delta': ans += e.get('text', '')
                    elif e.get('type') == 'step' and e.get('status') == 'running': tools_.append(e.get('tool'))
                    elif e.get('type') in ('error', 'notice'): errs.append(f"{e['type']}: {e.get('text', '')[:200]}")
                    elif e.get('type') == 'card': tools_.append('card:' + str((e.get('card') or {}).get('type')))
                    elif e.get('type') == 'done': done = e
                nonread = [t for t in tools_ if not t.startswith('card:') and risk.get(t) != 'read']
                OUTD['operator'] = {'status': ost, 'answer300': ans[:300], 'answerChars': len(ans), 'tools': tools_, 'toolRisks': {t: risk.get(t) for t in tools_ if not t.startswith('card:')},
                                    'nonRead': nonread, 'errors': errs, 'done': done, 'frames': sorted(set(f for f in frames if f))}
                step('Operator chat', ost == 200 and ans.strip() and not nonread and not [x for x in errs if x.startswith('error')], ost,
                     f"tools {tools_} ({'all read' if not nonread else 'NOT read: ' + str(nonread)}); llmCalls {(done or {}).get('llmCalls')}, tokens {(done or {}).get('tokens')}; answer: {ans[:200]!r}" if ans.strip() else f"no answer; {'; '.join(errs)[:250]}")
            else:
                step('Operator chat', False, st, f'thread not created: {why(j)}')

        # ---- 4. one browser test call, 5. its analysis and recording
        if guard('browser test call', 10.0):
            await call(s, me, aid, stack)
    return finish()

async def call(s, me, aid, stack):
    p = os.path.join(TOOLS_DIR, 'replygap.py')
    R = types.ModuleType('replygap')
    exec(compile(open(p).read().replace('\nasyncio.run(main())', '\n'), p, 'exec'), R.__dict__)
    rc = R.CP_(s); rc.cookie = me.cookie
    try:
        g = await rc.tool('agent.get', {'agentId': aid})
        R.CLAUSE[0] = ((g.get('draft') or {}).get('opening') or {}).get('disclosureClause') or ''
        r = await R.one_call(s, rc, aid, R.SCRIPTS[0], stack, 0)
    except Exception as e:
        step('browser test call', False, None, f'did not complete: {repr(e)[:240]}'); OUTD['call'] = {'fatal': repr(e)[:400]}; return
    HTTP.append({'at': now(), 'm': 'POST', 'p': '/v1/tools/test.browser_call', 's': 200})
    cid = r['conversationId']; rec = {}; t0 = time.time()
    while True:                                         # analysis runs when call.ended arrives (and the sweep retries)
        st, j = await me.tool('call.get', {'conversationId': cid}); rec = res(j)
        terminal = (rec.get('analysis') or {}).get('status') in ('done', 'failed', 'not_configured', 'skipped')
        if (terminal and (rec.get('recording') or {}).get('url')) or time.time() - t0 > 240: break
        await asyncio.sleep(10)
    OUTD['callWaitS'] = round(time.time() - t0)
    an = rec.get('analysis') or {}; recd = rec.get('recording') or {}; turns = rec.get('turns') or []; cost = rec.get('cost') or {}
    OUTD['call'] = {'conversationId': cid, 'stack': stack, 'combinationId': (rec.get('runManifest') or {}).get('combinationId'), 'status': rec.get('status'),
                    'endReason': rec.get('endReason'), 'durationS': rec.get('durationS'), 'turnsAgent': len([t for t in turns if t.get('speaker') == 'agent']),
                    'turnsCaller': len([t for t in turns if t.get('speaker') == 'caller']), 'transcriptLines': len(rec.get('transcript') or []), 'socketGaps': r.get('socketGaps'),
                    'analysis': {k: (an.get(k)[:300] if isinstance(an.get(k), str) else an.get(k)) for k in ('status', 'reason', 'reasonCode', 'modelReasonCode', 'model', 'summary', 'outcomeGuess', 'outcomeUnclear',
                                 'outcomeConfidence', 'judge_calls', 'judge_shadow', 'judge_unavailable', 'tier', 'wouldEscalate') if k in an},
                    'analysisKeys': sorted(an), 'outcome': rec.get('outcome'), 'outcomes': rec.get('outcomes'), 'reason': rec.get('reason'),
                    'recording': {'hasUrl': bool(recd.get('url')), 'why': recd.get('why'), 'recordingUri': bool(rec.get('recordingUri')), 'expiresAt': recd.get('expiresAt')},
                    'cost': {'totalInrMilli': cost.get('totalInrMilli'), 'byComponent': r.get('costByComponent'), 'lines': len(cost.get('lines') or [])},
                    'safety': rec.get('safety'), 'judgeMarks': rec.get('judgeMarks'), 'firstAgentText': r.get('firstAgentText'), 'agentTurns': [(t.get('text') or '')[:200] for t in turns if t.get('speaker') == 'agent']}
    c = OUTD['call']
    step('browser test call', c['status'] == 'done' and c['turnsAgent'] > 0 and c['turnsCaller'] > 0, 200,
         f"{cid}: {c['combinationId']}, {c['durationS']} s, end {c['endReason']}, agent/caller turns {c['turnsAgent']}/{c['turnsCaller']}, reply gaps {c['socketGaps']}, INR {(cost.get('totalInrMilli') or 0) / 1000:.2f}")
    og = an.get('outcomeGuess') or {}
    outcome = og.get('value') or rec.get('outcome') or next((o.get('value') for o in (rec.get('outcomes') or []) if o.get('value')), None)
    step('call: analysis completes with an outcome', an.get('status') == 'done' and bool(outcome), 200,
         f"analysis {an.get('status')}{' (' + str(an.get('reason')) + ')' if an.get('reason') else ''} on {an.get('model')}; outcome {outcome!r}"
         f"{' quoting ' + repr((og.get('quote') or '')[:80]) if og else ''}; unclear {json.dumps(an.get('outcomeUnclear'), ensure_ascii=False)[:100]}; model reason code {an.get('modelReasonCode')}; "
         f"outcome column {rec.get('outcome')!r}; summary {(an.get('summary') or '')[:120]!r}")
    if recd.get('url') and recd['url'].startswith(PUB + '/rt/'):
        user, pw = os.environ.get('VP_STAGE_USER') or 'vp', os.environ.get('VP_STAGE_PASS') or ''
        async with s.get(recd['url'], auth=aiohttp.BasicAuth(user, pw), timeout=aiohttp.ClientTimeout(total=60)) as rr:
            body = await rr.read(); ctype = rr.headers.get('content-type'); rst = rr.status
        HTTP.append({'at': now(), 'm': 'GET', 'p': ':8443/rt/v1/recordings/:id', 's': rst})
        riff = body[:4] == b'RIFF' and body[8:12] == b'WAVE'
        dur = None
        if riff and len(body) > 44:
            import struct
            ch, sr, bps = struct.unpack('<H', body[22:24])[0], struct.unpack('<I', body[24:28])[0], struct.unpack('<H', body[34:36])[0]
            dur = round((len(body) - 44) / (sr * ch * bps / 8), 1) if sr and ch and bps else None
        OUTD['call']['recordingFetch'] = {'status': rst, 'contentType': ctype, 'bytes': len(body), 'wav': riff, 'approxSeconds': dur}
        step('call: recording link answers through :8443', rst == 200 and (ctype or '').startswith('audio/'), rst, f"content type {ctype}, {len(body)} bytes, WAV {riff}, about {dur} s")
        async with s.get(recd['url'], timeout=aiohttp.ClientTimeout(total=30)) as rr: nst = rr.status
        step('call: the same link without basic auth', nst == 401, nst, 'Caddy still demands the staging passcode')
    else:
        step('call: recording link answers through :8443', False, None, f"no :8443 link: {recd.get('why') or ('base ' + recd['url'].split('/v1/')[0] if recd.get('url') else '')}")

def finish():
    OUTD['spendAfter'] = db_spend(); OUTD['ended'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    OUTD['steps'] = STEPS; OUTD['http'] = HTTP
    OUTD['summary'] = {'steps': len(STEPS), 'pass': sum(1 for x in STEPS if x['pass']), 'fail': sum(1 for x in STEPS if not x['pass'])}
    with open(OUT, 'w') as f: json.dump(OUTD, f, ensure_ascii=False, indent=1)
    print('SPEND', json.dumps(OUTD['spendAfter'])); print('SUMMARY', json.dumps(OUTD['summary']), flush=True)

asyncio.run(main())
