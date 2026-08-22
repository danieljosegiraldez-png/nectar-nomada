#!/usr/bin/env bash
# Seal .env into the backup destination as an encrypted blob.
#
# A restored database is not a restored system. Without AUTH_SECRET every
# existing session and token is invalid; without the R2 credentials the media
# pipeline cannot address its own bucket. The database backups (ADR-055)
# deliberately contain none of these, so this covers the other half.
#
# The passphrase is typed by you, used in memory, and never written anywhere.
# It is NOT stored beside the ciphertext, is NOT in this repository, and is
# NOT recoverable if you lose it — put it in your password manager BEFORE
# running this. Ciphertext in Google Drive plus a passphrase in a password
# manager is two custodians; ciphertext plus a passphrase in the same Drive
# would be one, and pointless.
#
# Usage:  npm run secrets:seal

set -euo pipefail

cd "$(dirname "$0")/../.."

ENV_FILE=".env"
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found" >&2; exit 1; }

BACKUP_DIR="${NN_BACKUP_DIR:-$HOME/nectar-backups}"
BACKUP_PARENT="$(dirname "$BACKUP_DIR")"
[ -d "$BACKUP_PARENT" ] || {
  echo "ERROR: backup destination not available (missing $BACKUP_PARENT)." >&2
  echo "Same guard as backup-db.sh: refusing to write to an unmounted path." >&2
  exit 1
}

SECRETS_DIR="$BACKUP_DIR/secrets"
mkdir -p "$SECRETS_DIR"
OUT="$SECRETS_DIR/env.enc"

# PBKDF2-HMAC-SHA256, 600k iterations, random salt. LibreSSL ships with macOS,
# which matters: `age` and `gpg` are not installed here and there is no
# Homebrew to install them, and a recovery tool you cannot run on a fresh
# machine is not a recovery tool.
encrypt() { openssl enc -aes-256-cbc -md sha256 -pbkdf2 -iter 600000 -salt "$@"; }

printf 'Passphrase (not echoed): '
read -r -s PASS; echo
printf 'Confirm passphrase:      '
read -r -s PASS2; echo
[ -n "$PASS" ] || { echo "ERROR: empty passphrase" >&2; exit 1; }
[ "$PASS" = "$PASS2" ] || { echo "ERROR: passphrases do not match" >&2; exit 1; }
unset PASS2

TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

printf '%s' "$PASS" | encrypt -in "$ENV_FILE" -out "$TMP_OUT" -pass stdin

# Round-trip before publishing: an encrypted file nobody has decrypted is the
# same failure ADR-055 names for backups nobody has restored.
if ! printf '%s' "$PASS" | encrypt -d -in "$TMP_OUT" -pass stdin | diff -q - "$ENV_FILE" >/dev/null; then
  echo "FAIL: sealed file did not decrypt back to $ENV_FILE. Nothing written." >&2
  exit 1
fi
unset PASS

mv "$TMP_OUT" "$OUT"
trap - EXIT
chmod 600 "$OUT"

# Names only, never values: tells a future restorer what should be present
# without being a second copy of the secrets.
{
  echo "Néctar Nómada — sealed secrets inventory"
  echo "sealed_at_utc: $(date -u +%Y-%m-%dT%H%M%SZ)"
  echo "source:        .env"
  echo "cipher:        AES-256-CBC, PBKDF2-HMAC-SHA256, 600000 iterations, salted"
  echo "sha256:        $(shasum -a 256 "$OUT" | awk '{print $1}')"
  echo ""
  echo "Keys contained (names only — no values here):"
  grep -oE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z_0-9]*=' "$ENV_FILE" \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=$//' | sort | sed 's/^/  - /'
  echo ""
  echo "To recover:  npm run secrets:open"
  echo "The passphrase is in your password manager. It is nowhere else."
} > "$SECRETS_DIR/INVENTORY.txt"

echo ""
echo "Sealed and round-trip verified:"
echo "  $OUT  ($(ls -lh "$OUT" | awk '{print $5}'))"
echo "  $SECRETS_DIR/INVENTORY.txt"
echo ""
echo "Re-run this after any secret changes — rotating the Neon password, adding"
echo "Stripe or Google OAuth keys. A stale seal restores a system that cannot"
echo "connect to anything."
