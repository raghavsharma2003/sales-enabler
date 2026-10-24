#!/bin/sh
# Start (or reuse) a throwaway Postgres 16 for tests: /tmp/vp-pgtest, port 55432, unix socket only, superuser "vp",
# trust auth. Creates database ${1:-vp_test}, applies product migrations, prints the DATABASE_URL to export.
# Postgres refuses to run as root, so the cluster runs as the "postgres" OS user when we are root.
set -e
PGB=${PGB:-/usr/lib/postgresql/16/bin}
D=/tmp/vp-pgtest
DB=${1:-vp_test}
[ -x "$PGB/initdb" ] || { echo "postgres 16 binaries not found at $PGB (set PGB)"; exit 1; }
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/sh -c "$1"; else sh -c "$1"; fi; }
mkdir -p "$D"; [ "$(id -u)" = 0 ] && chown postgres "$D"
[ -f "$D/data/PG_VERSION" ] || as_pg "$PGB/initdb -D $D/data -U vp --auth=trust > $D/initdb.log"
as_pg "$PGB/pg_ctl -D $D/data status" > /dev/null 2>&1 || as_pg "$PGB/pg_ctl -D $D/data -o '-k $D -p 55432 -c listen_addresses=' -l $D/pg.log -w start" > /dev/null
"$PGB/psql" -h "$D" -p 55432 -U vp -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB'" | grep -q 1 || "$PGB/createdb" -h "$D" -p 55432 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55432"
DATABASE_URL="$URL" node "$(dirname "$0")/migrate.mjs" > /dev/null
echo "export DATABASE_URL='$URL'"
