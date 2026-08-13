# Gap Analysis — Néctar Nómada Digital Platform (2026-08-10)

> **⚠️ HISTORICAL DOCUMENT — BUILD-STATE CLAIMS BELOW ARE OBSOLETE.**
> Written 2026-08-10. Its method (programmatic extraction against the live
> repo, not against memory) was sound and much of it still holds, but its
> **build-status verdicts are wrong as of today**: Part 3's classification of
> Agricultural Traceability (§18) and Apiary/Honey (§19) as "SPECIFIED, zero
> code" is the most consequential example — both are now among the most
> heavily tested parts of the platform (tickets T1–T14, T9.5, T12.5, T12.6
> for Traceability; A1–A8, A5.5 for Apiary), each with dedicated schema
> models, service layers, and test suites. Do **not** use this document to
> decide what is or isn't built. For current build status, check
> `docs/implementation/README.md` and
> `docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md`'s ticket table
> (§34) instead. This document is kept, not deleted, because its inventory
> method and several of its still-valid findings (documentation debt,
> cross-reference gaps) remain useful history — read it as "what was true on
> 2026-08-10," not as current state.

Comprehensive audit per `07_GAP_ANALYSIS_PROMPT.md`. This is a read-only
report — no code or other architecture document was modified while
producing it. All build-state claims below were pulled directly from the
current repository (`git log`, `prisma/schema.prisma`, `npx tsc --noEmit`,
`npm run lint`, `npm test`, `npm run build`, `npx vercel ls`) at the time of
writing, not from memory of past conversations. Where a finding is
uncertain rather than confirmed, it is explicitly marked "worth
confirming" rather than asserted.

---

## Part 1 — Full Inventory

### 1.1 Every file in `docs/architecture/` (45 files)

**Numbered session prompts** (instructions for handing content to Claude
Code — process artifacts, not architecture):

| File | Covers |
|---|---|
| `00_FIRST_SESSION_PROMPT.md` | The literal first message used to kick off this whole project |
| `00_INSTRUCTIONS_AND_PROMPT.md` | Duplicate/near-duplicate of `04_ADD_REMAINING_PLANNING_DOCS_PROMPT.md` (see Part 2) |
| `01_ADD_EXTERNAL_DATA_SOURCES_PROMPT.md` | Instructions for adding the external-data-sources catalog |
| `02_ADD_MEDIA_PIPELINE_PROMPT.md` | Instructions for adding the Media Intelligence Pipeline doc |
| `03_CRYOBLOOM_PUBLIC_CONTENT_PROMPT.md` | Instructions for CryoBloom Vol. 1 public content (status: not yet acted on — no CryoBloom content exists in Discover) |
| `04_ADD_REMAINING_PLANNING_DOCS_PROMPT.md` | Instructions for adding 5 planning docs (Specimen, Consumer Sensory, Guided Field Study, Tourism Experiences, Research Activity Criteria) |
| `05_ADD_SENSORY_PROTOCOLS_PROMPT.md` | Instructions for adding Beverage Sensory Protocols |
| `06_ADD_COMPETITIONS_PROMPT.md` | Instructions for adding Competitions operational architecture |
| `07_GAP_ANALYSIS_PROMPT.md` | The prompt this exact report was generated from |
| `08_ADD_TOURISM_DESIGN_RESOURCES_PROMPT.md` | Instructions for adding Tourism Design Resources |
| `09_ADD_BRAND_MARKETING_PROMPT.md` | Instructions for adding Brand/Marketing/Community/Sales input (status: input added, no review pass done yet — see Part 4) |

**Core architecture (the "Section 51 deliverables" + successors)**:

| File | Covers |
|---|---|
| `PLATFORM_OVERVIEW.md` | v1 architecture baseline — provenance model, role-aware surfaces, module list, tech stack summary |
| `PLATFORM_OVERVIEW_draft.md` | Superseded draft, kept as historical input only |
| `DOMAIN_MODEL.md` | Canonical entity layer, Person/UserAccount/Role distinction, module attachment points |
| `DATA_ARCHITECTURE.md` | Physical schema conventions — module-owned schemas, standard columns, provenance columns, partitioning, search |
| `RBAC.md` | The `Assignment → Scope → Role Profile → Permission` chain and resolution algorithm |
| `AI_GOVERNANCE.md` | What AI may/may not do; the suggestion lifecycle; DB-level enforcement |
| `INTEGRATIONS.md` | Adapter-per-capability convention; Weather/Storage/Airtable/Email/Payments/AI/Maps/Calendar/IoT/Drive |
| `SECURITY.md` | Authn/authz, input validation, classification enforcement, audit, secrets, sessions |
| `MVP_ROADMAP.md` | Vertical-slice sequencing, deviating from CLAUDE.md's listed order |
| `DECISIONS.md` | The ADR log — 36 entries, see 1.2 |

**Architecture reviews of large input documents** (status: approved, architecture-only):

| File | Covers |
|---|---|
| `EXTERNAL_DATA_ARCHITECTURE.md` | Review of `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` — provider priority, `external.*` schema design, P0 = Open-Meteo/NASA POWER/OpenTopography |
| `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` | Review of `NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md` — Story/MediaAsset/AI-intelligence-loop reuse, `StoryBlock` recommendation |
| `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` | Review of the Commerce/Operations input doc — Lot Genealogy, `Offering`, Consulting, Client Portal |
| `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` | Review of `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_PROMPT_CORRECTED.md` — persona/mode registry, checked directly against current schema; awaiting approval |

**Implemented-and-live domain planning docs**:

| File | Covers |
|---|---|
| `BEVERAGE_SENSORY_PROTOCOLS.md` | Coffee/beer/mead/honey protocol content, Reference Standards & Panel Calibration — **implemented** |
| `COMPETITIONS.md` | Operational layer (roles, intake, pull sheets, Best of Show, separate payment) — **accepted as planning input, not built** (ADR-036) |
| `CONSUMER_SENSORY_FEEDBACK.md` | Lightweight QR-triggered consumer hedonic feedback, structurally separate from expert Sensory — **not built** |
| `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` | Individual-specimen tracking beneath Location; wood/material processing chain — **not built** |
| `GUIDED_FIELD_STUDY_TOOL.md` | Shared apiary/coffee biodiversity field-study wizard — **not built** |
| `TOURISM_EXPERIENCES.md` | Gastro/eco/heritage tourism extensions to Experiences, episode-based design — **not built** |
| `TOURISM_DESIGN_RESOURCES.md` | Partner-facing experience-design resource library (SERNATUR-grounded) — **not built** |
| `RESEARCH_ACTIVITY_CRITERIA.md` | Five-part substance test distinguishing genuine research from commercial activity; retroactive review gate — **gate resolved (ADR-027), criteria itself not enforced in code** |
| `MAP_AND_TERRITORY.md` | Interactive map layering/zoom/classification/routes — **not built** |
| `MEDIA_INTELLIGENCE_PIPELINE.md` | Non-destructive Google Drive ingestion → AI-assisted content generation — **not built** |

**Unprocessed input documents** (raw input awaiting a review pass, same category `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md`/`NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md`/the Commerce input doc were in before their reviews were written):

| File | Status |
|---|---|
| `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` | Already reviewed → `EXTERNAL_DATA_ARCHITECTURE.md` |
| `NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md` | Already reviewed → `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` |
| `NÉCTAR NÓMADA — Commerce, Operations & Professional Tools Architecture Input.md` | Already reviewed → `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` |
| `NECTAR_NOMADA_AI_PERSONA_MODES_KNOWLEDGE_TOOLS_PROMPT.md` | Superseded by `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_PROMPT_CORRECTED.md`, which **has** been reviewed → `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` |
| `NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT.md` / `..._CORRECTED.md` | **No review document exists yet** — this is the one input doc in the repo that hasn't gone through the "review → approved architecture doc" pipeline every other large input got. Not yet committed to git either (see 1.3). |
| `CHATGPT_AI_PERSONA_RESEARCH_PROMPT.md`, `CHATGPT_DATA_SOURCE_RESEARCH_PROMPT.md` | Research prompts meant to be pasted into ChatGPT, whose output became the two input docs above — process artifacts |

### 1.2 Every ADR in `DECISIONS.md` (36 entries)

| ADR | Title |
|---|---|
| 001 | Relational core on PostgreSQL + PostGIS |
| 002 | Environmental time-series: native partitioning, not a separate database |
| 003 | Object storage: S3-compatible (Cloudflare R2) |
| 004 | Application framework: Next.js (App Router) + TypeScript, single deployable |
| 005 | ORM: Prisma |
| 006 | Authentication: Auth.js, self-hosted, custom RBAC |
| 007 | Hosting: Vercel + Neon + Cloudflare R2 |
| 008 | Payments: Stripe |
| 009 | Maps: Mapbox |
| 010 | Search: Postgres full-text search for v1 |
| 011 | AI: provider-agnostic adapter, default Anthropic Claude |
| 012 | MVP sequencing: Identity (Slice 1) before Public Discovery |
| 013 | Modular monolith confirmed, no microservices for v1 |
| 014 | RBAC: Assignment/Scope/Role Profile/Permission chain, non-broadening scopes |
| 015 | Local dev database: Prisma's local Postgres, not Docker |
| 016 | Prisma Client via `@prisma/adapter-pg` |
| 017 | External Data Architecture: approved decisions |
| 018 | Adaptive Intelligence & Experience Architecture: approved decisions |
| 019 | Media Intelligence Pipeline: accepted as planning input, deferred |
| 020 | Commerce, Operations & Professional Tools Architecture: approved decisions |
| 021 | Foundational schema implemented; PostGIS deferred (tooling, not design) |
| 022 | Neon becomes the primary development database ahead of go-live |
| 023 | UI chrome i18n: next-intl, cookie-based, no URL routing |
| 024 | Slice 2 (Public Discovery) implemented |
| 025 | Slice 3 (Commerce) implemented |
| 026 | Five planning docs accepted (specimen, consumer sensory, field study, tourism, research criteria) |
| 027 | Retroactive research-activity review: resolved (approved by Daniel Silvera) |
| 028 | Slice 4 (Experiences & Reservations) implemented — core booking only |
| 029 | Slice 5 (Partner Workspace) implemented |
| 030 | Slice 6 (Sensory) implemented |
| 031 | Beverage Sensory Protocols & Reference Standards: accepted as planning input |
| 032 | Fix: Assessment double-submission race |
| 033 | Slice 7 (AI) implemented |
| 034 | Competitions implemented (reuses Sensory) |
| 035 | Beverage Sensory Protocol content populated; Calibration implemented |
| 036 | Competitions operational layer (`COMPETITIONS.md`): accepted as planning input |

### 1.3 Actual codebase build state (verified live, not from memory)

**Toolchain checks, run just now:**

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean, zero errors |
| `npm run lint` | Clean, zero errors |
| `npm test` | 37/37 passing (single file: `tests/rbac/resolve.test.ts`) |
| `npm run build` | Succeeds, 24 routes generated |
| `npx vercel ls` | Latest production deployment `Ready`, ~1h old |
| `git status` | 3 untracked files: `09_ADD_BRAND_MARKETING_PROMPT.md`, `NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT.md`, `..._CORRECTED.md` — added to the working tree but never committed |

**Prisma models actually implemented: 55, across 7 schemas** (`prisma/schema.prisma`, verified directly):

| Schema | Models | Maps to |
|---|---|---|
| `core` | 19 (Person, UserAccount, Assignment, Scope, RoleProfile, Permission, RoleProfilePermission, AuditEvent, Location, Organization, Program, DomainTag, Project, ProjectDomainTagAssignment, Sample, Asset, Story, Product, Experience) | Identity + Foundational + Discover |
| `commerce` | 6 (Cart, CartItem, Order, OrderItem, Payment, ProductVariant) | Slice 3 |
| `experiences` | 4 (ExperienceSession, Booking, Participant, BookingPayment) | Slice 4 |
| `partner` | 3 (Task, FieldSubmission, FieldSubmissionAsset) | Slice 5 |
| `sensory` | 15 (SensoryProtocol/Version/Attribute, SensorySession/Flight/BlindSample/BlindMapping, Assessment/AttributeResponse, PanelResult, ReferenceStandard, SelfCreatedStandardDetail, CalibrationSession/Result, EvaluatorSensitivityProfile) | Slice 6 + Calibration |
| `ai` | 1 (Recommendation) | Slice 7 |
| `competitions` | 7 (Competition, CompetitionEdition, CompetitionCategory, Entry, CompetitionJudgeAssignment, CompetitionResult, Award) | Competitions |

**13 migrations applied**, chronological, `20260809221638_init_identity` through `20260810101802_beverage_protocols_and_calibration` — no gaps, no out-of-order timestamps.

**RBAC catalog** (`lib/rbac/catalog.ts`): 27 permissions, 7 seeded Role Profiles (Platform Admin, Content/Ops Coordinator, Research Lead, Research Contributor, Partner Field Collector, Sensory Judge, Sensory Head Judge).

**Service layer** (`lib/`): `ai/`, `audit.ts`, `auth/`, `commerce/`, `competitions/`, `db.ts`, `discover/`, `experiences/`, `integrations/payments/` (Stripe), `integrations/storage/` (R2), `partner/`, `rbac/`, `sensory/` (including `calibration.ts`), `validation/`. 22 route pages, 10 server-action files.

**Test coverage**: exactly one test file, covering RBAC resolution only (37 assertions). CLAUDE.md §57's "unit tests; integration tests; permission tests; API tests; critical user-flow tests" is satisfied only for the RBAC-tests-mandatory clause — every other module (Commerce, Experiences, Partner Workspace, Sensory, Competitions, Calibration, AI) has been verified exclusively through live manual/browser verification against Neon during each slice's build session, never through an automated test. This is a real, substantial gap — see Part 4.

**Credentials configured vs. not** (checked presence/absence only, no values printed):

| Credential | Status |
|---|---|
| `AUTH_SECRET` | Set |
| `AI_SERVICE_DATABASE_URL` | Set |
| `DATABASE_URL` | **Not found in `.env` or `.env.local` in this shell** — worth confirming: production is independently verified working (per `SETUP.md`'s deployment note, checked directly against Vercel production after fixing a `DATABASE_URL` formatting bug), so this is very likely a local-shell/session artifact rather than a real credential loss, but it could not be positively explained during this audit and is flagged rather than assumed benign. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Not set (known, see Part 4) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Not set (known, see Part 4) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Not set (known, see Part 4) |

---

## Part 2 — Internal Consistency Check

Method: every doc's actual `## N. Title` / `### N. Title` (numbered) and `## X. Title` (lettered) headings were extracted programmatically to build a ground-truth section index per file, then every `` `Doc.md` §N `` / `` `Doc.md`'s §N `` citation across all 45 files (365 total citations found) was checked against that index.

### 2.1 Confirmed broken cross-references

**Five recurring instances of citing `DOMAIN_MODEL.md` or `PLATFORM_OVERVIEW.md` when the content actually lives in `CLAUDE.md`.** Both `DOMAIN_MODEL.md` (tops out at §7) and `PLATFORM_OVERVIEW.md` (tops out at §10) are themselves derived from `CLAUDE.md`, and several citations appear to have picked up the wrong source document — likely because the section *numbers* happened to coincide across documents at the time they were written:

| Citing doc | Cited as | Should be | Evidence |
|---|---|---|---|
| `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` (3 occurrences, in §D and §E) | `` `DOMAIN_MODEL.md` §8 `` | `CLAUDE.md` §8 (PROJECT SYSTEM) | `DOMAIN_MODEL.md` has no §8; `CLAUDE.md` §8 is where "Tasks" is actually listed as a Project System entity |
| `CONSUMER_SENSORY_FEEDBACK.md` (3 occurrences, opening line + §5 x2) | `` `PLATFORM_OVERVIEW.md` §14 `` | `CLAUDE.md` §14 (MY NÉCTAR) | `PLATFORM_OVERVIEW.md` has no §14; `CLAUDE.md` §14 lists "My Tastings, Sensory History" verbatim, which the citing text quotes |
| `CONSUMER_SENSORY_FEEDBACK.md` (§4) | `` `DOMAIN_MODEL.md` §15 `` | `CLAUDE.md` §15 (CUSTOMER PROFILE & CRM) | `DOMAIN_MODEL.md` has no §15; `CLAUDE.md` §15 is where the Declared-vs-Inferred preference distinction actually appears |
| `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` (§K table) | `` `PLATFORM_OVERVIEW.md` §39 `` | `CLAUDE.md` §39 (FRONT-END ARCHITECTURE) | `PLATFORM_OVERVIEW.md` has no §39; `CLAUDE.md` §39 is where "PWA architecture initially" is actually stated |
| `DECISIONS.md` (ADR-009) | `` `PLATFORM_OVERVIEW.md` §48/§9 `` | `CLAUDE.md` §48 (DESIGN PHILOSOPHY) | `PLATFORM_OVERVIEW.md` has no §48; `CLAUDE.md` §48 is where "should not feel like generic enterprise software" actually appears. The `/§9` half is unclear — worth confirming what it was meant to point at. |

**One citation to content that does not exist anywhere in its target document**, not just a wrong section number:

- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §M (lines 476-479) cites `` `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §24's "every chart carries units/source/sample identity/date/provenance" ``. `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` uses lettered sections (A through Q) — it has no numbered §24 — and the word "chart" does not appear anywhere in that document at all (confirmed via direct search, zero matches). This reads as a fabricated/hallucinated specific quote rather than a simple mistyped section number. Flagged plainly since it's cited as a direct quotation, not a paraphrase.

**One malformed filename citation**:

- `MEDIA_INTELLIGENCE_PIPELINE.md` (§2, ingestion section) cites `` `EXTERNAL_DATA_SOURCES.md` §25 ``. No file with that exact name exists — the closest matches are `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` (whose own §25 is "Core External-Data Entities to Design," which fits the citation's context about an `ImportJob`-shaped pattern) and `EXTERNAL_DATA_ARCHITECTURE.md` (whose §25 is "Security," which doesn't fit). Likely intends the former; worth confirming and fixing the filename.

### 2.2 The specifically-flagged item: `GUIDED_FIELD_STUDY_TOOL.md` §8 vs. `OFFLINE_FIELD_CAPABILITY.md`

**Confirmed not updated.** `OFFLINE_FIELD_CAPABILITY.md`'s own opening line states it was "created because two independent planning documents (`GUIDED_FIELD_STUDY_TOOL.md` §8 and `MAP_AND_TERRITORY.md`) each needed offline support on their own" — i.e., it was explicitly written to be the resolution of that gap. But `GUIDED_FIELD_STUDY_TOOL.md` §8 (the "Offline support" bullet) still reads, verbatim:

> **Sequencing flag**: `MVP_ROADMAP.md` §3 currently defers *full* offline operation as a general platform capability... worth deciding, when this tool is actually scheduled, whether it needs its own lighter local-draft mechanism pulled forward rather than waiting on the general offline architecture.

This is the exact pre-`OFFLINE_FIELD_CAPABILITY.md` framing — it still poses the offline question as open and cites only `MVP_ROADMAP.md` §3, with zero mention of `OFFLINE_FIELD_CAPABILITY.md`, which was written specifically to answer it. The promised backlink was never applied.

### 2.3 Stale comment contradicting code two lines below it

`prisma/schema.prisma` line 3: `// Only the \`core\` Postgres schema exists so far. Module schemas (commerce, research,` — followed two lines later by the actual `datasource.schemas` array, which already lists seven schemas (`core, commerce, experiences, partner, sensory, ai, competitions`). This comment predates Slice 3 and was never removed as the schema grew. Not user-facing, but worth a one-line cleanup.

### 2.4 Contradiction/staleness between `DATA_ARCHITECTURE.md` §1 and the actual schema list

`DATA_ARCHITECTURE.md` §1 enumerates the planned module schemas as `identity, commerce, research, sensory, competitions, environmental, content, project, partner, ai`. The actual implemented schema list (`prisma/schema.prisma`, confirmed) is `core, commerce, experiences, partner, sensory, ai, competitions`. Comparing:

- `identity`, `project`, `content` were never created as separate schemas — those tables live in `core` instead.
- `research`, `environmental` are correctly still absent (those modules aren't built), so no drift there.
- **`experiences` is missing from the documented list entirely** — it's a real, live schema (4 models) that `DATA_ARCHITECTURE.md` §1 never mentions.

This was already partially flagged in `DECISIONS.md` ADR-026 decision 2 ("fold `material`, `consumer_sensory`, `field_study` into the list... not urgent enough to justify a standalone edit today," written before Slices 3-7 shipped). The gap has grown since — `experiences` joined the actual schema without ever being added to the documented list, and the "not urgent" call has now been outstanding across five more implemented slices.

### 2.5 Minor, already-flagged-and-explained divergence (not a real inconsistency)

`BEVERAGE_SENSORY_PROTOCOLS.md` §4 specifies placeholder categories with `status = 'planned_not_built'`. The actual implemented enum value is `planned` (`SensoryProtocolStatus.planned`). This is intentional and self-documented — the schema carries a comment citing `BEVERAGE_SENSORY_PROTOCOLS.md` §4 directly and explaining the shortened name — so this is not an unflagged bug, just worth noting for completeness.

### 2.6 Known documentation lag, previously flagged as low-priority (still true)

`RBAC.md` §5's prose list of Role Profiles still reads: Platform Admin, Content/Ops Coordinator, Research Lead, Research Contributor, Partner Field Collector, Sensory Judge, Customer. **"Sensory Head Judge" (added in Slice 6, ADR-030 decision 4) is still missing from this list**, exactly as `DECISIONS.md` ADR-031 already noted ("cosmetic, `RBAC.md` §5 already states its list isn't closed, not urgent to fix now"). Confirmed still the case; still cosmetic.

### 2.7 Entities specified but never implemented (documentation says "exists," code doesn't)

Not a doc-to-doc contradiction, but several documents reference entities as if reaching for something already real, when the entity is only ever specified, never built:

- **`OrganizationMembership`** — `DOMAIN_MODEL.md` §2 gives it a full field list (`id, person_id, organization_id, title, started_at, ended_at, status`) and explains its relationship to Assignment-based permissions at some length, but it was never added to `prisma/schema.prisma`. No other document appears to depend on it being live, so this isn't causing a contradiction elsewhere, just an unbuilt entity presented with the same specificity as built ones.
- **`Notification`** — correctly cited by three different documents (`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`, `GUIDED_FIELD_STUDY_TOOL.md`, `EXTERNAL_DATA_ARCHITECTURE.md`) all pointing at `DOMAIN_MODEL.md` §5, where it is genuinely specified — this is internally consistent, just not yet built. Listed here because the `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` review (§0, §23) found this absence materially limits what Operator Mode can do today — worth being aware this single missing table blocks more than one planned feature simultaneously.

### 2.8 What was checked and found consistent (worth stating, not just the problems)

- `ScopeType` enum: `RBAC.md` §2's documented list (`platform | program | project | location | competition | session | experience`) matches the actual Prisma enum exactly. `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §S's proposal to add `organization` is correctly framed everywhere as "not implemented now" — no contradiction.
- Every `CLAUDE.md` §N citation spot-checked (10 checked: §2, §3, §9, §12, §15, §16, §40, §42, §49, §61) matched the actual `CLAUDE.md` content precisely.
- Cross-checks explicitly performed by `ADR-031`, `ADR-034`, `ADR-036` against `RBAC.md`/`DOMAIN_MODEL.md`/`SECURITY.md` were re-verified for this audit and hold up — no new conflicts found in those specific areas.

---

## Part 3 — Coverage Against CLAUDE.md's Original Scope

Classified section-by-section. **BUILT** = implemented in code and verified working. **SPECIFIED** = has a real planning document, not built. **PARTIALLY ADDRESSED** = touched on within another document or partially built, never given full treatment. **NOT ADDRESSED** = no planning document and no implementation.

| § | Section | Classification | Notes |
|---|---|---|---|
| 1 | Organization (context) | — | Vision statement, not a buildable requirement |
| 2 | Core Platform Principle | **BUILT** | Canonical entity reuse demonstrated across every shipped slice |
| 3 | Important Existing System Principles | **PARTIALLY ADDRESSED** | Version-preservation pattern (supersedes-FK) genuinely built for `Assessment`/`SensoryProtocolVersion`/`Sample`; the full provenance vocabulary (`provenance_class`, `source_reference`, `data_quality`) specified in `DATA_ARCHITECTURE.md` §4 as "mandatory, not conventional" **has zero implementation anywhere in the schema** — confirmed via direct search, no `provenanceClass`/`dataQuality`/`sourceReference` column exists. Built modules use the simpler `RecordStatus`/`ClassificationLevel` pair instead. The full Harvest→Lot→...→Product traceability chain doesn't exist (Research OS/Agricultural Traceability unbuilt). |
| 4 | Platform Experience (5 surfaces) | **PARTIALLY ADDRESSED** | Discover, My Néctar, Partner Workspace, and a judge/admin Sensory surface are real. "Research Workspace" doesn't exist (no Research OS). "Platform Command Center" is really several separate admin pages, not a unified command-center surface. |
| 5 | Discover | **BUILT** | Slice 2 |
| 6 | Map & Territory | **SPECIFIED**, not built | `MAP_AND_TERRITORY.md` (12 §), zero map UI exists; `Location.geoPoint` PostGIS column exists (ADR-021) but nothing renders it |
| 7 | Environmental Data | **SPECIFIED**, not built | `EXTERNAL_DATA_ARCHITECTURE.md`, `DATA_ARCHITECTURE.md` §6; zero `EnvironmentalObservation`/`Sensor` tables |
| 8 | Project System | **PARTIALLY ADDRESSED** | `Program`/`Project`/`DomainTag`/`Task` built; `Milestone`, `Collaboration`, `Report` entities never built or separately specified |
| 9 | People & Organizations | **PARTIALLY ADDRESSED** | `Person`/`Organization` built; `OrganizationMembership` specified (§2.7 above) but not built |
| 10 | RBAC | **BUILT** | Fully implemented and tested (the one module with real automated test coverage) |
| 11 | Commerce | **PARTIALLY ADDRESSED** | `Product`/`ProductVariant`/`Cart`/`Order`/`Payment` built; `Collection`, `Discount`, `Promotion`, `Refund` never built |
| 12 | Experiences & Reservations | **PARTIALLY ADDRESSED** | Core booking engine built (Slice 4); gastro-tourism extensions (`TOURISM_EXPERIENCES.md`) specified, not built; Waiver/Checklist/Transportation/Weather-dependency fields never built |
| 13 | Events (distinct from Experiences) | **NOT ADDRESSED** (user-flagged) | The *only* mention anywhere is one sentence in `DOMAIN_MODEL.md` §3: "Event — separate from Experience... a scheduled happening with sessions/guests/sponsors, not a repeatable bookable offering." No field list, no dedicated document, no schema, no code. This is a real, confirmed gap — a genuinely distinct CLAUDE.md §13 concept (Edition/Venue/Sessions/Guests/Tickets/Speakers/Sponsors) has never gotten past a one-line disambiguation from Experience. |
| 14 | My Néctar | **PARTIALLY ADDRESSED** | Orders and Bookings sections are real and query live data. Saved items, Sensory History, Collections, Projects Followed, Recommendations, Learning, Notifications, Preferences are all unbuilt. The "Sensory history" section's copy still reads "Empty — Sensory is a later vertical slice (MVP_ROADMAP.md)" — stale, since Sensory has been built and live for several slices now (see Part 4). |
| 15 | Customer Profile & CRM | **NOT ADDRESSED** in code | `CustomerProfile`/`DeclaredPreference`/`InteractionEvent` don't exist. `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §K surfaced this as a gap and recommended adding it to `DOMAIN_MODEL.md`, but that recommendation itself was never acted on — still genuinely unaddressed at both the doc and code level. |
| 16 | Story & Knowledge Engine | **PARTIALLY ADDRESSED** | `Story` exists but is a single flat `bodyMarkdown` field — no versioning, no blocks, no media, no Interview/Quote/Transcript. The richer model is specified (`NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md`, reviewed in `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`) but not built. |
| 17 | Research OS | **SPECIFIED extensively, zero code** (user-flagged) | Named in `DOMAIN_MODEL.md` §4, `RESEARCH_ACTIVITY_CRITERIA.md` (its own dedicated doc, focused on activity classification not the OS itself), and referenced by three other documents' own sections (`EXTERNAL_DATA_ARCHITECTURE.md` §17, `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §I/§J/§K). Zero implementation: no `Experiment`, `Protocol`, `ProtocolVersion`, `Evidence`, `EvidenceClaim`, `Measurement`, `Hypothesis`, `AnalysisRun` table exists anywhere. This is the single largest gap between "specified" and "built" in the entire project — every module that touches Research OS (Fermentation, Coffee processing, Consulting, several AI modes) is itself blocked on it. |
| 18 | Agricultural Traceability | **SPECIFIED, zero code** | `DOMAIN_MODEL.md` §4's coffee chain (`Lot → HarvestEvent → ... → SensorySession`); `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F (Lot Genealogy) is real, deep design work on top of it — none of it built |
| 19 | Apiary/Honey | **PARTIALLY ADDRESSED** (user-flagged) | One paragraph in `DOMAIN_MODEL.md` §4. `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §3 covers bloom→honey correlation via the Specimen entity in real depth. `BEVERAGE_SENSORY_PROTOCOLS.md`'s honey sensory protocol is genuinely **built and live**. But the operational chain CLAUDE.md §19 actually asks for — `Apiary → Hive → Colony → Inspection`, `Queen`, `Feeding`, `Treatment`, `HealthObservation`, `Bloom/Flora`, `Harvest → HoneyBatch → Extraction → Storage` — has no dedicated architecture document and zero schema. Sensory *evaluation* of honey is built; honey *production* is not addressed. |
| 20 | Fermentation & Beverage | **PARTIALLY ADDRESSED** (user-flagged) | One paragraph in `DOMAIN_MODEL.md` §4. `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §I/§J design a generalized `traceability.measurement` table and reuse Research OS protocol versioning for it — real design depth, but contingent on Research OS existing. No dedicated `FERMENTATION_ARCHITECTURE.md`. Zero code — no `FermentationRun`, `Vessel`, `Ingredient`, `Culture`, `Inoculation` table exists. |
| 21 | Sensory & Evaluation Platform | **BUILT** | The most complete module in the platform — protocols, versions, sessions, flights, blind coding, assessments, panel results, calibration |
| 22 | Evaluator Types | **PARTIALLY ADDRESSED** | Technical/Research judge type built (Sensory Judge/Head Judge roles). Guided-experience and Consumer evaluation modes specified (`CONSUMER_SENSORY_FEEDBACK.md`) but not built. |
| 23 | Sensory — Coffee | **PARTIALLY ADDRESSED** | Cupping protocol live; filter-coffee brew-parameter traceability chain (grinder/water/TDS/extraction yield) never built |
| 24 | Sensory — Honey | **BUILT** | Protocol live (ISO/academic-grounded, per `BEVERAGE_SENSORY_PROTOCOLS.md`) |
| 25 | Sensory — Beer | **BUILT** | Protocol live (BJCP-adapted) |
| 26 | Sensory — Wine/Mead/Spirits | **PARTIALLY ADDRESSED** | Mead protocol live; Wine and Spirits exist only as `status = planned` placeholder rows with no attribute content |
| 27 | Evaluator Profile | **PARTIALLY ADDRESSED** | `EvaluatorSensitivityProfile`/calibration history built at the data layer; no UI surfaces an evaluator's aggregate stats (sessions completed, repeatability, panel alignment) |
| 28 | Sensory Analytics | **PARTIALLY ADDRESSED** | `PanelResult` mean built; median/variance/CI/inter-rater agreement/descriptor frequency/PCA/radar visualization all unbuilt |
| 29-30 | Competition Management OS / Filter Coffee | **PARTIALLY ADDRESSED** | Core entity chain built and live (reuses Sensory, per ADR-034); operational layer (`COMPETITIONS.md` — roles, intake, pull sheets, Best of Show, separate payments) accepted as planning input, not built (ADR-036) |
| 31 | AI Intelligence Layer | **PARTIALLY ADDRESSED** | The suggestion-*writing* half is real (rule-based generator, `ai.recommendation`, review UI). Search/summarize/compare/pattern-detection/a real conversational assistant — none of it exists. `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` §0 confirmed directly: no `AIProvider` implementation, no model SDK dependency anywhere in `package.json`. |
| 32 | AI Governance | **BUILT** | Enforced structurally — the `ai_service` Postgres role's restricted grants were verified directly this session (INSERT+SELECT on `ai.recommendation` only) |
| 33 | Search | **NOT ADDRESSED** | `DATA_ARCHITECTURE.md` §8 specifies Postgres full-text search as the v1 plan; zero `tsvector` usage found anywhere in the codebase. No cross-entity search exists at all today. |
| 34 | Notifications & Workflows | **SPECIFIED**, not built | `DOMAIN_MODEL.md` §5 names `Notification`; zero implementation, and confirmed (§2.7) to be blocking parts of Operator Mode design |
| 35 | Audit Trail | **BUILT** | `AuditEvent`, genuinely used by RBAC, AI suggestion decisions, others |
| 36 | Database Design | **BUILT** | Matches spec — UUID PKs, standard columns, PostGIS |
| 37 | File/Object Storage | **PARTIALLY ADDRESSED** | R2 adapter built and used for Partner Workspace `Asset` uploads; no Story/Product/Experience media pipeline exists yet |
| 38 | Time-Series Architecture | **SPECIFIED**, not built | Partitioning design exists (`DATA_ARCHITECTURE.md` §6); no `environmental.observation` table exists to partition |
| 39 | Front-End Architecture | **BUILT** | Next.js, responsive, i18n |
| 40 | Offline/Field Capability | **SPECIFIED**, not built | `OFFLINE_FIELD_CAPABILITY.md`, dedicated doc, zero implementation |
| 41 | Internationalization | **BUILT** | next-intl, ES/EN, cookie-based |
| 42 | Technical Stack | **BUILT** | Matches `PLATFORM_OVERVIEW.md` §8 exactly |
| 43 | API-First Principle | **PARTIALLY ADDRESSED** | Internal service-layer boundaries are real; no public API exists beyond the inbound Stripe webhook |
| 44 | External Integration Architecture | **PARTIALLY ADDRESSED** | Payments (Stripe) and Storage (R2) adapters built and used; Weather/Maps/Calendar/IoT/AI-provider adapters are named interfaces with zero implementations |
| 45 | Data Import | **NOT ADDRESSED** | No CSV/XLSX import job architecture anywhere |
| 46 | Exports | **NOT ADDRESSED** | No export functionality anywhere |
| 47 | Dashboards | **NOT ADDRESSED** | No role-specific dashboard beyond each module's own basic list page |
| 48 | Design Philosophy | **PARTIALLY ADDRESSED** | Functional, branded UI exists; the explicit public/editorial-vs-operator density split CLAUDE.md asks for isn't deeply realized (most pages share one plain layout) |
| 49 | Do Not Do These Things | — | Anti-pattern list; spot-checked, not violated by anything built so far |
| 50 | Development Methodology | **BUILT** (followed) | Iterative vertical slices, matches the prescribed order of operations |
| 51 | First Architecture Deliverables | **BUILT** | All 9 named documents exist |
| 52 | Initial Domain Model | **PARTIALLY ADDRESSED** | Most listed entities specified in `DOMAIN_MODEL.md`; Research OS/Environmental/several cross-cutting entities (Notification, CustomerProfile) remain unbuilt |
| 53 | MVP Strategy | **BUILT** (followed, reordered) | Slices A-G roughly map to what shipped, in the ADR-012 modified order |
| 54 | Demonstration Data | **BUILT** (followed) | DEMO-labeling discipline consistently applied across every slice |
| 55 | Data Quality | **PARTIALLY ADDRESSED** | `RecordStatus` lifecycle built and used; the scientific-evidence quality vocabulary (`verified_with_limitation`, `working_hypothesis`, etc.) specified in `DATA_ARCHITECTURE.md` §7 has zero implementation |
| 56 | Security | **BUILT** | `SECURITY.md` + RBAC enforcement, CSRF via Server Actions |
| 57 | Testing | **PARTIALLY ADDRESSED** | RBAC-tests-mandatory clause satisfied; everything else relies on live manual verification only — see Part 4 |
| 58 | Observability | **PARTIALLY ADDRESSED** | Structured logging via Next.js/Vercel exists; no dedicated error monitoring or health-check endpoint |
| 59 | Performance | **PARTIALLY ADDRESSED** | Indexing done per-migration; no caching layer; pagination not yet needed at current data volume |
| 60-63 | Process/meta instructions | — | Followed throughout (repository inspection before building, documentation-first, decision logging) |

**Summary**: of CLAUDE.md's ~50 substantive sections, roughly 14 are fully BUILT, 20 are PARTIALLY ADDRESSED, 8 are SPECIFIED-only, and 7 (Events, Customer Profile/CRM, Search, Data Import, Exports, Dashboards, and the deep operational half of Apiary/Fermentation) are genuinely NOT ADDRESSED at either the doc or code level.

---

## Part 4 — Known Technical Debt and Open Items

Compiled from explicit flags already raised across `DECISIONS.md`, `SETUP.md`, and the planning documents — not re-solved here.

**Credentials / integrations not configured** (per `SETUP.md`, current as of this audit):
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — blocks verifying a real Checkout purchase completing through the webhook, for both Commerce orders and Experience bookings.
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` — blocks verifying a real Partner Workspace media upload completing through object storage.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth login path is unconfigured and unverified; credentials-only auth works.
- Transactional email — no provider wired up at all (`INTEGRATIONS.md` §5 names the interface, no implementation); email verification is unverified.
- None of the above are set in Vercel's production environment either (`SETUP.md`'s deployment note) — the gaps apply in production too, not just locally.
- A price hasn't been set on any DEMO `ProductVariant`/Experience, which is a prerequisite decision for testing Stripe even once keys exist (`DECISIONS.md` ADR-025 decision 10, ADR-028 decision 8).

**Not built despite being accepted/scoped**:
- `TOURISM_EXPERIENCES.md`'s gastro-tourism extensions (waitlist, multi-day sessions, dietary structure, pairing/episode menus, live sensory feedback) — accepted (ADR-026/027), not yet layered onto the core booking engine.
- An admin UI for creating/reclassifying Partner Workspace `Task` rows — currently seed-data-only (ADR-029 decision 4).
- The Assessment-correction workflow — schema supports it (`supersedesAssessmentId`), `submitAssessment` currently just rejects a second submission outright (ADR-030 decision 5).
- Any Sensory protocol domain beyond what's built (coffee/beer/mead/honey are live; wine/cacao/chocolate/spirits/rum/gin/infused-liquors/water/non-alcoholic are `planned`-status placeholders with zero attribute content, per `BEVERAGE_SENSORY_PROTOCOLS.md` §4).
- `COMPETITIONS.md`'s full operational layer (ADR-036) — four specific implementation gaps already logged there: `judge_session` should key by `UserAccount` not `Person`; blind-code *assignment* needs its own permission distinct from `blind_mapping:view` (only the *view* restriction exists today); `bos_round` needs its own `sensorySessionId` link before Best-of-Show judging can reuse Sensory; and `finalizeResult`/`declareAward` don't yet write `AuditEvent` rows despite `SECURITY.md` §6 already requiring it for "every competition result change."
- `DistillationRun` — flagged in `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §9 as a small future gap, same shape as `FermentationRun`, not urgent.
- `eBird`, `Protected Planet API`, `ORCID` integrations — explicitly gated on legal/licensing review before use (`EXTERNAL_DATA_ARCHITECTURE.md` §24, §30 decision 8) — review owner not yet assigned.

**Documentation debt** (doesn't block anything, but accumulating):
- `DATA_ARCHITECTURE.md` §1's schema list is stale (§2.4 above) — missing `experiences`, still lists three schemas that were folded into `core` instead of built separately.
- `RBAC.md` §5's Role Profile prose list is missing "Sensory Head Judge" (§2.6 above).
- `GUIDED_FIELD_STUDY_TOOL.md` §8's offline note was never updated to reference `OFFLINE_FIELD_CAPABILITY.md` (§2.2 above, the item specifically flagged for this audit).
- Five broken/mistargeted cross-references and one fabricated quote (§2.1 above).
- Stale comment at `prisma/schema.prisma` line 3 (§2.3 above).
- `00_INSTRUCTIONS_AND_PROMPT.md` and `04_ADD_REMAINING_PLANNING_DOCS_PROMPT.md` appear to be duplicates or near-duplicates covering the same five planning docs — worth confirming whether one is stale and safe to remove.
- `ADR-027`'s own text notes that if Daniel Silvera's written per-item review notes for the retroactive research-activity review become available, they should be appended to that ADR entry — no such notes have been appended as of this audit; the ADR currently records only the outcome ("approved"), not the reasoning.
- The Brand/Marketing/Community/Sales input document has no review-pass companion document yet, unlike every other large input doc in the repo, and its two files aren't committed to git (§1.1, §1.3).

**Test coverage** (elevated to its own item given how one-sided it is): only `tests/rbac/resolve.test.ts` exists. Every other shipped module (Commerce, Experiences, Partner Workspace, Sensory, Competitions, Calibration, AI suggestion lifecycle) has been verified exclusively through live, manual, one-time browser/database verification during its build session — none of that verification is captured as a repeatable automated test. A future regression in, say, the Assessment race-condition fix or the blind-mapping restriction would not be caught by `npm test`.

**Known, explicitly-deferred architectural decisions** (not urgent, listed so nothing is only living in prior conversation history):
- `organization` as a new `RBAC.md` `ScopeType` — accepted design (`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §S/§AA), scheduled alongside Client Portal work, not built.
- `CustomerProfile`/`DeclaredPreference`/`InteractionEvent` — accepted as a documented gap-fix (`ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §K/§Q decision 6), never actually added to `DOMAIN_MODEL.md` itself despite being "confirmed in scope."
- Whether weather/climate external data reuses `environmental.observation` vs. its own table, and whether `external_source_class` needs folding into `provenance_class` — both open in `EXTERNAL_DATA_ARCHITECTURE.md` §30, unresolved.
- `pgvector`/embeddings for semantic search — recommended direction (`ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §H) when the time comes, explicitly NEXT-phase, not started.
- A new `ai:converse` permission for who may use a future Ask Néctar — flagged in `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` §37/§43, no decision yet.

---

## Part 5 — Worth Exploring

Kept short and grounded in what's actually built — not a speculative feature list.

1. **Wire My Néctar's "Sensory history" section to real data.** This is the single most concrete, low-effort opportunity found during this audit. The copy at `messages/en.json` line 143 still reads "Empty — Sensory is a later vertical slice (MVP_ROADMAP.md)," but Sensory, Competitions, and Calibration have all been live for several slices now. `Assessment.evaluatorUserAccountId` already ties every submitted assessment to a real `UserAccount` — a logged-in Sensory Judge's own past assessments are already queryable with no schema change, just a new query in `lib/sensory/service.ts` and a real section in `app/my-nectar/page.tsx` replacing the placeholder.

2. **Run a real cross-category competition now that the infrastructure supports it.** `COMPETITIONS.md`'s own motivating example is a Panama-style lager competition; the entity chain, Sensory Judge/Head Judge roles, and the BJCP-adapted beer protocol are all live today. Every Competitions verification so far (per `SETUP.md`) has used coffee. Running one real beer, mead, or honey competition through the *existing, unmodified* Competitions UI would be a genuine, cheap proof of the category-agnostic design claim `COMPETITIONS.md` and `ADR-036` make, using zero new code.

3. **`AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md`'s own MVP recommendation (§40) is unusually ready to execute.** It independently arrived at exactly the five modes (Field, Operator, Sensory, Competition, Commerce) that already have real grounding data per this audit's Part 3 findings — the review and the audit converge from different directions on the same "what's actually live" answer, which is a reasonable signal that scoping is right, not just optimistic.

4. **`TOURISM_DESIGN_RESOURCES.md` already names its own follow-on opportunity explicitly** (§2, line 144): a cross-producer "Panama craft trail" route (Tres Gatos, Casa Bruja, Clandestina, and others), rendered via `MAP_AND_TERRITORY.md` §5's existing route-rendering design — noted there as "worth a dedicated conversation," not assumed into scope. Repeating it here only because it's a rare case of a document already flagging its own natural next step with this level of specificity.

5. **The Content/Ops Coordinator Role Profile already holds `ai:review_suggestion`** — meaning the non-developer-collaborator seat CLAUDE.md's team context specifically asked RBAC to support is already functional for AI suggestion review today, not just theoretically supported by the data model. Actually inviting a real non-admin collaborator into that role (e.g., for the AI suggestions surface) would be a genuine test of "add non-developer collaborator roles later without rework" rather than an assumption that it works.

---

*This report is a snapshot as of 2026-08-10. It was produced without modifying any code or other architecture document, per the task's constraint.*
