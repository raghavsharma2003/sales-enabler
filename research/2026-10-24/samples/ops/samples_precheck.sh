
# Samples pre-check (2026-10-24, R13): what the renderer needs on this host. Offline only: no provider request.
echo "== samples pre-check $(date -u)"
command -v ffmpeg || echo "ffmpeg missing"; command -v ffprobe || echo "ffprobe missing"
echo "libopus encoders: $(ffmpeg -hide_banner -encoders 2>/dev/null | grep -c libopus || true)"
cd /opt/vp-stage/app/product/voice
runuser -u vpstage -- /opt/vp-stage/venv/bin/python -c "import vpvoice.samples as s; print('renderer importable; curated', s.curated(), 'max', s.MAX_S)" || true
runuser -u vpstage -- env -i PATH=/usr/bin:/bin HOME=/tmp /opt/vp-stage/venv/bin/python -m unittest tests.test_samples 2>&1 | tail -3 || true
echo "== samples pre-check done"
