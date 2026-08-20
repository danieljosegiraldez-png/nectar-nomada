#!/usr/bin/env bash
# Wrapper for the scheduled (launchd) backup. Not for interactive use —
# run `npm run backup:db` directly for that.
#
# Differences from an interactive run, all of them about surviving a laptop:
#   - Skips quietly when the destination is not mounted. A backup laptop
#     spends a lot of its life with Drive still starting up or the network
#     down, and a screaming failure every time trains you to ignore it.
#   - Verifies the set it just wrote. An unattended backup nobody restores
#     is exactly the thing ADR-055 exists to prevent.
#   - Appends to a log beside the backups, so the record of what ran lives
#     with the artifacts rather than in a terminal that has scrolled away.

set -uo pipefail

REPO="/Users/danielsan/Downloads/nectar-nomada-package"
cd "$REPO" || exit 1

export PATH="/Users/danielsan/.nvm/versions/node/v24.19.0/bin:$PATH"
: "${NN_BACKUP_DIR:=/Users/danielsan/Library/CloudStorage/GoogleDrive-danieljosegiraldez@gmail.com/My Drive/nectar-backups}"
export NN_BACKUP_DIR

LOG_DIR="$NN_BACKUP_DIR"
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Destination unavailable is a skip, not a failure: Drive not yet mounted,
# machine offline, external drive unplugged.
if [ ! -d "$(dirname "$NN_BACKUP_DIR")" ]; then
  exit 0
fi
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0
LOG="$LOG_DIR/scheduled.log"

echo "=== $(stamp) scheduled backup starting ===" >> "$LOG"

if bash scripts/backup/backup-db.sh >> "$LOG" 2>&1; then
  if bash scripts/backup/verify-restore.sh >> "$LOG" 2>&1; then
    echo "=== $(stamp) OK — backup written and verified ===" >> "$LOG"
    exit 0
  fi
  echo "=== $(stamp) FAILED — backup written but did NOT verify ===" >> "$LOG"
  exit 1
fi

echo "=== $(stamp) FAILED — backup did not complete ===" >> "$LOG"
exit 1
