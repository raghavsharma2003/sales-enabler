#!/bin/sh
# r7 copy of research/2026-10-24/benches-r6/harness/mkdb.sh (paths only): same migrate.mjs, private tmpfs cluster
# /dev/shm/vp-pgbench-r7 on port 55447, migrations from /dev/shm/wt-bench7.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench-r7; DB=$1
"$PGB/createdb" -h "$D" -p 55447 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55447"
DATABASE_URL="$URL" node /dev/shm/wt-bench7/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
