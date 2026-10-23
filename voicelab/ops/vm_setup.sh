#!/bin/bash
# VP voice lab VM bootstrap / redeploy (ARM Run Command; secrets arrive as protected-parameter env vars, written only to
# /opt/voicelab/.env with mode 600, owned by the service user). Idempotent: re-run to deploy a new bundle.
set -e
export DEBIAN_FRONTEND=noninteractive
FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
if ! command -v caddy >/dev/null; then
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq python3-venv libasound2t64 ca-certificates curl >/dev/null 2>&1 || apt-get install -y -qq python3-venv ca-certificates curl
  curl -sSL -o /usr/local/bin/caddy "https://caddyserver.com/api/download?os=linux&arch=amd64" && chmod +x /usr/local/bin/caddy
  id -u voicelab >/dev/null 2>&1 || useradd --system --home /opt/voicelab --shell /usr/sbin/nologin voicelab
fi
mkdir -p /opt/voicelab/app /opt/voicelab/data
cd /opt/voicelab
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -q --upgrade pip >/dev/null 2>&1 || true
./venv/bin/pip install -q aiohttp numpy onnxruntime azure-cognitiveservices-speech cryptography
curl -sS -o bundle.tgz -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/vl-transfer/voicelab-bundle.tgz?$SAS"
rm -rf app.new && mkdir app.new && tar xzf bundle.tgz -C app.new && rm -rf app && mv app.new app
umask 077
if [ -n "$VERTEX_SA_B64" ]; then echo "$VERTEX_SA_B64" | base64 -d > /opt/voicelab/vertex-sa.json; fi
cat > /opt/voicelab/.env <<ENV
LAB_AI_ENDPOINT=$LAB_AI_ENDPOINT
LAB_AI_KEY=$LAB_AI_KEY
LAB_SPEECH_KEY=$LAB_SPEECH_KEY
LAB_SPEECH_REGION=$LAB_SPEECH_REGION
VP_AI_ENDPOINT=$VP_AI_ENDPOINT
VP_AI_KEY=$VP_AI_KEY
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
SARVAM_API_KEY=$SARVAM_API_KEY
PLIVO_AUTH_ID=$PLIVO_AUTH_ID
PLIVO_AUTH_TOKEN=$PLIVO_AUTH_TOKEN
PLIVO_NUMBER=$PLIVO_NUMBER
PLIVO_ALLOWED_TO=$PLIVO_ALLOWED_TO
LAB_PUBLIC_URL=https://$FQDN
VERTEX_SA_FILE=/opt/voicelab/vertex-sa.json
VERTEX_OFF=${VERTEX_OFF:-1}
VP_REGION=centralindia
VERTEX_LOCATION=${VERTEX_LOCATION:-global}
VERTEX_LIVE_LOCATION=${VERTEX_LIVE_LOCATION:-}
VERTEX_MODEL_MAP='${VERTEX_MODEL_MAP:-}'
VERTEX_LIVE_AUDIO=${VERTEX_LIVE_AUDIO:-mediaChunks}
LAB_PASSCODE=$LAB_PASSCODE
LAB_DATA=/opt/voicelab/data
LAB_DAILY_USD=15
LAB_HOST=127.0.0.1
LAB_PORT=8080
ENV
umask 022
chown -R voicelab:voicelab /opt/voicelab && chmod 600 /opt/voicelab/.env; [ -f /opt/voicelab/vertex-sa.json ] && chmod 600 /opt/voicelab/vertex-sa.json
cat > /etc/systemd/system/voicelab.service <<UNIT
[Unit]
Description=VP voice lab
After=network-online.target
[Service]
User=voicelab
WorkingDirectory=/opt/voicelab/app/server
EnvironmentFile=/opt/voicelab/.env
ExecStart=/opt/voicelab/venv/bin/python /opt/voicelab/app/server/app.py
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
UNIT
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<CADDY
$FQDN {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
CADDY
# The product's private staging (research/2026-10-23/staging) adds its own site on :8443; keep it across lab redeploys.
if [ -f /etc/caddy/vp-stage.caddy ]; then echo 'import /etc/caddy/vp-stage.caddy' >> /etc/caddy/Caddyfile; fi
cat > /etc/systemd/system/caddy.service <<UNIT
[Unit]
Description=Caddy
After=network-online.target
[Service]
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
Restart=always
Environment=HOME=/root
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now caddy >/dev/null 2>&1; systemctl restart caddy
systemctl enable voicelab >/dev/null 2>&1; systemctl restart voicelab
sleep 6
systemctl is-active voicelab caddy
curl -s http://127.0.0.1:8080/api/ping; echo
curl -s -o /dev/null -w "https %{http_code}\n" https://$FQDN/api/ping || true
journalctl -u voicelab --no-pager -n 15 | tail -8
