#!/bin/bash
# 3 sequential requests (>= 1.5 s apart) to the Vertex OpenAI-compatible endpoint with the judge's exact request shape, a
# 20 s timeout instead of the judge's 800 ms, to see whether the endpoint answers and how fast. Prints status/latency only.
S=/opt/vp-stage
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; sleep 30
done
cd $S/app/product/voice && $S/venv/bin/python - <<'PY'
import asyncio, json, time, aiohttp
from vpvoice.providers.google import VertexToken, DEFAULT_MODELS
from vpvoice import stacks
sa = json.load(open('/opt/vp-stage/vertex-sa.json'))
J = json.load(open('/opt/vp-stage/app/product/shared/safety/judge.json'))['judges']['caller_crisis']
URL = f"https://aiplatform.googleapis.com/v1/projects/{sa['project_id']}/locations/global/endpoints/openapi/chat/completions"
LINES = ['aaj itni garmi hai, main to mar hi gaya', 'premium kab tak bharna hai?', 'sab khatam karna chahta hoon, ab jeene ka mann nahi']
async def main():
    async with aiohttp.ClientSession() as h:
        tok = await VertexToken(sa).get(h)
        for i, line in enumerate(LINES):
            body = {'model': 'google/' + DEFAULT_MODELS[stacks.STACKS['v2-flashlite']['components']['brain']], 'messages': [{'role': 'system', 'content': J['system_prompt']},
                    {'role': 'user', 'content': J['user_template'].replace('{prev}', '').replace('{text}', line)}],
                    'max_completion_tokens': J['max_tokens'], 'temperature': J['temperature'], 'response_format': {'type': 'json_object'}}
            t0 = time.monotonic()
            try:
                async with h.post(URL, json=body, headers={'Authorization': 'Bearer ' + tok}, timeout=aiohttp.ClientTimeout(total=20)) as r:
                    txt = await r.text(); ms = int((time.monotonic() - t0) * 1000)
                    out = {'i': i, 'status': r.status, 'ms': ms}
                    try:
                        d = json.loads(txt); ch = (d.get('choices') or [{}])[0]
                        out.update({'finish': ch.get('finish_reason'), 'content': (ch.get('message') or {}).get('content'), 'usage': d.get('usage')})
                    except Exception: out['body_head'] = txt[:160]
                    if r.status != 200: out['error'] = txt[:240]
            except Exception as e: out = {'i': i, 'exc': repr(e)[:160], 'ms': int((time.monotonic() - t0) * 1000)}
            print(json.dumps(out, ensure_ascii=False)); await asyncio.sleep(1.5)
asyncio.run(main())
PY
