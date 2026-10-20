"""Static string analysis of Vapi's public dashboard JS (login-page chunks + lazily referenced chunks, fetched as public static files; nothing executed).
Usage: python3 -I bundle_findings.py <dashboard-js dir> <dashboard-js-lazy dir> > bundle-findings.json"""
import sys, os, re, json, glob, hashlib
files = sorted(glob.glob(os.path.join(sys.argv[1], '*.js')) + glob.glob(os.path.join(sys.argv[2], '*.js')))
txt = {f: open(f, encoding='utf-8', errors='ignore').read() for f in files}
allt = '\n'.join(txt.values())
def first(pat, n=400):
    m = re.search(pat, allt, re.S); return m.group(0)[:n] if m else None
routes = sorted(set(re.findall(r't\.[A-Z_]+="(/[a-z0-9/:\-]+)"', allt)))
api_paths = sorted(set(re.findall(r'path:"(/[a-zA-Z0-9/\-]+)"', allt)) | set(re.findall(r'path:`(/[a-zA-Z0-9/\-]+)', allt)))
flags = sorted(set(re.findall(r'"((?:enable|disable|use)-[a-z0-9.\-]+)"', allt)))
plans = first(r'PAY_AS_YOU_GO:"pay-as-you-go".{0,1400}', 1400)
csv_norm = first(r'function os\(t\)\{const s=t\.replace\(/\[\\s\\-\(\)\'\]/g,""\);[^}]*\}', 300)
csv_validate = first(r'Or=t=>\{const s=\[\],a=\[\];.{0,700}', 700)
csv_reject = first(r'if\(h\.length>0\)\{E\.add\(\{title:"Phone number validation errors\. Please update the CSV and upload again\.".{0,260}', 400)
campaign_strings = sorted(set(s for s in re.findall(r'"([A-Z][^"]{12,160})"', txt.get(next((f for f in files if 'campaign-timezone-combobox' in txt[f]), files[0]), '')) if re.search(r'campaign|contact|schedule|concurr|voicemail|webhook|timezone|7 days|10,000', s, re.I)))
compliance_hits = {k: len(re.findall(k, allt)) for k in [r'\bDNC\b', r'doNotCall', r'NCPR', r'\bTRAI\b', r'\bDLT\b', r'callingHours', r'quietHours', r'optOut', r'suppressionList', r'retryPlan']}
out = {
  'date': '2026-10-20', 'n_files': len(files), 'bytes': sum(len(t) for t in txt.values()),
  'source_maps_referenced': sum(1 for t in txt.values() if 'sourceMappingURL' in t),
  'dashboard_routes': routes, 'api_paths_used_by_dashboard': api_paths, 'feature_flags': flags,
  'legacy_bundled_plans_snippet': plans,
  'campaign_csv_phone_normaliser': csv_norm, 'campaign_csv_row_validation': csv_validate, 'campaign_csv_reject_on_error': csv_reject,
  'campaign_wizard_strings': campaign_strings,
  'compliance_string_hits': compliance_hits,
  'daily_js_version_in_dashboard': (re.search(r'key:"version",value:function\(\)\{return"([0-9.]+)"', allt) or [None, None])[1],
  'file_sha256': {os.path.basename(f): hashlib.sha256(txt[f].encode('utf-8', 'surrogatepass')).hexdigest() for f in files if any(k in f for k in ['index-PFf57Fb9', 'index-Dy8CkNeM', 'agentImprovement', 'CallHealth', 'AgentBuilder'])},
}
print(json.dumps(out, indent=1))
