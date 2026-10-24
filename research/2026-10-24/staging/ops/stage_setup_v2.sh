#!/bin/bash
# stage_setup_v2.sh (2026-10-24, stage 8 config fix): ../../2026-10-23/staging/ops/stage_setup.sh (v1) plus, in the env
# block only, the staging configuration v1 left out. Everything else is v1, byte for byte. Future deploys use v2.
#   - control-plane models on the lab's Azure AI deployments (op7's): VP_LLM_DEFAULT_URL/_KEY/_KEY_HEADER/_MODEL, made
#     here from the lab's LAB_AI_ENDPOINT and LAB_AI_KEY (the same lines v1 copies into .env; never printed);
#     VP_LLM_OPERATOR_MODEL and the Operator's prices; VP_ANALYSIS_MODELS and VP_ANALYSIS_DEFAULT_MODEL;
#   - VP_SAFETY_JUDGE_MODE=off: every VP_LLM_SAFETY_JUDGE_* stays unset, but both judges fall back to VP_LLM_DEFAULT_*
#     (shared/safety/judge.ts judgeConfigured with ??, vpvoice/judge.py config with or), so without this line the
#     judge would run in shadow on lab-gpt41mini-in. Off keeps it uncalled, as it was before (no judge calls or events);
#   - recordings: VP_RECORDINGS_DIR (created, vpstage, mode 700) and VP_RUNTIME_PUBLIC_URL (= the runtime's VP_PUBLIC_URL);
#   - VP_TEST_BUDGET_DEFAULT_INR=2000 (inert until 84b7c48 is deployed);
#   - a hook: /opt/vp-stage/.env.extra, if present, is appended last (a later line overrides an earlier one), for env
#     that arrives later (telephony). Keep it mode 600; its names are printed with the rest, never its values.
# v1's header follows.
# VP private staging on the lab VM (vl-vm-cin). Idempotent: re-run to deploy a new bundle.
# Separate from the voice lab: /opt/vp-stage, user vpstage, units vp-stage-control (127.0.0.1:8091) and
# vp-stage-runtime (127.0.0.1:8090), Postgres 16 database vp_stage, Caddy site on :8443 behind basic auth.
# Secrets: the lab's provider keys are copied from /opt/voicelab/.env into /opt/vp-stage/.env (mode 600) on the VM;
# nothing secret is printed. The staging passcode arrives as the protected parameter VP_STAGE_PASS.
set -e
export DEBIAN_FRONTEND=noninteractive HOME=/root
FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
B=https://vpresearchraw1017.blob.core.windows.net/vl-transfer
S=/opt/vp-stage
VERTEX_OFF_WANT=${VERTEX_OFF_WANT:-1}
[ -n "$VP_STAGE_PASS" ] || { echo "VP_STAGE_PASS missing"; exit 2; }
id -u vpstage >/dev/null 2>&1 || useradd --system --home $S --shell /usr/sbin/nologin vpstage
mkdir -p $S/data $S/tools

echo "== packages"
if ! [ -x /usr/lib/postgresql/16/bin/postgres ]; then
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq postgresql-16 >/dev/null
fi
systemctl is-active postgresql >/dev/null || systemctl start postgresql
if ! [ -x $S/node/bin/node ]; then
  cd /tmp
  curl -fsS -o SHASUMS256.txt https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
  V=$(grep -oE 'node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz' SHASUMS256.txt | head -1)
  curl -fsS -o "$V" "https://nodejs.org/dist/latest-v22.x/$V"
  grep " $V\$" SHASUMS256.txt | sha256sum -c - >/dev/null
  rm -rf $S/node && mkdir -p $S/node && tar xJf "$V" -C $S/node --strip-components=1 && rm -f "$V"
fi
export PATH=$S/node/bin:$PATH
node --version

echo "== bundle"
curl -fsS -o $S/bundle.tgz -H "x-ms-version: 2022-11-02" "$B/vp-stage-bundle.tgz?$SAS"
curl -fsS -o $S/tools.tgz -H "x-ms-version: 2022-11-02" "$B/vp-stage-tools.tgz?$SAS"
tar xzf $S/tools.tgz -C $S/tools
rm -rf $S/app.new && mkdir $S/app.new && tar xzf $S/bundle.tgz -C $S/app.new
if [ -d $S/app/node_modules ] && cmp -s $S/app/package-lock.json $S/app.new/package-lock.json; then mv $S/app/node_modules $S/app.new/; fi
rm -rf $S/app.old; [ -d $S/app ] && mv $S/app $S/app.old; mv $S/app.new $S/app; rm -rf $S/app.old
cat $S/app/BUNDLE_SHA 2>/dev/null || true
cd $S/app
[ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error
node product/web/build.mjs | tail -3

echo "== python"
[ -d $S/venv ] || python3 -m venv $S/venv
$S/venv/bin/pip install -q --upgrade pip >/dev/null 2>&1 || true
$S/venv/bin/pip install -q -r product/voice/requirements.txt
$S/venv/bin/python -c "import aiohttp, numpy, onnxruntime, azure.cognitiveservices.speech, cryptography; print('py deps ok', aiohttp.__version__)"

echo "== database"
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='vpstage'\"" | grep -q 1 || su postgres -c "psql -q -c 'CREATE ROLE vpstage LOGIN'"
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='vp_stage'\"" | grep -q 1 || su postgres -c "createdb -O vpstage vp_stage"
su postgres -c "psql -tAc 'SHOW listen_addresses'"
DBURL='postgresql://vpstage@/vp_stage?host=/var/run/postgresql'

echo "== env"
umask 077
labv() { grep -m1 "^$1=" /opt/voicelab/.env || true; }
oldv() { [ -f $S/.env ] && grep -m1 "^$1=" $S/.env | cut -d= -f2- || true; }
SK=$(oldv VP_SECRET_KEY); [ -n "$SK" ] || SK=$(openssl rand -hex 32)
RS=$(oldv VP_RUNTIME_SECRET); [ -n "$RS" ] || RS=rt-$(openssl rand -hex 24)
install -o vpstage -g vpstage -m 600 /opt/voicelab/vertex-sa.json $S/vertex-sa.json
{
  echo "# VP private staging. Mode 600. Never print or copy off the VM."
  echo "NODE_ENV=production"
  echo "DATABASE_URL=$DBURL"
  echo "VP_SECRET_KEY=$SK"
  echo "VP_RUNTIME_SECRET=$RS"
  echo "VP_RUNTIME_URL=http://127.0.0.1:8090"
  echo "VP_CONTROL_URL=http://127.0.0.1:8091"
  echo "VP_PUBLIC_URL=https://$FQDN:8443/rt"
  echo "VP_BIND=127.0.0.1"
  echo "VP_VAD_MODEL=$S/app/voicelab/server/models/silero_vad.onnx"
  echo "VP_REGION=centralindia"
  echo "VERTEX_SA_FILE=$S/vertex-sa.json"
  echo "VERTEX_OFF=$VERTEX_OFF_WANT"
  echo "VERTEX_LOCATION=global"
  echo "VERTEX_LIVE_LOCATION=us-central1"
  echo "VERTEX_LIVE_AUDIO=mediaChunks"
  labv VERTEX_MODEL_MAP
  labv LAB_AI_ENDPOINT; labv LAB_AI_KEY; labv LAB_SPEECH_KEY; labv LAB_SPEECH_REGION
  labv VP_AI_ENDPOINT; labv VP_AI_KEY; labv OPENROUTER_API_KEY
  echo "VP_STAGE_PACE_S=1.0"
  echo "VP_STAGE_VERTEX_MAX=2500"
  echo "VP_STAGE_PACE_LOG=$S/data/vertex-pace.jsonl"
  echo "VP_STAGE_USER=${VP_STAGE_USER:-vp}"
  echo "VP_STAGE_PASS=$VP_STAGE_PASS"
  # v2 (2026-10-24): control-plane models, recordings, test budget; then the optional .env.extra hook
  AIE=$(labv LAB_AI_ENDPOINT | cut -d= -f2-); AIK=$(labv LAB_AI_KEY | cut -d= -f2-)
  echo "VP_LLM_DEFAULT_URL=${AIE%/}/openai/v1/chat/completions"
  echo "VP_LLM_DEFAULT_KEY=$AIK"
  echo "VP_LLM_DEFAULT_KEY_HEADER=api-key"
  echo "VP_LLM_DEFAULT_MODEL=lab-gpt41mini-in"
  echo "VP_LLM_OPERATOR_MODEL=lab-gpt41"
  echo "VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN=190000"
  echo "VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_OUT=760000"
  echo "VP_ANALYSIS_MODELS=lab-gpt41mini-in,lab-gpt41"
  echo "VP_ANALYSIS_DEFAULT_MODEL=lab-gpt41mini-in"
  echo "VP_SAFETY_JUDGE_MODE=off"
  echo "VP_RECORDINGS_DIR=$S/data/recordings"
  echo "VP_RUNTIME_PUBLIC_URL=https://$FQDN:8443/rt"
  echo "VP_TEST_BUDGET_DEFAULT_INR=2000"
  if [ -f $S/.env.extra ]; then echo "# appended from $S/.env.extra"; grep -v '^#' $S/.env.extra || true; fi
} > $S/.env.new
unset AIE AIK
mkdir -p $S/data/recordings
mv $S/.env.new $S/.env
umask 022
chown -R vpstage:vpstage $S && chmod 600 $S/.env $S/vertex-sa.json && chmod 700 $S
chmod 700 $S/data/recordings; [ -f $S/.env.extra ] && chmod 600 $S/.env.extra || true
cut -d= -f1 $S/.env | grep -v '^#' | tr '\n' ' '; echo

echo "== migrate"
runuser -u vpstage -- env DATABASE_URL="$DBURL" $S/node/bin/node product/scripts/migrate.mjs | tail -2

echo "== units"
cat > /etc/systemd/system/vp-stage-control.service <<UNIT
[Unit]
Description=VP staging control plane (127.0.0.1:8091)
After=network-online.target postgresql.service
[Service]
User=vpstage
WorkingDirectory=$S/app
Environment=PATH=$S/node/bin:/usr/bin:/bin
EnvironmentFile=$S/.env
Environment=PORT=8091
ExecStart=$S/node/bin/node --import $S/tools/bind-local.mjs --import tsx product/server/main.ts
Restart=always
RestartSec=3
MemoryMax=1200M
CPUWeight=50
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/vp-stage-runtime.service <<UNIT
[Unit]
Description=VP staging voice runtime (127.0.0.1:8090)
After=network-online.target vp-stage-control.service
[Service]
User=vpstage
WorkingDirectory=$S/app/product/voice
EnvironmentFile=$S/.env
Environment=PORT=8090
Environment=VP_MAX_CALLS_PER_PROCESS=4
ExecStart=$S/venv/bin/python $S/tools/run_runtime.py
Restart=always
RestartSec=3
MemoryMax=1200M
CPUWeight=50
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable vp-stage-control vp-stage-runtime >/dev/null 2>&1
systemctl restart vp-stage-control vp-stage-runtime
sleep 8
systemctl is-active vp-stage-control vp-stage-runtime || { journalctl -u vp-stage-control -u vp-stage-runtime --no-pager -n 30 | cut -c1-240; exit 1; }

echo "== proxy"
HASH=$(printf '%s\n' "$VP_STAGE_PASS" | /usr/local/bin/caddy hash-password 2>/dev/null | tail -1)
case "$HASH" in \$2*) ;; *) HASH=$(/usr/local/bin/caddy hash-password --plaintext "$VP_STAGE_PASS" | tail -1);; esac
cat > /etc/caddy/vp-stage.caddy <<CADDY
# VP private staging (2026-10-23): basic auth in front of the control plane and the runtime. Remove with the teardown.
$FQDN:8443 {
  basic_auth {
    ${VP_STAGE_USER:-vp} $HASH
  }
  handle_path /rt/* {
    reverse_proxy 127.0.0.1:8090
  }
  handle {
    reverse_proxy 127.0.0.1:8091
  }
}
CADDY
chmod 600 /etc/caddy/vp-stage.caddy
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-vpstage
grep -q 'import /etc/caddy/vp-stage.caddy' /etc/caddy/Caddyfile || printf '\nimport /etc/caddy/vp-stage.caddy\n' >> /etc/caddy/Caddyfile
if /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/vps-validate.log 2>&1; then
  /usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -2
  echo "caddy reloaded"
else
  echo "caddy validate FAILED; restoring the lab Caddyfile"; tail -5 /tmp/vps-validate.log
  cp /etc/caddy/Caddyfile.bak-vpstage /etc/caddy/Caddyfile
fi
sleep 3

echo "== seed (synthetic)"
runuser -u vpstage -- env DATABASE_URL="$DBURL" VP_RUNTIME_SECRET="$RS" PATH=$S/node/bin:/usr/bin:/bin $S/node/bin/node --import tsx product/web/dev/seed.ts http://127.0.0.1:8091 2>&1 | tail -4

echo "== smoke"
curl -s -m 5 http://127.0.0.1:8091/v1/health; echo
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime ok', d['ok'], d['runtimeVersion'], 'signing', d['signing'], 'control', d['control']); [print(' ', k, v['available'], v['missing'], (v['reason'] or '')[:120]) for k, v in d['stacks'].items()]"
curl -s -m 10 -o /dev/null -w "proxy no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /tmp/vps-index.html -w "proxy auth / %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/; grep -o '<title>[^<]*' /tmp/vps-index.html || true
curl -s -m 10 -o /dev/null -w "proxy auth /v1/health %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 10 -o /dev/null -w "proxy auth /rt/v1/health %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/rt/v1/health
ss -ltnp | grep -E ':(8090|8091|5432|8443) ' | awk '{print $4}'
echo "== lab"
systemctl is-active voicelab caddy
curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
curl -s -m 10 -o /dev/null -w "lab public %{http_code}\n" https://$FQDN/api/ping
free -m | head -2; df -h / | tail -1
journalctl -u vp-stage-control -u vp-stage-runtime --no-pager -n 12 | cut -c1-220
