#!/bin/bash
# Stage 8, step 4b: the owner's account (one Run Command, after the smoke passed). VP_OWNER_EMAIL and VP_OWNER_PASSWORD
# arrive as protected parameters (ops8.py with OPS8_OWNER=1) and are read only by owner8.py from its environment; this
# script never echoes them. Output: statuses and the workspace id. Placeholders filled by drive8.sh: __KIT_SHA__.
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; K=/tmp/vps8
echo "== owner8 $(date -u)"
[ -n "$VP_OWNER_EMAIL" ] && [ -n "$VP_OWNER_PASSWORD" ] || { echo "STOP: owner parameters not passed"; exit 2; }
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -c "$1" 2>&1; }
D=$(cat $S/app/BUNDLE_SHA); echo "deployed: $D"; [ "$D" = 9b34ff7 ] || { echo "STOP: staging is not at 9b34ff7"; exit 3; }
TC=$(q 'SELECT trial_credit_inr_milli FROM money_config'); echo "trial credit: $TC milli"; [ "$TC" = 5000000 ] || { echo "STOP: the test credit is not on"; exit 3; }
echo "workspaces before: $(q 'SELECT count(*) FROM workspace'); named 'Vyakti Test Workspace': $(q "SELECT count(*) FROM workspace WHERE name = 'Vyakti Test Workspace'")"
rm -rf $K && mkdir -p $K && curl -fsS -o $K/kit.tgz -H "x-ms-version: 2022-11-02" "$B/vps8-kit.tgz?$SAS" || { echo "STOP: kit download failed"; exit 6; }
[ "$(sha256sum $K/kit.tgz | cut -c1-64)" = "__KIT_SHA__" ] || { echo "STOP: kit sha256 mismatch"; exit 6; }
tar xzf $K/kit.tgz -C $K
T0=$(date -u '+%Y-%m-%d %H:%M:%S')
cd $K && timeout 300 $S/venv/bin/python $K/owner8.py $K/owner8.json 2>&1 | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g' | cut -c1-300
echo "owner8 exit ${PIPESTATUS[0]}"
cd /tmp
W=$($S/venv/bin/python -c "import json; print(json.load(open('$K/owner8.json')).get('workspaceId') or '')")
if [ -n "$W" ]; then
  echo "DB check of workspace $W: name '$(q "SELECT name FROM workspace WHERE id = '$W'")', members $(q "SELECT count(*) FROM member WHERE workspace_id = '$W'") (roles $(q "SELECT string_agg(role, ',') FROM member WHERE workspace_id = '$W'")), agents $(q "SELECT count(*) FROM agent WHERE workspace_id = '$W'"), contacts $(q "SELECT count(*) FROM contact WHERE workspace_id = '$W'"), campaigns $(q "SELECT count(*) FROM campaign WHERE workspace_id = '$W'"), calls $(q "SELECT count(*) FROM conversation WHERE workspace_id = '$W'")"
  echo "  wallet $(q "SELECT balance_inr_milli || ' milli, state ' || state FROM wallet WHERE workspace_id = '$W'"); trial top-up rows $(q "SELECT count(*) || ' (' || coalesce(sum(inr_milli),0) || ' milli)' FROM wallet_topup WHERE workspace_id = '$W' AND kind = 'trial_credit'"); trial grant rows for it $(q "SELECT count(*) FROM money_trial_grant WHERE workspace_id = '$W'")"
fi
echo "control error lines since $T0: $(journalctl -u vp-stage-control --since "$T0" --no-pager | grep -ciE 'error|traceback')"
curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$K/owner8.json "$B/runlogs/vps8-owner8.json?$SAS" -o /dev/null -w "upload owner8.json %{http_code}\n"
rm -rf $K
echo "== owner8 done $(date -u)"
