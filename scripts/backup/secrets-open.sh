#!/usr/bin/env bash
# Recover the sealed .env from the backup destination.
#
# This is the half of disaster recovery that runs on a machine that may have
# nothing else: a fresh laptop, this repository from git, and Google Drive.
# It deliberately depends on nothing but macOS's own openssl.
#
# Prints to stdout by default rather than writing .env, so recovering does not
# silently overwrite a working local environment. Redirect when you mean to:
#
#   npm run secrets:open                 # inspect
#   npm run secrets:open -- --to .env    # write it, refusing to clobber

set -euo pipefail

cd "$(dirname "$0")/../.."

BACKUP_DIR="${NN_BACKUP_DIR:-$HOME/nectar-backups}"
IN="$BACKUP_DIR/secrets/env.enc"

DEST=""
if [ "${1:-}" = "--to" ]; then
  DEST="${2:-}"
  [ -n "$DEST" ] || { echo "ERROR: --to needs a path" >&2; exit 1; }
  [ -e "$DEST" ] && { echo "ERROR: $DEST already exists; refusing to overwrite." >&2; exit 1; }
fi

[ -f "$IN" ] || {
  echo "ERROR: no sealed secrets at $IN" >&2
  echo "Run 'npm run secrets:seal' first, or point NN_BACKUP_DIR at the right place." >&2
  exit 1
}

if [ -f "$BACKUP_DIR/secrets/INVENTORY.txt" ]; then
  RECORDED="$(awk '/^sha256:/{print $2}' "$BACKUP_DIR/secrets/INVENTORY.txt")"
  ACTUAL="$(shasum -a 256 "$IN" | awk '{print $1}')"
  if [ -n "$RECORDED" ] && [ "$RECORDED" != "$ACTUAL" ]; then
    echo "WARNING: env.enc does not match the sha256 recorded in INVENTORY.txt." >&2
    echo "  recorded: $RECORDED" >&2
    echo "  actual:   $ACTUAL" >&2
    echo "Continuing — a re-seal that did not update the inventory looks like this too." >&2
  fi
fi

printf 'Passphrase (not echoed): ' >&2
read -r -s PASS; echo >&2

decrypt() { openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 600000 "$@"; }

if [ -n "$DEST" ]; then
  umask 077
  if printf '%s' "$PASS" | decrypt -in "$IN" -out "$DEST" -pass stdin 2>/dev/null; then
    unset PASS
    chmod 600 "$DEST"
    echo "Recovered to $DEST (mode 600)." >&2
  else
    unset PASS
    rm -f "$DEST"
    echo "FAILED: wrong passphrase, or the file is corrupt." >&2
    exit 1
  fi
else
  if ! printf '%s' "$PASS" | decrypt -in "$IN" -pass stdin 2>/dev/null; then
    unset PASS
    echo "FAILED: wrong passphrase, or the file is corrupt." >&2
    exit 1
  fi
  unset PASS
fi
