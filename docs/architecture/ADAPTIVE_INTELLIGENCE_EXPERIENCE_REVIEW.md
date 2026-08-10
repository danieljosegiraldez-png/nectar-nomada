# Adaptive Intelligence & Experience Architecture — Review

**Status: approved (see `DECISIONS.md` ADR-018).** Nothing is implemented, no
schema changed, no dependency installed yet — approval covers architecture
and sequencing; Foundational-phase implementation begins when
`MVP_ROADMAP.md` Slice 2 is kicked off.

Input: `NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md` (2,506 lines,
referenced throughout as "the input document"). Note: your prompt named it
`NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE_INPUT.md`; no file with that
exact name exists in the repo — this is the same naming-mismatch pattern as
the external-data document, and this is the file that matches your
description. Flagged, not silently guessed around.

This review treats the input document exactly as instructed: product and
architecture *input*, not an implementation checklist. Its own §71 asks for a
narrower deliverable (`CONTENT_EXPERIENCE_ARCHITECTURE.md`); your chat
instruction supersedes that with the broader structure below, so that
structure is what this document follows.

---

## Executive Summary

The input document is, structurally, a large elaboration of one module
`PLATFORM_OVERVIEW.md` and `DOMAIN_MODEL.md` already named but did not
flesh out: **Story & Knowledge Engine** (`DOMAIN_MODEL.md` §4;
`CLAUDE.md` §16 already lists Story, Article, Interview, Media Collection,
Source, Quote, Transcript, Topic, Tag as entities in this module). Most of
what the input document proposes — `Story`, `Interview`, `Transcript`,
`Quote`, `MediaAsset` — is not a new concept for this platform; it is the
detail that module was always going to need, arriving now instead of at
Slice-2 time. The genuinely new material is the *intelligence* layer wrapped
around it: AI-assisted content enrichment, semantic search, adaptive
experience composition, an operator copilot, and a creative-opportunity
pipeline.

The central finding of this review: **almost none of this can be built yet**,
because `Location`, `Project`, `Organization`, and `Sample` — the entities
every proposed content/experience object attaches to — don't exist in the
database (only Slice 1 Identity is implemented; §B). That reframes the whole
exercise from "which of these 70+ ideas do we build" to "which of these ideas
extend an already-approved architecture cleanly, and in what order do the
prerequisites actually unlock them." Three governance mechanisms already
approved in this codebase — the provenance model (`PLATFORM_OVERVIEW.md` §3),
the AI suggestion/review/audit loop (`AI_GOVERNANCE.md`), and RBAC
classification (`RBAC.md` §6) — turn out to cover most of what the input
document asks for under new names (`AISuggestion`, information-leakage
prevention, rights gating). The real architectural work is recognizing that
and generalizing, not building parallel systems (§E).

## A. Executive Summary

(See above — kept as its own heading per the requested structure; not
repeated verbatim.)

## B. Existing Repository State

**What is actually implemented today:** `Person`, `UserAccount`,
`RoleProfile`, `Permission`, `RoleProfilePermission`, `Scope`, `Assignment`,
`AuditEvent` (Slice 1, Identity). Nothing else — no `Location`, `Project`,
`Organization`, `Sample`, `Asset`/`MediaAsset`, `Story`, `Product`,
`Experience`, `Event`, or any Research OS / Sensory / Competition table
exists as a live Prisma model.

**What already exists as approved design** (not code) and is directly
relevant to this review:

- `DOMAIN_MODEL.md` §4 already names the "Story & Knowledge Engine" module
  and its attachment points (Story/Article/Interview → Source/Quote/
  Transcript, Media types, FK references to Person/Organization/Location/
  Project). The input document's `Interview`, `TranscriptSegment`, `Quote`
  entities are elaborations of this, not additions to it.
- `DATA_ARCHITECTURE.md` §5 already specifies the Asset metadata/binary split
  (`core.asset` in Postgres, binaries in object storage, R2 per
  `DECISIONS.md` ADR-003) — this is the same shape the input document's
  `MediaAsset`/derivative pipeline needs. One entity, not two.
- `AI_GOVERNANCE.md` §4 already defines the full suggestion lifecycle
  (`ai.recommendation`: type, model, context, evidence, confidence, reviewer,
  decision, action taken) and enforces it at the **database permission
  level** — the AI service role has no write grant on any domain table, only
  on `ai.recommendation`. The input document's `AISuggestion` entity (its
  §5/§65) is this same entity under a different name.
- `RBAC.md` §6 already defines the classification axis
  (public/registered/partner/internal/confidential/trade_secret) and §7
  already defines the blind-evaluation safeguard pattern (a restrictive,
  separately-gated permission for the blind-code mapping table) — directly
  reusable for §L's sensory/research safeguards.
- `EXTERNAL_DATA_ARCHITECTURE.md` (written earlier in this same session)
  already designs a `WEATHER_SNAPSHOT`-shaped content block backed by
  `environmental.observation`, and already establishes the pattern this
  document needs for AI provenance labeling ("NASA POWER estimated..." vs.
  "Néctar Nómada logger recorded...", its §20) — the same pattern extends
  directly to distinguishing original media/interviews from AI-generated
  content (§H below).
- `INTEGRATIONS.md` §1 already establishes the adapter-per-capability
  convention this document's Media Architecture section (§I) extends for
  transcription/media-transform/streaming providers.
- `MVP_ROADMAP.md` Slice 2 ("Public Discovery") already scopes Location,
  Project, **Story**, Product, Experience as read-only — meaning Story
  already has a planned entry point in the roadmap; it does not need a new
  slice invented, only content and detail added to an already-scheduled one
  (§N).

**Conclusion:** this review is not identifying gaps in the architecture —
it's identifying that Slice 1 (Identity) is the only thing built, so every
question below about "how does X integrate with Location/Project/Story" is
being answered the same way `DOMAIN_MODEL.md` answered it originally: ahead
of the code, so the eventual Story/Media implementation doesn't need a
retrofit.

## C. Capability Map

| Capability | Status |
|---|---|
| Content Intelligence (classify/connect/search media) | MISSING — no MediaAsset table exists yet; the *governance* pattern it needs (AI suggestion loop) already EXISTS |
| Creative & Marketing Intelligence (opportunity detection) | MISSING — but the delivery mechanism (`ai.recommendation` + `Notification`) EXISTS |
| Audiovisual Intelligence (transcription, highlight detection, semantic search) | MISSING, FUTURE/OPTIONAL — no current media volume to justify it |
| Adaptive Experience Engine (StoryBlock/ExperienceComposition) | MISSING — see §F for recommended abstraction level |
| Adaptive UX (role/goal/device/connectivity-aware presentation) | PARTIAL — role-awareness EXISTS via RBAC (`RBAC.md`); goal/expertise/interest personalization signals are MISSING (no `CustomerProfile`/`InteractionEvent` entity yet — a real gap, flagged in §K) |
| Operator Intelligence / Copilot | MISSING, high value — OVERLAPS with the existing `ai.recommendation` + `Notification` mechanism, should not become a separate system (§G) |
| Research Intelligence | PARTIAL — the *safeguard model* (provenance_class, Evidence/Interpretation/Conclusion distinction) EXISTS in `DOMAIN_MODEL.md`/`AI_GOVERNANCE.md`; the Research OS tables themselves do not exist yet |
| Sensory Intelligence | PARTIAL — blind-coding RBAC safeguard EXISTS (`RBAC.md` §7); Sensory module tables do not exist yet |
| Personalization | MISSING — no signal-capture entities exist; CRM/preference model described in `CLAUDE.md` §15 was never added to `DOMAIN_MODEL.md`'s entity list (flagged, §K) |
| Ask Néctar (grounded conversational assistant) | MISSING, correctly sequenced last per `MVP_ROADMAP.md` Slice 7 — this review does not recommend moving it earlier |
| Continuous Learning (engagement-informed suggestions) | FUTURE/OPTIONAL — depends on Personalization + real usage data existing first |
| Field Capture Intelligence | FUTURE — depends on Partner Workspace (`MVP_ROADMAP.md` Slice 5) and offline/PWA capability (`PLATFORM_OVERVIEW.md`'s cited CLAUDE.md §40, explicitly deferred there too) |
| Content Graph (MediaAsset → depicts/documents/supports relationships) | MISSING but straightforward — standard FK/join-table modeling, no new architectural pattern needed |
| Provenance UI ("how we know this") | PARTIAL — the underlying data (provenance_class, source_reference) EXISTS in `DATA_ARCHITECTURE.md` §4; no UI exists yet because no UI beyond Slice 1 exists yet |
| Rights & Consent | MISSING, genuinely new — no existing entity covers "what channels/territories is this media licensed for" (§M) |
| Multilingual architecture | PARTIAL — `PLATFORM_OVERVIEW.md`/CLAUDE.md §41 already establishes "separate canonical data from localized display content"; no concrete `Translation`/`SubtitleTrack` entities exist yet |
| Media infrastructure (Cloudinary/Mux/etc.) | MISSING, vendor decisions deferred (§I) |
| Performance / field conditions (adaptive streaming, offline, low-bandwidth) | PARTIAL — PWA/offline direction already set in `CLAUDE.md` §40 as future work; nothing implemented |
| Creative Opportunity Detection | MISSING — OVERLAPS directly with `ai.recommendation`, should reuse it (§J) |
| Content Coverage analysis | MISSING but simple — a rule-based query over existing/future content-relationship tables, does not need AI to start (§N) |
| 3D / 360 / live streaming experiences | NOT RECOMMENDED YET — the input document itself frames these as post-MVP ("do not begin with 3D or generative video," its §67); this review agrees |

## D. Canonical Data Model Impact

**Reuse existing entities — do not duplicate:**

- `Person`, `Organization`, `Location`, `Project`, `Sample`, `Product`,
  `Experience`, `Event` — as the input document itself instructs (its §65),
  and consistent with `DOMAIN_MODEL.md` §2/§3.
- `Asset` (`DATA_ARCHITECTURE.md` §5) *is* `MediaAsset` — same metadata/
  binary split, same object-storage pattern. The input document's proposed
  `MediaAsset` fields (checksum, capture metadata, rights, creator, related
  entities) map directly onto the already-specified `core.asset` columns
  plus the new rights fields in §M below. No second table.
- `ai.recommendation` (`AI_GOVERNANCE.md` §4) *is* `AISuggestion` /
  `AIEnrichmentResult`. Content-enrichment suggestions (transcript-derived
  entity links, suggested tags, suggested quotes) are `suggestion_type`
  values on the existing table, not a new one — this keeps the single
  database-level write restriction (AI can only INSERT into
  `ai.recommendation`) covering content enrichment automatically, with no
  new security boundary to define and get right a second time.
- `Notification` (`DOMAIN_MODEL.md` §5) is the delivery mechanism for
  Operator Intelligence signals and Editorial Opportunity suggestions — not
  a new "OperatorDigest" system.
- `EvidenceClaim` (Research OS, not yet built) is where an external or
  content-derived observation becomes research evidence, exactly as
  `EXTERNAL_DATA_ARCHITECTURE.md` §17 already specifies for external data —
  the same rule applies here: a `MediaAsset` or `Interview` quote supports
  an `EvidenceClaim` only via an explicit human-mediated research workflow,
  never automatically.

**Requires new relationships (join tables), not new canonical entities:**

- `ContentEntityLink` (MediaAsset ↔ Person/Location/Project/Sample/Species) —
  a join table, not a new canonical concept, matching the "prefer first-class
  relationships over generic tags" instruction (input doc §13/§D).
- Story/Project/Location/Product/Experience cross-references for the
  "dynamic project homepage" (input doc §43) — again joins, not new
  identity-bearing entities.

**Genuinely requires new entities** (none of these duplicate anything
existing):

```
MediaAsset (= Asset, extended)   MediaDerivative   MediaSegment
Interview   TranscriptSegment    Quote
Story   StoryVersion   StoryBlock   StoryPublication
ExperienceComposition (see §F — recommend deferring the generic "block" system, reuse StoryBlock instead)
ContentEntityLink
RightsGrant   ConsentRecord   UsageRestriction   ReleaseDocument   License   (§M)
Translation   SubtitleTrack
ContentCoverageMetric   EditorialOpportunity  (both thin — see §J, mostly computed/derived, not heavily-columned tables)
CustomerProfile   DeclaredPreference   InteractionEvent   (§K — a gap in DOMAIN_MODEL.md's original entity list, not from this input document, but exposed by trying to design Personalization)
```

Deliberately **not** recommended as new entities: `SpatialAnnotation` /
`PanoramaScene` / `PanoramaHotspot` / `LiveMediaSession` /
`LiveMediaRecording` / `MediaProcessingJob` / `MediaDeliveryProvider` — these
are all EXPERIMENTAL/ADVANCED-phase concerns (§N) and designing their schema
now, before a single Story exists, would be exactly the premature-abstraction
risk `PLATFORM_OVERVIEW.md` §5 and `DECISIONS.md` generally argue against.

## E. Intelligence Architecture

The input document's biggest risk is framing Content Intelligence, Creative
Intelligence, Operator Intelligence, Research Intelligence, Sensory
Intelligence, and Personalization as if they might become five separate AI
subsystems. They should not. All six share one infrastructure, already
mostly designed:

```
Trigger (new media / project activity / external observation / research event)
        ↓
Retrieval (RBAC-scoped query over canonical + content + external data — AI_GOVERNANCE.md §5)
        ↓
Suggestion (one row in ai.recommendation — AI_GOVERNANCE.md §4)
        ↓
Human review (accept / reject / modify — same UI pattern regardless of domain)
        ↓
Action (a normal, RBAC-checked write by the human, source_ai_recommendation_id recorded)
        ↓
Audit (AuditEvent — SECURITY.md §6)
```

What differs between the six "intelligences" is only the **trigger** and the
**suggestion_type taxonomy**, not the mechanism:

| "Intelligence" | Trigger examples | `suggestion_type` examples |
|---|---|---|
| Content | New MediaAsset uploaded | `entity_link`, `suggested_tag`, `quote_candidate`, `transcript_language` |
| Creative/Marketing | Project activity milestone + sufficient coverage | `editorial_opportunity` (§J) |
| Operator | Scheduled digest / coverage-gap detection | `operator_signal` (matches `EXTERNAL_DATA_ARCHITECTURE.md` §21's identical pattern) |
| Research | Incomplete record / pattern in measurements | `research_gap`, `correlation_candidate` |
| Sensory | Panel-result pattern | `panel_anomaly` |
| Personalization | Interaction history | not a suggestion at all — see note below |

Personalization is the one item that is *not* a suggestion-review-approve
loop — it's a query-time ranking/filtering concern (§K), not content that
needs human sign-off before a user sees it. It shares the *data* (interest
signals) but not the governance mechanism.

**Recommendation:** do not create `AIEnrichmentJob`, `AIEnrichmentResult`, or
a parallel `AISuggestion` table. Extend `ai.recommendation`'s
`suggestion_type` taxonomy and `related_entity_type` to cover content/media
objects once they exist. This is a data-modeling decision this review makes
now rather than deferring, since getting it right avoids building and later
having to merge two governance systems.

## F. Experience Engine

Evaluated three abstraction levels: `StoryBlock` alone, `StoryBlock` +
`ExperienceComposition` as currently proposed (24 block types, a generic
composition wrapper), or a full "Experience Engine."

**Recommendation: adopt `StoryBlock` now; do not build a separate
`ExperienceComposition`/Experience Engine layer yet.**

Reasoning: every experience type the input document lists (project pages,
interactive stories, scrollytelling, maps, "Follow the X" navigation, product
traceability, research explorers) is, at the data level, a sequence of typed
content blocks referencing canonical entities — which is exactly what
`StoryBlock` already is. `ExperienceComposition` as separately specified
(its own §60: title/audience/mode/blocks/personalization_rules) doesn't add
a genuinely different capability, it adds a second competing block-sequence
concept. Two systems for "an ordered sequence of typed, entity-referencing
content blocks" is the duplicated-data risk `PLATFORM_OVERVIEW.md` warns
against generally, applied here. A `Story` *is* one kind of composition;
sensory sessions, guided audio walks, and event screens are different
*modes* of rendering/interacting with a block sequence, which can be a
`mode` enum on `Story`/`StoryPublication` (`WEB | SCROLLYTELLING | AUDIO_WALK
| EVENT_SCREEN | ...`) rather than a second schema.

Build the generic "Experience Engine" abstraction only if, after Story ships,
a genuinely block-incompatible experience type appears (e.g., something with
real-time multi-participant state like the "Live Sensory & Competition Mode"
in the input doc's §20 — that has state machine and concurrency needs a
content-block model doesn't cover). That is an ADVANCED-phase decision (§N),
not a Foundational one.

## G. Operator Experience

The input document is right that this should not be a conventional admin
dashboard, and right that it's a major requirement — but the mechanism is
already 90% specified: an operator's "what changed, what needs attention"
view is a filtered, role-scoped read over `ai.recommendation` (pending
`operator_signal` suggestions) + `Notification` + `ContentCoverageMetric`
(§N — a simple derived view, not a heavy new subsystem) + `AuditEvent`
(recent activity). The "LAS NUBES: new since last visit / coverage gap /
story opportunity / missing before publication" example in the input
document (its §6) is a rendering of exactly those four sources, scoped to
one Project.

This sits alongside, not instead of, the public/customer/partner surfaces
already defined in `PLATFORM_OVERVIEW.md` §4 — it's the Admin/Platform
Command Center surface (already named there) gaining a content-aware
digest view once Story/Media exist, not a new fifth surface.

## H. AI Architecture

Extends `AI_GOVERNANCE.md` directly; nothing here contradicts it.

- **Grounded retrieval**: RBAC-scoped query (`AI_GOVERNANCE.md` §5) over
  canonical entities + `ai.recommendation` history + (once built)
  `MediaAsset`/`Story`/`TranscriptSegment` content — the assistant answers
  from what the requesting user is authorized to see, never a privileged
  superuser view.
- **Model adapters**: the existing `AIProvider` interface
  (`INTEGRATIONS.md` §7, `DECISIONS.md` ADR-011) already covers
  text/completion; multimodal capability (Claude vision, Gemini multimodal —
  input doc §9) is an extension of that same interface's method surface, not
  a new adapter family.
- **Permissions**: same authorization service as everything else
  (`SECURITY.md` §2) — a query executes as the requesting user's resolved
  RBAC permissions, not as a system account.
- **Provenance & confidence**: every AI output that cites external or
  internal data carries the structured citation object
  `EXTERNAL_DATA_ARCHITECTURE.md` §20 already specifies, extended to cite
  `MediaAsset`/`TranscriptSegment`/`EvidenceClaim` sources the same way it
  cites `external.observation` rows. Confidence, where the model provides
  one, is stored on the `ai.recommendation` row (`AI_GOVERNANCE.md` §4
  already has a `confidence` field) — never fabricated where the model
  doesn't provide a real one, echoing `EXTERNAL_DATA_ARCHITECTURE.md` §11's
  "no universal confidence percentage" rule.
- **Human approval**: unchanged — the existing suggestion lifecycle.
- **Suggestion lifecycle / audit trail**: unchanged — `ai.recommendation` +
  `AuditEvent`.
- **Semantic search / embeddings**: genuinely new infrastructure. Recommend
  a `content_embedding` table (id, source_entity_type, source_entity_id,
  embedding vector, model, model_version, created_at) using Postgres's
  `pgvector` extension rather than a separate vector database — same
  reasoning as `DECISIONS.md` ADR-002/ADR-010's general bias toward "extend
  Postgres before adding a new system" for a solo-maintained project. This
  is a NEXT-phase item (§N), needed only once there's enough content to
  search.
- **Structured outputs**: standard practice for any tool-calling/JSON-mode
  usage against the model provider — an implementation detail of the
  `AIProvider` adapter, not a new architectural concern.
- **Tool execution boundaries**: any "tool" the AI assistant can invoke
  (e.g., "search media," "look up a project") is itself a read-only,
  RBAC-scoped query — the AI is never given a tool that performs a write;
  every write-shaped action surfaces as an `ai.recommendation` for a human
  to execute instead, per `AI_GOVERNANCE.md` §3's structural (database-
  permission-level) enforcement.

## I. Media Architecture

Per your instruction, classified against what the repository already uses
(nothing beyond Postgres/R2/Prisma/Next.js — no media pipeline exists yet):

| Technology | Classification | Why |
|---|---|---|
| Cloudinary | USEFUL LATER | Real value once a MediaAsset/derivative pipeline is actually being built; not required to start — a first cut can use object storage (R2, already decided) + Next.js Image transforms for basic responsive images before paying for a dedicated media platform. |
| Mux | OPTIONAL | No current video-streaming use case (no live events, no long-form video library yet). Evaluate against Cloudinary video specifically when a real need appears — the input document's own caution against running both applies. |
| Remotion | USEFUL LATER | Low commitment (a rendering library, not a hosted service with lock-in) — genuinely useful once real project data + approved media exist to compose from. No reason to add before Story/MediaAsset exist. |
| Deepgram / AssemblyAI | OPTIONAL | Needed only once transcription is a real workflow (Interview module). Put behind a `TranscriptionProvider` adapter (`INTEGRATIONS.md` §1 pattern) and pick one at implementation time rather than deciding now. |
| ElevenLabs | OPTIONAL, consent-gated | The input document's own voice-cloning consent warning is the load-bearing constraint here; no current narration/dubbing need. |
| Mapbox | **Already decided** (`DECISIONS.md` ADR-009) | Not a new decision — covers base mapping/geocoding needs already. |
| CesiumJS | NOT RECOMMENDED YET | 3D geospatial is explicitly post-MVP per the input document's own "Digital Twin Lite... do not begin with a full metaverse" — agreed. Revisit only if a specific terrain/watershed story genuinely needs 3D over Mapbox's 2D. |
| Marzipano | OPTIONAL, FUTURE | Lightweight, low lock-in, fine to add whenever a 360 experience is actually scoped — no urgency. |
| Three.js | NOT RECOMMENDED YET | No need demonstrated beyond what Mapbox/Marzipano/Cesium already cover if/when those are added — avoid a third geospatial/3D library without a specific gap. |
| Sanity | **NOT RECOMMENDED** | Directly conflicts with `DECISIONS.md` ADR-001 (Postgres as sole canonical datastore) — and the input document's own §38 independently reaches the same conclusion ("do not automatically introduce a second authoritative content database... Sanity should not become authoritative for scientific/project facts"). `Story`/`StoryBlock` belong in Postgres. |
| PostHog | USEFUL LATER | Valuable once there's real public traffic (post-Slice-2 launch) for analytics/feature flags; no value with zero users. |
| Liveblocks | NOT RECOMMENDED YET | The input document itself says not to introduce it without a demonstrated realtime-collaboration need — none exists (solo/small-team context, `PLATFORM_OVERVIEW.md` §9). |
| Multimodal AI (Claude vision, Gemini) | USEFUL LATER, no new decision | Covered by the existing provider-agnostic `AIProvider` adapter (`DECISIONS.md` ADR-011) — a capability extension, not a new vendor relationship to evaluate separately. |

**None of the above should be installed now** — consistent with your
explicit instruction and with the input document's own "do not begin by
adding Cesium, Mux, Cloudinary, Sanity, Liveblocks and AI providers
simultaneously."

## J. Creative Intelligence Pipeline

Reuses §E's shared mechanism exactly:

```
Project activity (new media, milestone, sensory result, harvest, etc.)
  → Opportunity detection: a rule (initially simple/deterministic — coverage
    thresholds like the input doc's §28 examples — not ML) evaluates whether
    enough approved material + a real trigger exists
  → Evidence/media discovery: RBAC-scoped query over existing MediaAsset/
    EvidenceClaim/research records connected to that Project
  → Audience relevance / narrative suggestion / creative brief: an
    ai.recommendation row (suggestion_type = 'editorial_opportunity'),
    citing the discovered evidence/media as its supporting_evidence
  → Draft: a human (Content/Ops Coordinator Role Profile, RBAC.md §5) creates
    an actual Story/StoryVersion from the suggestion — the suggestion itself
    is never auto-published
  → Human review / approval: the existing Story approval workflow (§M ties
    rights-check into this same gate)
  → Publication: StoryPublication row
  → Analytics / learning: deferred to §N NEXT phase, depends on real traffic existing
```

No new pipeline infrastructure — this is `ai.recommendation` plus the
content-approval workflow that Story itself needs regardless of AI
involvement.

## K. Adaptive UX

| Dimension | Current architectural support |
|---|---|
| WHO (role, permissions, expertise) | Role/permissions: EXISTS (`RBAC.md`). Expertise: not modeled — part of the Personalization gap below. |
| WHY (objective) | Not modeled — inferred from navigation context (e.g., which "lens" a user selected, input doc §31), not a stored attribute. |
| WHERE (field/office/event/home) | Not modeled explicitly; closest proxy is device+connectivity (below) plus which app surface (Partner Workspace vs. public site) the user is in — already distinguished by `PLATFORM_OVERVIEW.md` §4's role-aware surfaces. |
| WHAT (current project/location/sample/product) | EXISTS structurally once those entities exist — ordinary page/request context, not a new personalization concern. |
| WHEN (project lifecycle, season, event timing) | Derivable from existing/planned entity status fields and dates — no new infrastructure. |
| DEVICE | Standard responsive web — `CLAUDE.md` §39 (PWA-first) already covers this direction. |
| CONNECTIVITY | Not modeled yet — ties to the offline/PWA work `CLAUDE.md` §40 already defers to later; this review does not recommend building it earlier. |
| HISTORY | **Gap** — no `InteractionEvent` entity exists. Needed for personalization generally, not content-specific. |
| INTEREST | **Gap** — no `DeclaredPreference`/inferred-interest entity exists. `CLAUDE.md` §15 describes this conceptually (declared vs. inferred, "do not convert behavioral inference into personal factual information") but it was never added to `DOMAIN_MODEL.md`'s concrete entity list (§52) or built in Slice 1. Flagged as a genuine gap this review surfaces, not something the input document introduced. |
| STATE (what needs attention) | Covered by §G's Operator Intelligence mechanism for operators; not applicable to public/customer UX the same way. |

**Recommendation:** add `CustomerProfile`, `DeclaredPreference`, and
`InteractionEvent` to `DOMAIN_MODEL.md` when My Néctar / Personalization work
is actually scheduled (My Néctar's *shell* already exists from Slice 1, but
it's an empty state with no preference/history capture yet) — this is a
data-model gap this review found by trying to design Adaptive UX honestly,
independent of anything the input document proposed, and worth fixing in
`DOMAIN_MODEL.md` directly rather than only in this review (see the closing
note after §Q).

The "Choose Your Lens" concept (input doc §31) is UX, not new data — it's a
client-side reordering of existing approved content blocks based on a
selected persona, requiring no new backend entity beyond the ordering/
tagging that `ContentEntityLink`/`ContentTopic` (§D) already provide.

## L. Research and Sensory Safeguards

No new mechanism required — this section exists to confirm the input
document's concerns are already met by approved architecture, not to design
something new:

- **Experimental integrity / measurement integrity**: `provenance_class`
  (`DATA_ARCHITECTURE.md` §4) already distinguishes `measured_fact` from
  `interpretation`/`conclusion`/`ai_suggestion` — content/media referencing a
  measurement never overwrites or restates it as a different class.
- **Blind evaluations**: `RBAC.md` §7's blind-code-mapping restrictive
  permission pattern already prevents a Judge's resolved permissions from
  reaching sample identity — a sensory *experience* UI (input doc §19-20)
  built later must call the same authorization service, not re-implement
  visibility logic client-side (`SECURITY.md` §2's "no hidden-UI-only
  authorization" rule applies exactly here).
- **Evidence provenance**: `EvidenceClaim`'s human-mediated connection
  requirement (§D above, `EXTERNAL_DATA_ARCHITECTURE.md` §17) covers content-
  derived evidence identically to external-data-derived evidence.
- **Research conclusions**: `AI_GOVERNANCE.md` §2 already prohibits AI from
  approving conclusions or altering submitted sensory forms — a "Research
  Story" generated from approved findings (input doc's Creative pipeline) is
  presenting an already-human-approved `Conclusion`, never generating one.
- **Competition rules**: `DOMAIN_MODEL.md`'s Competitions module (not yet
  built) already specifies blind coding and chain-of-custody; live/audience
  modes (input doc §20) are a presentation layer over that model and must
  never expose blind identities through a public real-time channel — a
  content/experience-layer requirement to enforce, not a new data-model
  requirement.

## M. Rights / Consent / Publication Governance

Genuinely new — nothing in the current architecture covers "what channels
and territories is this specific piece of media legally cleared for," which
is a different axis from RBAC classification (RBAC answers "who inside/
outside Néctar Nómada can see this"; rights answers "what is this legally
allowed to be used for, once visible"). Recommended minimal model:

```
core.consent_record   (person_id, media_asset_id(nullable), scope_description,
                        granted_at, expires_at, status)
core.rights_grant      (media_asset_id, grantor, right_type, allowed_channels[],
                        territory, expires_at, source_document_reference)
core.usage_restriction  (media_asset_id, restriction_type, description)
```

Enforcement point, matching the pattern `EXTERNAL_DATA_ARCHITECTURE.md` §24
already establishes for external-dataset licensing: before any `MediaAsset`
backs a public or commercial surface (a published Story, a Product page, an
ad/campaign), the publish workflow checks `rights_grant.allowed_channels`
the same way it would check `license.commercial_use_allowed` for external
data — **one enforcement pattern, two different source tables it reads
from**, not two different mechanisms to build and maintain. AI's role here
(input doc §48: "AI should check rights before suggesting publication") is
just another `can()`-style check the suggestion-generation step performs
before proposing a channel/use for a given asset — not a special AI
capability.

## N. Implementation Phases

**FOUNDATIONAL** (prerequisite to anything else in this document; overlaps
directly with `MVP_ROADMAP.md` Slice 2):
- `Location`, `Project`, `Organization`, `Sample` tables.
- `MediaAsset` (= extended `Asset`), basic `Story`/`StoryVersion`/
  `StoryBlock` (a handful of block types only: TEXT, HEADING, QUOTE, IMAGE,
  IMAGE_GALLERY, MAP — not all 24 from the input document's list).
- Basic `rights_grant`/`consent_record` fields on `MediaAsset` (§M, minimal
  version — full `License`/`ReleaseDocument` detail can wait).
- `ContentEntityLink` join table.

**MVP** (makes the Foundational layer actually usable for one real story):
- `StoryPublication`, simple approval workflow (`DRAFT → REVIEW → APPROVED →
  PUBLISHED`, not the full 8-stage pipeline from input doc §47 yet).
- Object-storage-backed image derivatives via Next.js Image (no Cloudinary
  yet, per §I).
- Simple, rule-based `ContentCoverageMetric` (counts, not AI-derived).
- Dynamic project homepage assembled from the above (input doc §43).

**NEXT:**
- AI content enrichment via `ai.recommendation` (§E): entity-link
  suggestions, quote candidates, transcript-derived tags.
- Semantic search / `pgvector` embeddings (§H).
- Operator digest (§G).
- Editorial Opportunity detection (§J).
- `CustomerProfile`/`DeclaredPreference`/`InteractionEvent` + basic
  Personalization (ordering only, per §K).
- `Interview`/`TranscriptSegment`/`Quote` as first-class entities, one
  transcription provider (§I).
- Full Rights/Consent model (§M) if usage has grown complex enough to need
  it.

**ADVANCED:**
- Scrollytelling / map-story compositions.
- "Follow the Place / Sample / Person / Ingredient" navigation modes (a
  `mode` on `Story`, per §F — not a new engine).
- Interactive data visualization (sensory radar, timelines).
- Multilingual translation workflow (`Translation`/`SubtitleTrack`,
  human-review gate before AI translation is public copy — input doc §54).
- Adaptive UX / "Choose Your Lens."
- Cloudinary (if the MVP's simpler image pipeline proves insufficient).

**EXPERIMENTAL:**
- 360 (Marzipano), 3D (CesiumJS/Three.js), live streaming (Mux), programmatic
  video (Remotion), Digital Passport, real-time collaboration (Liveblocks),
  AR/WebXR — all explicitly deferred by the input document itself, agreed.

## O. First Vertical Slice

Comparing the four candidates from your prompt:

| Candidate | Depends on | Assessment |
|---|---|---|
| Interactive place/project story | Location, Project, Story/MediaAsset (Foundational+MVP above) | Smallest dependency set; validates the core content model end-to-end without needing Research OS, live infrastructure, or offline sync. |
| CryoBloom — Follow the Sample | All of the above **plus** Research OS (Experiment/Measurement/Evidence tables — not built) and process-trace visualization | Real value, but strictly larger scope — sequenced correctly *after* the place/story slice validates the content model. |
| Guided sensory session | All of the above **plus** the Sensory module (blind coding, real-time assessment UX) — one of the platform's highest-safeguard areas (§L) | Highest risk to rush; the blind-evaluation safeguard needs to be right before any public-facing sensory experience ships. |
| Field capture companion | Partner Workspace (`MVP_ROADMAP.md` Slice 5) + offline/PWA sync (explicitly deferred, `CLAUDE.md` §40) | Valuable operationally but has the most infrastructure prerequisites of the four. |

**Recommendation: Interactive place/project story, first** — same
conclusion the input document reaches independently in its own §67. This
review arrives at it from dependency analysis rather than taking the input
document's word for it, and the two agree, which is worth noting as
corroboration rather than coincidence.

## P. Risks

- **Vendor lock-in**: Sanity (rejected, §I) and, to a lesser extent,
  Cloudinary/Mux if adopted without the adapter-interface discipline
  `INTEGRATIONS.md` already establishes — mitigated by requiring every media
  vendor sit behind a capability interface, never called directly from
  Story/MediaAsset business logic.
- **Duplicated data**: the single largest risk in the input document as
  written — it proposes ~30 new entities, several of which (§D) are actually
  the same thing as something already specified. Mitigated by this review's
  explicit reuse decisions in §D/§E.
- **AI hallucination**: mitigated structurally by the existing
  suggestion-only write path (`AI_GOVERNANCE.md` §3) — a hallucinated
  "quote" or "entity link" is a rejected suggestion, never a corrupted
  record, because the AI role cannot write to `Story`/`MediaAsset`/
  `EvidenceClaim` directly.
- **Privacy**: interview consent (§M), and the same GPS-precision-for-small-
  farms concern already flagged in `EXTERNAL_DATA_ARCHITECTURE.md` §9 —
  worth a shared answer (classification level on Location, likely, at
  Slice-2 design time) rather than two separate privacy analyses.
- **Permissions confusion**: RBAC classification and media rights (§M) are
  two different axes answering two different questions — the real risk is
  a future engineer conflating them (checking only one when both matter).
  Mitigated by naming them distinctly in this document and requiring both
  checks at the publish gate.
- **Rights/consent**: covered in §M; risk is under-building this before the
  first public Story ships, not over-building it.
- **Media cost**: video storage/streaming and satellite-scale imagery are
  the actual cost risks; this review's phased approach (§N) specifically
  avoids committing to Mux/Cesium/heavy raster handling before volume
  justifies it.
- **Performance / field conditions**: Panama field connectivity is real;
  the graceful-degradation pattern the input document proposes (3D → 2D map
  → static image; 4K → adaptive stream → transcript) is sound and should be
  a stated requirement for any ADVANCED/EXPERIMENTAL feature's acceptance
  criteria, not just an aspiration.
- **Offline limitations**: explicitly deferred (matches existing
  `CLAUDE.md` §40 posture) — not attempted in Foundational/MVP.
- **Scientific integrity**: well-guarded by existing architecture (§L);
  the risk is entirely in *implementation* discipline (actually calling the
  authorization service, actually gating classification) rather than in the
  data model.
- **Maintenance burden**: the largest practical risk for a solo-maintained
  project (`PLATFORM_OVERVIEW.md` §9). The input document's full scope,
  taken literally, is a multi-year product built by a team. This review's
  phasing (§N) and aggressive "reuse, don't duplicate" stance (§D/§E) are
  the direct mitigation — most of the "new AI system" and "new vendor"
  surface area collapses into extending what already exists.

## Q. Decisions Requiring Product-Owner Approval

1. **Fold Story/Media (Foundational phase, §N) into `MVP_ROADMAP.md` Slice
   2** rather than creating a new slice — Slice 2 already names "Story" in
   its scope; this review recommends formalizing that rather than treating
   content/media as a separate track. Confirm or specify a different
   sequencing.
2. **Reuse `ai.recommendation` for all content/creative/operator
   suggestions** (§E) rather than building a parallel `AISuggestion` table —
   confirm, since this is a schema decision worth locking in before any
   Foundational-phase content work starts.
3. **Adopt `StoryBlock` now; defer `ExperienceComposition`/Experience Engine**
   (§F) until a genuinely block-incompatible experience type is scoped —
   confirm this narrower starting scope.
4. **No media vendor commitment (Cloudinary/Mux/etc.) in the Foundational or
   MVP phase** (§I/§N) — start with object storage + Next.js Image; confirm
   this build-first-buy-later approach, or specify a vendor you want
   committed to earlier for a reason this review wouldn't know (e.g., an
   existing account/contract).
5. **First vertical slice: Interactive place/project story** (§O) — confirm,
   or specify a different priority.
6. **Add `CustomerProfile`/`DeclaredPreference`/`InteractionEvent` to
   `DOMAIN_MODEL.md`** (§K) as a documented gap-fix, independent of the
   input document, at the same time Foundational-phase work begins —
   confirm this is in scope for that pass or should be tracked separately.
7. **Rights/Consent minimal model now, full model deferred** (§M, §N) —
   confirm the two-tier approach (basic fields in Foundational, full
   `RightsGrant`/`ReleaseDocument`/`License` entities in NEXT) rather than
   building the complete rights model before the first Story ships.

---

*Architecture review only. No entity was added to the live schema, no
migration created, no dependency installed, no provider account created, per
the constraint given with this task.*
