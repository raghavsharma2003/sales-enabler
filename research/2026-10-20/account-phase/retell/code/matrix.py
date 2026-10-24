import json,re,csv
D='/home/user/sales-enabler/data/account-phase/retell/'
oa=json.load(open('/home/user/sales-enabler/data/teardown/retell/docs/openapi-summary.json'))['ops']
executed={ # (method,path-pattern): result
 ('GET','/get-api-key-info'):'200',('GET','/get-concurrency'):'200',('GET','/list-voices'):'200',('GET','/get-voice/{}'):'200',
 ('POST','/v2/list-agents'):'200',('GET','/get-agent/{}'):'200 (also 404 on probe id)',('GET','/list-agent-versions/{}'):'200',
 ('GET','/v2/list-retell-llms'):'200',('GET','/get-retell-llm/{}'):'200',('GET','/v2/list-conversation-flows'):'200',('GET','/v2/list-conversation-flow-components'):'200',
 ('GET','/list-knowledge-bases'):'200',('POST','/v3/list-chats'):'200',('POST','/v3/list-calls'):'200',('POST','/list-contacts'):'200',('GET','/list-apps'):'200',
 ('GET','/v2/list-test-case-definitions'):'200 (400 without type)',('GET','/v2/list-batch-tests'):'400 without type (not retried with type)',('GET','/v2/list-export-requests'):'200',
 ('GET','/get-crm-config'):'200',('GET','/get-crm-schema'):'400 no CRM app',('GET','/get-sync-job-status'):'200',('GET','/get-backfill-contact-job-status'):'200',
 ('GET','/v2/list-phone-numbers'):'200',('GET','/get-mcp-tools/{}'):'400 needs mcp_id query',
 ('POST','/create-retell-llm'):'201',('POST','/create-agent'):'201 (+ 400/404 validation probes)',('POST','/create-agent-version/{}'):'201',('POST','/publish-agent-version/{}'):'200',
 ('PATCH','/update-agent/{}'):'422 on published; 200 on draft',('DELETE','/delete-agent/{}'):'204',('POST','/create-conversation-flow'):'201',('DELETE','/delete-conversation-flow/{}'):'204',
 ('POST','/create-test-case-definition'):'201',('GET','/get-test-case-definition/{}'):'404 probe only',('DELETE','/delete-test-case-definition/{}'):'204',
 ('POST','/create-contact'):'201 / 400 duplicate',('GET','/get-contact-by-phone/{}'):'200',('DELETE','/delete-contact/{}'):'204',
 ('POST','/search-community-voice'):'200 x5 providers',('POST','/upload-contact-import-file'):'401 Invalid JWT',('GET','/get-contact-import'):'401 Invalid JWT',('POST','/create-contact-import'):'400 validation only',
}
probe404={'/get-chat-agent/{}','/get-chat/{}','/get-conversation-flow-component/{}','/get-conversation-flow/{}','/get-knowledge-base/{}','/get-phone-number/{}','/v2/get-call/{}','/get-contact/{}','/list-contact-conversations/{}','/get-app/{}','/list-app-usages/{}','/get-test-run/{}','/get-batch-test/{}','/v2/list-test-runs/{}'}
billable_note={ # inferred from docs rate card; NOT executed
 '/v2/create-phone-call':'billable call (not executed)','/v3/create-web-call':'billable call (not executed)','/v2/register-phone-call':'billable call (not executed)','/create-batch-call':'billable dials +0.005/dial (not executed)',
 '/create-chat':'billable chat (not executed)','/create-chat-completion':'billable per message (not executed)','/create-sms-chat':'billable (not executed)','/agent-playground-completion/{}':'billable LLM tokens (not executed)',
 '/create-phone-number':'buys a number (not executed)','/import-phone-number':'creates number resource (not executed)','/create-knowledge-base':'KB beyond 10 free is $8/mo (not executed)','/create-batch-test':'simulation credits (not executed)',
 '/clone-voice':'provider cost unknown (not executed)','/add-community-voice':'adds voice to account (not executed)','/create-app':'integration (not executed)'}
def norm(p): return re.sub(r'\{[^}]*\}','{}',p)
rows=[]
for o in oa:
    p=norm(o['path']); k=(o['method'],p)
    if k in executed: status='executed: '+executed[k]
    elif p in probe404 and o['method']=='GET': status='executed: 404 with invalid probe id (auth ok)'
    elif p in billable_note: status='NOT executed: '+billable_note[p]
    else: status='not executed (write or unneeded)'
    rows.append([o['method'],o['path'],o['operationId'],status])
with open(D+'derived/endpoint-matrix.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['method','path','operationId','status_this_phase']); w.writerows(rows)
print(len(rows), sum(1 for r in rows if r[3].startswith('executed')), sum(1 for r in rows if r[3].startswith('NOT')))
