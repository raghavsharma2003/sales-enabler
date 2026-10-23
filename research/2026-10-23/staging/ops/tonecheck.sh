#!/bin/bash
q() { runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "$1"; }
echo "== stored tones on agent turns (length distribution)"
q "SELECT count(*) FILTER (WHERE latency->>'tone' IS NOT NULL), max(length(latency->>'tone')), percentile_disc(0.5) WITHIN GROUP (ORDER BY length(latency->>'tone')) FROM turn WHERE speaker='agent'"
echo "== the two calls with dropped batches: turn seqs present, cost lines"
for c in 35ddd374-6ca6-4e49-94e6-b40018774301 ad0027f2-cbb6-4a32-8b26-e69d284e71c5; do
  q "SELECT '$c', string_agg(idx::text, ',' ORDER BY idx) FROM turn WHERE conversation_id='$c'"
  q "SELECT component, count(*), sum(inr_milli) FROM cost_line WHERE conversation_id='$c' GROUP BY component ORDER BY component"
  q "SELECT status, end_reason, cost_inr_milli, duration_s FROM conversation WHERE id='$c'"
done
