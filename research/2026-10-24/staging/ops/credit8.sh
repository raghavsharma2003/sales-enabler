#!/bin/bash
# Stage 8, step 3: the staging-only test credit. On the staging database vp_stage ONLY, money_config's trial credit is set
# to INR 5,000 (5,000,000 milli) so each NEW workspace's wallet starts with it (migration 0906's wallet_a_trial trigger:
# once per workspace and once per owner email hash, when the wallet row is first written at sign-up). This is a staging
# test allowance, not the customer trial amount: the product default stays 0 in code (0906 inserts DEFAULT VALUES).
# Also lists the migrations the deploy applied. Prints no secret values.
set -e
echo "== credit8 $(date -u)"
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -v ON_ERROR_STOP=1 -At -c "$1"; }
echo "database: $(q 'SELECT current_database()')"
echo "migrations applied by the 9b34ff7 deploy (applied_at today after 09:30 UTC): $(q "SELECT string_agg(filename, ' ' ORDER BY filename) FROM schema_migrations WHERE applied_at >= '2026-10-24 09:30:00+00'")"
echo "schema_migrations rows: $(q 'SELECT count(*) FROM schema_migrations')"
echo "before: trial_credit_inr_milli|updated_at = $(q 'SELECT trial_credit_inr_milli, updated_at FROM money_config')"
q "UPDATE money_config SET trial_credit_inr_milli = 5000000, updated_at = now()" | sed 's/^/update: /'
echo "after:  trial_credit_inr_milli|updated_at = $(q 'SELECT trial_credit_inr_milli, updated_at FROM money_config')"
echo "money_config rows: $(q 'SELECT count(*) FROM money_config') (the table holds one row by its CHECK)"
echo "code default stays 0: $(grep -c 'trial_credit_inr_milli  bigint NOT NULL DEFAULT 0' /opt/vp-stage/app/product/db/migrations/0906_money_trial_staff.sql) line(s) in 0906 declare DEFAULT 0"
echo "trigger present: $(q "SELECT tgname FROM pg_trigger WHERE tgname = 'wallet_a_trial'")"
echo "== credit8 done $(date -u)"
