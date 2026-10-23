#!/bin/bash
# 2 sequential streaming requests (>= 2 s apart) to the v2-38flash brain model on Vertex global, the runtime's request
# shape (thinkingLevel low, as its catalog entry), 60 s timeout: time to first SSE data and to the end. Prints status/timing only.
S=/opt/vp-stage
cd $S/app/product/voice && $S/venv/bin/python - <<'PY'
import asyncio, json, time, aiohttp
from vpvoice.providers.google import VertexToken, DEFAULT_MODELS
from vpvoice import stacks, catalog
sa = json.load(open('/opt/vp-stage/vertex-sa.json'))
B = stacks.STACKS['v2-38flash']['components']['brain']          # the stack's own brain, looked up (no id written here)
M = DEFAULT_MODELS[B]; THINK = catalog.BRAINS[B].get('thinking', {})
URL = f"https://aiplatform.googleapis.com/v1/projects/{sa['project_id']}/locations/global/publishers/google/models/{M}:streamGenerateContent?alt=sse"
async def main():
    async with aiohttp.ClientSession() as h:
        tok = await VertexToken(sa).get(h)
        for i, txt in enumerate(['Reply in one short Hinglish sentence: caller says "haan hello, kaun bol raha hai?"', 'Say namaste in one word.']):
            body = {'contents': [{'role': 'user', 'parts': [{'text': txt}]}], 'generationConfig': {'maxOutputTokens': 120, 'temperature': 0.6, 'thinkingConfig': THINK}}
            t0 = time.monotonic(); first = None; status = None; n = 0
            try:
                async with h.post(URL, json=body, headers={'Authorization': 'Bearer ' + tok}, timeout=aiohttp.ClientTimeout(total=60)) as r:
                    status = r.status; hdr = int((time.monotonic() - t0) * 1000)
                    if status != 200: print(json.dumps({'i': i, 'status': status, 'err': (await r.text())[:200]})); continue
                    async for line in r.content:
                        if line.startswith(b'data:'):
                            n += 1; first = first or int((time.monotonic() - t0) * 1000)
                    print(json.dumps({'i': i, 'status': status, 'hdr_ms': hdr, 'first_data_ms': first, 'end_ms': int((time.monotonic() - t0) * 1000), 'chunks': n}))
            except Exception as e:
                print(json.dumps({'i': i, 'status': status, 'exc': repr(e)[:160], 'ms': int((time.monotonic() - t0) * 1000)}))
            await asyncio.sleep(2)
asyncio.run(main())
PY
