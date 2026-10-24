#!/bin/sh
# r6 copy of research/2026-10-24/benches-r5/harness/mkdb.sh: same migrate.mjs, private tmpfs cluster
# /dev/shm/vp-pgbench7 on port 55439, migrations from /dev/shm/wt-bench6.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench7; DB=$1
"$PGB/createdb" -h "$D" -p 55439 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55439"
DATABASE_URL="$URL" node /dev/shm/wt-bench6/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
