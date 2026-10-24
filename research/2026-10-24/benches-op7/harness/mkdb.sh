#!/bin/sh
# op7 copy of the op6 harness mkdb.sh (paths only): private tmpfs cluster /dev/shm/vp-pgbench-op7 on port 55442,
# migrations from /dev/shm/wt-op7.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench-op7; DB=$1
"$PGB/createdb" -h "$D" -p 55442 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55442"
DATABASE_URL="$URL" node /dev/shm/wt-op7/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
