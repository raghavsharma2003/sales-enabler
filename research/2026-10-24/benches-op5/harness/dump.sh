#!/bin/sh
# dump.sh <db> <task-id...>: messages and actions for bench workspaces (op5 cluster)
P="/usr/lib/postgresql/16/bin/psql -h /dev/shm/vp-pgbench6 -p 55438 -U vp -d $1 -tA"; shift
for t in "$@"; do echo "=== $t"
$P -c "select m.role || ': ' || left(regexp_replace(m.content::text, '\s+', ' ', 'g'), 900) from message m join workspace w on w.id=m.workspace_id where w.name='bench $t' order by m.created_at, m.id"
$P -c "select 'ACTION ' || a.tool || ' ' || a.status || ' ' || left(a.args::text, 300) || ' => ' || left(coalesce(a.result::text,''),300) from action a join workspace w on w.id=a.workspace_id where w.name='bench $t' order by a.created_at"
done
