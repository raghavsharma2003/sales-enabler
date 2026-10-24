#!/bin/sh
# r4 copy of research/2026-10-23/benches-r3/harness/mkdb.sh: same migrate.mjs, private tmpfs cluster
# /dev/shm/vp-pgbench4 on port 55436, migrations from /dev/shm/wt-bench4.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench4; DB=$1
"$PGB/createdb" -h "$D" -p 55436 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55436"
DATABASE_URL="$URL" node /dev/shm/wt-bench4/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
