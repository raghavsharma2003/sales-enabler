#!/bin/sh
# op6 copy of the op5 harness mkdb.sh (paths only): private tmpfs cluster /dev/shm/vp-pgbench-op6 on port 55441,
# migrations from /dev/shm/wt-op6.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench-op6; DB=$1
"$PGB/createdb" -h "$D" -p 55441 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55441"
DATABASE_URL="$URL" node /dev/shm/wt-op6/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
