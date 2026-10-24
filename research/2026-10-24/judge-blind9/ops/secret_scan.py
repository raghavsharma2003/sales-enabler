# Secret scan over the files this job wrote. Prints only file names, line numbers and WHICH check matched, never a value.
# 1. Every value in the scratchpad env files (keys, endpoints with keys, the staging passcode, the SAS signature) and
#    the Vertex service-account private key id / key body, as literal substrings (values of 8+ chars).
# 2. Generic patterns: SAS sig=, bearer tokens, Google API keys, OpenAI-style keys, PEM private keys, ya29 OAuth tokens,
#    Azure-style 32-hex keys next to key words, and Indian mobile numbers other than the synthetic 90000000xx range.
import json, os, re, sys
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
vals = {}
for f in ('azure.env', 'voicelab.env', 'vp-stage.env', 'vp-azure.env', 'vp-gemini-or.env', 'voicelab-extra.env', 'vp-storage.env', 'l8-frc.env', 'vp-teardown-accounts.env'):
    p = f'{SP}/{f}'
    if not os.path.exists(p): continue
    for l in open(p):
        if '=' in l and not l.startswith('#'):
            k, v = l.rstrip('\n').split('=', 1); v = v.strip().strip('"')
            if k in ('VP_STORAGE_ACCOUNT',): continue      # an account name, already in the committed 23 Oct scripts; not a secret
            if len(v) >= 8 and not v.lower() in ('centralindia', 'southindia', 'true', 'false'): vals[f'{f}:{k}'] = v
sas = open(f'{SP}/voicelab/sas.txt').read().strip()
m = re.search(r'sig=([^&]+)', sas)
if m: vals['sas:sig'] = m.group(1)
if os.path.exists(f'{SP}/vertex-sa.json'):
    sa = json.load(open(f'{SP}/vertex-sa.json'))
    for k in ('private_key_id', 'private_key', 'client_id'):
        if sa.get(k): vals[f'vertex-sa:{k}'] = sa[k] if k != 'private_key' else sa[k].split('\n')[1]
PAT = {
    'sas-sig': re.compile(r'[?&]sig=[A-Za-z0-9%+/=]{20,}'),
    'bearer': re.compile(r'Bearer\s+[A-Za-z0-9._\-]{20,}'),
    'google-api-key': re.compile(r'AIza[0-9A-Za-z_\-]{30,}'),
    'oauth-ya29': re.compile(r'ya29\.[0-9A-Za-z_\-]{20,}'),
    'sk-key': re.compile(r'\bsk-[A-Za-z0-9_\-]{20,}'),
    'pem': re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    'hex32-near-key': re.compile(r'(?i)(key|secret|pass|token)[^\n]{0,20}\b[0-9a-f]{32,}\b'),
    'in-mobile': re.compile(r'(?<![\d.])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\d])'),
}
SYN = re.compile(r'90000000\d\d')
bad = 0; n = 0
for root in sys.argv[1:]:
    paths = [root] if os.path.isfile(root) else [os.path.join(d, f) for d, _, fs in os.walk(root) for f in fs]
    for p in paths:
        try: txt = open(p, encoding='utf-8', errors='replace').read()
        except Exception: continue
        n += 1
        for name, v in vals.items():
            if v in txt: bad += 1; print(f'HIT literal {name.split(":")[0]}:{name.split(":")[1]} in {p}')
        for i, line in enumerate(txt.split('\n'), 1):
            for name, rx in PAT.items():
                for mm in rx.finditer(line):
                    s = mm.group(0)
                    if name == 'in-mobile':
                        digits = re.sub(r'\D', '', s)[-10:]
                        if SYN.fullmatch(digits): continue
                        # unix times, ids and long numbers are not phone numbers: require a phone-like context
                        if not re.search(r'(?i)phone|mobile|tel|call|whatsapp|\+91|contact', line): continue
                    if name == 'hex32-near-key' and re.search(r'sha256|sha|digest|hash|uuid|conversation', line, re.I): continue
                    bad += 1; print(f'HIT pattern {name} in {p}:{i}')
print(f'scanned {n} files, {len(vals)} literal secrets checked, hits {bad}')
