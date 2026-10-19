# VP voice lab (2026-10-19): Azure lifecycle for the owner's test-call lab. Only touches vp-research-rg, names vl-*.
# Adapted from research/2026-10-18/lanes/g5-gemini-paid/harness/vm_ops.py. Keys are read from / written to the
# scratchpad env files only (chmod 600); nothing secret is printed or committed.
# Usage:
#   python lab_ops.py ai              -> AIServices account vp-lab-ai-sin (southindia) + model deployments (DEPLOYMENTS)
#   python lab_ops.py speech          -> SpeechServices account vp-lab-speech-cin (centralindia)
#   python lab_ops.py keys            -> writes scratchpad/voicelab.env (endpoints + keys for both accounts)
#   python lab_ops.py vm [size]       -> nsg (80/443 in) / vnet / ip with DNS label / nic / vm in centralindia
#   python lab_ops.py sas             -> container vl-transfer + 24 h container SAS in scratchpad/voicelab/sas.txt
#   python lab_ops.py put LOCAL NAME / get NAME LOCAL
#   python lab_ops.py run NAME SCRIPT [timeout] [--async] / status NAME [wait]
#   python lab_ops.py list            -> vl-* resources and deployments still present
#   python lab_ops.py delete-vm       -> deletes the VM stack and verifies 404 (accounts are kept; delete-ai removes them)
import os, re, sys, json, time, datetime, hmac, hashlib, base64, urllib.parse
import requests
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
CA = '/root/.ccr/ca-bundle.crt'
def envfile(p):
    return dict(l.strip().split('=', 1) for l in open(p) if '=' in l and not l.startswith('#'))
AZ = envfile(f'{SP}/azure.env'); SUB = AZ['AZURE_SUBSCRIPTION_ID']
RGP = f'/subscriptions/{SUB}/resourceGroups/vp-research-rg'
RG = RGP + '/providers'; NET = RG + '/Microsoft.Network'; CS = RG + '/Microsoft.CognitiveServices/accounts'
LOC = 'centralindia'; VM = 'vl-vm-cin'; P = 'vl'
AI_ACCT, AI_LOC = 'vp-lab-ai-sin', 'southindia'
SPEECH_ACCT = 'vp-lab-speech-cin'
DNS_LABEL = 'vp-voicelab-1019'
STORAGE = 'vpresearchraw1017'; CONTAINER = 'vl-transfer'
TAGS = {'lane': 'voicelab', 'created': '2026-10-19', 'owner_ask': 'test-call lab', 'delete_after': 'owner decision'}
# name: (model, version, format, sku, capacity in thousands of TPM)
DEPLOYMENTS = {
    # brains (OpenAI-compatible chat)
    'lab-gpt41mini-in': ('gpt-4.1-mini', '2025-04-14', 'OpenAI', 'Standard', 50),       # regional South India (residency)
    'lab-gpt41':        ('gpt-4.1', '2025-04-14', 'OpenAI', 'GlobalStandard', 50),
    'lab-gpt56terra':   ('gpt-5.6-terra', '2026-07-09', 'OpenAI', 'GlobalStandard', 50),
    'lab-gpt6luna':     ('gpt-6-luna', '2026-09-22', 'OpenAI', 'GlobalStandard', 50),
    'lab-gptchat':      ('gpt-chat-latest', '2026-10-07', 'OpenAI', 'GlobalStandard', 50),
    'lab-dsv4flash':    ('DeepSeek-V4-Flash', '2026-04-23', 'DeepSeek', 'GlobalStandard', 50),
    'lab-kimik26':      ('Kimi-K2.6', '2026-04-20', 'MoonshotAI', 'GlobalStandard', 50),
    'lab-llama4mav':    ('Llama-4-Maverick-17B-128E-Instruct-FP8', '1', 'Meta', 'GlobalStandard', 50),
    'lab-mistralmed':   ('mistral-medium-3-5', '1', 'Mistral AI', 'GlobalStandard', 50),
    'lab-grok41fast':   ('grok-4-1-fast-non-reasoning', '1', 'xAI', 'GlobalStandard', 50),
    'lab-qwen3':        ('qwen3-32b', '1', 'Alibaba', 'GlobalStandard', 50),
    'lab-gptoss120b':   ('gpt-oss-120b', '1', 'OpenAI-OSS', 'GlobalStandard', 50),
    # speech-to-speech
    'lab-rtmini':       ('gpt-realtime-mini', '2025-10-06', 'OpenAI', 'GlobalStandard', 10),
    'lab-rt21mini':     ('gpt-realtime-2.1-mini', '2026-07-07', 'OpenAI', 'GlobalStandard', 10),
    'lab-rt21':         ('gpt-realtime-2.1', '2026-07-07', 'OpenAI', 'GlobalStandard', 10),
    # speech-to-text (Asha's recogniser)
    'lab-livetx':       ('gpt-live-transcribe', '2026-07-28', 'OpenAI', 'GlobalStandard', 10),
}
_tok = None
def token():
    global _tok
    if _tok and _tok[1] > time.time() + 120: return _tok[0]
    r = requests.post(f"https://login.microsoftonline.com/{AZ['AZURE_TENANT_ID']}/oauth2/v2.0/token", data={'client_id': AZ['AZURE_CLIENT_ID'], 'client_secret': AZ['AZURE_CLIENT_SECRET'], 'grant_type': 'client_credentials', 'scope': 'https://management.azure.com/.default'}, verify=CA, timeout=30)
    d = r.json(); _tok = (d['access_token'], time.time() + int(d.get('expires_in', 3000)))
    return _tok[0]
def arm(method, path, body=None):
    assert path.startswith(RGP), 'refusing to touch anything outside vp-research-rg'
    for i in range(6):
        try:
            r = requests.request(method, 'https://management.azure.com' + path, headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'}, data=json.dumps(body) if body is not None else None, verify=CA, timeout=60)
            try: return r.status_code, r.json()
            except Exception: return r.status_code, {'raw': r.text[:300]}
        except requests.exceptions.RequestException:
            time.sleep(3 * (i + 1))
    raise RuntimeError('ARM unreachable')
def wait_ok(path, api, tries=120):
    for _ in range(tries):
        s, d = arm('GET', f'{path}?api-version={api}')
        st = (d.get('properties') or {}).get('provisioningState')
        if st in ('Succeeded', 'Failed', 'Canceled'): return st
        time.sleep(5)
    return 'timeout'
def ledger(what, units, est_inr):
    with open(f'{SP}/vp-spend.jsonl', 'a') as f:
        f.write(json.dumps({'lane': 'voicelab', 'what': what, 'units': units, 'est_inr': est_inr, 'ts': datetime.date.today().isoformat()}) + '\n')
def err(d): return (d.get('error') or {}).get('message', '')[:240]

def ai():
    path = f'{CS}/{AI_ACCT}'
    s, d = arm('PUT', f'{path}?api-version=2024-10-01', {'location': AI_LOC, 'kind': 'AIServices', 'sku': {'name': 'S0'}, 'tags': TAGS,
                                                         'properties': {'customSubDomainName': AI_ACCT, 'publicNetworkAccess': 'Enabled'}})
    print('account', s, err(d)); print('account', wait_ok(path, '2024-10-01'))
    only = sys.argv[2:] or list(DEPLOYMENTS)
    for name in only:
        model, ver, fmt, sku, cap = DEPLOYMENTS[name]
        for c in (cap, 20, 10, 5, 1):
            if c > cap: continue
            s, d = arm('PUT', f'{path}/deployments/{name}?api-version=2024-10-01', {'sku': {'name': sku, 'capacity': c},
                       'properties': {'model': {'format': fmt, 'name': model, 'version': ver}, 'versionUpgradeOption': 'NoAutoUpgrade'}})
            if s in (200, 201):
                st = wait_ok(f'{path}/deployments/{name}', '2024-10-01'); print(f'  {name:16s} {model} cap={c} -> {st}'); break
            print(f'  {name:16s} cap={c} {s} {err(d)}')
            if 'quota' not in err(d).lower() and 'capacity' not in err(d).lower(): break
    ledger('AIServices account + deployments (pay per token, no standing charge)', ','.join(only), 0)
def speech():
    path = f'{CS}/{SPEECH_ACCT}'
    s, d = arm('PUT', f'{path}?api-version=2024-10-01', {'location': LOC, 'kind': 'SpeechServices', 'sku': {'name': 'S0'}, 'tags': TAGS,
                                                         'properties': {'customSubDomainName': SPEECH_ACCT, 'publicNetworkAccess': 'Enabled'}})
    print('speech', s, err(d)); print('speech', wait_ok(path, '2024-10-01'))
    ledger('SpeechServices S0 centralindia (pay per use)', 'account', 0)
def keys():
    out = {}
    for acct, pre in ((AI_ACCT, 'LAB_AI'), (SPEECH_ACCT, 'LAB_SPEECH')):
        s, d = arm('POST', f'{CS}/{acct}/listKeys?api-version=2024-10-01')
        out[pre + '_KEY'] = d['key1']
        s, d = arm('GET', f'{CS}/{acct}?api-version=2024-10-01')
        out[pre + '_ENDPOINT'] = d['properties']['endpoint']
    out['LAB_SPEECH_REGION'] = LOC
    p = f'{SP}/voicelab.env'
    with open(p, 'w') as f:
        for k, v in out.items(): f.write(f'{k}={v}\n')
    os.chmod(p, 0o600); print('wrote', p, sorted(out))

def vm():
    tags = TAGS
    rules = [{'name': f'allow-{port}', 'properties': {'priority': 100 + i, 'direction': 'Inbound', 'access': 'Allow', 'protocol': 'Tcp',
              'sourceAddressPrefix': 'Internet', 'sourcePortRange': '*', 'destinationAddressPrefix': '*', 'destinationPortRange': str(port)}}
             for i, port in enumerate((80, 443))]
    s, d = arm('PUT', f'{NET}/networkSecurityGroups/{P}-nsg?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'properties': {'securityRules': rules}}); print('nsg', s, err(d))
    s, d = arm('PUT', f'{NET}/virtualNetworks/{P}-vnet?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'properties': {'addressSpace': {'addressPrefixes': ['10.96.0.0/24']}, 'subnets': [{'name': 'default', 'properties': {'addressPrefix': '10.96.0.0/26', 'networkSecurityGroup': {'id': f'{NET}/networkSecurityGroups/{P}-nsg'}}}]}}); print('vnet', s, err(d))
    s, d = arm('PUT', f'{NET}/publicIPAddresses/{P}-ip?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'sku': {'name': 'Standard'}, 'properties': {'publicIPAllocationMethod': 'Static', 'dnsSettings': {'domainNameLabel': DNS_LABEL}}}); print('ip', s, err(d))
    print('vnet', wait_ok(f'{NET}/virtualNetworks/{P}-vnet', '2024-05-01'), 'ip', wait_ok(f'{NET}/publicIPAddresses/{P}-ip', '2024-05-01'))
    s, d = arm('PUT', f'{NET}/networkInterfaces/{P}-nic?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'properties': {'ipConfigurations': [{'name': 'ipc', 'properties': {'subnet': {'id': f'{NET}/virtualNetworks/{P}-vnet/subnets/default'}, 'publicIPAddress': {'id': f'{NET}/publicIPAddresses/{P}-ip'}}}]}}); print('nic', s, err(d))
    print('nic', wait_ok(f'{NET}/networkInterfaces/{P}-nic', '2024-05-01'))
    kp = f'{SP}/{P}_vm_ed25519'
    if not os.path.exists(kp): os.system(f'ssh-keygen -q -t ed25519 -N "" -f {kp}')
    pub = open(kp + '.pub').read().strip()
    size = sys.argv[2] if len(sys.argv) > 2 else 'Standard_D2als_v7'
    body = {'location': LOC, 'tags': tags, 'properties': {
        'hardwareProfile': {'vmSize': size},
        'storageProfile': {'imageReference': {'publisher': 'Canonical', 'offer': 'ubuntu-24_04-lts', 'sku': 'server', 'version': 'latest'},
                           **({'diskControllerType': 'NVMe'} if re.search(r'_v[67]$', size) else {}),
                           'osDisk': {'name': f'{P}-osdisk', 'createOption': 'FromImage', 'deleteOption': 'Delete', 'diskSizeGB': 30, 'managedDisk': {'storageAccountType': 'StandardSSD_LRS'}}},
        'osProfile': {'computerName': 'vlvmcin', 'adminUsername': 'azureuser', 'linuxConfiguration': {'disablePasswordAuthentication': True, 'ssh': {'publicKeys': [{'path': '/home/azureuser/.ssh/authorized_keys', 'keyData': pub}]}}},
        'networkProfile': {'networkInterfaces': [{'id': f'{NET}/networkInterfaces/{P}-nic', 'properties': {'deleteOption': 'Delete'}}]}}}
    s, d = arm('PUT', f'{RG}/Microsoft.Compute/virtualMachines/{VM}?api-version=2024-07-01', body); print('vm', s, err(d))
    print('vm', wait_ok(f'{RG}/Microsoft.Compute/virtualMachines/{VM}', '2024-07-01'))
    s, d = arm('GET', f'{NET}/publicIPAddresses/{P}-ip?api-version=2024-05-01')
    print('fqdn', (d.get('properties') or {}).get('dnsSettings', {}).get('fqdn'), 'ip', (d.get('properties') or {}).get('ipAddress'))
    ledger(f'VM {size} centralindia + Standard IP + 30 GB StandardSSD, kept running while the owner tests', 'per hour ~INR 9', 9)

def sas(hours=24):
    s, d = arm('PUT', f'{RG}/Microsoft.Storage/storageAccounts/{STORAGE}/blobServices/default/containers/{CONTAINER}?api-version=2023-05-01', {'properties': {'publicAccess': 'None'}})
    print('container', s)
    st = envfile(f'{SP}/vp-storage.env'); assert st['VP_STORAGE_ACCOUNT'] == STORAGE
    sv, sp_, sr, spr = '2022-11-02', 'racwl', 'c', 'https'
    t_st = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=10)).strftime('%Y-%m-%dT%H:%M:%SZ')
    t_se = (datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%SZ')
    sts = '\n'.join([sp_, t_st, t_se, f'/blob/{STORAGE}/{CONTAINER}', '', '', spr, sv, sr, '', '', '', '', '', '', ''])
    sig = base64.b64encode(hmac.new(base64.b64decode(st['VP_STORAGE_KEY']), sts.encode(), hashlib.sha256).digest()).decode()
    tok = urllib.parse.urlencode({'sv': sv, 'st': t_st, 'se': t_se, 'sr': sr, 'sp': sp_, 'spr': spr, 'sig': sig})
    os.makedirs(f'{SP}/voicelab', exist_ok=True)
    p = f'{SP}/voicelab/sas.txt'; open(p, 'w').write(tok); os.chmod(p, 0o600)
    return tok
def blob_url(name):
    return f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/{name}?' + open(f'{SP}/voicelab/sas.txt').read().strip()
def put(local, name):
    r = requests.put(blob_url(name), data=open(local, 'rb').read(), headers={'x-ms-blob-type': 'BlockBlob', 'x-ms-version': '2022-11-02'}, verify=CA, timeout=300)
    print('put', name, r.status_code)
def get(name, local):
    r = requests.get(blob_url(name), headers={'x-ms-version': '2022-11-02'}, verify=CA, timeout=300)
    if r.status_code == 200: open(local, 'wb').write(r.content)
    print('get', name, r.status_code, len(r.content)); return r.status_code
def secrets():
    out = {'SAS': open(f'{SP}/voicelab/sas.txt').read().strip()}
    out.update(envfile(f'{SP}/voicelab.env'))
    g = envfile(f'{SP}/vp-gemini-or.env')
    out.update({'GEMINI_PAID_KEY': g['GEMINI_PAID_KEY'], 'GEMINI_TEST_KEY': g['GEMINI_TEST_KEY'], 'OPENROUTER_API_KEY': g['OPENROUTER_API_KEY']})
    sea = envfile(f'{SP}/vp-azure.env'); out.update({'VP_AI_ENDPOINT': sea['VP_AI_ENDPOINT'], 'VP_AI_KEY': sea['VP_AI_KEY']})
    if os.path.exists(f'{SP}/vertex-sa.json'):        # Google Cloud service account for Vertex AI (owner's credit)
        out['VERTEX_SA_B64'] = base64.b64encode(open(f'{SP}/vertex-sa.json', 'rb').read()).decode()
    extra = f'{SP}/voicelab-extra.env'          # owner-supplied keys (Sarvam, Plivo), if present
    if os.path.exists(extra): out.update(envfile(extra))
    if os.path.exists(f'{SP}/voicelab/lab-pass.txt'): out['LAB_PASSCODE'] = open(f'{SP}/voicelab/lab-pass.txt').read().strip()
    return out
def run(name, script, timeout=3600, asyn=False):
    sec = secrets(); sas_t = sec['SAS']
    base = f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/runlogs'
    body = {'location': LOC, 'properties': {'source': {'script': script}, 'asyncExecution': True, 'timeoutInSeconds': timeout,
            'protectedParameters': [{'name': k, 'value': v} for k, v in sec.items()],
            'outputBlobUri': f'{base}/{name}.out?{sas_t}', 'errorBlobUri': f'{base}/{name}.err?{sas_t}', 'treatFailureAsDeploymentFailure': False}}
    path = f'{RG}/Microsoft.Compute/virtualMachines/{VM}/runCommands/{name}?api-version=2024-03-01'
    s, d = arm('PUT', path, body); print('PUT', s, err(d), flush=True)
    if asyn: return
    status(name, timeout)
def status(name, timeout=0):
    sas_t = open(f'{SP}/voicelab/sas.txt').read().strip()
    base = f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/runlogs'
    path = f'{RG}/Microsoft.Compute/virtualMachines/{VM}/runCommands/{name}?api-version=2024-03-01'
    t0 = time.time(); st = None; iv = {}
    while True:
        s, d = arm('GET', path + '&$expand=instanceView')
        iv = (d.get('properties') or {}).get('instanceView') or {}
        st = iv.get('executionState')
        if st in ('Succeeded', 'Failed', 'TimedOut', 'Canceled') or time.time() - t0 > timeout: break
        time.sleep(10)
    print('STATE', st, 'exit', iv.get('exitCode'))
    for kind in ('out', 'err'):
        r = requests.get(f'{base}/{name}.{kind}?{sas_t}', verify=CA, timeout=60)
        txt = r.text if r.status_code == 200 else f'(no blob {r.status_code})'
        print(f'----- {kind} (last 4000 chars)\n' + txt[-4000:])
VMRES = lambda: [(f'{RG}/Microsoft.Compute/virtualMachines/{VM}', '2024-07-01'), (f'{RG}/Microsoft.Compute/disks/{P}-osdisk', '2024-03-02'),
                 (f'{NET}/networkInterfaces/{P}-nic', '2024-05-01'), (f'{NET}/publicIPAddresses/{P}-ip', '2024-05-01'),
                 (f'{NET}/virtualNetworks/{P}-vnet', '2024-05-01'), (f'{NET}/networkSecurityGroups/{P}-nsg', '2024-05-01')]
def listres():
    for path, api in VMRES() + [(f'{CS}/{AI_ACCT}', '2024-10-01'), (f'{CS}/{SPEECH_ACCT}', '2024-10-01')]:
        s, _ = arm('GET', f'{path}?api-version={api}'); print(path.split('/')[-1], s)
    s, d = arm('GET', f'{CS}/{AI_ACCT}/deployments?api-version=2024-10-01')
    for x in d.get('value', []): print('  dep', x['name'], x['properties']['model']['name'], x['sku'], x['properties'].get('provisioningState'))
def delete_vm():
    for path, api in VMRES():
        s, d = arm('DELETE', f'{path}?api-version={api}'); print('DELETE', path.split('/')[-1], s)
        for _ in range(90):
            s2, _ = arm('GET', f'{path}?api-version={api}')
            if s2 == 404: break
            time.sleep(5)
        print('  gone' if s2 == 404 else f'  still {s2}')

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'ai': ai()
    elif cmd == 'speech': speech()
    elif cmd == 'keys': keys()
    elif cmd == 'vm': vm()
    elif cmd == 'sas': sas()
    elif cmd == 'put': put(sys.argv[2], sys.argv[3])
    elif cmd == 'get': get(sys.argv[2], sys.argv[3])
    elif cmd == 'run': run(sys.argv[2], open(sys.argv[3]).read(), int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 3600, '--async' in sys.argv)
    elif cmd == 'status': status(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    elif cmd == 'list': listres()
    elif cmd == 'delete-vm': delete_vm()
    else: raise SystemExit(cmd)
