#!/bin/bash
# Create a GlobalStandard deployment in vp-research-ai-sea (or ACCOUNT override). Usage: deploy.sh NAME FORMAT MODEL VERSION CAPACITY [SKU]
SP=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad
ACC=${ACCOUNT:-vp-research-ai-sea}
SKU=${6:-GlobalStandard}
BODY="{\"sku\":{\"name\":\"$SKU\",\"capacity\":$5},\"properties\":{\"model\":{\"format\":\"$2\",\"name\":\"$3\",\"version\":\"$4\"},\"versionUpgradeOption\":\"NoAutoUpgrade\"${RAI:+,\"raiPolicyName\":\"$RAI\"}}}"
$SP/arm.sh PUT "/subscriptions/{sub}/resourceGroups/vp-research-rg/providers/Microsoft.CognitiveServices/accounts/$ACC/deployments/$1?api-version=2024-10-01" "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print('$1', d.get('properties',{}).get('provisioningState'), d.get('error',{}).get('code'), (d.get('error',{}).get('message') or '')[:300])"
