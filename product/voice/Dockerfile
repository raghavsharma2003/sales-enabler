# VP voice runtime for Azure Container Apps. Build from the repository root (the Silero VAD model is the one the
# voice lab measured with, at voicelab/server/models):
#   docker build -f product/voice/Dockerfile -t vp-voice .
# Ingress: HTTP + websockets on $PORT (8080). Secrets and endpoints come only from the environment (README.md).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 VP_VAD_MODEL=/app/models/silero_vad.onnx
WORKDIR /app
COPY product/voice/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY voicelab/server/models/silero_vad.onnx /app/models/silero_vad.onnx
COPY product/voice/vpvoice /app/vpvoice
COPY product/shared/safety/rules.json /app/vpvoice/rules.json
RUN useradd --system --uid 10001 vp && chown -R vp /app
USER vp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/v1/health', timeout=2)"
CMD ["python", "-m", "vpvoice"]
