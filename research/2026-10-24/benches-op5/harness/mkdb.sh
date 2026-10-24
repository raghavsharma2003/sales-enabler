#!/bin/sh
# op5 copy of the r4 harness mkdb.sh: same migrate.mjs, private tmpfs cluster /dev/shm/vp-pgbench6 on port 55438,
# migrations from /dev/shm/wt-op5.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench6; DB=$1
"$PGB/createdb" -h "$D" -p 55438 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55438"
DATABASE_URL="$URL" node /dev/shm/wt-op5/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
