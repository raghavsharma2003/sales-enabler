# VP voice runtime for Azure Container Apps. Build from the repository root (the Silero VAD model is the one the
# voice lab measured with, at voicelab/server/models):
#   docker build -f product/voice/Dockerfile -t vp-voice .
# Ingress: HTTP + websockets on $PORT (8080). Secrets and endpoints come only from the environment (README.md).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 VP_VAD_MODEL=/app/models/silero_vad.onnx
WORKDIR /app
# the Azure Speech SDK (the ears) needs OpenSSL and ALSA's shared library on Linux, even with no sound device
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 libasound2 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY product/voice/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY voicelab/server/models/silero_vad.onnx /app/models/silero_vad.onnx
COPY product/voice/vpvoice /app/vpvoice
COPY product/shared/safety/rules.json /app/vpvoice/rules.json
COPY product/shared/safety/judge.json /app/vpvoice/judge.json
RUN useradd --system --uid 10001 vp && chown -R vp /app
USER vp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/v1/health', timeout=2)"
# One process, capped at VP_MAX_CALLS_PER_PROCESS (20). On a multi-core replica run one worker per core instead:
#   CMD ["python", "-m", "vpvoice.launch"]  with nginx (python -m vpvoice.launch --nginx-conf) routing /w/<i>/ to the
#   workers; without nginx the launcher's front proxies media itself, at ~0.37% of a core per call (README).
CMD ["python", "-m", "vpvoice"]
