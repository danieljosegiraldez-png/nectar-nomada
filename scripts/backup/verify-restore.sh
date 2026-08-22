#!/usr/bin/env bash
# Prove a backup set actually restores — the half that makes the other half
# worth having.
#
# Spins up a THROWAWAY local PostgreSQL cluster in a temp directory, restores
# the dump into it, recomputes the row census, and diffs it against the census
# taken at dump time. Nothing touches Neon, and nothing touches any Postgres
# server you already run: the cluster is created, used, and destroyed here,
# listening on a Unix socket only (no TCP port, so no conflicts).
#
# Restoring into local PostgreSQL rather than a Neon branch is deliberate. A
# Neon branch would prove the dump is readable by Neon. This proves you can
# leave.
#
# Usage:  npm run backup:verify                 # verifies the latest set
#         npm run backup:verify -- <backup-dir> # verifies a specific set

set -euo pipefail

cd "$(dirname "$0")/../.."
. scripts/backup/pg-tools.sh

require_pg_tools

BACKUP_DIR="${NN_BACKUP_DIR:-$HOME/nectar-backups}"
SET_DIR="${1:-$BACKUP_DIR/latest}"

[ -d "$SET_DIR" ] || { echo "ERROR: no backup set at $SET_DIR" >&2; exit 1; }
[ -f "$SET_DIR/neondb.dump" ]   || { echo "ERROR: $SET_DIR/neondb.dump missing" >&2; exit 1; }
[ -f "$SET_DIR/rowcounts.tsv" ] || { echo "ERROR: $SET_DIR/rowcounts.tsv missing" >&2; exit 1; }

echo "Néctar Nómada — restore verification"
echo "  backup set: $(cd "$SET_DIR" && pwd -P)"
echo "  pg tools:   $PG_BIN"

# --- checksum the artifacts before trusting them ---------------------------
if [ -f "$SET_DIR/MANIFEST.txt" ]; then
  echo "Checking manifest checksums..."
  CHECKSUM_FAIL=0
  while read -r expected file; do
    [ -n "${file:-}" ] || continue
    actual="$(cd "$SET_DIR" && shasum -a 256 "$file" | awk '{print $1}')"
    if [ "$actual" != "$expected" ]; then
      echo "  MISMATCH: $file" >&2
      CHECKSUM_FAIL=1
    fi
  done < <(sed -n '/^checksums (sha256):/,/^$/p' "$SET_DIR/MANIFEST.txt" | sed '1d;$d' | awk '{print $1, $2}')
  if [ "$CHECKSUM_FAIL" -ne 0 ]; then
    echo "FAIL: backup artifacts do not match their recorded checksums." >&2
    exit 1
  fi
  echo "  all artifacts match their recorded checksums"
fi

# --- throwaway cluster -----------------------------------------------------
WORK_DIR="$(mktemp -d /tmp/nn-verify.XXXXXX)"
PGDATA="$WORK_DIR/pgdata"
SOCK_DIR="$WORK_DIR/sock"
mkdir -p "$SOCK_DIR"

cleanup() {
  if [ -d "$PGDATA" ]; then
    pg_run "$PG_BIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Creating throwaway cluster in $WORK_DIR ..."
pg_run "$PG_BIN/initdb" -D "$PGDATA" -U postgres --encoding=UTF8 --no-sync >/dev/null 2>&1

# Unix socket only: no TCP listener, so this cannot collide with any Postgres
# already running on this machine.
pg_run "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$WORK_DIR/postgres.log" \
  -o "-k $SOCK_DIR -h ''" -w start >/dev/null 2>&1

LOCAL="postgresql://postgres@/postgres?host=$SOCK_DIR"
pg_run "$PG_BIN/psql" "$LOCAL" -q -c 'create database restored' >/dev/null
RESTORED="postgresql://postgres@/restored?host=$SOCK_DIR"

# --- restore ---------------------------------------------------------------
# --no-owner / --no-privileges: neondb_owner and ai_service are Neon roles and
# do not exist here. Their absence is expected, not a failure of the backup.
echo "Restoring..."
set +e
pg_run "$PG_BIN/pg_restore" \
  --dbname="$RESTORED" \
  --no-owner \
  --no-privileges \
  "$SET_DIR/neondb.dump" > "$WORK_DIR/restore.out" 2> "$WORK_DIR/restore.err"
RESTORE_RC=$?
set -e

RESTORE_ERRORS="$(grep -c '^pg_restore: error' "$WORK_DIR/restore.err" 2>/dev/null || true)"
RESTORE_ERRORS="${RESTORE_ERRORS:-0}"

if [ "$RESTORE_ERRORS" -gt 0 ]; then
  echo "  pg_restore reported $RESTORE_ERRORS error(s) — first few:"
  grep '^pg_restore: error' "$WORK_DIR/restore.err" | head -5 | sed 's/^/    /'
  cp "$WORK_DIR/restore.err" "$SET_DIR/restore-errors.log"
  echo "    (full log copied to $SET_DIR/restore-errors.log)"
else
  echo "  restored with no errors"
fi

# --- the actual verification ----------------------------------------------
echo "Recomputing row census on the restored copy..."
row_census "$RESTORED" > "$WORK_DIR/restored-rowcounts.tsv"

if diff -u "$SET_DIR/rowcounts.tsv" "$WORK_DIR/restored-rowcounts.tsv" > "$WORK_DIR/census.diff"; then
  TABLES="$(wc -l < "$SET_DIR/rowcounts.tsv" | tr -d ' ')"
  ROWS="$(awk -F'\t' '{s+=$2} END {print s+0}' "$SET_DIR/rowcounts.tsv")"
  echo ""
  echo "PASS — restored copy matches the source exactly."
  echo "  $TABLES tables, $ROWS rows, every count identical."
  echo ""
  echo "  This backup is restorable into stock PostgreSQL 18 with no Neon"
  echo "  involvement. Provider exit is demonstrated, not assumed."
  {
    echo ""
    echo "verified_at_utc:  $(date -u +%Y-%m-%dT%H%M%SZ)"
    echo "verified_result:  PASS ($TABLES tables, $ROWS rows, restore errors: $RESTORE_ERRORS)"
  } >> "$SET_DIR/MANIFEST.txt"
  exit 0
else
  echo ""
  echo "FAIL — restored copy does not match the source." >&2
  echo "  '-' is the source census, '+' is what came back:" >&2
  head -40 "$WORK_DIR/census.diff" | sed 's/^/  /' >&2
  cp "$WORK_DIR/census.diff" "$SET_DIR/census-mismatch.diff"
  echo "  (full diff at $SET_DIR/census-mismatch.diff)" >&2
  {
    echo ""
    echo "verified_at_utc:  $(date -u +%Y-%m-%dT%H%M%SZ)"
    echo "verified_result:  FAIL — see census-mismatch.diff"
  } >> "$SET_DIR/MANIFEST.txt"
  exit 1
fi
