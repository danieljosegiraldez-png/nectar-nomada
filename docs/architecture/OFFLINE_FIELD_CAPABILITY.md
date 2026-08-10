# Offline Field Capability — Néctar Nómada Digital Platform

Extends `MVP_ROADMAP.md` §3 (which previously deferred full offline
operation broadly) into a real, scoped architecture — created because two
independent planning documents (`GUIDED_FIELD_STUDY_TOOL.md` §8 and
`MAP_AND_TERRITORY.md`) each needed offline support on their own, which is
a real signal this deserved its own dedicated piece rather than being
re-solved per feature.

**Scope, confirmed broad**: general Partner Workspace forms, not just Field
Study and Map — any data-entry surface a partner or staff member might use
at a remote site with poor/no connectivity.

---

## 1. Technical approach — PWA, no separate native app

**Progressive Web App (service worker + local storage)**, running in the
browser at the same site — not a separate native app requiring
installation. This keeps the platform's single-deployable, low-ops-
complexity discipline intact (`PLATFORM_OVERVIEW.md` §5) rather than adding
a second codebase/deployment target for mobile.

```
- Service worker caches: app shell, map tiles for recently-viewed areas
  (per MAP_AND_TERRITORY.md), and form schemas for offline-capable forms.
- Local storage (IndexedDB): draft records created/edited while offline,
  queued for sync.
```

## 2. What gets offline support

Broad scope, confirmed: any Partner Workspace form, Field Study Tool
entries (Specimen tagging, floral resource entries, voice memos, photos),
and the map view for recently-accessed areas. Not scoped to a fixed list —
new forms built later can opt into the same offline-draft pattern rather
than each needing its own bespoke offline handling.

## 3. Draft lifecycle

```
offline.draft_record(id, entity_type, entity_id (nullable — null until
  first sync creates it), payload jsonb, created_by_person_id, created_at,
  device_id, sync_status [pending|syncing|synced|conflict], last_sync_attempt_at)
```

- **No expiry, no time limit** — drafts persist locally until connectivity
  returns, however long that takes. No forced alert or deletion after a
  fixed window.
- **Visible offline indicator**: while working without connectivity, the
  interface shows a persistent, honest indicator ("No connection — changes
  will sync later") — not silent background handling. The person doing
  field work should always know their current state, not discover after
  the fact whether something saved.

## 4. Conflict resolution — versioned, never silently overwritten

When two people capture offline data about the same entity (e.g., two
people independently tag the same tree while both offline) and both sync:
**both records are saved as separate versions for later human review** —
never last-write-wins, never automatic merging.

```
offline.sync_conflict(id, entity_type, entity_id, draft_record_ids
  (array — the competing versions), status [pending_review|resolved],
  resolved_by_person_id (nullable), resolution_notes (nullable))
```

This is exactly consistent with the version-preservation principle already
running through this entire platform (`CLAUDE.md` §3, `DATA_ARCHITECTURE.md`
§2's `superseded_by` pattern) — a sync conflict isn't a special case
requiring new philosophy, it's the same "never silently lose data, corrections
are new versions" rule applied to the specific case of two offline drafts
colliding.

## 5. Storage quota handling

The interface alerts the user if device storage is filling up with
unsynced drafts/photos/voice memos before sync has occurred — a real
practical concern for multi-day remote fieldwork accumulating photo-heavy
Specimen entries. This is a warning, not a hard block — the person doing
field work should know their device is filling up, not be prevented from
continuing to document what they're seeing.

## 6. Sync behavior

- Automatic background sync attempt when connectivity returns (standard
  service-worker background sync pattern), plus a manual "sync now" option
  so someone isn't purely dependent on automatic detection.
- Media (photos, voice memos) sync after structured data, given their
  larger size — a draft's text/structured fields sync first so the record
  exists, then attached media follows, rather than blocking the whole
  record on the slowest part.

## 7. Relationship to Map & Territory

`MAP_AND_TERRITORY.md` §12 references this document for its offline
requirement rather than duplicating it — recently-viewed map tiles cache
via the same service-worker mechanism (§1) as form drafts, so field work
in a remote area has both the map and the data-entry forms available
without connectivity, using one offline system, not two.

## 8. Sequencing

This is genuinely cross-cutting infrastructure, not owned by one slice —
build the base PWA/service-worker/sync mechanism once Field Study Tool or
Partner Workspace forms are actually being implemented (whichever comes
first triggers building this), then every subsequent offline-capable
surface (the map, later forms) plugs into the same mechanism rather than
reinventing it. Log acceptance in `DECISIONS.md`, and note in
`GUIDED_FIELD_STUDY_TOOL.md`'s own §8 that its offline requirement is now
satisfied by this document rather than left as its own open flag.
