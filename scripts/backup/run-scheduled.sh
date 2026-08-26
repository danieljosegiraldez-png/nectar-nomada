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
#   - Says so when it fails. See below.
#
# ADR-089. This wrapper wrote its log to a file inside Google Drive, and on
# 2026-08-24 that append returned EDEADLK:
#
#   run-scheduled.sh: line 34: echo: write error: Resource deadlock avoided
#
# Which would be a lost log line, except the backup itself ran as
# `backup-db.sh >> "$LOG"` — and when a redirect cannot be opened, the command
# never runs at all. So a transient Drive condition silently skipped the
# backup, left an empty directory that looked like one, and exited 1 into
# /tmp where nothing reads it. The last successful scheduled run before that
# was 2026-08-20; nobody knew for six days.
#
# Three rules follow from it, and they are the whole design here:
#
#   1. The log lives on local disk. Drive is for artifacts, not for a file
#      appended to on every line.
#   2. Logging can never abort the run. Every write is best-effort.
#   3. Failure is announced where a person will see it, not returned as an
#      exit code to a daemon.

set -uo pipefail

REPO="/Users/danielsan/Developer/nectar-nomada-package"
cd "$REPO" || exit 1

export PATH="/Users/danielsan/.nvm/versions/node/v24.19.0/bin:$PATH"
: "${NN_BACKUP_DIR:=/Users/danielsan/Library/CloudStorage/GoogleDrive-danieljosegiraldez@gmail.com/My Drive/nectar-backups}"
export NN_BACKUP_DIR

# Local, always writable, and the conventional place for it on macOS. The
# previous location — inside NN_BACKUP_DIR — is what broke.
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/nectar-nomada-backup.log"
mkdir -p "$LOG_DIR" 2>/dev/null

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Rule 2: `|| true` on every write. A log that cannot be written is a thing to
# notice later, never a reason to skip the backup.
log() { echo "$*" >>"$LOG" 2>/dev/null || true; }

# Rule 3. launchd captures stderr to a file nobody opens, so a failure has to
# leave the process to be seen. Both channels are best-effort: a notification
# needs a logged-in session, and the status file needs Drive to be writable —
# neither is guaranteed, so neither is trusted alone.
announce_failure() {
  local message="$1"
  log "=== $(stamp) FAILED — $message ==="

  osascript -e "display notification \"$message\" with title \"Néctar Nómada backup FAILED\" sound name \"Basso\"" \
    >/dev/null 2>&1 || true

  # A file beside the backups, so the failure is visible to anyone looking at
  # the backups themselves — including from another machine, since Drive syncs
  # it. Removed on the next success, so its presence always means "the most
  # recent run failed".
  printf '%s\n%s\n\nSee %s\n' "$(stamp)" "$message" "$LOG" \
    >"$NN_BACKUP_DIR/BACKUP-FAILED.txt" 2>/dev/null || true
}

clear_failure_marker() {
  rm -f "$NN_BACKUP_DIR/BACKUP-FAILED.txt" 2>/dev/null || true
}

# Destination unavailable is a skip, not a failure: Drive not yet mounted,
# machine offline, external drive unplugged. Deliberately silent — this is the
# normal state of a laptop, and alerting on it would train the alert away.
if [ ! -d "$(dirname "$NN_BACKUP_DIR")" ]; then
  exit 0
fi
mkdir -p "$NN_BACKUP_DIR" 2>/dev/null || exit 0

log "=== $(stamp) scheduled backup starting ==="

if ! bash scripts/backup/backup-db.sh >>"$LOG" 2>&1; then
  announce_failure "the dump did not complete"
  exit 1
fi

if ! bash scripts/backup/verify-restore.sh >>"$LOG" 2>&1; then
  # Worse than a failed dump, and worth different wording: a set exists and
  # cannot be restored, which is the state ADR-055 says must never pass
  # unnoticed.
  announce_failure "a backup was written but did NOT restore"
  exit 1
fi

log "=== $(stamp) OK — backup written and verified ==="
clear_failure_marker
exit 0
