#!/usr/bin/env bash
# Off-provider logical backup of the Neon database.
#
# Writes a timestamped, self-describing backup set to $NN_BACKUP_DIR:
#
#   neondb.dump    pg_dump custom format (-Fc), compressed, restorable with
#                  pg_restore into any PostgreSQL 18+ instance
#   schema.sql     plain-text schema only — human-readable and diffable, so a
#                  structural change between backups is visible without tools
#   rowcounts.tsv  per-table census taken at dump time; verify-restore.sh
#                  diffs a restored copy against this
#   MANIFEST.txt   provenance: versions, sizes, SHA-256 of every artifact
#
# The point of this script is that the backup does not live inside the account
# that is the single point of failure. Neon's own PITR is a fine first line of
# defence and a useless last one.
#
# Usage:  npm run backup:db
#         NN_BACKUP_DIR=/some/other/place npm run backup:db

set -euo pipefail

cd "$(dirname "$0")/../.."
REPO_ROOT="$(pwd)"
. scripts/backup/pg-tools.sh

require_pg_tools
load_env .env

# --- destination -----------------------------------------------------------
# Configurable so the same script serves a local folder today and a Google
# Drive path the moment Drive is installed — one variable, no code change.
BACKUP_DIR="${NN_BACKUP_DIR:-$HOME/nectar-backups}"

# Create the leaf directory, but never its parents. If the parent is missing,
# the destination is almost certainly not mounted — an unplugged external drive,
# or Google Drive not installed. `mkdir -p` would silently manufacture an
# ordinary local folder at a path that looks like cloud storage, and every
# backup written there would never sync. Fail loudly instead.
if [ ! -d "$BACKUP_DIR" ]; then
  BACKUP_PARENT="$(dirname "$BACKUP_DIR")"
  if [ ! -d "$BACKUP_PARENT" ]; then
    cat >&2 <<MSG
ERROR: backup destination is not available.

  NN_BACKUP_DIR: $BACKUP_DIR
  missing parent: $BACKUP_PARENT

The parent directory does not exist, which usually means the destination is
not mounted — Google Drive not installed, or an external drive unplugged.

Refusing to create it: a folder made here would be ordinary local storage
wearing a cloud-storage path, and nothing written to it would ever sync.

Either mount/install the destination, or run against a local path:
  NN_BACKUP_DIR="\$HOME/nectar-backups" npm run backup:db
MSG
    exit 1
  fi
  echo "Destination does not exist, creating: $BACKUP_DIR"
  mkdir "$BACKUP_DIR"
fi
[ -w "$BACKUP_DIR" ] || { echo "ERROR: $BACKUP_DIR is not writable" >&2; exit 1; }

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
SET_DIR="$BACKUP_DIR/$STAMP"
mkdir -p "$SET_DIR"

echo "Néctar Nómada — database backup"
echo "  pg tools:    $PG_BIN ($("$PG_BIN/pg_dump" --version))"
echo "  destination: $SET_DIR"

# --- preflight -------------------------------------------------------------
SERVER_VERSION="$(pg_run "$PG_BIN/psql" "$DUMP_URL" -At -c 'show server_version')"
echo "  server:      PostgreSQL $SERVER_VERSION"

case "$DATABASE_URL" in
  *-pooler.*) echo "  note:        dumping via direct endpoint, not the pooler" ;;
esac

# --- census ----------------------------------------------------------------
echo "Taking row census..."
row_census "$DUMP_URL" > "$SET_DIR/rowcounts.tsv"
TABLE_COUNT="$(wc -l < "$SET_DIR/rowcounts.tsv" | tr -d ' ')"
TOTAL_ROWS="$(awk -F'\t' '{s+=$2} END {print s+0}' "$SET_DIR/rowcounts.tsv")"
echo "  $TABLE_COUNT tables, $TOTAL_ROWS rows"

# --- dump ------------------------------------------------------------------
# Ownership and grants are captured here and dropped at restore time
# (pg_restore --no-owner --no-privileges), because neondb_owner does not exist
# on a machine that is not Neon. Keeping them in the dump means the
# information survives; dropping them at restore means the restore works.
echo "Dumping (custom format)..."
pg_run "$PG_BIN/pg_dump" "$DUMP_URL" \
  --format=custom \
  --compress=9 \
  --no-sync \
  --file="$SET_DIR/neondb.dump"

echo "Dumping (schema only, plain text)..."
pg_run "$PG_BIN/pg_dump" "$DUMP_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file="$SET_DIR/schema.sql"

# --- manifest --------------------------------------------------------------
{
  echo "Néctar Nómada database backup"
  echo "taken_at_utc:     $STAMP"
  echo "server_version:   PostgreSQL $SERVER_VERSION"
  echo "pg_dump_version:  $("$PG_BIN/pg_dump" --version)"
  echo "host:             $(echo "$DUMP_URL" | sed -E 's|.*@([^/?]+).*|\1|')"
  echo "database:         $(pg_run "$PG_BIN/psql" "$DUMP_URL" -At -c 'select current_database()')"
  echo "schemas:          $(pg_run "$PG_BIN/psql" "$DUMP_URL" -At -c "select string_agg(nspname, ', ' order by nspname) from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'")"
  echo "tables:           $TABLE_COUNT"
  echo "rows:             $TOTAL_ROWS"
  echo "git_commit:       $(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo 'unknown')"
  echo "git_dirty:        $(if [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]; then echo yes; else echo no; fi)"
  echo ""
  echo "checksums (sha256):"
  for f in neondb.dump schema.sql rowcounts.tsv; do
    echo "  $(cd "$SET_DIR" && shasum -a 256 "$f")"
  done
  echo ""
  echo "sizes:"
  for f in neondb.dump schema.sql rowcounts.tsv; do
    echo "  $(cd "$SET_DIR" && ls -lh "$f" | awk '{print $5, $9}')"
  done
  echo ""
  echo "restore into any PostgreSQL 18+ instance:"
  echo "  createdb restored"
  echo "  pg_restore --dbname=restored --no-owner --no-privileges neondb.dump"
  echo ""
  echo "verify this backup actually restores:"
  echo "  npm run backup:verify -- $SET_DIR"
} > "$SET_DIR/MANIFEST.txt"

# --- retention -------------------------------------------------------------
# Keep the newest NN_BACKUP_KEEP sets. Unbounded growth is a slow leak into
# cloud storage, but pruning is deliberately conservative: it only ever
# removes whole timestamped set directories it can see, never anything else
# in the destination, and never the set just written.
KEEP="${NN_BACKUP_KEEP:-14}"
PRUNED=0
while IFS= read -r old_set; do
  [ -n "$old_set" ] || continue
  [ "$old_set" = "$(basename "$SET_DIR")" ] && continue
  rm -rf "${BACKUP_DIR:?}/$old_set"
  PRUNED=$((PRUNED + 1))
done < <(
  find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*T*Z' -exec basename {} \; 2>/dev/null \
    | sort -r | tail -n +$((KEEP + 1))
)
[ "$PRUNED" -gt 0 ] && echo "Pruned $PRUNED set(s) beyond the newest $KEEP."

# --- pointer to newest -----------------------------------------------------
ln -sfn "$SET_DIR" "$BACKUP_DIR/latest"

echo ""
echo "Backup complete:"
sed -n '/^sizes:/,/^$/p' "$SET_DIR/MANIFEST.txt" | sed '1d;$d'
echo ""
echo "  $SET_DIR"
echo "  (also reachable as $BACKUP_DIR/latest)"
echo ""
echo "This backup is UNVERIFIED until you restore it. Run:"
echo "  npm run backup:verify -- $SET_DIR"
