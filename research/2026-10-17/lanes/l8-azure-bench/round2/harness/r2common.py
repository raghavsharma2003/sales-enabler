# r2-latency-india (2026-10-17): shared config for benches run ON the Central India VM (no proxy).
# Keys come from env vars injected by vmrun.py as protected parameters; never written to disk.
import os, time, csv, json, subprocess
KEYS = {'cin': os.environ.get('CIN_KEY'), 'sin': os.environ.get('SIN_KEY'), 'sea': os.environ.get('SEA_KEY'), 'frc': os.environ.get('FRC_KEY')}
SPEECH_REGION_KEY = {'centralindia': 'cin', 'southeastasia': 'sea'}   # vp-r2lat-cin (AIServices, centralindia); vp-research-ai-sea
ACCT_HOST = {'cin': 'vp-r2lat-cin', 'sin': 'vp-r2lat-sin', 'sea': 'vp-research-ai-sea', 'frc': 'vp-research-ai-frc'}
def chat_url(acct): return f'https://{ACCT_HOST[acct]}.openai.azure.com/openai/v1/chat/completions'
# LLM arms: name -> (account, deployment, extra params, processing scope)
NANO = {'max_completion_tokens': 300, 'reasoning_effort': 'none'}
OLD = {'max_tokens': 120, 'temperature': 0.4}
SOL61 = {'max_completion_tokens': 600, 'reasoning_effort': 'low'}   # gpt-6.1-sol rejects 'none'/'minimal'
LLMS = {
  'sea-gs gpt-5.4-nano':        ('sea', 'r2-gpt-5-4-nano-async', NANO, 'Global'),
  'sea-gs gpt-4.1-mini':        ('sea', 'r2-gpt-4-1-mini-async', OLD, 'Global'),
  'sea-gs gpt-5.4-mini':        ('sea', 'r2-gpt-5-4-mini-async', NANO, 'Global'),
  'sea-gs gpt-5.4-mini priority': ('sea', 'r2-gpt-5-4-mini-async', dict(NANO, service_tier='priority'), 'Global (priority tier)'),
  'sea-dzapac gpt-5.4-mini':    ('sea', 'r2-gpt-5-4-mini-dzapac-async', NANO, 'DataZone APAC'),
  'sea-dzapac gpt-6.1-sol':     ('sea', 'r2-gpt-6-1-sol-dzapac-async', SOL61, 'DataZone APAC'),
  'frc-dzeu gpt-6-luna':        ('frc', 'r2-gpt-6-luna-dz-async', NANO, 'DataZone EU'),
  'frc-dzeu gpt-6-sol':         ('frc', 'r2-gpt-6-sol-dz-async', NANO, 'DataZone EU'),
  'frc-dzeu DeepSeek-V4-Flash': ('frc', 'r2-deepseek-v4-flash-dz-async', OLD, 'DataZone EU'),
  'sin-std gpt-4.1-mini':       ('sin', 'r2-gpt-4-1-mini-std-async', OLD, 'Regional (India geography)'),
  'sin-gs gpt-5.4-nano':        ('sin', 'r2-gpt-5-4-nano-async', NANO, 'Global'),
}
def ts(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
class Out:
  def __init__(self, path): self.path = path; self.w = None; self.f = open(path, 'a', newline='', encoding='utf-8'); self.new = os.path.getsize(path) == 0
  def row(self, d):
    if self.w is None:
      self.w = csv.DictWriter(self.f, fieldnames=list(d.keys()), extrasaction='ignore')
      if self.new: self.w.writeheader()
    self.w.writerow(d); self.f.flush()
def upload(path, name=None):
  sas = os.environ.get('SAS')
  if not sas: return
  name = name or os.path.basename(path)
  subprocess.run(['curl', '-s', '-o', '/dev/null', '-X', 'PUT', '-H', 'x-ms-blob-type: BlockBlob', '--data-binary', '@' + path,
                  f'https://vpresearchraw1017.blob.core.windows.net/r2lat-transfer/results/{name}?{sas}'], check=False)
