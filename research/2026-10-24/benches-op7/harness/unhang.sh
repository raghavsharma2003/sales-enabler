#!/bin/sh
# op7 (new, no model): the bench's teardown hang after 06e0c8f. workspace/notifications.ts startNotifier holds one pooled
# client for LISTEN vp_outbox and never releases it, so operator-bench.ts's `await pool.end()` never resolves and the
# report is never written (the 5 s outbox timer then logs "Cannot use a pool after calling end on the pool"). After ALL of
# a run's tasks have logged their result and the hang has shown itself, this terminates that run's LISTEN backend; the
# notifier's error handler releases the client, pool.end() resolves and the bench writes its report from the results it
# already holds. Nothing is re-run or re-graded. unhang.sh <label> [tasks=48]
T=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op7
L=$1; N=${2:-48}; OUT=/dev/shm/bench-out-op7
case $L in gpt-4.1-r*) LOG=$OUT/logs/operator-41-${L#gpt-4.1-}.log ;; gpt-4.1-mini-r*) LOG=$OUT/logs/operator-mini-${L#gpt-4.1-mini-}.log ;; esac
until [ -f $OUT/operator-$L.json ] || { [ -f "$LOG" ] && [ "$(grep -c '^PASS \|^FAIL \|^ERROR \|^NOT_MEASURED \|^NOT_RUN ' $LOG)" -ge $N ] && grep -q 'Cannot use a pool after calling end' $LOG; }; do sleep 5; done
[ -f $OUT/operator-$L.json ] && { echo "$L: report already written"; exit 0; }
DB=$(cat $OUT/db-$L.txt)
P="/usr/lib/postgresql/16/bin/psql -h /dev/shm/vp-pgbench-op7 -p 55442 -U vp -d postgres -tA"
echo "$L: $(grep -c '^PASS \|^FAIL \|^ERROR \|^NOT_MEASURED \|^NOT_RUN ' $LOG) task results logged; teardown hung; terminating LISTEN backend(s) in $DB at $(date -u +%T)"
$P -c "select pid, pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB' and query = 'LISTEN vp_outbox'"
until [ -f $OUT/operator-$L.json ]; do sleep 2; done; echo "$L: report written $(date -u +%T)"
