# g5-gemini-paid (2026-10-18): Central India VM lifecycle + job runner through ARM Run Command (no inbound SSH).
# Adapted from g2-gemini-live-measured/harness/vm_ops.py (copied, not modified). Only touches vp-research-rg, names g5-*.
# Secrets are read at runtime from the scratchpad env files and passed as Run Command protectedParameters (they become
# env vars inside the VM script). Nothing secret is written to disk or printed.
# Usage:
#   python vm_ops.py create [size]     -> nsg/vnet/ip/nic/vm in centralindia (default Standard_D2als_v7)
#   python vm_ops.py sas               -> ensures container g5-transfer, writes a short-lived container SAS to the scratchpad
#   python vm_ops.py put LOCAL BLOBNAME / get BLOBNAME LOCAL
#   python vm_ops.py run NAME SCRIPT [timeout_s] [--async]
#   python vm_ops.py status NAME [wait_s]
#   python vm_ops.py list              -> lists g5-* resources still present in vp-research-rg
#   python vm_ops.py delete            -> deletes vm, os disk, nic, ip, vnet, nsg (and run commands); verifies 404
import os, sys, json, time, requests, datetime
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
CA = '/root/.ccr/ca-bundle.crt'
LOC = 'centralindia'; VM = 'g5-vm-cin'; P = 'g5'
def envfile(p):
    return dict(l.strip().split('=', 1) for l in open(p) if '=' in l and not l.startswith('#'))
AZ = envfile(f'{SP}/azure.env'); SUB = AZ['AZURE_SUBSCRIPTION_ID']
RGP = f'/subscriptions/{SUB}/resourceGroups/vp-research-rg'
RG = RGP + '/providers'
STORAGE = 'vpresearchraw1017'; CONTAINER = 'g5-transfer'
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
            return _arm(method, path, body)
        except requests.exceptions.RequestException:
            time.sleep(3 * (i + 1))
    return _arm(method, path, body)
def _arm(method, path, body=None):
    r = requests.request(method, 'https://management.azure.com' + path, headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'}, data=json.dumps(body) if body is not None else None, verify=CA, timeout=60)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, {'raw': r.text[:300]}
def wait_ok(path, api, tries=60):
    for _ in range(tries):
        s, d = arm('GET', f'{path}?api-version={api}')
        st = (d.get('properties') or {}).get('provisioningState')
        if st in ('Succeeded', 'Failed'): return st
        time.sleep(5)
    return 'timeout'
NET = RG + '/Microsoft.Network'
def create():
    tags = {'lane': 'g5-gemini-paid', 'created': '2026-10-18', 'delete_after': 'same-day'}
    s, d = arm('PUT', f'{NET}/networkSecurityGroups/{P}-nsg?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'properties': {'securityRules': []}}); print('nsg', s)
    s, d = arm('PUT', f'{NET}/virtualNetworks/{P}-vnet?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'properties': {'addressSpace': {'addressPrefixes': ['10.95.0.0/24']}, 'subnets': [{'name': 'default', 'properties': {'addressPrefix': '10.95.0.0/26', 'networkSecurityGroup': {'id': f'{NET}/networkSecurityGroups/{P}-nsg'}}}]}}); print('vnet', s, (d.get('error') or {}).get('message', '')[:200])
    s, d = arm('PUT', f'{NET}/publicIPAddresses/{P}-ip?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'sku': {'name': 'Standard'}, 'properties': {'publicIPAllocationMethod': 'Static'}}); print('ip', s, (d.get('error') or {}).get('message', '')[:200])
    print('vnet', wait_ok(f'{NET}/virtualNetworks/{P}-vnet', '2024-05-01'), 'ip', wait_ok(f'{NET}/publicIPAddresses/{P}-ip', '2024-05-01'))
    s, d = arm('PUT', f'{NET}/networkInterfaces/{P}-nic?api-version=2024-05-01', {'location': LOC, 'tags': tags, 'properties': {'ipConfigurations': [{'name': 'ipc', 'properties': {'subnet': {'id': f'{NET}/virtualNetworks/{P}-vnet/subnets/default'}, 'publicIPAddress': {'id': f'{NET}/publicIPAddresses/{P}-ip'}}}]}}); print('nic', s, (d.get('error') or {}).get('message', '')[:200])
    print('nic', wait_ok(f'{NET}/networkInterfaces/{P}-nic', '2024-05-01'))
    pub = open(f'{SP}/{P}_vm_ed25519.pub').read().strip()
    size = sys.argv[2] if len(sys.argv) > 2 else 'Standard_D2als_v7'
    body = {'location': LOC, 'tags': tags, 'properties': {
        'hardwareProfile': {'vmSize': size},
        'storageProfile': {'imageReference': {'publisher': 'Canonical', 'offer': 'ubuntu-24_04-lts', 'sku': 'server', 'version': 'latest'},
                           'diskControllerType': os.environ.get('G5_DISK_CTRL', 'NVMe'),
                           'osDisk': {'name': f'{P}-osdisk', 'createOption': 'FromImage', 'deleteOption': 'Delete', 'diskSizeGB': 30, 'managedDisk': {'storageAccountType': 'StandardSSD_LRS'}}},
        'osProfile': {'computerName': 'g5vmcin', 'adminUsername': 'azureuser', 'linuxConfiguration': {'disablePasswordAuthentication': True, 'ssh': {'publicKeys': [{'path': '/home/azureuser/.ssh/authorized_keys', 'keyData': pub}]}}},
        'networkProfile': {'networkInterfaces': [{'id': f'{NET}/networkInterfaces/{P}-nic', 'properties': {'deleteOption': 'Delete'}}]}}}
    s, d = arm('PUT', f'{RG}/Microsoft.Compute/virtualMachines/{VM}?api-version=2024-07-01', body); print('vm', s, (d.get('error') or {}).get('message', '')[:300])
    print('vm', wait_ok(f'{RG}/Microsoft.Compute/virtualMachines/{VM}', '2024-07-01', 120))
def sas(hours=8):
    s, d = arm('PUT', f'{RG}/Microsoft.Storage/storageAccounts/{STORAGE}/blobServices/default/containers/{CONTAINER}?api-version=2023-05-01', {'properties': {'publicAccess': 'None'}})
    print('container', s)
    s, d = arm('POST', f'{RG}/Microsoft.Storage/storageAccounts/{STORAGE}/listServiceSas?api-version=2023-05-01', {
        'canonicalizedResource': f'/blob/{STORAGE}/{CONTAINER}', 'signedResource': 'c', 'signedPermission': 'racwl', 'signedProtocol': 'https',
        'signedVersion': '2022-11-02',
        'signedStart': (datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=10)).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'signedExpiry': (datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%SZ')})
    # The token listServiceSas returned failed signature validation on 2026-10-18, so sign the container SAS locally with
    # the account key (vp-storage.env), Blob service SAS string-to-sign for sv=2022-11-02.
    import hmac, hashlib, base64, urllib.parse
    st = envfile(f'{SP}/vp-storage.env'); assert st['VP_STORAGE_ACCOUNT'] == STORAGE
    sv, sp, sr, spr = '2022-11-02', 'racwl', 'c', 'https'
    t_st = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=10)).strftime('%Y-%m-%dT%H:%M:%SZ')
    t_se = (datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%SZ')
    sts = '\n'.join([sp, t_st, t_se, f'/blob/{STORAGE}/{CONTAINER}', '', '', spr, sv, sr, '', '', '', '', '', '', ''])
    sig = base64.b64encode(hmac.new(base64.b64decode(st['VP_STORAGE_KEY']), sts.encode(), hashlib.sha256).digest()).decode()
    tok = urllib.parse.urlencode({'sv': sv, 'st': t_st, 'se': t_se, 'sr': sr, 'sp': sp, 'spr': spr, 'sig': sig})
    os.makedirs(f'{SP}/g5', exist_ok=True)
    open(f'{SP}/g5/sas.txt', 'w').write(tok)
    return tok
def blob_url(name):
    return f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/{name}?' + open(f'{SP}/g5/sas.txt').read().strip()
def put(local, name):
    r = requests.put(blob_url(name), data=open(local, 'rb').read(), headers={'x-ms-blob-type': 'BlockBlob', 'x-ms-version': '2022-11-02'}, verify=CA, timeout=300)
    print('put', name, r.status_code)
def get(name, local):
    r = requests.get(blob_url(name), headers={'x-ms-version': '2022-11-02'}, verify=CA, timeout=300)
    if r.status_code == 200: open(local, 'wb').write(r.content)
    print('get', name, r.status_code, len(r.content))
    return r.status_code
def secrets():
    g = envfile(f'{SP}/vp-gemini-or.env')
    return {'GEMINI_PAID_KEY': g['GEMINI_PAID_KEY'], 'GEMINI_TEST_KEY': g['GEMINI_TEST_KEY'], 'SAS': open(f'{SP}/g5/sas.txt').read().strip()}
def run(name, script, timeout=3600, asyn=False):
    sec = secrets(); sas_t = sec['SAS']
    base = f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/runlogs'
    body = {'location': LOC, 'properties': {'source': {'script': script}, 'asyncExecution': True, 'timeoutInSeconds': timeout,
            'protectedParameters': [{'name': k, 'value': v} for k, v in sec.items()],
            'outputBlobUri': f'{base}/{name}.out?{sas_t}', 'errorBlobUri': f'{base}/{name}.err?{sas_t}', 'treatFailureAsDeploymentFailure': False}}
    path = f'{RG}/Microsoft.Compute/virtualMachines/{VM}/runCommands/{name}?api-version=2024-03-01'
    s, d = arm('PUT', path, body); print('PUT', s, (d.get('error') or {}).get('message', '')[:300], flush=True)
    if asyn: return
    status(name, timeout)
def status(name, timeout=0):
    sas_t = open(f'{SP}/g5/sas.txt').read().strip()
    base = f'https://{STORAGE}.blob.core.windows.net/{CONTAINER}/runlogs'
    path = f'{RG}/Microsoft.Compute/virtualMachines/{VM}/runCommands/{name}?api-version=2024-03-01'
    t0 = time.time(); st = None; iv = {}
    while True:
        s, d = arm('GET', path + '&$expand=instanceView')
        iv = (d.get('properties') or {}).get('instanceView') or {}
        st = iv.get('executionState')
        if st in ('Succeeded', 'Failed', 'TimedOut', 'Canceled') or time.time() - t0 > timeout: break
        time.sleep(15)
    print('STATE', st, 'exit', iv.get('exitCode'))
    for kind in ('out', 'err'):
        r = requests.get(f'{base}/{name}.{kind}?{sas_t}', verify=CA, timeout=60)
        txt = r.text if r.status_code == 200 else f'(no blob {r.status_code})'
        print(f'----- {kind} (last 3000 chars)\n' + txt[-3000:])
RES = lambda: [(f'{RG}/Microsoft.Compute/virtualMachines/{VM}', '2024-07-01'), (f'{RG}/Microsoft.Compute/disks/{P}-osdisk', '2024-03-02'),
               (f'{NET}/networkInterfaces/{P}-nic', '2024-05-01'), (f'{NET}/publicIPAddresses/{P}-ip', '2024-05-01'),
               (f'{NET}/virtualNetworks/{P}-vnet', '2024-05-01'), (f'{NET}/networkSecurityGroups/{P}-nsg', '2024-05-01')]
def listres():
    for path, api in RES():
        s, _ = arm('GET', f'{path}?api-version={api}'); print(path.split('/')[-1], s)
def delete():
    for path, api in RES():
        s, d = arm('DELETE', f'{path}?api-version={api}'); print('DELETE', path.split('/')[-1], s)
        for _ in range(90):
            s2, _ = arm('GET', f'{path}?api-version={api}')
            if s2 == 404: break
            time.sleep(10)
        print('  gone' if s2 == 404 else f'  still {s2}')
if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'create': create()
    elif cmd == 'sas': print('sas', 'ok' if sas() else 'failed')
    elif cmd == 'put': put(sys.argv[2], sys.argv[3])
    elif cmd == 'get': get(sys.argv[2], sys.argv[3])
    elif cmd == 'run':
        run(sys.argv[2], open(sys.argv[3]).read(), int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 3600, '--async' in sys.argv)
    elif cmd == 'status': status(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    elif cmd == 'list': listres()
    elif cmd == 'delete': delete()
