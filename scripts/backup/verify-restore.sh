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
# `--locale-provider=builtin --builtin-locale=C.UTF-8` iguala la colación a la de PRODUCCIÓN,
# medida el 2026-09-27: `datcollate` es `C.UTF-8` y pliega las mayúsculas acentuadas. Sin esto
# `initdb` hereda el locale del entorno —en un Mac, `C` a secas— y la copia «verificada» se
# comportaría distinto del original ante cualquier comparación que no distinga caja: los índices
# `lower(btrim(name))`, los `ILIKE`, cualquier `lower(a) = lower(b)`. `builtin` y no `libc` porque
# macOS no tiene el locale `C.UTF-8`; lo trae Postgres desde la 17. Mismo arreglo que el PR #506
# hizo en scripts/test-db.sh.
#
# **Esta bandera y la del `create database` de abajo son REDUNDANTES entre sí, y está medido.**
# Flip-test del 2026-09-28, tres corridas sobre el respaldo real: quitando sólo ésta, la copia
# sigue plegando —la del `create database` la fija—; quitando sólo la de abajo, también sigue
# —con `initdb` builtin, `template1` ya pliega y la base lo hereda—; y sólo quitando LAS DOS
# falla. O sea que quien venga y borre una «porque sobra» no romperá nada, y por eso hay que
# decir aquí que la que quede es la que guarda. No se quita ninguna: la del `initdb` protege
# cualquier otra base que se cree en este clúster, la del `create database` protege ésta aunque
# el clúster cambie.
pg_run "$PG_BIN/initdb" -D "$PGDATA" -U postgres --encoding=UTF8 --no-sync \
  --locale-provider=builtin --builtin-locale=C.UTF-8 >/dev/null 2>&1

# Unix socket only: no TCP listener, so this cannot collide with any Postgres
# already running on this machine.
pg_run "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$WORK_DIR/postgres.log" \
  -o "-k $SOCK_DIR -h ''" -w start >/dev/null 2>&1

LOCAL="postgresql://postgres@/postgres?host=$SOCK_DIR"
pg_run "$PG_BIN/psql" "$LOCAL" -q \
  -c "create database restored template template0 encoding 'UTF8' locale_provider builtin builtin_locale 'C.UTF-8'" >/dev/null
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

# --- ¿se comporta como el original? ----------------------------------------
# El censo de filas dice que están los datos; esto dice que las REGLAS son las mismas. Una copia
# creada con otra colación restaura las 199 tablas y las cuenta iguales, y aun así «DOÑA» deja de
# chocar con «Doña»: los índices únicos sobre `lower(btrim(name))` admitirían filas que el original
# rechaza. Eso no es una copia restaurable, es una parecida.
PLIEGA="$(pg_run "$PG_BIN/psql" "$RESTORED" -At -c "select lower('FERRETERÍA') = 'ferretería'")"
if [ "$PLIEGA" != "t" ]; then
  echo ""
  echo "FAIL — la copia restaurada NO pliega las mayúsculas acentuadas." >&2
  echo "  lower('FERRETERÍA') no da 'ferretería', y en producción sí (medido el 2026-09-27)." >&2
  echo "  El clúster de verificación se creó con otra colación; mira el initdb de este guion." >&2
  {
    echo ""
    echo "verified_at_utc:  $(date -u +%Y-%m-%dT%H%M%SZ)"
    echo "verified_result:  FAIL — la copia no pliega mayúsculas acentuadas"
  } >> "$SET_DIR/MANIFEST.txt"
  exit 1
fi
echo "  la copia pliega las mayúsculas acentuadas, como producción"

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
