# Stage 8 (2026-10-24, staging at 9b34ff7): the buyer-journey smoke, run ON THE VM against the control plane on
# 127.0.0.1:8091, and the listed checks through Caddy on :8443. Only the product's own API: /v1/signup, /v1/login, /v1/me,
# /v1/tools, /v1/tools/:name, /v1/actions, /v1/actions/:id/decide, the Operator's /v1/operator/threads routes, and the
# runtime's browser media socket for the one test call. One NEW workspace, synthetic data only:
#   workspace "Smoke Test Co", member "Smoke Tester", email smoke+<unix ts>@example.com, a random password made here and
#   kept only in this process (never printed, never written).
# Tool names and inputs come from GET /v1/tools and the modules' STATUS.json / code at 9b34ff7, never guessed.
# Approvals: only the import commit (if it asks for one) and the agent's version.publish are approved. The campaign
# LAUNCH is proposed so its approval card can be read, and is NEVER approved (telephony is off; nothing may dial).
# The one browser test call reuses ../tools/replygap.py's one_call (as verify_calls.py does: the same clips, waits and
# test.browser_call, which never dials a phone), signed in as the smoke member instead of the seed account.
# Every step is recorded as pass/fail with its HTTP status and a one-line reason; nothing secret is printed. The basic-auth
# passcode for :8443 arrives as the protected parameter VP_STAGE_PASS and is used only in request headers.
# Usage (VM): /opt/vp-stage/venv/bin/python smoke8.py OUT.json
import asyncio, json, os, re, secrets, sys, time, types
import aiohttp

CP = os.environ.get('VPS_CP', 'http://127.0.0.1:8091')
PUB = os.environ.get('VPS_PUB', 'https://vp-voicelab-1019.centralindia.cloudapp.azure.com:8443')
TOOLS_DIR = os.environ.get('VPS_TOOLS', '/opt/vp-stage/tools')
NO_CALL = os.environ.get('VPS_NO_CALL') == '1'          # dry runs only (no runtime): skip the browser call
OUT = sys.argv[1]
T0 = time.time()
STEPS, HTTP, FIVEXX = [], [], []
CSV = ('Name,Mobile,Language,City\n'
       'Rohan Kapoor,+91 90000 00021,Hindi,Pune\n'
       'Meera Pillai,+91 90000 00022,Hinglish,Kochi\n'
       'Arjun Sethi,+91 90000 00023,Hindi,Indore\n')     # made-up people; numbers in the synthetic +91 90000 000xx range
NOTE = ('Smoke Test Co is a made-up business used for a staging test. Its office is open 10 am to 6 pm, Monday to '
        'Saturday, and it never asks anyone for an OTP.')
QUESTION = 'What does this workspace have so far?'

def now(): return time.strftime('%H:%M:%S', time.gmtime())

def step(name, ok, status, note, **extra):
    r = {'step': name, 'pass': bool(ok), 'status': status, 'note': str(note)[:300], 'at': now(), **extra}
    STEPS.append(r)
    print(json.dumps({k: v for k, v in r.items() if k in ('step', 'pass', 'status', 'note', 'at')}, ensure_ascii=False), flush=True)
    return r

class Session:
    def __init__(self, s): self.s = s; self.cookie = ''
    async def http(self, method, path, body=None, base=CP, auth=None, cookie=True, text=False):
        h = {'content-type': 'application/json'} if body is not None else {}
        if cookie and self.cookie: h['cookie'] = self.cookie
        try:
            async with self.s.request(method, base + path, headers=h, data=None if body is None else json.dumps(body), auth=auth,
                                      timeout=aiohttp.ClientTimeout(total=120)) as r:
                sc = r.headers.get('set-cookie') or ''
                if sc.startswith('vp_session='): self.cookie = sc.split(';')[0]
                raw = await r.read()
                st = r.status
        except Exception as e:
            HTTP.append({'at': now(), 'm': method, 'p': path.split('?')[0], 's': None, 'err': repr(e)[:120]})
            return None, {'error': repr(e)[:200]}
        HTTP.append({'at': now(), 'm': method, 'p': path.split('?')[0][:80], 's': st, 'base': 'cp' if base == CP else 'pub'})
        if st >= 500: FIVEXX.append({'at': now(), 'm': method, 'p': path.split('?')[0][:80], 's': st})
        if text: return st, raw
        try: return st, json.loads(raw or b'{}')
        except Exception: return st, {'_raw': raw[:200].decode('utf8', 'replace')}
    async def tool(self, name, args=None):
        return await self.http('POST', '/v1/tools/' + name, {'args': args or {}})

def ok(j): return isinstance(j, dict) and j.get('status') == 'confirmed'
def res(j): return (j or {}).get('result') or {}
def why(j):
    if not isinstance(j, dict): return str(j)[:200]
    return j.get('reason') or (j.get('error') if isinstance(j.get('error'), str) else json.dumps(j.get('error'))) or j.get('message') or j.get('status') or json.dumps(j)[:200]

async def main():
    out = {'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cp': CP, 'pub': PUB}
    async with aiohttp.ClientSession() as s:
        me = Session(s)
        email = f'smoke+{int(time.time())}@example.com'
        password = secrets.token_urlsafe(18)          # kept in this process only
        out['email'] = email

        # ---- 1. sign up, sign in, who am I, the tool list
        st, j = await me.http('POST', '/v1/signup', {'workspace': 'Smoke Test Co', 'name': 'Smoke Tester', 'email': email, 'password': password})
        ws = j.get('workspaceId')
        step('signup', st == 201 and ws, st, f'workspace {ws} created' if ws else why(j))
        out['workspaceId'] = ws
        if st != 201: return finish(out)
        me.cookie = ''
        st, j = await me.http('POST', '/v1/login', {'email': email, 'password': password})
        step('login', st == 200 and me.cookie, st, 'signed in with a fresh session cookie' if st == 200 else why(j))
        st, j = await me.http('GET', '/v1/me')
        w = (j or {}).get('workspace') or {}; m = (j or {}).get('member') or {}
        step('me', st == 200 and w.get('id') == ws and w.get('name') == 'Smoke Test Co' and m.get('role') == 'owner', st,
             f"workspace '{w.get('name')}' plan {w.get('plan')} status {w.get('status')}; member '{m.get('name')}' role {m.get('role')}; via {j.get('via')}")
        st, j = await me.http('GET', '/v1/tools')
        tl = {t['name']: t for t in (j or {}).get('tools', [])}
        need = ['wallet.get', 'invoice.get', 'template.list', 'agent.create', 'agent.get', 'brief.compile', 'knowledge.ingest', 'test.simulate', 'test.chat',
                'source.upload', 'source.map', 'source.commit', 'campaign.draft', 'campaign.launch', 'test.browser_call', 'call.get',
                'member.list', 'apikey.list', 'webhook.list', 'integration.list']
        missing = [n for n in need if n not in tl]
        out['tools'] = {'n': len(tl), 'missing': missing, 'test.chat': 'test.chat' in tl}
        step('tools', st == 200 and not missing, st, f'{len(tl)} tools; the {len(need)} this smoke uses are all listed' if not missing else f'missing {missing}')
        risk = {n: t.get('risk') for n, t in tl.items()}

        # ---- 2. wallet: the trial credit, state not blocked
        st, j = await me.tool('wallet.get')
        wv = res(j); out['wallet'] = wv
        bal = wv.get('balanceInrMilli', wv.get('balance_inr_milli'))
        state = wv.get('state'); wok = ok(j)
        step('wallet', ok(j) and bal == 5_000_000 and state != 'blocked', st, f'balance {bal} milli (INR {bal / 1000 if isinstance(bal, (int, float)) else bal}), state {state}' if ok(j) else why(j))
        st, j = await me.tool('invoice.get')
        iv = res(j); out['invoice'] = iv
        mi = [x for x in (iv.get('moneyIn') or []) if x.get('kind') == 'trial_credit']
        money_in = ', '.join('%s %s' % (x.get('label'), x.get('display')) for x in (iv.get('moneyIn') or []))
        step('invoice.get (statement shows the credit)', ok(j) and mi and mi[0].get('inrMilli') == 5_000_000, st,
             f"money in: {money_in}; cost {(iv.get('display') or {}).get('cost')}; period {json.dumps(iv.get('period'))}" if ok(j) else why(j))
        step('wallet caps (the product\'s own limits)', wok and bool(wv.get('caps')), 200, '; '.join(f"{c.get('label')}: {c.get('text')}"[:110] for c in (wv.get('caps') or []))[:280])

        # ---- 3. the guided start (the web composes it from four reads; there is no onboarding tool) + Today's brief
        reads = {}
        for name, args in (('agent.list', {}), ('call.search', {'includeTest': True, 'limit': 50}), ('contact.list', {'limit': 1}), ('campaign.list', {})):
            st, j = await me.tool(name, args); reads[name] = (st, ok(j), res(j))
        counts = {'agents': len(reads['agent.list'][2].get('agents', [])), 'calls': len(reads['call.search'][2].get('calls', [])),
                  'contacts': len(reads['contact.list'][2].get('contacts', [])), 'campaigns': len(reads['campaign.list'][2].get('campaigns', []))}
        step('guided start reads', all(v[1] for v in reads.values()) and not any(counts.values()), '/'.join(str(v[0]) for v in reads.values()),
             f'no onboarding tool at 9b34ff7: web/src/pages/start.tsx reads agent.list, call.search, contact.list, campaign.list; all empty {counts}')
        st, j = await me.tool('brief.today')
        bt = res(j)
        step("brief.today (Today)", ok(j), st, f'keys {sorted(bt)[:10]}' if ok(j) else why(j))

        # ---- 4. an agent from a template: create, read back, its checks
        st, j = await me.tool('template.list')
        tpls = res(j).get('templates', [])
        tpl = next((t for t in tpls if t['id'] == 'insurance-renewal'), tpls[0] if tpls else None)
        step('template.list', ok(j) and tpl, st, f"{len(tpls)} templates; using '{tpl and tpl['id']}' (the reply-gap / verify_calls template)")
        st, j = await me.tool('agent.create', {'name': 'Smoke Agent', 'templateId': tpl['id']})
        a = res(j); aid = a.get('agentId'); out['agentId'] = aid
        rv = a.get('review') or {}
        step('agent.create (template)', ok(j) and aid, st, f"draft {aid}; compiles {a.get('compiles')}; lint {len(a.get('lint') or [])}; stackChosen {a.get('stackChosen')}; review {json.dumps(rv, ensure_ascii=False)[:120]}" if ok(j) else why(j))
        if not aid: return finish(out)
        st, j = await me.tool('brief.edit', {'agentId': aid, 'patch': [{'op': 'set', 'path': 'brand.name', 'value': 'Smoke Test Co'}, {'op': 'set', 'path': 'brand.spokenName', 'value': 'Smoke Test Co'}]})
        step('brief.edit (adopt business name, as the web does after Create draft)', ok(j), st, f"{len(res(j).get('changes') or [])} change(s)" if ok(j) else why(j))
        st, j = await me.tool('agent.get', {'agentId': aid})
        g = res(j); draft = g.get('draft') or {}
        lint = g.get('lint') or []
        errs = [x for x in lint if (x.get('severity') or x.get('level')) in ('error', 'block', 'hard')]
        stack = (g.get('stack') or {}).get('id') or (draft.get('voice') or {}).get('stackId')
        out['agent'] = {'stack': stack, 'voice': draft.get('voice'), 'compiles': g.get('compiles'), 'lint': lint[:10], 'briefBytes': (g.get('brief') or {}).get('bytes')}
        step('agent.get (read back)', ok(j) and g.get('compiles') and not errs and stack, st,
             f"name '{(g.get('agent') or {}).get('name')}', stack {stack}, voice {(draft.get('voice') or {}).get('voiceId')}, compiles {g.get('compiles')}, brief {(g.get('brief') or {}).get('bytes')} bytes, lint {len(lint)} ({len(errs)} blocking)")
        st, j = await me.tool('brief.compile', {'config': draft})
        step('brief.compile (the one compile)', ok(j), st, f"hash {str(res(j).get('hash'))[:12]}" if ok(j) else why(j))
        # the default stack's voice, if the template left it empty (verify_calls.agent_for does the same)
        if not (draft.get('voice') or {}).get('voiceId'):
            st, j = await me.tool('stack.list')
            sl = res(j); vp = next((x['components'].get('voice') for x in sl.get('stacks', []) if x.get('id') == stack), None)
            dv = next((c.get('defaultVoice') for c in sl.get('components', []) if c.get('part') == 'voice' and c.get('id') == vp), None)
            if dv:
                st, j = await me.tool('voice.set', {'agentId': aid, 'voiceId': dv})
                step('voice.set (default voice of the default stack)', ok(j), st, f'{dv}' if ok(j) else why(j))

        # ---- 5. knowledge: one short synthetic note
        st, j = await me.tool('knowledge.ingest', {'title': 'smoke-note.txt', 'text': NOTE})
        k = res(j); src = k.get('sourceId')
        step('knowledge.ingest', ok(j) and src, st, f"source {src}; {json.dumps({x: k[x] for x in k if x != 'sourceId'}, ensure_ascii=False)[:160]}" if ok(j) else why(j))
        if src:
            st, j = await me.tool('knowledge.list', {'sourceId': src})
            spans = res(j).get('spans') or []
            st2, j2 = await me.tool('knowledge.span.approve', {'spanIds': [x['id'] for x in spans], 'decision': 'approved'}) if spans else (None, {})
            step('knowledge passages approved', ok(j) and spans and ok(j2), f'{st}/{st2}', f'{len(spans)} passage(s) approved' if ok(j2) else why(j2 or j))

        # ---- 6. practice caller (text simulation) and the typed test chat
        st, j = await me.tool('simcaller.list', {'agentId': aid})
        callers = res(j).get('callers') or []
        c0 = callers[0] if callers else None
        st, j = await me.tool('test.simulate', {'agentId': aid, 'simCallerId': c0['id'], 'maxTurns': 8}) if c0 else (None, {'reason': 'no practice caller listed'})
        sim = res(j)
        out['simulate'] = {'caller': c0 and c0.get('id'), 'status': j.get('status') if isinstance(j, dict) else None, 'reason': None if ok(j) else why(j),
                           'turns': len(sim.get('transcript') or []), 'passed': sim.get('passed'), 'endedBy': sim.get('endedBy'), 'usage': sim.get('usage')}
        step('test.simulate', ok(j), st, f"caller {c0 and c0.get('id')}: {len(sim.get('transcript') or [])} turns, passed {sim.get('passed')}, ended by {sim.get('endedBy')}" if ok(j) else f"caller {c0 and c0.get('id')}: {why(j)}")
        if 'test.chat' in tl:
            st, j = await me.tool('test.chat', {'agentId': aid})
            ch = res(j)
            out['chat'] = {'status': j.get('status') if isinstance(j, dict) else None, 'reason': None if ok(j) else why(j), 'reply': str(ch.get('said') or ch.get('reply') or '')[:300]}
            step('test.chat (one exchange)', ok(j), st, f"her reply: {str(ch.get('said') or ch.get('reply') or '')[:120]}" if ok(j) else why(j))
        else:
            step('test.chat (one exchange)', True, None, 'not in the tool list at 9b34ff7: skipped')

        # ---- 7. import: a 3-row synthetic CSV, preview, then commit
        st, j = await me.tool('source.upload', {'kind': 'csv', 'name': 'smoke-3.csv', 'text': CSV, 'filename': 'smoke-3.csv'})
        up = res(j); uid = up.get('uploadId')
        step('source.upload', ok(j) and uid, st, f"upload {uid}; source {up.get('sourceId') or (up.get('source') or {}).get('id')}" if ok(j) else why(j))
        audience = None
        if uid:
            st, j = await me.tool('source.map', {'uploadId': uid, 'agentId': aid})
            mp = res(j)
            prev = mp.get('preview') or []
            step('source.map (preview)', ok(j) and mp.get('rowsTotal') == 3, st,
                 f"rows {mp.get('rowsTotal')}, phones {json.dumps(mp.get('phones'))[:120]}, columns {[c.get('field') for c in (mp.get('columns') or [])]}, preview rows {len(prev)}" if ok(j) else why(j))
            st, j = await me.tool('source.commit', {'uploadId': uid, 'consentPurpose': 'service', 'audienceName': 'Smoke 3'})
            appr = None
            if isinstance(j, dict) and j.get('status') == 'needs_approval':
                appr = j.get('summary')
                st, j = await me.http('POST', f"/v1/actions/{j['actionId']}/decide", {'approve': True})
            cm = res(j); audience = cm.get('audienceId')
            step('source.commit', ok(j) and audience, st, (f"approval card: '{appr}'; " if appr else 'ran at once (risk draft, no approval card); ') +
                 (f"audience {audience}; {json.dumps({x: cm[x] for x in cm if x in ('imported', 'created', 'merged', 'rows', 'callable', 'counts', 'receiptId')}, ensure_ascii=False)[:160]}" if ok(j) else why(j)))
            st, j = await me.tool('contact.list', {'limit': 10})
            cs = res(j).get('contacts') or []
            step('contact.list after import', ok(j) and len(cs) == 3, st, f'{len(cs)} contacts: ' + ', '.join(f"{c.get('name') or c.get('display_name')} {c.get('e164')}" for c in cs)[:200])

        # ---- 8. publish the agent (its approval card IS approved: publishing dials nothing), then a campaign up to the
        #         launch approval card, which is NOT approved
        st, j = await me.tool('agent.get', {'agentId': aid})
        dh = res(j).get('draftHash')
        st, j = await me.tool('version.publish', {'agentId': aid, 'draftHash': dh, 'note': 'Smoke version 1'})
        pcard = j.get('summary') if isinstance(j, dict) else None
        if isinstance(j, dict) and j.get('status') == 'needs_approval':
            st, j = await me.http('POST', f"/v1/actions/{j['actionId']}/decide", {'approve': True})
        pv = res(j); vid = pv.get('versionId') or pv.get('id')
        step('version.publish (approved)', ok(j) and vid, st, f"card '{pcard}'; version {vid}" if ok(j) else f"card '{pcard}'; {why(j)}")
        cid = None
        if vid and audience:
            st, j = await me.tool('campaign.draft', {'name': 'Smoke campaign', 'category': 'service', 'agentVersionId': vid, 'audienceId': audience,
                                                     'window': {'days': [1, 2, 3, 4, 5, 6], 'ranges': [{'start': '10:00', 'end': '18:00'}]},
                                                     'retry': {'pattern': 'standard'}, 'capInrMilli': 500_000, 'concurrency': 1})
            cd = res(j); cid = cd.get('id')
            step('campaign.draft (hours, retries, cap)', ok(j) and cid, st, f"campaign {cid}, policy v{cd.get('policyVersion')}, warnings {cd.get('warnings')}" if ok(j) else why(j))
        if cid:
            st, j = await me.tool('campaign.get', {'id': cid})
            cg = res(j); pol = (cg.get('policy') or cg.get('campaign', {}).get('policy') or {})
            blk = cg.get('blockers') or cg.get('launchBlockers') or []
            out['campaign'] = {'id': cid, 'state': cg.get('state') or (cg.get('campaign') or {}).get('state'), 'window': pol.get('window'), 'retry': pol.get('retry'),
                               'capInrMilli': pol.get('capInrMilli'), 'blockers': blk}
            step('campaign.get', ok(j), st, f"state {out['campaign']['state']}; cap {pol.get('capInrMilli')}; retry {json.dumps(pol.get('retry'))[:80]}; {len(blk)} launch blocker(s): " +
                 '; '.join(str(b.get('message') if isinstance(b, dict) else b)[:70] for b in blk)[:200])
            st, j = await me.tool('campaign.estimate', {'id': cid})
            step('campaign.estimate', ok(j), st, json.dumps((res(j).get('display') or {}), ensure_ascii=False)[:200] if ok(j) else why(j))
            st, j = await me.tool('campaign.launch', {'id': cid})
            card = j.get('summary') if isinstance(j, dict) else None
            out['launchCard'] = {'status': j.get('status') if isinstance(j, dict) else None, 'summary': card, 'actionId': (j or {}).get('actionId'), 'risk': (j or {}).get('risk')}
            step('campaign.launch: approval card read, NOT approved', st == 202 and (j or {}).get('status') == 'needs_approval', st, f"card: '{card}' (risk {(j or {}).get('risk')}); not approved")
            st, j = await me.http('GET', '/v1/actions')
            acts = (j or {}).get('actions') or []
            step('GET /v1/actions (the card waits)', st == 200 and any(x.get('id') == out['launchCard']['actionId'] and x.get('status') == 'proposed' for x in acts), st,
                 f"{len(acts)} proposed: " + ', '.join(f"{x.get('tool')}" for x in acts))
            st, j = await me.tool('campaign.get', {'id': cid})
            step('campaign still a draft', ok(j) and (res(j).get('state') or (res(j).get('campaign') or {}).get('state')) == 'draft', st, f"state {res(j).get('state') or (res(j).get('campaign') or {}).get('state')}")

        # ---- 9. the Operator: one message; only read tools
        st, j = await me.http('POST', '/v1/operator/threads', {'title': 'Smoke'})
        tid = ((j or {}).get('thread') or {}).get('id')
        frames, ans, steps_, errs_ = [], '', [], []
        if tid:
            h = {'content-type': 'application/json', 'cookie': me.cookie}
            async with s.post(CP + f'/v1/operator/threads/{tid}/messages', headers=h, data=json.dumps({'text': QUESTION}), timeout=aiohttp.ClientTimeout(total=180)) as r:
                ost = r.status; HTTP.append({'at': now(), 'm': 'POST', 'p': '/v1/operator/threads/:id/messages', 's': ost, 'base': 'cp'})
                if ost >= 500: FIVEXX.append({'at': now(), 'm': 'POST', 'p': '/v1/operator/threads/:id/messages', 's': ost})
                buf = (await r.read()).decode('utf8', 'replace')
            for blk in buf.split('\n\n'):
                d = next((l[6:] for l in blk.split('\n') if l.startswith('data: ')), None)
                if not d: continue
                try: e = json.loads(d)
                except Exception: continue
                frames.append(e.get('type'))
                if e.get('type') == 'delta': ans += e.get('text', '')
                elif e.get('type') == 'step' and e.get('status') == 'running': steps_.append(e.get('tool'))
                elif e.get('type') in ('error', 'notice'): errs_.append(f"{e['type']}: {e.get('text', '')[:200]}")
                elif e.get('type') == 'card': steps_.append('card:' + str((e.get('card') or {}).get('type')))
            nonread = [t for t in steps_ if not t.startswith('card:') and risk.get(t) != 'read']
            out['operator'] = {'status': ost, 'frames': frames, 'tools': steps_, 'nonRead': nonread, 'answer300': ans[:300], 'errors': errs_}
            step('Operator chat', ost == 200 and ans.strip() and not nonread and not errs_, ost,
                 (f"answer: {ans[:160]!r}; tools {steps_} (all read)" if ans.strip() else f"no answer; {'; '.join(errs_)[:220]}; frames {frames}"))
        else:
            step('Operator chat', False, st, f'thread not created: {why(j)}')

        # ---- 10. one browser test call on the default stack (replygap.one_call: synthetic caller clips, never a phone)
        if NO_CALL:
            step('browser test call', False, None, 'skipped (dry run without a runtime)')
        else:
            await browser_call(s, me, aid, stack, out)

        # ---- 11. settings reads
        for name, args, what in (('member.list', {}, 'team/roles'), ('apikey.list', {}, 'API keys'), ('webhook.list', {}, 'webhooks'),
                                 ('integration.list', {}, 'integrations'), ('invoice.get', {}, 'billing statement'), ('usage.get', {'groupBy': 'component'}, 'usage')):
            st, j = await me.tool(name, args)
            r_ = (j or {}).get('result') if isinstance(j, dict) else None
            if isinstance(r_, list): first_list = f'{len(r_)} rows'            # usage.get answers a list (fixed after the run: see testbuild-9b34ff7.md)
            else:
                r_ = r_ or {}
                first_list = next((f'{k} {len(v)}' for k, v in r_.items() if isinstance(v, list)), f'keys {sorted(r_)[:6]}')
            extra = ''
            if name == 'member.list': extra = '; ' + ', '.join(f"{x.get('name')} ({x.get('role')})" for x in (r_.get('members') or []))[:80]
            step(f'settings: {what} ({name})', ok(j), st, (first_list + extra) if ok(j) else why(j))

        # ---- 12. through Caddy on :8443
        user, pw = os.environ.get('VP_STAGE_USER') or 'vp', os.environ.get('VP_STAGE_PASS') or ''
        ba = aiohttp.BasicAuth(user, pw) if pw else None
        st, _ = await me.http('GET', '/', base=PUB, cookie=False, text=True)
        step(':8443 / without auth', st == 401, st, 'basic auth demanded' if st == 401 else 'expected 401')
        st, html = await me.http('GET', '/', base=PUB, auth=ba, cookie=False, text=True)
        html = (html or b'').decode('utf8', 'replace') if isinstance(html, (bytes, bytearray)) else ''
        title = (re.search(r'<title>([^<]*)', html) or [None, None])[1]
        step(':8443 / with auth (the app)', st == 200 and title, st, f'title {title!r}')
        assets = sorted(set(re.findall(r'(?:src|href)="(/assets/[^"]+\.(?:js|css))"', html)))
        res_a = []
        for p in assets:
            st, _ = await me.http('GET', p, base=PUB, auth=ba, cookie=False, text=True); res_a.append((p.rsplit('/', 1)[-1], st))
        step(':8443 JS and CSS assets', assets and all(x[1] == 200 for x in res_a) and any(p.endswith('.js') for p in assets) and any(p.endswith('.css') for p in assets),
             '/'.join(str(x[1]) for x in res_a), ', '.join(f'{n} {c}' for n, c in res_a)[:220])
        for p in ('/v1/health', '/rt/v1/health'):
            st, j = await me.http('GET', p, base=PUB, auth=ba, cookie=False)
            step(f':8443 {p}', st == 200, st, json.dumps(j)[:80] if p == '/v1/health' else f"ok {j.get('ok')}, activeCalls {j.get('activeCalls')}")
    return finish(out)

async def browser_call(s, me, aid, stack, out):
    """One test call the way verify_calls.py makes it: replygap.one_call (test.browser_call useDraft, the synthetic clips of
    SCRIPTS[0], real-time 16 kHz frames into the browser media socket, hang up after the last clip), then call.get."""
    p = os.path.join(TOOLS_DIR, 'replygap.py')
    R = types.ModuleType('replygap')
    exec(compile(open(p).read().replace('\nasyncio.run(main())', '\n'), p, 'exec'), R.__dict__)
    rc = R.CP_(s); rc.cookie = me.cookie        # the smoke member's session, not the seed account
    try:
        g = await rc.tool('agent.get', {'agentId': aid})
        R.CLAUSE[0] = ((g.get('draft') or {}).get('opening') or {}).get('disclosureClause') or ''
        r = await R.one_call(s, rc, aid, R.SCRIPTS[0], stack, 0)
    except Exception as e:
        step('browser test call', False, None, f'did not complete: {repr(e)[:240]}'); out['call'] = {'fatal': repr(e)[:400]}; return
    HTTP.append({'at': now(), 'm': 'POST', 'p': '/v1/tools/test.browser_call', 's': 200, 'base': 'cp'})
    cid = r['conversationId']
    rec = {}
    for _ in range(12):                          # the analysis is written after call.ended reaches the control plane
        st, j = await me.tool('call.get', {'conversationId': cid}); rec = res(j)
        if rec.get('status') not in ('live', None) and rec.get('analysis'): break
        await asyncio.sleep(5)
    turns = rec.get('turns') or []
    an = rec.get('analysis') or {}
    recd = rec.get('recording') or {}
    cost = rec.get('cost') or {}
    out['call'] = {'conversationId': cid, 'stack': stack, 'combinationId': (rec.get('runManifest') or {}).get('combinationId'), 'status': rec.get('status'),
                   'endReason': rec.get('endReason'), 'durationS': rec.get('durationS'), 'turnsAgent': len([t for t in turns if t.get('speaker') == 'agent']),
                   'turnsCaller': len([t for t in turns if t.get('speaker') == 'caller']), 'transcriptLines': len(rec.get('transcript') or []),
                   'socketGaps': r.get('socketGaps'), 'openingAudioAfterJoinMs': r.get('openingAudioAfterJoinMs'), 'placedToFirstReplyS': r.get('placedToFirstReplyS'),
                   'aiInFirstReply': r.get('aiInFirstReply'), 'firstAgentText': r.get('firstAgentText'), 'errors': r.get('errors'),
                   'recording': {'url': bool(recd.get('url')), 'why': recd.get('why'), 'recordingUri': bool(rec.get('recordingUri'))},
                   'analysis': {'status': an.get('status'), 'reason': an.get('reason'), 'reasonCode': an.get('reasonCode')}, 'outcome': rec.get('outcome'),
                   'reason': rec.get('reason'), 'cost': {'totalInrMilli': cost.get('totalInrMilli'), 'byComponent': r.get('costByComponent'), 'lines': len(cost.get('lines') or [])},
                   'fallbacksUsed': r.get('fallbacksUsed'), 'rtTimingError': r.get('rtTimingError')}
    c = out['call']
    step('browser test call (placed and closed)', c['status'] == 'done' and c['turnsAgent'] > 0 and c['turnsCaller'] > 0, 200,
         f"{cid}: {c['combinationId']}, {c['durationS']} s, end {c['endReason']}, agent/caller turns {c['turnsAgent']}/{c['turnsCaller']}, reply gaps {c['socketGaps']}")
    step('call log: transcript', c['transcriptLines'] > 0, 200, f"{c['transcriptLines']} transcript lines; first agent text {str(c['firstAgentText'])[:90]!r}")
    if recd.get('url'):
        u = recd['url']; public = u.startswith(PUB)
        user, pw = os.environ.get('VP_STAGE_USER') or 'vp', os.environ.get('VP_STAGE_PASS') or ''
        if public:
            st, body = await me.http('GET', u, base='', auth=aiohttp.BasicAuth(user, pw) if pw else None, cookie=False, text=True)
            step('call log: recording link answers through :8443', st == 200, st, f'{len(body or b"")} bytes from the :8443 address')
        else:
            step('call log: recording link answers through :8443', False, None, f"the link's base is {u.split('/v1/')[0]!r}, not the :8443 address (VP_RUNTIME_PUBLIC_URL unset)")
    else:
        step('call log: recording link answers through :8443', False, None, f"no link: {recd.get('why')}")
    step('call log: analysis and outcome', an.get('status') == 'done', 200, f"analysis {an.get('status')} ({an.get('reason')}); outcome {rec.get('outcome')}; reason code {(rec.get('reason') or {}).get('code')}")
    step('call log: cost', isinstance(cost.get('totalInrMilli'), (int, float)) and cost.get('totalInrMilli') > 0, 200,
         f"INR {(cost.get('totalInrMilli') or 0) / 1000:.2f} in {len(cost.get('lines') or [])} lines: {json.dumps(r.get('costByComponent'))[:120]}")

def finish(out):
    out['ended'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()); out['wallS'] = round(time.time() - T0, 1)
    out['steps'] = STEPS; out['http'] = HTTP; out['fiveXX'] = FIVEXX
    out['summary'] = {'steps': len(STEPS), 'pass': sum(1 for x in STEPS if x['pass']), 'fail': sum(1 for x in STEPS if not x['pass']), 'requests': len(HTTP), 'fiveXX': len(FIVEXX)}
    with open(OUT, 'w') as f: json.dump(out, f, ensure_ascii=False, indent=1)
    print('SUMMARY', json.dumps(out['summary']), flush=True)
    return out

asyncio.run(main())
