# g3-cascade-measured (2026-10-18): Central India VM + AIServices lifecycle and job runner through ARM (no inbound SSH).
# Adapted from g2's vm_ops.py; every resource is named g3-* inside vp-research-rg and is deleted by `delete`.
# Secrets are read at runtime from the scratchpad env files / ARM listKeys and passed as Run Command protectedParameters
# (they become env vars inside the VM script). Nothing secret is written to disk or printed.
# Usage:
#   python vm_ops.py create-ai        -> AIServices g3-cin (centralindia) + g3-sin (southindia) + gpt-4.1-mini Standard deployment
#   python vm_ops.py create-vm [size] -> nsg/vnet/ip/nic/vm in centralindia
#   python vm_ops.py sas              -> container g3-transfer + short-lived SAS in the scratchpad (never printed)
#   python vm_ops.py run NAME SCRIPT [timeout_s] [--async]
#   python vm_ops.py status NAME [wait_s]
#   python vm_ops.py delete           -> deletes vm, disk, nic, ip, vnet, nsg, deployments, accounts (purged), container
import os, sys, json, time, requests, datetime
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
CA = '/root/.ccr/ca-bundle.crt'
LOC = 'centralindia'; VM = 'g3-vm-cin'
def envfile(p):
    return dict(l.strip().split('=', 1) for l in open(p) if '=' in l and not l.startswith('#'))
AZ = envfile(f'{SP}/azure.env'); SUB = AZ['AZURE_SUBSCRIPTION_ID']
RGP = f'/subscriptions/{SUB}/resourceGroups/vp-research-rg'
RG = RGP + '/providers'
NET = RG + '/Microsoft.Network'; CS = RG + '/Microsoft.CognitiveServices/accounts'
STORAGE = 'vpresearchraw1017'; CONTAINER = 'g3-transfer'
TAGS = {'lane': 'g3-cascade-measured', 'created': '2026-10-18', 'delete_after': 'same-day'}
ACCOUNTS = {'g3-cin': 'centralindia', 'g3-sin': 'southindia'}
_tok = None
def token():
    global _tok
    if _tok and _tok[1] > time.time() + 120: return _tok[0]
    r = requests.post(f"https://login.microsoftonline.com/{AZ['AZURE_TENANT_ID']}/oauth2/v2.0/token", data={'client_id': AZ['AZURE_CLIENT_ID'], 'client_secret': AZ['AZURE_CLIENT_SECRET'], 'grant_type': 'client_credentials', 'scope': 'https://management.azure.com/.default'}, verify=CA, timeout=30)
    d = r.json(); _tok = (d['access_token'], time.time() + int(d.get('expires_in', 3000)))
    return _tok[0]
def arm(method, path, body=None):
    for i in range(6):
        try:
            r = requests.request(method, 'https://management.azure.com' + path, headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'}, data=json.dumps(body) if body is not None else None, verify=CA, timeout=60)
            try: return r.status_code, r.json()
            except Exception: return r.status_code, {'raw': r.text[:300]}
        except requests.exceptions.RequestException:
            time.sleep(3 * (i + 1))
    raise RuntimeError('arm unreachable')
def wait_ok(path, api, tries=90):
    for _ in range(tries):
        s, d = arm('GET', f'{path}?api-version={api}')
        st = (d.get('properties') or {}).get('provisioningState')
        if st in ('Succeeded', 'Failed'): return st
        time.sleep(5)
    return 'timeout'
def acct_key(name):
    s, d = arm('POST', f'{CS}/{name}/listKeys?api-version=2024-10-01')
    return d.get('key1')
def create_ai():
    for name, loc in ACCOUNTS.items():
        s, d = arm('PUT', f'{CS}/{name}?api-version=2024-10-01', {'location': loc, 'kind': 'AIServices', 'sku': {'name': 'S0'}, 'tags': TAGS,
                   'properties': {'customSubDomainName': f'{name}-1018', 'publicNetworkAccess': 'Enabled', 'disableLocalAuth': False}})
        print('account', name, s, (d.get('error') or {}).get('message', '')[:300])
    for name in ACCOUNTS: print(name, wait_ok(f'{CS}/{name}', '2024-10-01'))
    # gpt-4.1-mini Standard (regional, India geography), default content filter; 100k TPM
    s, d = arm('PUT', f'{CS}/g3-sin/deployments/g3-gpt-4-1-mini-std?api-version=2024-10-01', {'sku': {'name': 'Standard', 'capacity': 100},
               'properties': {'model': {'format': 'OpenAI', 'name': 'gpt-4.1-mini', 'version': '2025-04-14'}, 'versionUpgradeOption': 'NoAutoUpgrade'}})
    print('deployment', s, (d.get('error') or {}).get('message', '')[:300])
    print('deployment', wait_ok(f'{CS}/g3-sin/deployments/g3-gpt-4-1-mini-std', '2024-10-01'))
def create_vm(size='Standard_D4s_v5'):
    s, d = arm('PUT', f'{NET}/networkSecurityGroups/g3-nsg?api-version=2024-05-01', {'location': LOC, 'tags': TAGS, 'properties': {'securityRules': []}}); print('nsg', s)
    s, d = arm('PUT', f'{NET}/virtualNetworks/g3-vnet?api-version=2024-05-01', {'location': LOC, 'tags': TAGS, 'properties': {'addressSpace': {'addressPrefixes': ['10.93.0.0/24']}, 'subnets': [{'name': 'default', 'properties': {'addressPrefix': '10.93.0.0/26', 'networkSecurityGroup': {'id': f'{NET}/networkSecurityGroups/g3-nsg'}}}]}}); print('vnet', s, (d.get('error') or {}).get('message', '')[:200])
    s, d = arm('PUT', f'{NET}/publicIPAddresses/g3-ip?api-version=2024-05-01', {'location': LOC, 'tags': TAGS, 'sku': {'name': 'Standard'}, 'properties': {'publicIPAllocationMethod': 'Static'}}); print('ip', s, (d.get('error') or {}).get('message', '')[:200])
    print('vnet', wait_ok(f'{NET}/virtualNetworks/g3-vnet', '2024-05-01'), 'ip', wait_ok(f'{NET}/publicIPAddresses/g3-ip', '2024-05-01'))
    s, d = arm('PUT', f'{NET}/networkInterfaces/g3-nic?api-version=2024-05-01', {'location': LOC, 'tags': TAGS, 'properties': {'ipConfigurations': [{'name': 'ipc', 'properties': {'subnet': {'id': f'{NET}/virtualNetworks/g3-vnet/subnets/default'}, 'publicIPAddress': {'id': f'{NET}/publicIPAddresses/g3-ip'}}}]}}); print('nic', s, (d.get('error') or {}).get('message', '')[:200])
    print('nic', wait_ok(f'{NET}/networkInterfaces/g3-nic', '2024-05-01'))
    pub = open(f'{SP}/g3_vm_ed25519.pub').read().strip()
    body = {'location': LOC, 'tags': TAGS, 'properties': {
        'hardwareProfile': {'vmSize': size},
        'storageProfile': {'imageReference': {'publisher': 'Canonical', 'offer': 'ubuntu-24_04-lts', 'sku': 'server', 'version': 'latest'},
                           'osDisk': {'name': 'g3-osdisk', 'createOption': 'FromImage', 'deleteOption': 'Delete', 'diskSizeGB': 30, 'managedDisk': {'storageAccountType': 'StandardSSD_LRS'}}},
        'osProfile': {'computerName': 'g3vmcin', 'adminUsername': 'azureuser', 'linuxConfiguration': {'disablePasswordAuthentication': True, 'ssh': {'publicKeys': [{'path': '/home/azureuser/.ssh/authorized_keys', 'keyData': pub}]}}},
        'networkProfile': {'networkInterfaces': [{'id': f'{NET}/networkInterfaces/g3-nic', 'properties': {'deleteOption': 'Delete'}}]}}}
    s, d = arm('PUT', f'{RG}/Microsoft.Compute/virtualMachines/{VM}?api-version=2024-07-01', body); print('vm', s, (d.get('error') or {}).get('message', '')[:300])
    print('vm', wait_ok(f'{RG}/Microsoft.Compute/virtualMachines/{VM}', '2024-07-01', 120))
def sas(hours=10):
    s, d = arm('PUT', f'{RG}/Microsoft.Storage/storageAccounts/{STORAGE}/blobServices/default/containers/{CONTAINER}?api-version=2023-05-01', {'properties': {'publicAccess': 'None'}}); print('container', s)
    s, d = arm('POST', f'{RG}/Microsoft.Storage/storageAccounts/{STORAGE}/listServiceSas?api-version=2023-05-01', {
        'canonicalizedResource': f'/blob/{STORAGE}/{CONTAINER}', 'signedResource': 'c', 'signedPermission': 'racwl', 'signedProtocol': 'https',
        'signedExpiry': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%SZ')})
    if s != 200: print('sas', s, str(d)[:300]); return None
    os.makedirs(f'{SP}/g3', exist_ok=True); open(f'{SP}/g3/sas.txt', 'w').write(d['serviceSasToken']); print('sas ok')
def secrets():
    g = envfile(f'{SP}/vp-gemini-or.env')
    return {'GEMINI_API_KEY': g['GEMINI_TEST_KEY'], 'OPENROUTER_API_KEY': g['OPENROUTER_API_KEY'], 'CIN_KEY': acct_key('g3-cin'), 'SIN_KEY': acct_key('g3-sin'),
            'SAS': open(f'{SP}/g3/sas.txt').read().strip()}
def run(name, script, timeout=3600, asyn=False):
    sec = secrets(); sas_t = sec['SAS']
    base = f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/runlogs'
    body = {'location': LOC, 'properties': {'source': {'script': script}, 'asyncExecution': True, 'timeoutInSeconds': timeout,
            'protectedParameters': [{'name': k, 'value': v} for k, v in sec.items()],
            'outputBlobUri': f'{base}/{name}.out?{sas_t}', 'errorBlobUri': f'{base}/{name}.err?{sas_t}', 'treatFailureAsDeploymentFailure': False}}
    path = f'{RG}/Microsoft.Compute/virtualMachines/{VM}/runCommands/{name}?api-version=2024-03-01'
    s, d = arm('PUT', path, body); print('PUT', s, (d.get('error') or {}).get('message', '')[:300], flush=True)
    if not asyn: status(name, timeout)
def status(name, timeout=0):
    sas_t = open(f'{SP}/g3/sas.txt').read().strip()
    base = f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/runlogs'
    path = f'{RG}/Microsoft.Compute/virtualMachines/{VM}/runCommands/{name}?api-version=2024-03-01'
    t0 = time.time(); iv = {}
    while True:
        s, d = arm('GET', path + '&$expand=instanceView')
        iv = (d.get('properties') or {}).get('instanceView') or {}
        if iv.get('executionState') in ('Succeeded', 'Failed', 'TimedOut', 'Canceled') or time.time() - t0 > timeout: break
        time.sleep(10)
    print('STATE', iv.get('executionState'), 'exit', iv.get('exitCode'))
    for kind in ('out', 'err'):
        r = requests.get(f'{base}/{name}.{kind}?{sas_t}', verify=CA, timeout=60)
        txt = r.text if r.status_code == 200 else f'(no blob {r.status_code})'
        print(f'----- {kind} (last 3000 chars)\n' + txt[-3000:])
def delete():
    gone = []
    for path, api in [(f'{RG}/Microsoft.Compute/virtualMachines/{VM}', '2024-07-01'), (f'{RG}/Microsoft.Compute/disks/g3-osdisk', '2024-03-02'),
                      (f'{NET}/networkInterfaces/g3-nic', '2024-05-01'), (f'{NET}/publicIPAddresses/g3-ip', '2024-05-01'),
                      (f'{NET}/virtualNetworks/g3-vnet', '2024-05-01'), (f'{NET}/networkSecurityGroups/g3-nsg', '2024-05-01'),
                      (f'{CS}/g3-sin/deployments/g3-gpt-4-1-mini-std', '2024-10-01'), (f'{CS}/g3-sin', '2024-10-01'), (f'{CS}/g3-cin', '2024-10-01'),
                      (f'{RG}/Microsoft.Storage/storageAccounts/{STORAGE}/blobServices/default/containers/{CONTAINER}', '2023-05-01')]:
        s, d = arm('DELETE', f'{path}?api-version={api}'); print('DELETE', path.split('/')[-1], s, flush=True)
        s2 = None
        for _ in range(90):
            s2, _ = arm('GET', f'{path}?api-version={api}')
            if s2 == 404: break
            time.sleep(10)
        print('  gone' if s2 == 404 else f'  still {s2}'); gone.append((path.split('/')[-1], s2))
    for name, loc in ACCOUNTS.items():   # purge soft-deleted accounts
        s, d = arm('DELETE', f'/subscriptions/{SUB}/providers/Microsoft.CognitiveServices/locations/{loc}/resourceGroups/vp-research-rg/deletedAccounts/{name}?api-version=2024-10-01')
        print('PURGE', name, s)
    return gone
if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'create-ai': create_ai()
    elif cmd == 'create-vm': create_vm(sys.argv[2] if len(sys.argv) > 2 else 'Standard_D4s_v5')
    elif cmd == 'sas': sas()
    elif cmd == 'run': run(sys.argv[2], open(sys.argv[3]).read(), int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 3600, '--async' in sys.argv)
    elif cmd == 'status': status(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    elif cmd == 'delete': delete()
