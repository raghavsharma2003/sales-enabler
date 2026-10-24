#!/bin/sh
# op7 (new, no model): the private tmpfs Postgres 16 cluster for the op7 runs, set up as product/scripts/pg-test.sh does
# (initdb -U vp --auth=trust, unix socket only, run as the postgres OS user) plus fsync=off. cluster.sh start|stop|status.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench-op7
as_pg() { su postgres -s /bin/sh -c "$1"; }
case $1 in
start)
  mkdir -p $D && chown postgres $D
  [ -f $D/data/PG_VERSION ] || as_pg "$PGB/initdb -D $D/data -U vp --auth=trust > $D/initdb.log"
  as_pg "$PGB/pg_ctl -D $D/data -o '-k $D -p 55442 -c listen_addresses= -c fsync=off' -l $D/pg.log -w start" ;;
stop) as_pg "$PGB/pg_ctl -D $D/data -m fast -w stop"; rm -rf $D ;;
status) as_pg "$PGB/pg_ctl -D $D/data status" ;;
esac
