# Integrations — Néctar Nómada Digital Platform

Implements CLAUDE.md §44: "Create adapter interfaces... do not scatter
provider-specific code throughout the application." Every external system is
reached through an internal interface defined by the capability it provides, not
by the vendor. A module (commerce, environmental, AI) depends on the interface;
exactly one file per provider implements it.

---

## 1. Convention

```
/lib/integrations/<capability>/
  types.ts        -- the interface every provider must implement
  <provider>.ts   -- one file per concrete provider
  index.ts        -- exports the currently-configured provider via env-driven factory
```

Business logic imports from `<capability>/index.ts`, never from a specific
provider file. Swapping providers is a change to `index.ts`'s factory (or an env
var) plus a new provider file — not a grep-and-replace across modules.

## 2. Weather API

Interface: `WeatherProvider.getObservations(location, range) →
EnvironmentalObservation[]` (typed to the schema in `DATA_ARCHITECTURE.md` §6,
`source_type = 'weather_api'`). Initial provider: a general-purpose weather API
with historical + forecast endpoints (concrete vendor selected at implementation
time of the Environmental Data slice — not blocking the architecture pass).
Ingested observations always carry the provider's own station/grid-point
identifier in `source_reference` so a later data-quality question ("which
provider's model produced this number") is answerable.

## 3. Object / Media Storage

Interface: `ObjectStorageProvider.putObject / getSignedUrl / deleteObject`.
Provider: S3-compatible (Cloudflare R2 — `DECISIONS.md` ADR-003). The adapter is
intentionally S3-API-shaped (not a custom protocol) specifically so switching to
AWS S3 or another S3-compatible vendor later is a credentials/endpoint change,
not a rewrite.

## 4. Existing Airtable Research OS

Interface: `LegacyResearchSource.fetchRecords(table, filter) → raw records` plus
a documented, versioned field-mapping table (not inline code) translating
Airtable field names to canonical entity/module fields. This adapter is
read-oriented for migration/import (`DATA_ARCHITECTURE.md` §9 migration
discipline applies) — it is not a live dependency the running application calls
on every request. See `MVP_ROADMAP.md` for when Airtable import work is
scheduled relative to the vertical slices (not in v1's first slices; CryoBloom
data migration is explicitly deferred per CLAUDE.md §53).

## 5. Email

Interface: `EmailProvider.send(template, recipient, data)`. Transactional email
only for v1 (booking confirmations, invitations, notifications) — no marketing
email infrastructure in scope yet. Concrete provider is a standard transactional
email API (e.g. Postmark/Resend-class service), chosen at implementation time for
deliverability and Next.js/serverless compatibility; templates live in the
application, not in the provider's UI, so they're versioned in git.

## 6. Payments

Interface: `PaymentsProvider.createCharge / refund / getStatus`. Provider:
Stripe (`DECISIONS.md` ADR-008). Order/Payment records in `commerce` schema store
the provider's reference ID, never card data — no PCI-scoped data touches
Néctar Nómada's own database, by construction (Stripe Elements/Checkout handles
card entry client-side, tokenized before it reaches the application).

## 7. AI Providers

Interface: `AIProvider.complete(prompt, context) / AIProvider.embed(text)`.
Default provider: Anthropic Claude. The interface is provider-agnostic
specifically because CLAUDE.md §42 requires this ("Do NOT tightly couple business
logic to one AI vendor") — governance controls (`AI_GOVERNANCE.md`) live in the
calling service layer, above this adapter, so they apply regardless of which
model provider is configured.

## 8. Maps

Interface: `MapsProvider.geocode / reverseGeocode / renderTiles`. Provider:
Mapbox (`DECISIONS.md` ADR-009), chosen for its Postgres/PostGIS-friendly
ecosystem and custom-styling support matching the non-generic design direction in
`PLATFORM_OVERVIEW.md`.

## 9. Calendar

Interface: `CalendarProvider.createEvent / updateEvent / sendInvite`. Not
implemented in v1's scoped slices (Experiences/Bookings use their own
`ExperienceSession` scheduling data, not an external calendar dependency for
core booking logic) — this adapter exists in the architecture for a later
"sync my bookings to Google Calendar" feature, which is additive and does not
block MVP.

## 10. IoT / Data Loggers

Interface: `IoTIngestProvider.parsePayload(rawPayload, deviceId) →
EnvironmentalObservation[]`. Distinct from the Weather API adapter (§2) even
though both feed the same `environmental.observation` table — CLAUDE.md §7 is
explicit that weather APIs, stations, sensors, and manual observations must never
be treated as equivalent-provenance sources, so each ingestion path is its own
adapter with its own `source_type`, even though they converge on one schema.

## 11. Google Drive

Interface: `DocumentSourceProvider.listFiles / fetchFile`. Used for importing
existing organizational documents (protocols, reports) during migration, subject
to the same import-job discipline as `DATA_ARCHITECTURE.md` §9 — not a live
two-way sync in v1.

## 12. What is explicitly out of scope for v1 integrations

Native mobile push notifications, SMS, and multi-channel marketing automation are
named as future extensions in CLAUDE.md §34 ("Architecture should permit future
email / push / messaging integrations") but are not built or adapter-stubbed in
v1 — in-app notifications only, per that section's own stated priority.
