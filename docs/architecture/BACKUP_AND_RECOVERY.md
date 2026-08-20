# Backup and recovery

Operational runbook. The reasoning behind it is ADR-055; this file is what
you follow when something has gone wrong, or on the schedule below.

## What is protected, and what is not

| | Covered | How |
|---|---|---|
| Neon Postgres (`neondb`, 12 schemas, 122 tables) | **yes** | `npm run backup:db`, verified by `npm run backup:verify` |
| R2 media objects | **no** | only R2's own durability — see "Known gaps" |
| `.env` secrets (`AUTH_SECRET`, R2 keys, Neon password) | **yes** | `npm run secrets:seal` — encrypted blob beside the backups (ADR-057) |
| Application code, schema history | yes | git |

A restored database plus this repository plus the sealed `.env` is a working
platform. The database backups deliberately contain no secrets — those are
sealed separately under a passphrase only you hold, so that someone with the
Drive folder has ciphertext rather than credentials.

## Taking a backup

```bash
npm run backup:db
```

Writes a timestamped set to `$NN_BACKUP_DIR` (default `~/nectar-backups`):

- `neondb.dump` — `pg_dump` custom format, restorable into any PostgreSQL 18+
- `schema.sql` — schema only, plain text, so structural drift between
  backups is visible with `diff`
- `rowcounts.tsv` — per-table census taken at dump time
- `MANIFEST.txt` — versions, sizes, SHA-256 of every artifact, the git
  commit that was live, and whether the tree was dirty

`latest` symlinks to the newest set.

## Verifying it (do not skip)

```bash
npm run backup:verify
```

Creates a throwaway local PostgreSQL cluster, restores into it, recomputes
the census, and diffs. **It passes only if every table's row count matches.**
The result is appended to that set's `MANIFEST.txt`.

A backup that has not been verified is a hope, not a backup. Verify at least
the first backup of any month, and always after a schema migration.

## Restoring for real

Into any PostgreSQL 18+ instance:

```bash
createdb restored
pg_restore --dbname=restored --no-owner --no-privileges neondb.dump
```

`--no-owner --no-privileges` is required off Neon: `neondb_owner` and
`ai_service` do not exist there.

To restore *back into Neon* after a bad migration, prefer Neon's PITR — it is
faster and does not need a dump. Use these files when the Neon account itself
is the problem.

## Changing where backups go

One variable, no code change:

```bash
NN_BACKUP_DIR="$HOME/Library/CloudStorage/GoogleDrive-<account>/My Drive/nectar-backups" npm run backup:db
```

Set it permanently in your shell profile once Google Drive for desktop is
installed. Until then backups sit in `~/nectar-backups` and share this
laptop's fate.

## Secrets

The database backups contain no credentials. Recovering the platform needs
`.env` too, and it is sealed separately:

```bash
npm run secrets:seal              # encrypt .env into <destination>/secrets/
npm run secrets:open              # print it back
npm run secrets:open -- --to .env # write it, refusing to overwrite
```

AES-256-CBC with PBKDF2-HMAC-SHA256 at 600,000 iterations and a random salt,
via the `openssl` macOS already ships. That choice is deliberate: `age` and
`gpg` are not installed here and there is no Homebrew, and a recovery tool you
cannot run on a fresh machine is not a recovery tool.

Sealing verifies its own round-trip before publishing — it decrypts what it
just wrote and compares it to `.env`, refusing to leave a file behind if they
differ. Same principle as verifying a database restore.

**The passphrase lives in your password manager and nowhere else.** Not in
this repository, not in Drive, not beside the ciphertext — ciphertext and
passphrase in the same place is one custodian, which is no better than none.
If you lose it, the seal is unrecoverable; there is no reset.

`secrets/` sits outside the timestamped set directories, so retention pruning
never touches it. `INVENTORY.txt` beside the blob lists key *names* only, so a
future restorer can tell what should be present without it being a second copy
of the secrets.

## Cadence

Two paths, both writing to the same destination.

**Manual** — `npm run backup:db` then `npm run backup:verify`. Use before and
after any `prisma migrate` against production, and after any real field
session that entered data worth losing.

**Scheduled** — `scripts/backup/run-scheduled.sh`, driven by the launchd job
in `scripts/backup/com.nectarnomada.backup.plist` (Mondays 09:00 local). It
differs from an interactive run in three ways that matter on a laptop:

- it **skips silently** when the destination is not mounted, because a laptop
  spends much of its life with Drive still starting or the network down, and
  an alarm on every one of those trains you to ignore alarms;
- it **verifies what it just wrote**, since an unattended backup nobody
  restores is the exact failure ADR-055 exists to prevent;
- it logs to `scheduled.log` beside the backups, so the record lives with the
  artifacts.

`StartCalendarInterval` rather than `StartInterval`: a machine asleep at the
scheduled time runs the job once on next wake instead of skipping the week.

To install it:

```bash
cp scripts/backup/com.nectarnomada.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nectarnomada.backup.plist
```

To check or remove it:

```bash
launchctl list | grep nectarnomada
launchctl unload ~/Library/LaunchAgents/com.nectarnomada.backup.plist
```

**Retention.** Each run keeps the newest `NN_BACKUP_KEEP` sets (default 14)
and deletes older ones. Pruning only ever removes whole timestamped set
directories, never the set just written and nothing else in the destination.
At roughly 1.3 MB per set this is about cloud tidiness, not space.

## Known gaps

1. **R2 media has no second copy — but there is currently no media.**
   Verified 2026-08-20: `core.asset` holds 0 rows and the `nectar-nomada`
   R2 bucket holds 0 objects. The gap is real in design and empty in
   practice, so no reconciliation tooling has been built — deliberately,
   per `SECURITY.md`'s own rule that need justifies complexity rather than
   anticipation of it. The same check confirmed the R2 credentials
   authenticate. The moment real photos exist this becomes urgent, and the
   `Asset` table already stores `storage_key`, `storage_bucket`,
   `size_bytes` and `checksum_sha256`, so a reconciling backup — pull every
   object, verify against the recorded checksum, report anything missing or
   corrupt — is straightforward to write against real data.

2. **No producer-facing export.** A producer cannot take their own lots,
   sensory results, or reports out of the platform. This is a product gap as
   much as an operational one.
3. **Recovery point is up to a week.** The scheduled job is weekly and only
   runs while this laptop is awake and Drive is mounted. Anything entered
   between runs is protected only by Neon's own PITR.
4. **The seal goes stale silently.** Nothing checks that `secrets/env.enc`
   still matches `.env`. Re-run `npm run secrets:seal` after rotating the Neon
   password or adding Stripe/Google keys, or recovery restores a system that
   cannot connect to anything.
5. **Vercel's environment variables are a separate custodian.** Production
   reads its secrets there, not from `.env`, and they are not covered by the
   seal. Changes made in one place do not propagate to the other.
