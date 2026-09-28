#!/usr/bin/env bash
# A local PostgreSQL for the test suite, restored from the newest verified
# backup.
#
# Why restored rather than migrated-from-empty: two assertions in the suite
# check that real data is untouched — Las Nubes has two Projects, Cerro Azul
# six plots — so a freshly migrated and seeded database cannot satisfy them.
# A restore gives the suite the same shape production has, which is also what
# makes it a faithful rehearsal rather than an approximation.
#
# The cluster is self-contained: its own data directory, its own port, its own
# Unix socket. It does not touch any PostgreSQL you may already run, and
# `down` leaves nothing behind but the data directory, which `reset` rebuilds.
#
#   npm run test:db up      start it and restore the newest backup
#   npm run test:db reset    throw the data away and restore again
#   npm run test:db down     stop it
#   npm run test:db status   is it running, and what is in it

set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/backup/pg-tools.sh

# Kept out of the repository and out of /tmp: the suite is slow enough that
# rebuilding this on every reboot would be a reason to stop using it.
CLUSTER_DIR="${NN_TEST_DB_DIR:-$HOME/Library/Application Support/NectarNomada/testdb}"
PGDATA="$CLUSTER_DIR/pgdata"
# Unix sockets are capped near 103 bytes, and the path above is already long.
SOCK_DIR="/tmp/nn-testdb"
PORT="${NN_TEST_DB_PORT:-55433}"
DB_NAME="nectar_test"
TEST_URL="postgresql://postgres@127.0.0.1:$PORT/$DB_NAME"

running() {
  [ -d "$PGDATA" ] && "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1
}

start_cluster() {
  mkdir -p "$SOCK_DIR"
  if [ ! -d "$PGDATA" ]; then
    echo "Creating the test cluster (first run only)..."
    mkdir -p "$CLUSTER_DIR"
    # `--locale-provider=builtin --builtin-locale=C.UTF-8` iguala la colación a la de
    # PRODUCCIÓN, medida el 2026-09-27 contra Neon: `datcollate` es `C.UTF-8`. Sin esto
    # `initdb` hereda el locale del entorno —en un Mac, `C` a secas—, donde `lower('Í')`
    # devuelve 'Í' y «FERRETERÍA EL PUENTE» NO choca con «Ferretería El Puente», mientras
    # que en producción y en CI sí. Lo que se rompe es el PLEGADO DE CAJA —el orden sale
    # igual en las dos, porque ambas ordenan por bytes—, o sea todo lo que compara sin
    # distinguir mayúsculas: los índices `lower(btrim(name))`, el `mode: "insensitive"` de
    # Prisma y cualquier `lower(a) = lower(b)`. Pasó con tests/equipos/proveedores.test.ts.
    #
    # `builtin` y no `libc`: macOS **no tiene** el locale `C.UTF-8` —sólo `en_US.UTF-8`,
    # que ordena distinto—, así que pedírselo a la libc fallaría o mentiría. El proveedor
    # builtin lo trae Postgres desde la 17 y da exactamente C.UTF-8 en cualquier sistema.
    "$PG_BIN/initdb" -D "$PGDATA" -U postgres --encoding=UTF8 --no-sync \
      --locale-provider=builtin --builtin-locale=C.UTF-8 >/dev/null
  fi
  if ! running; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$CLUSTER_DIR/postgres.log" \
      -o "-p $PORT -h 127.0.0.1 -k $SOCK_DIR" -w start >/dev/null
  fi
}

newest_backup() {
  local dir="${NN_BACKUP_DIR:-$HOME/nectar-backups}"
  local set_dir
  set_dir="$(find "$dir" -maxdepth 1 -type d -name '20*T*Z' 2>/dev/null | sort | tail -1)"
  [ -n "$set_dir" ] && [ -f "$set_dir/neondb.dump" ] || return 1
  echo "$set_dir"
}

restore() {
  local set_dir
  if ! set_dir="$(newest_backup)"; then
    cat >&2 <<MSG
ERROR: no backup to restore from.

Looked in: ${NN_BACKUP_DIR:-$HOME/nectar-backups}

Take one first:
  npm run backup:db
MSG
    return 1
  fi
  echo "Restoring from $(basename "$set_dir")..."
  "$PG_BIN/psql" "postgresql://postgres@127.0.0.1:$PORT/postgres" -q \
    -c "drop database if exists $DB_NAME with (force)" \
    -c "create database $DB_NAME template template0 encoding 'UTF8' locale_provider builtin builtin_locale 'C.UTF-8'"
  # --no-owner/--no-privileges: neondb_owner and ai_service are Neon roles and
  # do not exist here, exactly as in verify-restore.sh.
  "$PG_BIN/pg_restore" --dbname="$TEST_URL" --no-owner --no-privileges "$set_dir/neondb.dump" 2>/dev/null || true
  local tables
  tables="$("$PG_BIN/psql" "$TEST_URL" -At -c \
    "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")"
  echo "  restored $tables tables"
}

announce() {
  cat <<MSG

Test database ready.

  export TEST_DATABASE_URL="$TEST_URL"
  npm test

Add that export to your shell profile to make it the default. The suite
refuses to run against a remote database without ALLOW_REMOTE_TEST_DB=1,
so this is the path of least resistance as well as the safe one.
MSG
}

require_pg_tools

case "${1:-up}" in
  up)
    start_cluster
    if "$PG_BIN/psql" "$TEST_URL" -At -c 'select 1' >/dev/null 2>&1; then
      # Una base creada antes del 2026-09-27 hereda la colación del entorno y NO pliega las
      # mayúsculas acentuadas, al revés que producción. Decirlo AQUÍ importa: sin esto `up`
      # anunciaba "Already up" tan campante, el guardia tests/arquitectura/colacion-de-la-base
      # seguía en rojo, y su instrucción devolvía a este mismo comando — el ciclo que enseña a
      # ignorar un guardia (hallazgo 3 de Codex, 2026-09-27).
      if [ "$("$PG_BIN/psql" "$TEST_URL" -At -c "select lower('FERRETERÍA') = 'ferretería'" 2>/dev/null)" != "t" ]; then
        cat >&2 <<MSG

Esta base es ANTERIOR al arreglo de colación: no pliega las mayúsculas acentuadas, y
producción sí. Las pruebas que corras contra ella pueden pasar aquí y caer en CI.

'up' no la puede arreglar: sólo restaura cuando no hay datos. Hay que recrearla, y eso
BORRA lo que tenga dentro:

  npm run test:db -- reset

MSG
        exit 1
      fi
      echo "Already up, with data. Use 'reset' to restore it again."
    else
      restore
    fi
    announce
    ;;
  reset)
    start_cluster
    restore
    announce
    ;;
  down)
    if running; then
      "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null
      echo "Test database stopped. Data kept — 'up' brings it back."
    else
      echo "Not running."
    fi
    ;;
  status)
    if running; then
      echo "Running on port $PORT."
      "$PG_BIN/psql" "$TEST_URL" -At -F' | ' -c "
        select 'tables', count(*)::int from information_schema.tables
          where table_schema not in ('pg_catalog','information_schema')
        union all select 'audit_event', count(*)::int from core.audit_event" 2>/dev/null \
        | sed 's/^/  /' || echo "  (no $DB_NAME database yet — run 'up')"
    else
      echo "Not running. Start it with: npm run test:db up"
    fi
    ;;
  *)
    echo "Usage: npm run test:db [up|reset|down|status]" >&2
    exit 1
    ;;
esac
