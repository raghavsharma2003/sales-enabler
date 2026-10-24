
# Redeploy wrapper, part 4 of 4 (2026-10-24, 6b0d859): sent after deploy_pre.sh + stage_setup.sh (verbatim) +
# deploy_post.sh in the same Run Command. Prints the turn-taking and latency defaults this tree adds (barge-in from audio,
# provider-aware speculation and pre-warm, listen-first), what each measured stack resolves to, and any env override of
# them. Prints no secret values.
echo "== post7 $(date -u)"
S=/opt/vp-stage
cd $S/app/product/voice && $S/venv/bin/python -c "
from vpvoice.cascade import CascadeSession as C
from vpvoice import stacks
from vpvoice.providers.warm import route_of, paced_providers
print('barge: BARGE_AUDIO', C.BARGE_AUDIO, 'BARGE_AUDIO_MS', C.BARGE_AUDIO_MS, 'RESUME_MS', C.RESUME_MS, 'BARGE_PAUSED_MS', C.BARGE_PAUSED_MS, 'BARGE_NOD_LONG_MS', C.BARGE_NOD_LONG_MS, 'BARGE_LONG_MS', C.BARGE_LONG_MS)
print('latency: SPECULATE_PARTIAL', C.SPECULATE_PARTIAL, 'SPECULATE_STABLE_MS', C.SPECULATE_STABLE_MS, 'PREWARM', C.PREWARM, 'FIRST_CLAUSE', C.FIRST_CLAUSE, 'LISTEN_FIRST', C.LISTEN_FIRST, '(outbound SIP only)')
pp = paced_providers({}); print('paced providers (default):', sorted(pp))
for s in ('v2-flashlite', 'v2-mai', 'v2-54mini'):
    c = stacks.STACKS[s]['components']; b = route_of('brain', c['brain']); v = route_of('voice', c['voice'])
    print(' ', s, 'brain', b, 'voice', v, '-> speculate', C.SPECULATE_PARTIAL and b not in pp, 'prewarm brain', C.PREWARM and b not in pp, 'voice', C.PREWARM and v not in pp)
"
echo "turn-taking / latency overrides in .env: $(grep -cE '^VP_(SPECULATE_PARTIAL|SPECULATE_STABLE_MS|PREWARM|FIRST_CLAUSE|BARGE_[A-Z_]+|RESUME_MS|PACED_PROVIDERS|LISTEN_FIRST)=' $S/.env) (0 = code defaults)"
P=$(systemctl show vp-stage-runtime -p MainPID --value)
echo "... in the runtime process env: $(tr '\0' '\n' < /proc/$P/environ | grep -cE '^VP_(SPECULATE_PARTIAL|SPECULATE_STABLE_MS|PREWARM|FIRST_CLAUSE|BARGE_[A-Z_]+|RESUME_MS|PACED_PROVIDERS|LISTEN_FIRST)=')"
cd /tmp && echo "migrations recorded in the DB: $(runuser -u vpstage -- psql -d vp_stage -At -c "SELECT count(*) FROM schema_migrations" 2>/dev/null || runuser -u vpstage -- psql -d vp_stage -At -c "SELECT count(*) FROM _migrations" 2>/dev/null || echo '?')"
journalctl -u vp-stage-runtime --since "-3min" --no-pager | grep -cE 'Traceback' | sed 's/^/runtime tracebacks in the last 3 min: /'
journalctl -u vp-stage-control --since "-3min" --no-pager | grep -ciE 'error|traceback' | sed 's/^/control error lines in the last 3 min: /'
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
echo "needrestart effective restart mode: $(perl -e 'our %nrconf = (restart => "i"); for my $f ("/etc/needrestart/needrestart.conf", sort glob("/etc/needrestart/conf.d/*.conf")) { do $f; } print $nrconf{restart}')"
echo "== post7 done $(date -u)"
