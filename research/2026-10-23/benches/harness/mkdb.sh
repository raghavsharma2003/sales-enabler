#!/bin/sh
# Same as product/scripts/pg-test.sh but against the private tmpfs cluster (/dev/shm/vp-pgbench, port 55433),
# because / is full and the shared /tmp/vp-pgtest cluster belongs to other workers.
set -e
PGB=/usr/lib/postgresql/16/bin; D=/dev/shm/vp-pgbench; DB=$1
"$PGB/createdb" -h "$D" -p 55433 -U vp "$DB"
URL="postgresql://vp@/$DB?host=$D&port=55433"
DATABASE_URL="$URL" node /dev/shm/wt-bench/product/scripts/migrate.mjs > /dev/null
echo "export DATABASE_URL='$URL'"
