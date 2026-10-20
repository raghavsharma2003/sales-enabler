#!/usr/bin/env python3 -I
"""Endpoint surface table from the live OpenAPI + which routes we exercised (from probe logs below)."""
import json, csv, re, collections
D = '/home/user/sales-enabler/data/account-phase/elevenlabs/'
a = json.load(open(D + 'openapi/openapi-live.json'))
exercised = {  # (METHOD, path-template) -> mode we used it in; derived from the el_probe.sh calls of this session
 ('GET','/v1/user'):'read', ('GET','/v1/user/subscription'):'read', ('GET','/v1/convai/agents'):'read',
 ('GET','/v1/convai/agents/{agent_id}'):'read', ('POST','/v1/convai/agents/create'):'write(synthetic, deleted)',
 ('PATCH','/v1/convai/agents/{agent_id}'):'write(synthetic)', ('DELETE','/v1/convai/agents/{agent_id}'):'write(cleanup)',
 ('GET','/v1/convai/conversations'):'read', ('GET','/v1/convai/phone-numbers'):'read', ('GET','/v1/convai/v2/phone-numbers'):'read',
 ('GET','/v1/convai/batch-calling/workspace'):'read', ('GET','/v1/convai/knowledge-base'):'read', ('GET','/v1/convai/tools'):'read',
 ('POST','/v1/convai/tools'):'write(synthetic, deleted)', ('DELETE','/v1/convai/tools/{tool_id}'):'write(cleanup)',
 ('GET','/v1/convai/secrets'):'read', ('GET','/v1/convai/mcp-servers'):'read', ('GET','/v1/convai/agent-testing'):'read',
 ('POST','/v1/convai/agent-testing/create'):'write(synthetic, deleted)', ('GET','/v1/convai/agent-testing/{test_id}'):'read',
 ('DELETE','/v1/convai/agent-testing/{test_id}'):'write(cleanup)', ('GET','/v1/convai/test-invocations'):'read',
 ('GET','/v1/convai/tags'):'read', ('POST','/v1/convai/tags'):'write(synthetic, deleted)', ('DELETE','/v1/convai/tags/{tag_id}'):'write(cleanup)',
 ('GET','/v1/convai/triage-tickets'):'read', ('GET','/v1/convai/users'):'read', ('GET','/v1/convai/llm/list'):'read',
 ('POST','/v1/convai/llm-usage/calculate'):'read(calculator)', ('GET','/v1/convai/settings'):'read', ('GET','/v1/convai/settings/dashboard'):'read',
 ('GET','/v1/convai/environments'):'read', ('GET','/v1/convai/environment-variables'):'read',
 ('POST','/v1/convai/environment-variables'):'write(synthetic, NOT deletable: no DELETE route)',
 ('GET','/v1/convai/analytics/live-count'):'read', ('GET','/v1/convai/whatsapp-accounts'):'read',
 ('GET','/v1/convai/knowledge-base/crawl'):'read', ('GET','/v1/convai/knowledge-base/rag-index'):'read', ('GET','/v1/speech-engine'):'read',
 ('POST','/v1/convai/knowledge-base/text'):'write(synthetic, deleted)', ('DELETE','/v1/convai/knowledge-base/{documentation_id}'):'write(cleanup)',
 ('GET','/v1/convai/agents/{agent_id}/branches'):'read', ('GET','/v1/convai/agents/{agent_id}/branches/{branch_id}'):'read',
 ('POST','/v1/convai/agents/{agent_id}/branches'):'write(synthetic)', ('GET','/v1/convai/agents/{agent_id}/versions/{version_id}'):'read',
 ('GET','/v1/convai/agents/{agent_id}/deployments'):'read', ('GET','/v1/convai/agents/{agent_id}/merge-proposals'):'read',
 ('POST','/v1/convai/agents/{agent_id}/merge-proposals'):'write(synthetic)',
 ('GET','/v1/convai/agents/{agent_id}/branches/{source_branch_id}/merge-preview'):'read',
 ('GET','/v1/convai/agents/{agent_id}/triage-tickets'):'read', ('GET','/v1/convai/agents/{agent_id}/topics'):'read',
 ('GET','/v1/convai/agents/{agent_id}/widget'):'read', ('GET','/v1/convai/agents/{agent_id}/link'):'read',
 ('GET','/v1/convai/agent/{agent_id}/knowledge-base/size'):'read', ('GET','/v1/convai/agents/{agent_id}/branches/{branch_id}/procedures'):'read',
 ('GET','/v1/models'):'read', ('GET','/v1/voices'):'read', ('GET','/v1/voices/{voice_id}'):'read', ('GET','/v1/shared-voices'):'read',
 ('GET','/v1/workspace/webhooks'):'read', ('GET','/v1/pronunciation-dictionaries'):'read', ('GET','/v1/workspace/groups'):'read',
 ('GET','/v1/service-accounts'):'read', ('GET','/v1/usage/character-stats'):'read(422: needs start_unix,end_unix)',
}
rows=[]
for p, v in a['paths'].items():
    for m, op in v.items():
        if m not in ('get','post','put','patch','delete'): continue
        M=m.upper()
        tag=(op.get('tags') or [''])[0]
        group = p.split('/')[2] if p.startswith('/v1/convai/') else p.split('/')[1]+'/'+(p.split('/')[2] if len(p.split('/'))>2 else '')
        rows.append([M,p,tag,op.get('operationId',''),(op.get('summary') or '')[:90],exercised.get((M,p),'')])
with open(D+'derived/endpoint-surface.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['method','path','tag','operation_id','summary','exercised_by_us']); w.writerows(rows)
tot=len(rows); conv=sum(1 for r in rows if r[1].startswith('/v1/convai/') or r[1].startswith('/v1/speech-engine'))
print('operations',tot,'convai+speech-engine',conv,'exercised',sum(1 for r in rows if r[5]))
notfound=[k for k in exercised if not any(r[0]==k[0] and r[1]==k[1] for r in rows)]
print('exercised keys not in spec:',notfound)
c=collections.Counter(r[2] for r in rows if r[1].startswith('/v1/convai/')); print(c.most_common(12))
