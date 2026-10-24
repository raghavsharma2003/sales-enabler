import json,csv,re,os,collections
R='/home/user/sales-enabler/data/account-phase/sarvam'
D=R+'/derived'
os.makedirs(D,exist_ok=True)
# ---- endpoints.csv
rows=[]
def svc(p):
    if p.startswith('/analytics/'): return 'analytics','https://apps.sarvam.ai/api'
    if '/campaigns' in p or (('/cohorts' in p or '/webhooks' in p) and '/deployments' in p): return 'scheduling','https://apps.sarvam.ai/api/scheduling'
    if p.endswith('/outbounds'): return 'outbounds','https://apps.sarvam.ai/api/outbounds'
    if '/test-suites' in p: return 'evals','https://apps.sarvam.ai/api/evals'
    if p in('/auth','/decrypt-key','/rotate-key'): return 'byok (customer-hosted)','https://api.customer.com/sarvam/byok/v1'
    if '/deployments' in p: return 'app-authoring','https://apps.sarvam.ai/api/app-authoring'
    return 'unknown',''
va=json.load(open(R+'/openapi/voice-agents.json'))
def refs(o,acc):
    if isinstance(o,dict):
        for k,v in o.items():
            if k=='$ref': acc.add(v.split('/')[-1])
            else: refs(v,acc)
    elif isinstance(o,list):
        for v in o: refs(v,acc)
    return acc
for p,v in va['paths'].items():
    for m,o in v.items():
        if m not in('get','post','put','patch','delete'): continue
        s,b=svc(p)
        req=sorted(refs(o.get('requestBody',{}),set()))
        ok=[c for c in o.get('responses',{}) if c.startswith('2')]
        resp=sorted(set(x for c in ok for x in refs(o['responses'][c],set())))
        rows.append(dict(surface='voice-agents',service=s,base_url=b,method=m.upper(),path=p,operationId=o.get('operationId'),summary=o.get('summary'),auth='X-API-Key (workspace key)' if s!='byok (customer-hosted)' else 'Basic/Bearer (Sarvam calls you)',request_schemas=';'.join(req),success_schemas=';'.join(resp),error_codes=';'.join(sorted(o.get('responses',{}).keys())),probed_with_our_key='yes: refused (401 Invalid API key format)' if s!='byok (customer-hosted)' else 'n/a'))
ap=json.load(open(R+'/openapi/apis.json'))
for p,v in ap['paths'].items():
    for m,o in v.items():
        if m not in('get','post','put','patch','delete'): continue
        probe=''
        if (m,p) in (('get','/v2/models'),('get','/v2/models/{model_id}'),('get','/voices'),('get','/text-to-speech/pronunciation-dictionary')): probe='yes: 200 (our key)'
        elif m=='post' and p in('/text-to-speech','/v2/chat/completions','/v1/chat/completions','/translate','/text-lid','/transliterate','/v2/responses','/text-to-speech/stream','/speech-to-text/job/v1'): probe='yes: empty body, 400 validation error (no spend)'
        rows.append(dict(surface='model-apis',service='api.sarvam.ai',base_url='https://api.sarvam.ai'+('/dubbing' if p.startswith('/jobs') else ''),method=m.upper(),path=p,operationId=o.get('operationId'),summary=o.get('summary'),auth='api-subscription-key header (or Bearer)',request_schemas='',success_schemas='',error_codes=';'.join(sorted(o.get('responses',{}).keys())),probed_with_our_key=probe))
with open(D+'/endpoints.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
c=collections.Counter((r['surface'],r['service']) for r in rows)
print(c)
# ---- sdk protocol comparison
py=open(R+'/sdk/pypi-conv-ai/x/sarvam_conv_ai_sdk/messages/types.py').read()
js=open(R+'/sdk/npm-conv-ai/x/package/dist/types/types.d.ts').read()
def enum_py(name):
    m=re.search(r'class %s\(.*?\):(.*?)(?=\nclass |\Z)'%name,py,re.S); return re.findall(r'=\s*"([^"]+)"',m.group(1)) if m else []
def enum_js(name):
    m=re.search(r'enum %s \{(.*?)\}'%name,js,re.S); return re.findall(r'=\s*"([^"]+)"',m.group(1)) if m else []
out={}
for n in['ServerMsgType','ClientMsgType','MsgStatus','ServerMsgCategory']:
    a,b=enum_py(n),enum_js(n)
    out[n]=dict(python=a,js=b,only_python=sorted(set(a)-set(b)),only_js=sorted(set(b)-set(a)))
pl=open(R+'/sdk/pypi-conv-ai/x/sarvam_conv_ai_sdk/tool.py').read()
jl=open(R+'/sdk/npm-conv-ai/x/package/dist/types/language.d.ts').read()
out['languages']=dict(python=re.findall(r'= "([A-Za-z]+)"',pl.split('class SarvamToolLanguageName')[1].split('def is_value')[0]),js=re.findall(r'= "([A-Za-z]+)"',jl),openapi_LanguageName=va['components']['schemas']['LanguageName']['enum'])
out['sample_rates']=dict(python_in=[16000,48000],python_out=16000,js_in=[8000,16000],js_out=[16000,22050],docs_recording_telephony_hz=11025)
out['python_start_overrides']=['agent_variables','initial_language_name','initial_bot_message','initial_state_name','speech_hotwords','text_to_speech_config{speaker_id|speaker_name,speech_settings{pitch,pace,volume}}']
out['js_start_overrides']=['agent_variables','initial_language_name','initial_bot_message','initial_state_name']
out['python_tool_contexts']={'SarvamToolContext':['agent_variables','internal_variables','engagement_metadata{interaction_id,attempt_id,campaign_id,interaction_language,app_id,app_version,agent_phone_number}','secrets','user_identifier','language','allowed_languages','end_conversation','state','next_valid_states'],
 'SarvamOnStartToolContext':['user_identifier','provider_ref_id','initial_bot_message','initial_state_name','initial_language_name','speech_hotwords','text_to_speech_config'],
 'SarvamOnEndToolContext':['user_identifier','provider_ref_id','interaction_transcript{en_text per turn, start/end time}','retry_interaction']}
json.dump(out,open(D+'/conv-ai-sdk-protocol.json','w'),indent=1)
print({k:(v.get('only_python'),v.get('only_js')) for k,v in out.items() if isinstance(v,dict) and 'only_python' in v})
print(out['languages'])
