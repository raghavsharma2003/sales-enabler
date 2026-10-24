# Stage 8, step 4b (2026-10-24): the owner's account on staging, ON THE VM. The integrator generated the login; it
# arrives ONLY as the protected parameters VP_OWNER_EMAIL and VP_OWNER_PASSWORD (environment variables of this Run
# Command). Neither is printed, logged or written: the output names the workspace id and statuses only.
#   POST /v1/signup  workspace "Vyakti Test Workspace", name "Owner", that email and password  -> want 201
#   GET  /v1/me with the signup session                                                       -> want 200, same workspace
#   wallet.get                                                                                 -> want INR 5,000, not blocked
#   agent.list, contact.list, campaign.list, audience.list                                     -> want all empty
# Nothing else is done in the workspace (reads only after sign-up).
# Usage (VM): /opt/vp-stage/venv/bin/python owner8.py OUT.json
import asyncio, json, os, sys, time
import aiohttp

CP = os.environ.get('VPS_CP', 'http://127.0.0.1:8091')
OUT = sys.argv[1]
STEPS = []

def step(name, ok, status, note):
    r = {'step': name, 'pass': bool(ok), 'status': status, 'note': str(note)[:240], 'at': time.strftime('%H:%M:%S', time.gmtime())}
    STEPS.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)

async def main():
    email, password = os.environ.get('VP_OWNER_EMAIL', ''), os.environ.get('VP_OWNER_PASSWORD', '')
    out = {'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    if not email or not password:
        step('parameters', False, None, 'VP_OWNER_EMAIL / VP_OWNER_PASSWORD not passed'); return done(out)
    step('parameters', True, None, 'both passed as protected parameters (values not shown)')
    cookie = ['']
    async with aiohttp.ClientSession() as s:
        async def http(method, path, body=None):
            h = {'content-type': 'application/json'}
            if cookie[0]: h['cookie'] = cookie[0]
            async with s.request(method, CP + path, headers=h, data=None if body is None else json.dumps(body), timeout=aiohttp.ClientTimeout(total=60)) as r:
                sc = r.headers.get('set-cookie') or ''
                if sc.startswith('vp_session='): cookie[0] = sc.split(';')[0]
                try: j = await r.json(content_type=None)
                except Exception: j = {}
                return r.status, j or {}
        async def tool(name, args=None):
            st, j = await http('POST', '/v1/tools/' + name, {'args': args or {}})
            return st, j, (j.get('result') or {}) if j.get('status') == 'confirmed' else None
        st, j = await http('POST', '/v1/signup', {'workspace': 'Vyakti Test Workspace', 'name': 'Owner', 'email': email, 'password': password})
        ws = j.get('workspaceId'); out['workspaceId'] = ws
        # an error body names no email (app.ts: 'that email already has a workspace; sign in instead'); keep only its code
        step('signup', st == 201 and ws and cookie[0], st, f'workspace {ws}' if st == 201 else f"refused: {(j.get('error') or {}).get('code') if isinstance(j.get('error'), dict) else j.get('code') or 'see status'}")
        if st != 201: return done(out)
        st, j = await http('GET', '/v1/me')
        w = j.get('workspace') or {}; m = j.get('member') or {}
        step('me (signup session)', st == 200 and w.get('id') == ws and w.get('name') == 'Vyakti Test Workspace' and m.get('role') == 'owner', st,
             f"workspace '{w.get('name')}' plan {w.get('plan')} status {w.get('status')}; member '{m.get('name')}' role {m.get('role')}; via {j.get('via')}")
        st, j, wv = await tool('wallet.get')
        wv = wv or {}
        step('wallet (trial credit)', wv.get('balanceInrMilli') == 5_000_000 and wv.get('state') != 'blocked', st,
             f"balance {wv.get('balanceInrMilli')} milli ({(wv.get('display') or {}).get('balance')}), state {wv.get('state')}")
        out['wallet'] = {k: wv.get(k) for k in ('state', 'balanceInrMilli', 'heldInrMilli', 'availableInrMilli')}
        counts = {}
        for name, key in (('agent.list', 'agents'), ('contact.list', 'contacts'), ('campaign.list', 'campaigns'), ('audience.list', 'audiences')):
            st, j, r = await tool(name, {'limit': 10} if name == 'contact.list' else {})
            counts[key] = len((r or {}).get(key, [])) if r is not None else None
            step(f'{name} (empty)', r is not None and counts[key] == 0, st, f'{counts[key]} {key}')
        out['counts'] = counts
    return done(out)

def done(out):
    out['steps'] = STEPS; out['ended'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    out['summary'] = {'steps': len(STEPS), 'pass': sum(1 for x in STEPS if x['pass']), 'fail': sum(1 for x in STEPS if not x['pass'])}
    with open(OUT, 'w') as f: json.dump(out, f, indent=1)
    print('SUMMARY', json.dumps(out['summary']), 'workspace', out.get('workspaceId'), flush=True)

asyncio.run(main())
