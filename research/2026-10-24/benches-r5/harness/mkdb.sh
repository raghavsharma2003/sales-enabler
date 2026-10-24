#!/bin/sh
# r5 copy of research/2026-10-24/benches-r4/harness/mkdb.sh: same migrate.mjs, private tmpfs cluster
# /dev/shm/vp-pgbench5 on port 55437, migrations from /dev/shm/wt-bench5.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench5; DB=$1
"$PGB/createdb" -h "$D" -p 55437 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55437"
DATABASE_URL="$URL" node /dev/shm/wt-bench5/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
