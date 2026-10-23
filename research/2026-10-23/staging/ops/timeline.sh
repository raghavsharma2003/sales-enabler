#!/bin/bash
# Turn timeline of the long-gap calls (synthetic test calls) from the staging DB.
for c in 2e9b1e1e-b042-45e6-b35c-9d945c4e98ed 3490f467-bd44-4cb9-832b-99c6c2a7cf0d 616acaf2-1c2a-4969-ad5e-0c4400eb43c8; do
  echo "== $c"
  runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT idx, speaker, started_ms, ended_ms, latency->>'latencyMs', interrupted, left(regexp_replace(text, '\s+', ' ', 'g'), 70) FROM turn WHERE conversation_id = '$c' ORDER BY started_ms, idx"
  runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT kind, at_ms, left(coalesce(note,''),60) FROM call_moment WHERE conversation_id = '$c' ORDER BY at_ms"
done
