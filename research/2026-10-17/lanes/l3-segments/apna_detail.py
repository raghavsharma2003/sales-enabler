"""Stage 2 only: read apna_urls.json, fetch job details with N workers, resume-safe (skips paths already in output)."""
import sys, os, json, random, time, importlib.util
from concurrent.futures import ThreadPoolExecutor
OUT = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 8
spec = importlib.util.spec_from_file_location('a', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'apna_crawl.py'))
sys_argv = sys.argv; sys.argv = ['x', OUT]; a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a); sys.argv = sys_argv
urls = json.load(open(os.path.join(OUT, 'apna_urls.json')))
outp = os.path.join(OUT, 'apna_jobs.jsonl')
done = set()
if os.path.exists(outp):
    for line in open(outp):
        try:
            d = json.loads(line)
            if not d.get('error'): done.add(d['path'])
        except Exception: pass
todo = [(p, s) for p, s in urls.items() if p not in done]
print('todo', len(todo), 'done', len(done), flush=True)
out = open(outp, 'a')
def work(item):
    time.sleep(random.random() * 0.5)
    return a.parse(*item)
n = 0
with ThreadPoolExecutor(W) as ex:
    for d in ex.map(work, todo):
        out.write(json.dumps(d, ensure_ascii=False) + '\n'); n += 1
        if n % 250 == 0: print('details', n, flush=True); out.flush()
out.close(); print('DONE', n, flush=True)
