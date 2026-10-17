# r2-latency-india (2026-10-17): run a shell script on the India VM through the ARM managed Run Command API.
# Secrets are read at runtime from the scratchpad env files / ARM listKeys and passed as protectedParameters
# (they become env vars inside the VM script); nothing secret is written to disk or printed.
# Usage: python vmrun.py NAME SCRIPT_FILE [timeout_s] [--async]
import os, sys, json, time, requests
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
CA = '/root/.ccr/ca-bundle.crt'
def envfile(p):
  return dict(l.strip().split('=', 1) for l in open(p) if '=' in l and not l.startswith('#'))
AZ = envfile(f'{SP}/azure.env'); SUB = AZ['AZURE_SUBSCRIPTION_ID']
RG = f'/subscriptions/{SUB}/resourceGroups/vp-research-rg/providers'
def token():
  r = requests.post(f"https://login.microsoftonline.com/{AZ['AZURE_TENANT_ID']}/oauth2/v2.0/token", data={'client_id': AZ['AZURE_CLIENT_ID'], 'client_secret': AZ['AZURE_CLIENT_SECRET'], 'grant_type': 'client_credentials', 'scope': 'https://management.azure.com/.default'}, verify=CA, timeout=30)
  return r.json()['access_token']
TOK = token()
def arm(method, path, body=None):
  r = requests.request(method, 'https://management.azure.com' + path, headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'}, data=json.dumps(body) if body is not None else None, verify=CA, timeout=60)
  try: return r.status_code, r.json()
  except Exception: return r.status_code, {'raw': r.text[:500]}
def acct_key(name):
  s, d = arm('POST', f'{RG}/Microsoft.CognitiveServices/accounts/{name}/listKeys?api-version=2024-10-01')
  return d.get('key1')
def secrets():
  vp = envfile(f'{SP}/vp-azure.env'); frc = envfile(f'{SP}/l8-frc.env')
  return {'CIN_KEY': acct_key('vp-r2lat-cin'), 'SIN_KEY': acct_key('vp-r2lat-sin'), 'SEA_KEY': vp['VP_AI_KEY'], 'FRC_KEY': frc['FRC_KEY'],
          'SAS': open(f'{SP}/r2lat/sas.txt').read().strip()}
if __name__ == '__main__':
  name, script = sys.argv[1], open(sys.argv[2]).read()
  timeout = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 3600
  asyn = '--async' in sys.argv
  sec = secrets(); sas = sec['SAS']
  base = 'https://vpresearchraw1017.blob.core.windows.net/r2lat-transfer/runlogs'
  out_uri = f'{base}/{name}.out?{sas}'; err_uri = f'{base}/{name}.err?{sas}'
  body = {'location': 'centralindia', 'properties': {'source': {'script': script}, 'asyncExecution': True, 'timeoutInSeconds': timeout,
          'protectedParameters': [{'name': k, 'value': v} for k, v in sec.items()],
          'outputBlobUri': out_uri, 'errorBlobUri': err_uri, 'treatFailureAsDeploymentFailure': False}}
  path = f'{RG}/Microsoft.Compute/virtualMachines/vp-r2lat-vm/runCommands/{name}?api-version=2024-03-01'
  s, d = arm('PUT', path, body); print('PUT', s, (d.get('error') or {}).get('message', '')[:300], flush=True)
  if asyn: sys.exit(0)
  t0 = time.time(); st = None
  while time.time() - t0 < timeout + 300:
    time.sleep(10)
    s, d = arm('GET', path + '&$expand=instanceView')
    iv = (d.get('properties') or {}).get('instanceView') or {}
    st = iv.get('executionState')
    if st in ('Succeeded', 'Failed', 'TimedOut', 'Canceled'): break
  print('STATE', st, 'exit', iv.get('exitCode'))
  for kind, u in (('OUT', out_uri), ('ERR', err_uri)):
    r = requests.get(u, verify=CA, timeout=60)
    txt = r.text if r.status_code == 200 else f'(no blob {r.status_code})'
    print(f'----- {kind} (last 3000 chars)\n' + txt[-3000:])
