#!/usr/bin/env bash
# Remove the orphaned RoastSessions the test suite left in production.
#
# Residue from the era tests/setup.ts was written to end, when the suite ran
# against production. The roasting fixture deletes sessions by roaster, and
# §4.1 creates three naming no roaster — so those leaked on every run. Their
# output lots and transformations were cleaned up; the sessions were not.
#
# All 79 rows in traceability.roast_session match every residue criterion at
# once (ADR-085). There are no real roast sessions in production.
#
# Safe to re-run: afterwards the set is empty and the delete is a no-op.
#
# Usage:
#   npm run data:remove-orphan-roasts
#
# Take a backup first — this deletes rows:
#   npm run backup:db && npm run backup:verify -- <dir>

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/pg-tools.sh
source "$HERE/backup/pg-tools.sh"

require_pg_tools
load_env

PG_BIN="$(find_pg_bin_dir)"
URL="$(libpq_url "$(direct_url "$DATABASE_URL")")"

echo "Removing orphaned roast sessions ..."
# One transaction, guarded: it refuses outright if any roast session is not
# residue — a real roast recorded since the survey rolls the whole thing back
# rather than being swept up with the rest.
{
  "$PG_BIN/psql" "$URL" -v ON_ERROR_STOP=1 -f "$HERE/remove-orphan-roasts.sql"
} 2>&1 | redact_secrets
