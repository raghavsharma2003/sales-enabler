#!/bin/sh
# r3 copy of research/2026-10-23/benches-r2/harness/mkdb.sh: same migrate.mjs, private tmpfs cluster
# /dev/shm/vp-pgbench3 on port 55435, migrations from /dev/shm/wt-bench3.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench3; DB=$1
"$PGB/createdb" -h "$D" -p 55435 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55435"
DATABASE_URL="$URL" node /dev/shm/wt-bench3/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
