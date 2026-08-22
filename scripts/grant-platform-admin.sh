#!/usr/bin/env bash
# Grant Platform Admin at platform scope to an existing account.
#
# The first administrator has to be created from outside the application:
# granting Platform Admin requires rbac:manage_permissions, which only Platform
# Admin holds. Production reached exactly that deadlock — see
# scripts/grant-platform-admin.sql for the detail.
#
# Usage:
#   npm run auth:grant-admin -- you@example.com
#
# Reads DATABASE_URL from .env like the backup tooling, connects to the direct
# (non-pooled) endpoint, and routes client output through the same redaction
# filter so a libpq connection error cannot print the password.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/pg-tools.sh
source "$HERE/backup/pg-tools.sh"

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Usage: npm run auth:grant-admin -- <email>" >&2
  exit 1
fi

require_pg_tools
load_env

PG_BIN="$(find_pg_bin_dir)"
URL="$(libpq_url "$(direct_url "$DATABASE_URL")")"

echo "Granting Platform Admin to $EMAIL ..."
# The statement is guarded and idempotent, and aborts on any post-condition
# failure, so a re-run is safe and a surprise rolls back rather than lands.
{
  "$PG_BIN/psql" "$URL" -v ON_ERROR_STOP=1 -v "email=$EMAIL" -f "$HERE/grant-platform-admin.sql"
} 2>&1 | redact_secrets

echo
echo "Done. Set a password next if this account does not have one:"
echo "  npm run auth:set-password -- $EMAIL"
