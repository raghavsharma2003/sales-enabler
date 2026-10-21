# Synthetic, fictional test data only. No network: fake adapters stand in for every provider.
import copy, hashlib, json
from vpvoice import catalog, stacks
from vpvoice.events import EventSink, MemoryPoster
from vpvoice.providers import Components

SECRET = 'test-secret-not-real'

AGENT = {
    'schema': 1, 'agentId': 'agt_demo', 'version': 3, 'versionHash': 'a' * 64,
    'brand': {'name': 'Suraksha Demo Insurance', 'spokenName': 'Suraksha', 'verifiedDomains': ['suraksha.example.in']},
    'job': 'renewal_reminder', 'category': 'service', 'sectorPacks': ['base', 'insurance_irdai'],
    'languages': {'primary': 'hinglish', 'allowed': ['hinglish', 'hi-IN'], 'mirrorCaller': True},
    'persona': {'name': 'Riya', 'gender': 'female', 'register': 'warm_peer', 'energy': 3, 'humour': 1, 'honorific': 'aap', 'notes': []},
    'goals': [{'id': 'renewal_intent', 'description': 'they choose the renewal link or an advisor callback', 'outcome': 'renewal_intent', 'required': True}],
    'facts': [{'key': 'renewal_due', 'value': '2 November', 'purpose': 'service', 'source': 'agent.form'},
              {'key': 'premium', 'value': '18,450', 'purpose': 'service', 'source': 'agent.form'},
              {'key': 'festive_offer', 'value': 'Diwali double cover', 'purpose': 'offer', 'source': 'agent.form'}],
    'neverSay': ['RivalCo'],
    'opening': {'disclosureClause': 'Suraksha की AI असिस्टेंट', 'usefulFirst': 'no-claim bonus raises cover'},
    'objections': [], 'tools': [{'name': 'send_whatsapp_link', 'risk': 'A1'}, {'name': 'end_call', 'risk': 'A0'}],
    'handOff': {'when': ['asks_for_human', 'crisis'], 'target': {'kind': 'callback'}, 'warmSummary': True},
    'memory': {'read': True, 'write': True, 'briefMaxBytes': 1200},
    'limits': {'maxDurationS': 600, 'maxSilenceS': 20, 'maxTurns': 40},
    'voice': {'stackId': 'v2-flashlite'},
    'recording': {'enabled': True, 'announce': True},
}
BRIEF_TEXT = 'You are Riya, an AI voice assistant phoning on behalf of Suraksha Demo Insurance (fictional). [compiled brief]'


def ticket(stack_id='v2-flashlite', transport=None, test=True, **over):
    a = copy.deepcopy(AGENT); a['voice'] = {'stackId': stack_id}
    voice = stacks.voices(stack_id)[1] if stack_id in stacks.STACKS else None
    raw = BRIEF_TEXT.encode()
    t = {'protocol': 1, 'conversationId': '0b6f6e1a-1c2d-4e5f-8a9b-000000000001', 'attemptId': None, 'workspaceId': 'ws_demo', 'direction': 'outbound',
         'transport': transport or {'kind': 'sim', 'simCallerId': 'sim_busy_parent'}, 'agent': a,
         'brief': {'text': BRIEF_TEXT, 'hash': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)},
         'stack': {'id': stack_id, 'combinationId': stacks.combination_id(stack_id, voice) if voice else 'x'},
         'contact': {'displayName': 'Asha', 'language': 'hinglish', 'timezone': 'Asia/Kolkata', 'facts': {'policy_no': 'SH-DEMO-0042'},
                     'memoryBrief': '', 'memoryStatus': 'none'},
         'consent': {'basis': 'contract'}, 'limits': {'maxDurationS': 600, 'maxCostInrMilli': 50000}, 'test': test}
    for k, v in over.items(): t[k] = v
    return t


class FakeBrain:
    """Replies from a script: a list of strings (one per reply) or a callable(messages) -> str. 100 tokens in, 20 out."""
    def __init__(self, script, fail_at=None, chunk=7):
        self.script = script; self.n = 0; self.calls = []; self.fail_at = fail_at; self.chunk = chunk

    async def stream(self, messages, usage, timing, max_tokens=180):
        self.calls.append(messages); i = self.n; self.n += 1
        if self.fail_at is not None and i >= self.fail_at:
            timing['err'] = '503 {"error": "UNAVAILABLE"} (fake)'; return
        text = self.script(messages) if callable(self.script) else (self.script[i] if i < len(self.script) else 'जी।')
        usage.update({'in': 100, 'out': 20, 'cached': 0, 'usd': catalog.brain_usd('gemini-3.5-flash-lite', 100, 20)})
        for k in range(0, len(text), self.chunk):
            yield text[k:k + self.chunk]


def components(stack_id='v2-flashlite', brain=None, voice=None, ears=None, fallback_brain=None):
    s = stacks.STACKS[stack_id]; c = s['components']; vname = stacks.voices(stack_id)[1]
    comp = Components(stack_id, s['kind'], vname, stacks.combination_id(stack_id, vname), brain=brain or FakeBrain(['नमस्ते']),
                      brain_id=c.get('brain', c.get('s2s', '')), brain_provider='gemini',
                      make_brain=(lambda bid: fallback_brain) if fallback_brain else None,
                      ears_id=c.get('ears', ''), gated=bool(c.get('gatedEars')), tts_id=c.get('voice', ''),
                      names={'stt': c.get('ears'), 'llm': c.get('brain'), 'tts': c.get('voice'), 's2s': c.get('s2s'), 'voice': vname})
    comp.voice = voice; comp.make_ears = ears
    return comp


def sink(cid='0b6f6e1a-1c2d-4e5f-8a9b-000000000001', fail_first=0):
    p = MemoryPoster(SECRET, fail_first=fail_first)
    return EventSink(cid, p, retry_delays=(0, 0, 0), flush_every_s=0.01), p


class Clock:
    def __init__(self): self.t = 1000.0
    def __call__(self): return self.t
    def advance(self, s): self.t += s


def bodies(poster):
    return [json.loads(b) for b in poster.bodies]
