# Brains: streaming chat completions, ported from voicelab/server/providers.py llm_stream(). One adapter per brain id
# (catalog.BRAINS); stream() yields text deltas and fills usage {'in','out','cached','usd'} and timing {'req','first','err'}.
import json, os, time
from .. import catalog
from .google import GoogleRoute


def az_host(endpoint): return endpoint.rstrip('/').replace('https://', '').replace('.cognitiveservices.azure.com', '.openai.azure.com')


class HttpBrain:
    def __init__(self, http, brain_id, env=None, google=None):
        self.http = http; self.id = brain_id; self.b = catalog.BRAINS[brain_id]; self.env = os.environ if env is None else env
        self.google = google or (GoogleRoute(self.env) if self.b['host'] == 'gm' else None)
        self.provider = catalog.BRAIN_PROVIDER.get(self.b['host'], 'brain')

    def host(self):
        h = self.b['host']; env = self.env
        if h == 'sv': return 'api.sarvam.ai'
        if h == 'or': return 'openrouter.ai'
        if h in ('sin', 'sea'):
            ep = env.get('LAB_AI_ENDPOINT' if h == 'sin' else 'VP_AI_ENDPOINT', '')
            return az_host(ep) if ep else None
        return None

    async def warm(self):
        """PREWARM (CascadeSession): open the brain host's connection before the request needs it."""
        if self.google is not None: await self.google.warm(self.http); return
        from .warm import warm_hosts
        warm_hosts(self.http, [self.host()])

    async def stream(self, messages, usage, timing, max_tokens=180):
        got = []
        try:
            async for d in self._stream(messages, usage, timing, max_tokens):
                got.append(d)
                yield d
        finally:
            # The door, a withdrawn speculative reply or a barge-in can close the stream before the host's usage chunk
            # (OpenAI-compatible hosts report usage only at the end). The provider still bills the prompt and what it
            # generated, so meter an estimate, marked as one (review M4): ~3 UTF-8 bytes per token, Hinglish-weighted.
            if not usage.get('in') and timing.get('status') == 200:
                usage['in'] = max(1, sum(len(str(m.get('content', '')).encode('utf-8')) for m in messages) // 3)
                usage['out'] = max(usage.get('out', 0) or 0, len(''.join(got).encode('utf-8')) // 3)
                usage['estimated'] = True
            usd = catalog.brain_usd(self.id, usage.get('in', 0), usage.get('out', 0), usage.get('cached', 0))
            usage['usd'] = usage.get('usd_reported', usd) if self.b['host'] == 'or' else usd

    async def _stream(self, messages, usage, timing, max_tokens):
        import aiohttp
        b = self.b; host = b['host']; env = self.env; timing['req'] = time.perf_counter()
        to = aiohttp.ClientTimeout(total=60, sock_read=30)
        if host in ('sin', 'sea', 'or', 'sv'):
            if host == 'sv':
                url = 'https://api.sarvam.ai/v1/chat/completions'; hdr = {'api-subscription-key': env.get('SARVAM_API_KEY', '')}
                body = {'model': b['model']}
            elif host == 'or':
                url = 'https://openrouter.ai/api/v1/chat/completions'; hdr = {'Authorization': 'Bearer ' + env.get('OPENROUTER_API_KEY', ''), 'X-Title': 'vp-voice'}
                body = {'model': b['model'], 'provider': {'order': [b['provider']], 'allow_fallbacks': False}, 'usage': {'include': True}}
            else:
                ep = env.get('LAB_AI_ENDPOINT' if host == 'sin' else 'VP_AI_ENDPOINT', ''); key = env.get('LAB_AI_KEY' if host == 'sin' else 'VP_AI_KEY', '')
                url = f'https://{az_host(ep)}/openai/v1/chat/completions'; hdr = {'api-key': key}
                body = {'model': b['model'], 'stream_options': {'include_usage': True}}
            body.update({'messages': messages, 'stream': True, 'max_completion_tokens': max_tokens + b.get('out_pad', 0), 'temperature': 0.6})
            if host in ('or', 'sv') or b.get('legacy_max'): body['max_tokens'] = body.pop('max_completion_tokens')
            if b.get('no_temp') or 'gpt-oss' in b['model'] or 'gptoss' in b['model'] or 'kimi' in b['model']: body.pop('temperature', None)
            body.update({k: v for k, v in b.get('extra', {}).items() if v is not None})
            async with self.http.post(url, headers=hdr, json=body, timeout=to) as r:
                timing['status'] = r.status
                if r.status != 200:
                    timing['err'] = f'{r.status} {(await r.text())[:300]}'; return
                async for raw in r.content:
                    line = raw.strip()
                    if not line.startswith(b'data:'): continue
                    data = line[5:].strip()
                    if data == b'[DONE]': break
                    try: d = json.loads(data)
                    except Exception: continue
                    u = d.get('usage')
                    if u:
                        usage['in'] = u.get('prompt_tokens', 0) or 0; usage['out'] = u.get('completion_tokens', 0) or 0
                        usage['cached'] = ((u.get('prompt_tokens_details') or {}).get('cached_tokens', 0)) or 0
                        if host == 'or' and u.get('cost') is not None: usage['usd_reported'] = u.get('cost')
                    for ch in d.get('choices') or []:
                        c = (ch.get('delta') or {}).get('content')
                        if c:
                            timing.setdefault('first', time.perf_counter())
                            yield c
        elif host == 'gm':
            sysm = '\n\n'.join(m['content'] for m in messages if m['role'] == 'system'); contents = []
            for m in messages:
                if m['role'] == 'system': continue
                role = 'model' if m['role'] == 'assistant' else 'user'
                if contents and contents[-1]['role'] == role: contents[-1]['parts'][0]['text'] += '\n' + m['content']
                else: contents.append({'role': role, 'parts': [{'text': m['content']}]})
            if not contents or contents[0]['role'] != 'user': contents.insert(0, {'role': 'user', 'parts': [{'text': '(call connected)'}]})
            body = {'systemInstruction': {'parts': [{'text': sysm}]}, 'contents': contents,
                    'generationConfig': {'maxOutputTokens': max_tokens, 'temperature': 0.6, 'thinkingConfig': b.get('thinking', {'thinkingLevel': 'minimal'})}}
            r = await self.google.stream(self.http, b['model'], body, timing, timeout=to)
            if r is None: return
            timing['status'] = 200
            try:
                async for raw in r.content:
                    line = raw.strip()
                    if not line.startswith(b'data:'): continue
                    try: d = json.loads(line[5:].strip())
                    except Exception: continue
                    um = d.get('usageMetadata')
                    if um:
                        usage['in'] = um.get('promptTokenCount', 0) or 0
                        usage['out'] = (um.get('candidatesTokenCount', 0) or 0) + (um.get('thoughtsTokenCount', 0) or 0)
                        usage['cached'] = um.get('cachedContentTokenCount', 0) or 0
                    for c in d.get('candidates') or []:
                        for p in (c.get('content') or {}).get('parts') or []:
                            t = p.get('text')
                            if t and not p.get('thought'):
                                timing.setdefault('first', time.perf_counter())
                                yield t
            finally:
                r.release()
