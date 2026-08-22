# Backup and recovery

Operational runbook. The reasoning behind it is ADR-055; this file is what
you follow when something has gone wrong, or on the schedule below.

## What is protected, and what is not

| | Covered | How |
|---|---|---|
| Neon Postgres (`neondb`, 12 schemas, 122 tables) | **yes** | `npm run backup:db`, verified by `npm run backup:verify` |
| R2 media objects | **no** | only R2's own durability — see "Known gaps" |
| `.env` secrets (`AUTH_SECRET`, R2 keys, Neon password) | **no** | held on this machine only |
| Application code, schema history | yes | git |

A restored database plus this repository is a working platform. A restored
database alone is not: you need `.env` too, and it is deliberately not in
any backup.

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

## Cadence

Manual, deliberately (ADR-055). Automate only once the manual path has been
run enough times to trust. Reasonable minimum while manual:

- before and after any `prisma migrate` against production
- after any real field session that entered data worth losing
- monthly regardless

## Known gaps

1. **R2 media has no second copy.** The `Asset` table stores
   `storage_key`, `storage_bucket`, `size_bytes` and `checksum_sha256`, so a
   reconciling backup — pull every object, verify against the recorded
   checksum, report anything missing or corrupt — is straightforward. Not
   built.
2. **No producer-facing export.** A producer cannot take their own lots,
   sensory results, or reports out of the platform. This is a product gap as
   much as an operational one.
3. **Recovery point is "whenever someone last ran it."** Manual by design
   for now; this is the cost of that choice, and it is the first thing to fix
   by automating.
4. **Secrets have no custody plan.** `.env` exists on one laptop.
