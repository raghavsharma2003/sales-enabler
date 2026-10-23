#!/bin/sh
# r2 copy of research/2026-10-23/benches/harness/mkdb.sh: same migrate.mjs, private tmpfs cluster
# /dev/shm/vp-pgbench2 on port 55434, migrations from /dev/shm/wt-bench2.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench2; DB=$1
"$PGB/createdb" -h "$D" -p 55434 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55434"
DATABASE_URL="$URL" node /dev/shm/wt-bench2/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
