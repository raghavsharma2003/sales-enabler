"""Crawl Apna public job listings (anonymous, no login) for telecalling-type roles.
Stage 1: listing pages -> job URLs. Stage 2: job detail -> structured fields. Output JSONL.
Polite: 4 workers, small sleeps. Usage: python3 -I apna_crawl.py OUTDIR"""
import sys, re, json, time, html, random, os
from concurrent.futures import ThreadPoolExecutor
import requests
OUT = sys.argv[1]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
S = requests.Session(); S.headers['User-Agent'] = UA
SLUGS = {'telecalling': 140, 'tele-caller': 100, 'telecaller': 60, 'telesales': 50, 'voice-process': 60, 'customer-care': 40, 'insurance-sales':30, 'credit-card-sales':20, 'recovery-executive':15, 'admission-counsellor':8, 'real-estate-sales':12}
def get(url, tries=3):
    for i in range(tries):
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 200: return r.text
            if r.status_code in (404, 410): return None
        except Exception as e:
            pass
        time.sleep(2 + 3*i)
    return None
def list_pages():
    urls = {}
    def fetch(args):
        slug, p = args
        h = get(f'https://apna.co/jobs/{slug}-jobs?page={p}')
        return slug, p, set(re.findall(r'href="(/job/[^"?#]+)"', h or ''))
    for slug, maxp in SLUGS.items():
        with ThreadPoolExecutor(6) as ex:
            res = list(ex.map(fetch, [(slug, p) for p in range(1, maxp+1)]))
        new = 0; nonempty = 0
        for _, p, links in res:
            if links: nonempty += 1
            for l in links:
                if l not in urls: urls[l] = slug; new += 1
        print('slug', slug, 'pages_nonempty', nonempty, 'new', new, 'total', len(urls), flush=True)
    return urls
def field(h, key, pat=r'"([^"]*)"'):
    m = re.search(r'\\"' + key + r'\\":' + pat.replace('"', r'\\"'), h)
    return m.group(1) if m else None
def parse(path, slug):
    h = get('https://apna.co' + path)
    if not h: return {'path': path, 'slug': slug, 'error': 'fetch'}
    d = {'path': path, 'slug': slug}
    import urllib.parse
    m = re.search(r'job_title=([^&"]+)', h); d['title'] = urllib.parse.unquote_plus(html.unescape(m.group(1))) if m else None
    m = re.search(r'\\"organization\\":\{\\"id\\":(\d+),\\"name\\":\\"(.*?)\\"', h)
    d['org_id'], d['company'] = (m.group(1), m.group(2)) if m else (None, None)
    for k in ['min_salary', 'max_salary', 'fixed_min_salary', 'fixed_max_salary', 'no_of_openings']:
        v = field(h, k, r'(\d+)'); d[k] = int(v) if v else None
    d['category'] = field(h, 'category'); d['job_category'] = field(h, 'job_category'); d['job_department'] = field(h, 'job_department')
    m = re.search(r'\\"city\\":\{\\"id\\":\d+,\\"name\\":\\"(.*?)\\"', h); d['city'] = m.group(1) if m else None
    m = re.search(r'"datePosted":"([^"]+)"', h); d['date_posted'] = m.group(1) if m else None
    sk = re.search(r'"skills":\[(.*?)\]', h); d['skills'] = re.findall(r'"([^"]+)"', sk.group(1)) if sk else []
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', h, flags=re.S)
    t = html.unescape(re.sub(r'<[^>]+>', '\n', body)); t = re.sub(r'\n\s*\n+', '\n', t)
    i = t.find('Job details'); j = t.find('Similar jobs you can apply for')
    d['text'] = t[i:j if j > i else i+4000][:4000] if i >= 0 else ''
    return d
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    urls = list_pages()
    json.dump(urls, open(os.path.join(OUT, 'apna_urls.json'), 'w'))
    out = open(os.path.join(OUT, 'apna_jobs.jsonl'), 'w')
    def work(item):
        time.sleep(random.random()*0.6)
        return parse(*item)
    n = 0
    with ThreadPoolExecutor(4) as ex:
        for d in ex.map(work, list(urls.items())):
            out.write(json.dumps(d, ensure_ascii=False) + '\n'); n += 1
            if n % 200 == 0: print('details', n, flush=True); out.flush()
    out.close(); print('DONE', n, flush=True)
