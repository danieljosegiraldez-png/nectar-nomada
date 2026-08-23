#!/usr/bin/env bash
# Shared helpers: locate PostgreSQL 18+ client tools and derive a
# pg_dump-safe connection URL from the app's pooled DATABASE_URL.
#
# Sourced by backup-db.sh and verify-restore.sh. Not executable on its own.

set -euo pipefail

REQUIRED_PG_MAJOR=18

# --- locate client tools ---------------------------------------------------
# Neon runs PostgreSQL 18.4 (verified 2026-08-19). pg_dump refuses to dump a
# server newer than itself, so an older client is not merely suboptimal — it
# fails outright. Search PATH first, then the standard Postgres.app layout.
find_pg_bin_dir() {
  local candidate
  if command -v pg_dump >/dev/null 2>&1; then
    candidate="$(dirname "$(command -v pg_dump)")"
    if pg_major_of "$candidate/pg_dump" >/dev/null 2>&1; then
      if [ "$(pg_major_of "$candidate/pg_dump")" -ge "$REQUIRED_PG_MAJOR" ]; then
        echo "$candidate"; return 0
      fi
    fi
  fi

  for candidate in \
    "/Applications/Postgres.app/Contents/Versions/18/bin" \
    "/Applications/Postgres.app/Contents/Versions/latest/bin" \
    "$HOME/Applications/Postgres.app/Contents/Versions/18/bin" \
    "/opt/homebrew/opt/postgresql@18/bin" \
    "/usr/local/opt/postgresql@18/bin"
  do
    if [ -x "$candidate/pg_dump" ] && [ "$(pg_major_of "$candidate/pg_dump")" -ge "$REQUIRED_PG_MAJOR" ]; then
      echo "$candidate"; return 0
    fi
  done

  return 1
}

pg_major_of() {
  # "pg_dump (PostgreSQL) 18.4" -> 18
  "$1" --version 2>/dev/null | sed -nE 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/p' | head -1
}

require_pg_tools() {
  local dir
  if ! dir="$(find_pg_bin_dir)"; then
    cat >&2 <<'MSG'
ERROR: no PostgreSQL 18+ client tools found.

Neon runs PostgreSQL 18.4. pg_dump refuses to dump a server newer than
itself, so PostgreSQL 17 or older will not work here.

Install Postgres.app (bundles PG 18 plus a local server for restore tests):
  1. open ~/Downloads/Postgres-2.9.6-18.dmg
  2. drag Postgres.app into /Applications
  3. re-run this script — it finds the binaries automatically

Homebrew alternative:
  brew install postgresql@18
MSG
    return 1
  fi
  PG_BIN="$dir"
  export PG_BIN
}

# --- connection URL --------------------------------------------------------
# DATABASE_URL points at Neon's PgBouncer pooler (host contains "-pooler").
# Transaction pooling cannot hold the repeatable-read snapshot pg_dump opens
# for a consistent dump, so dumping through it can yield a torn backup.
# Always dump against the direct endpoint.
direct_url() {
  echo "$1" | sed -E 's/-pooler(\.[a-z0-9.-]*neon\.tech)/\1/'
}

# DATABASE_URL carries sslmode=verify-full, which is correct for the
# application: node-postgres validates against Node's bundled CA roots.
# libpq does not use those roots — it looks for ~/.postgresql/root.crt and
# refuses to connect when it is absent, which it is here. `sslrootcert=system`
# tells libpq (16+) to use the OS trust store instead, restoring the same
# verification the app gets.
#
# This parameter cannot live in .env: node-postgres treats sslrootcert as a
# file path and dies with ENOENT trying to open a file literally named
# "system". The two client libraries genuinely need different spellings of
# the same intent.
libpq_url() {
  # libpq refuses `sslrootcert=system` alongside a weak sslmode:
  #   weak sslmode "require" may not be used with sslrootcert=system
  # `require` encrypts but verifies nothing, so pinning a trust store with it
  # is contradictory. Upgrading to verify-full is the stricter reading and the
  # one libpq demands — it checks the certificate chain *and* the hostname.
  #
  # This applies only to the psql/pg_dump path. The application connects
  # through node-postgres, which uses Node's own CA bundle and rejects
  # `sslrootcert=system` outright (ENOENT: open 'system'), which is why the two
  # are built differently at all.
  local url="$1"
  case "$url" in
    *sslmode=require*)      url="${url/sslmode=require/sslmode=verify-full}" ;;
    *sslmode=prefer*)       url="${url/sslmode=prefer/sslmode=verify-full}" ;;
    *sslmode=allow*)        url="${url/sslmode=allow/sslmode=verify-full}" ;;
  esac
  case "$url" in
    *sslrootcert=*) echo "$url" ;;
    *\?*)           echo "$url&sslrootcert=system" ;;
    *)              echo "$url?sslrootcert=system" ;;
  esac
}

load_env() {
  local env_file="${1:-.env}"
  [ -f "$env_file" ] || { echo "ERROR: $env_file not found" >&2; return 1; }
  # Read only the keys we need; avoids sourcing arbitrary shell from .env.
  # .env line 8 is indented by a leading space AND carries a trailing space.
  # dotenv trims both; a shell grep does not, and a connection URL with a
  # trailing space makes libpq fall out of URI parsing into keyword/value
  # parsing, which fails with a message containing the password. Trim
  # explicitly: optional `export `, surrounding quotes, and whitespace at
  # both ends.
  DATABASE_URL="$(
    sed -nE 's/^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=[[:space:]]*//p' "$env_file" \
      | head -1 \
      | sed -E 's/^["'"'"']//; s/["'"'"'][[:space:]]*$//; s/[[:space:]]+$//'
  )"
  [ -n "${DATABASE_URL:-}" ] || { echo "ERROR: DATABASE_URL not set in $env_file" >&2; return 1; }
  DUMP_URL="$(libpq_url "$(direct_url "$DATABASE_URL")")"
  export DATABASE_URL DUMP_URL
}

# --- row-count census ------------------------------------------------------
# Emits "schema.table<TAB>count" for every base table, sorted. Written at dump
# time and recomputed after restore; the diff is the verification.
row_census() {
  local url="$1"
  local gen
  gen="$(pg_run "$PG_BIN/psql" "$url" -At -c "
    select string_agg(
      format('select %L::text as t, count(*)::bigint as c from %I.%I',
             table_schema || '.' || table_name, table_schema, table_name),
      ' union all ')
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema');
  ")"
  [ -n "$gen" ] || { echo "ERROR: no base tables found" >&2; return 1; }
  pg_run "$PG_BIN/psql" "$url" -At -F$'\t' -c "$gen" | sort
}

# --- credential hygiene ----------------------------------------------------
# libpq prints the whole connection string, password included, on some
# connection errors. These logs are written next to the backup and synced to
# cloud storage, so redact before anything is emitted.
redact_secrets() {
  sed -E 's#(postgres(ql)?://[^:@/]+):[^@]*@#\1:***@#g'
}

# Run a pg client tool with its stderr redacted. stdout passes through
# untouched so command substitution still works.
pg_run() {
  local errf rc
  errf="$(mktemp)"
  set +e
  "$@" 2>"$errf"
  rc=$?
  set -e
  if [ -s "$errf" ]; then
    redact_secrets < "$errf" >&2
  fi
  rm -f "$errf"
  return "$rc"
}
