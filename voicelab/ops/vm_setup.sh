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
./venv/bin/pip install -q aiohttp numpy onnxruntime azure-cognitiveservices-speech
curl -sS -o bundle.tgz -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/vl-transfer/voicelab-bundle.tgz?$SAS"
rm -rf app.new && mkdir app.new && tar xzf bundle.tgz -C app.new && rm -rf app && mv app.new app
umask 077
cat > /opt/voicelab/.env <<ENV
LAB_AI_ENDPOINT=$LAB_AI_ENDPOINT
LAB_AI_KEY=$LAB_AI_KEY
LAB_SPEECH_KEY=$LAB_SPEECH_KEY
LAB_SPEECH_REGION=$LAB_SPEECH_REGION
VP_AI_ENDPOINT=$VP_AI_ENDPOINT
VP_AI_KEY=$VP_AI_KEY
GEMINI_TEST_KEY=$GEMINI_TEST_KEY
GEMINI_PAID_KEY=$GEMINI_PAID_KEY
GEMINI_PAID_REMAINING_USD=5.0
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
LAB_PASSCODE=$LAB_PASSCODE
LAB_DATA=/opt/voicelab/data
LAB_DAILY_USD=15
LAB_HOST=127.0.0.1
LAB_PORT=8080
ENV
umask 022
chown -R voicelab:voicelab /opt/voicelab && chmod 600 /opt/voicelab/.env
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
