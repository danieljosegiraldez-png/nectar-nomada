# Media Intelligence Pipeline — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §3 (Asset), `DATA_ARCHITECTURE.md` §5 (media/object
storage), `AI_GOVERNANCE.md`, and `INTEGRATIONS.md` §11 (Google Drive). This
document specifies how existing expedition/project/branding imagery (currently
in Google Drive under `nectarnomada@gmail.com`) is ingested, studied, and used
to generate new content — marketing, storytelling, documentary, background
imagery — without ever modifying the original source material.

---

## 1. The non-destructive principle (governs everything below)

This is a specific application of the version-preservation rule already in
`CLAUDE.md` §3 and `PLATFORM_OVERVIEW.md` §3: **original assets are read-only,
permanently.**

- The Google Drive integration is **read-only at the credential level** — the
  OAuth scope or service account requested has no write/delete permission on
  Drive. This isn't just an application-logic promise; it's the actual
  permission grant, so "the pipeline accidentally modifies a source file" is
  not a bug class that can occur (same enforcement pattern as
  `AI_GOVERNANCE.md` §3's database-level AI write restriction).
- Every file ingested from Drive becomes a **new** `core.asset` row pointing to
  a copy in your own object storage (Cloudflare R2, per `DECISIONS.md`
  ADR-003) — the platform never treats the live Drive file as its storage
  backend. Once copied, that original copy is immutable, same as any other
  Asset original (`DATA_ARCHITECTURE.md` §5).
- Anything AI-generated from a source asset — a composited background, a
  marketing crop, a generated variation — is stored as a **new Asset row**
  with `derivative_of_asset_id` pointing back to the source(s). The source
  itself is never overwritten, edited in place, or replaced.

## 2. Ingestion (Phase A — no AI involved yet)

Straightforward cataloging, usable as soon as Discover/Story pages need real
media (`MVP_ROADMAP.md` Slice 2 onward):

```
GoogleDriveProvider.listFiles(folderId) → file list
GoogleDriveProvider.fetchFile(fileId) → binary + metadata
```

Import job (`ExternalImportJob` pattern, consistent with
`NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` §25):

1. List files in designated brand/expedition folders.
2. For each new or changed file: download, checksum, upload to
   `nectar-originals/media/{asset_id}.{ext}` in R2, create `core.asset` row
   (`storage_key`, `checksum_sha256`, `original_filename`, `mime_type`,
   `creator_person_id` if known, `captured_at` if available from EXIF/Drive
   metadata, `usage_rights`, `status = 'imported_unreviewed'`).
3. Record `source_reference` (Drive file ID + folder path) so provenance back
   to the original Drive location is always traceable, even though the
   platform's copy is now authoritative for platform use.
4. Human reviews `imported_unreviewed` assets, sets `usage_rights` and
   `status = 'verified'` before anything downstream (AI or public display)
   uses them — an unreviewed import is not automatically public-facing.

This phase produces zero new content — it's a catalog, not a generator. It's
useful on its own: it's what lets Location/Project/Story pages actually show
your real photography instead of placeholders.

## 3. AI-assisted content generation (Phase B — the "study, generate, combine,
storytell" layer)

This is a `suggestion_type` family within the existing AI Suggestion lifecycle
(`AI_GOVERNANCE.md` §4) — not a new governance model. Every output here is a
`pending` `ai.recommendation` row until a human reviews it.

**What this layer can produce**, all as suggestions:

- Marketing copy drafts referencing/describing specific Assets or Projects.
- Story/documentary narrative drafts assembled from multiple source Assets
  (e.g., stitching an expedition's photos into a suggested narrative
  sequence).
- Generated or composited imagery — "eye candy," background imagery, social
  media crops/treatments — produced *from* or *inspired by* your source
  photography and brand assets (logo, color story), not generic stock.
- Suggested combinations/collections (e.g., "these 12 assets from Kiva Estate
  and Las Nubes could form one storytelling set").

**What it explicitly cannot do**, per `AI_GOVERNANCE.md` §2 applied here:

- Cannot publish generated content directly to a public-facing surface.
- Cannot alter, crop, retouch, or "improve" the original Asset in place —
  any visual transformation produces a new derivative Asset, full stop.
- Cannot claim a generated/composited image is original photography — every
  AI-touched Asset carries `provenance_class = 'ai_suggestion'`
  (`DATA_ARCHITECTURE.md` §4) until a human explicitly promotes it, at which
  point the promotion is attributed to that human, and the AI-generated
  version is retained, not deleted, as the traceable origin
  (`AI_GOVERNANCE.md` §6 — same rule already governing AI-authored story
  text, now applied to imagery).

## 4. Fine-tuning — a separate, explicitly-flagged decision

Training a custom image-generation model on your own branded imagery (for
consistent on-brand generation) is legitimate — it's your own IP — but is
**architecturally distinct** from the ingestion/suggestion pipeline above and
should not be assumed as in-scope by default:

- It goes through the same provider-agnostic `AIProvider` adapter
  (`INTEGRATIONS.md` §7) as any other AI capability — no vendor-specific
  fine-tuning code embedded in business logic.
- Candidate providers include Adobe's Firefly custom-model tooling (you
  already have Adobe connectivity available) or another fine-tuning-capable
  image provider — the specific choice is an ADR of its own when you're ready
  to pursue it, not decided here.
- Consent/rights are not a concern in the sense of third-party content (it's
  your own material), but the same asset classification and review discipline
  applies to *outputs* of a fine-tuned model as to any other AI-generated
  Asset (§3 above).
- This is not blocking Phase A or B — treat it as an optional Phase C,
  pursued once there's a concrete volume of generated content to justify the
  setup cost.

## 5. Access control specifics

**Decision (supersedes the original assumption of a separate
`nectarnomada@gmail.com` credential):** the brand Drive's relevant folders are
now shared with `danieljosegiraldez@gmail.com` (Viewer access, confirmed
2026-08-09). The platform's Drive integration authenticates as
`danieljosegiraldez@gmail.com` and reaches the brand content through that
sharing grant, rather than provisioning a second, separate OAuth/service
credential for `nectarnomada@gmail.com` directly.

- One credential to manage instead of two — simpler secret rotation, one
  fewer OAuth consent screen to maintain.
- The read-only constraint (§1) still applies at the scope level: the
  requested Drive API scope is read-only regardless of which account
  authenticates.
- If `nectarnomada@gmail.com` is ever used for content the personal account
  should *not* see (unrelated to this platform), scope the sharing grant to
  specific folders rather than the whole Drive, and revisit this ADR if that
  becomes necessary — record any such change in `DECISIONS.md`, not as a
  silent reconfiguration.
- Stored as an environment variable per `SECURITY.md` §8 — never in the
  repository, never pasted into a chat interface. This applies regardless of
  which account authenticates.
- This is separate from any personal Google account access used ad hoc in a
  chat interface for exploration — the platform's own integration is its own
  credential, set up deliberately, not inherited from an assistant's
  connector session.

## 5a. Handling existing unorganized content (confirmed, not hypothetical)

An inventory pass (2026-08-09) confirmed the brand Drive is not
consistently organized: expedition/project folders exist at inconsistent
depth, many contain raw camera-roll exports (`IMG_1470.HEIC`,
`IMG_1541.MOV`, etc. — device-default filenames carrying no descriptive
information), and folder names range from clear (`Kiva Estate NN Apiario
Toabre`, `Fermentation Fest 2025`) to ambiguous (`nomada`, `Proyectos`,
nested nested folders of unclear scope). This changes two things about the
ingestion design in §2:

- **The importer cannot assume filename or folder name alone is meaningful
  metadata.** It should still capture both (`original_filename`, full Drive
  folder path as `source_reference` context) as low-confidence signals, but
  treat them as a starting point for human/AI-assisted tagging, not as
  reliable classification. Every imported Asset defaults to
  `status = 'imported_unreviewed'` regardless of how clean or messy its
  originating folder looked — there's no fast path that skips review because
  a folder name happened to be descriptive.
- **A dedicated triage/tagging pass, not manual pre-organization, is the
  practical path forward.** Asking you to reorganize years of expedition
  photos in Drive before ingestion is not a reasonable prerequisite. Instead:
  1. Phase A ingestion runs as designed (§2) against the Drive content as-is,
     messy structure and all — it catalogs everything into `core.asset` with
     whatever folder-path/EXIF context is available.
  2. An **AI-assisted tagging suggestion pass** (a `suggestion_type` in the
     existing AI Suggestion lifecycle, §3) proposes likely
     Project/Location/Organization associations, descriptive titles, and
     content-category tags per Asset — e.g., inferring "likely Boquete,
     likely 2024, likely coffee harvest context" from folder path + EXIF GPS/
     timestamp + visual content — all as `pending` suggestions.
  3. You (or Nathy, if given a Content/Ops Role Profile per `RBAC.md` §5)
     review and accept/correct suggestions in batches, rather than
     one-by-one — a review queue grouped by originating folder is likely the
     most efficient UI shape for this, since misfiled-together photos are
     usually correctly grouped even when the folder name itself is vague.
  4. Only reviewed/tagged Assets are eligible for public-facing use
     (Discover, Story pages) or AI-generated derivative content (§3) — an
     unreviewed import sitting in the catalog is inert, not silently
     surfaced.
- This means Phase A (cataloging) and the tagging pass together are
  realistically their own body of work, larger than "import some files" — the
  volume observed (multiple expedition folders each containing 50+ raw files)
  makes this a multi-session effort in its own right once scheduled, not a
  quick pass.

## 6. Sequencing

- **Phase A (ingestion/cataloging)** can start as early as Slice 2 (Public
  Discovery) needs real media to display — it has no AI dependency and no
  governance complexity beyond the existing Asset model.
- **Phase B (AI-assisted generation)** belongs with Slice 7 (AI), per
  `MVP_ROADMAP.md` — deliberately last, since it needs the governed data model
  and RBAC-scoped retrieval (`AI_GOVERNANCE.md` §5) to mean anything.
- **Phase C (fine-tuning)**, if pursued, comes after Phase B has real usage
  patterns to justify it.

Log this document's acceptance in `DECISIONS.md` the same way
`NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` was logged — accepted as planning
input, sequencing deferred, not an immediate build order.
