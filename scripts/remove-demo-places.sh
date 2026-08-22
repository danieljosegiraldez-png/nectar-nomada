#!/usr/bin/env bash
# Remove the DEMO Locations and Organizations that survived ADR-066.
#
# ADR-066 removed the demo *project subtree*. A Location carries no projectId
# and an Organization none either, so neither was ever reachable from the
# projects that were deleted. Six of the eight are `public`, so they are what a
# visitor currently sees on /discover.
#
# Safe to re-run: after the first run the sets are empty and the deletes are
# no-ops, and the post-conditions still hold.
#
# Usage:
#   npm run data:remove-demo-places
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

echo "Removing DEMO locations and organizations ..."
# One transaction, guarded: it refuses if any non-demo record has attached
# itself to one of these since the counts were taken, and asserts the real
# totals afterwards. Any failure rolls the whole thing back.
{
  "$PG_BIN/psql" "$URL" -v ON_ERROR_STOP=1 -f "$HERE/remove-demo-places.sql"
} 2>&1 | redact_secrets
