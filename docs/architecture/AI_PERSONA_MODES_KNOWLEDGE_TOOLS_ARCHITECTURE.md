# AI Persona, Modes, Knowledge & Tools Architecture — Néctar Nómada Digital Platform

**Status: awaiting product-owner approval.** Nothing in this document is
implemented. No model SDK installed, no embeddings created, no RAG pipeline
built, no tool executed, no permission modified, no external knowledge source
ingested, no AI agent created, no production prompt modified, per the explicit
constraint given with this task. This is a behavioral and structural design
pass only.

Input: `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_PROMPT_CORRECTED.md` (referenced
throughout as "the input document"). Extends `AI_GOVERNANCE.md`, `RBAC.md`,
`DOMAIN_MODEL.md`, `INTEGRATIONS.md` §7, and the three prior architecture
reviews (`EXTERNAL_DATA_ARCHITECTURE.md`, `ADAPTIVE_INTELLIGENCE_EXPERIENCE_
REVIEW.md`, `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`) rather than
replacing any of them — where this document repeats a conclusion those three
already reached (RBAC-scoped retrieval, the `ai.recommendation` suggestion
loop, provenance labeling), it cites rather than re-derives.

**The one fact that reframes the whole exercise**: unlike the three prior
reviews, which were written when only Slice 1 (Identity) existed, this
platform now has six real vertical slices live in production — Discover,
Commerce, Experiences, Partner Workspace, Sensory (including Competitions
and Panel Calibration), and a first, narrow slice of AI (§0). That changes
the central question from "design everything ahead of any code" to "which
professional modes have real data to ground against *today*, and which are
still designing ahead of modules that don't exist yet." §0 and §40 make this
distinction precise, because it is the single biggest driver of what should
launch first.

---

## 0. Repository inspection — what exists today, precisely

Per the input document's own instruction to not assume anything is absent,
here is what was actually checked, not summarized from memory.

**AI infrastructure that is real and running in production:**

- `ai.recommendation` (Prisma model `Recommendation`) — the full suggestion
  lifecycle table `AI_GOVERNANCE.md` §4 specifies: `suggestionType`, `model`,
  `modelVersion`, `context` (jsonb), `recommendation`, `supportingEvidence`
  (jsonb), `confidence`, `relatedEntityType`/`relatedEntityId`, `status`
  (`pending|accepted|rejected|modified`), `reviewerUserAccountId`,
  `decisionAt`, `actionTaken`.
- A genuinely separate, restricted Postgres role, `ai_service` — verified
  directly (not just asserted) to hold `INSERT`+`SELECT` on
  `ai.recommendation` only, `UPDATE`/`DELETE` denied, and every other table
  unreachable (`permission denied for schema core`). This is the concrete,
  already-working instance of `AI_GOVERNANCE.md` §3's "technical enforcement,
  not policy-only" claim.
- `lib/ai/service.ts` — `generateDataCompletenessSuggestions()`, a **rule-
  based** generator (`model: "rule-based-completeness-checker-v1"`), scans
  `core.Project` for missing/empty descriptions. Honestly labeled as
  rule-based, not pretending to call a real model.
- `ai:review_suggestion` permission, gated the same way every other
  permission is (`can(userAccountId, "review_suggestion", "ai", {scopeType:
  "platform", scopeRefId: null})`), held by Platform Admin and Content/Ops
  Coordinator.
- `/ai` — a working review surface (pending list, accept/reject, reviewed
  history), writing a real `AuditEvent` on every decision.

**What does not exist, anywhere in the codebase, as of this inspection:**

- No `AIProvider` implementation. `INTEGRATIONS.md` §7 names the interface
  (`AIProvider.complete(prompt, context) / .embed(text)`); nothing implements
  it. No Anthropic/OpenAI/any model SDK is a dependency (`package.json`
  checked directly). **This means Ask Néctar — a real, model-backed
  conversational assistant — has never been built.** Everything that exists
  today is the suggestion-*writing* half of the loop (a scheduled/triggered
  rule scans data and proposes a fact), not a request/response assistant a
  user talks to.
- No embeddings, no `pgvector`, no retrieval/RAG infrastructure of any kind.
- No `Notification` table (`DOMAIN_MODEL.md` §5 names it; not yet built) —
  Operator Mode (§23) cannot yet deliver via the mechanism the prior reviews
  assumed exists.
- No Research OS tables at all — no `Experiment`, `Protocol`,
  `ProtocolVersion`, `Evidence`, `EvidenceClaim`, `Measurement`. Research
  Mode (§14) and Fermentation Mode (§16) have essentially nothing to ground
  against yet beyond what Sensory already covers.
- No `MediaAsset`/`Interview`/`TranscriptSegment`/`Quote`/`StoryBlock` —
  `Story` exists (Slice 2) but is a single flat `bodyMarkdown` field with no
  versioning, blocks, media, or interview structure. Storytelling Mode (§20)
  and Creative Mode (§21) have a real but very thin substrate today.
- No `CustomerProfile`/`DeclaredPreference`/`InteractionEvent` — the
  Personalization gap `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §K
  already flagged is still open.
- No `FermentationRun`/`Vessel`/`Culture` — Brewing Mode (§17) and
  Fermentation Mode (§16) have no operational data to query.
- No `external.*` schema (`EXTERNAL_DATA_ARCHITECTURE.md`'s design) and no
  `knowledge.*` schema (this document's own proposal, §8) — both are
  approved-or-proposed design, not code.

**What is real and directly reusable for this document's grounding needs:**

- Full RBAC: `Person`, `UserAccount`, `Assignment`, `Scope`, `RoleProfile`,
  `Permission`, and the resolution service (`lib/rbac/service.ts`'s `can()`
  and `resolvedPermissionKeys()`) — this is what §12's Tool Permission
  Architecture binds to directly, not a future mechanism.
- `Location`, `Organization`, `Program`, `Project`, `ProjectDomainTag`,
  `Sample` (Foundational layer).
- `Story`, `Product`, `Experience` (Discover, read-only public surface).
- `ProductVariant`, `Cart`, `Order`, `OrderItem`, `Payment` (Commerce).
- `ExperienceSession`, `Booking`, `Participant` (Experiences).
- `Asset`, `Task`, `FieldSubmission` (Partner Workspace).
- `SensoryProtocol`/`Version`/`Attribute`, `SensorySession`/`Flight`/
  `BlindSample`/`BlindMapping`, `Assessment`/`AttributeResponse`,
  `PanelResult` — the single most complete, richest-grounded module in the
  platform today.
- `Competition`/`Edition`/`Category`/`Entry`/`JudgeAssignment`/`Result`/
  `Award` — reuses Sensory's engine directly, per `DECISIONS.md` ADR-034.
- `ReferenceStandard`/`CalibrationSession`/`CalibrationResult`/
  `EvaluatorSensitivityProfile` — real panel-calibration data.

This inventory is the ground truth every recommendation below is checked
against — not the aspirational entity list in `DOMAIN_MODEL.md` §4, which
describes modules not yet built.

---

## 1. Executive Summary

Néctar Nómada should have **one AI identity** — an interdisciplinary
practitioner, not a roster of fictional bots — expressed through
**composable professional modes** that change vocabulary, sources, tools,
and safeguards without changing who is speaking. The mechanism for this
already exists in code for its write half (`ai.recommendation` +
`ai_service` role + human review); it does not yet exist for its read/
conversational half (no `AIProvider`, no retrieval, no Ask Néctar). This
document's job is to specify the read half — intent routing, knowledge
sourcing, tool permissions, and mode composition — so it plugs into the
already-working governance loop instead of inventing a second one.

**Recommendation in one sentence**: build Ask Néctar as a thin
intent-router + RBAC-scoped read-only-tool layer over the existing
`ai.recommendation`/RBAC infrastructure, launch with the five professional
modes that have real data to ground against today (Sensory, Competition,
Commerce, Field, Operator — plus a general Discover mode), and defer every
mode whose underlying module (Research OS, Fermentation, rich
Storytelling/Media, Consulting, deep Gastronomy/Pairing) doesn't exist yet
until that module ships — the same "don't build ahead of the module" bias
already governing every prior architecture review in this repository.

## 2. Core Persona

One interdisciplinary practitioner, composed of the archetypes the input
document lists (§2: field naturalist, fermentation researcher, coffee
farmer, brewer, winemaker, sensory analyst, cupper, sommelier, Cicerone,
gastronome, experimental maker, storyteller, scientific communicator), never
presented as separate characters. The persona is a **prompt-composition and
voice layer only** — it carries no authority of its own (§23 of the input
document; formalized here as §3's non-negotiable ordering) and is not a
database entity. It does not need to be: there is exactly one persona for
the whole platform, not something an admin edits per-installation the way a
Role Profile is (`RBAC.md` §2's "data, not code" reasoning applies to things
that genuinely vary per deployment or need non-developer editability;
persona voice does not — it is versioned in git as a system-prompt template,
same discipline `INTEGRATIONS.md` §5 already applies to email templates).

**"Alchemist" trait** (input §4): retained strictly as the internal metaphor
of curiosity + controlled experimentation + observation, never as a
mysticism/energy/terroir-magic framing. Concretely: the alchemist's "what if
we changed this variable?" is *never itself an answer* — it always routes
to a mode that can actually test or evaluate the change (Research: "how do
we test it," Sensory: "how do we evaluate the result," Data: "what actually
changed"). This is the same pattern §6's Mode Composition formalizes for
every multi-mode query, not a special case for this one trait.

## 3. Persona Guardrails

**Non-negotiable ordering, extending `AI_GOVERNANCE.md`'s existing structure
one layer up** (input §23, reconciled with what already governs suggestion
writes):

```
AI GOVERNANCE (AI_GOVERNANCE.md — already enforced at the DB permission layer)
  ↓
PERMISSIONS (RBAC.md's can() — already enforced server-side)
  ↓
EVIDENCE / SOURCE STATUS (provenance_class, DATA_ARCHITECTURE.md §4 — already enforced)
  ↓
TASK + PROFESSIONAL MODE (this document, §4-6 — new)
  ↓
KNOWLEDGE + TOOLS (this document, §7-13 — new)
  ↓
CORE PERSONA / VOICE (this document, §2 — new)
  ↓
RESPONSE
```

Persona is the *last* thing applied, not the first — a confident, eloquent
voice is layered on top of an already-governed, already-permission-scoped,
already-evidence-labeled answer. It never widens what the answer is allowed
to say.

**Concrete, testable guardrails** (input §24, made specific to this
platform's actual schema):

- **No sensory invention**: an AI response must never generate a tasting
  note, descriptor, or intensity claim for a specific `Sample`/`Product`
  that has no corresponding `Assessment`/`AttributeResponse`/`PanelResult`
  row. It may describe *general* characteristics of a variety/style from
  Tier A/B/C sources (§14), clearly framed as general knowledge, never as
  "this coffee tastes like."
- **Observation vs. interpretation vs. comparison stay three sentences, not
  one** (input §3's worked example) — enforced as a response-composition
  rule the system prompt states explicitly per mode, checked in eval/review
  (§37's testing requirement), not something the architecture alone
  guarantees.
- **Research status survives rewriting**: if a `PanelResult`/future
  `Conclusion` is `provisional`/`working_hypothesis`/`conflicting`
  (`DATA_ARCHITECTURE.md` §7), the response must carry that status word
  forward, never smooth it into unqualified confidence.
- **Unknown is a valid, preferred answer** over a fabricated one — this is
  not new; it is `AI_GOVERNANCE.md` §7's "missing data stays missing" rule
  restated as a persona instruction so it survives into casual conversation,
  not only structured suggestion generation.
- **Persona suppression is a real, opposite mode** — see §27 (blind
  evaluation) and §22 (raw field logging): some workflows must actively
  *reduce* expressiveness, not increase it.

## 4. Professional Mode Architecture

**Where modes live, answered directly**: modes are a **code-level registry**
(a typed array/map, e.g. `lib/ai/modes.ts`, the same "data-shaped constants
in code" pattern `lib/rbac/catalog.ts` already uses for the Permission/Role
Profile catalog), **not** a database table and **not** admin-editable
runtime configuration. Reasoning: Role Profiles are DB data because RBAC.md
§2 explicitly requires non-developer-addable roles; professional modes are a
product/prompt-engineering surface that changes with a deploy, the same
category as a template (`INTEGRATIONS.md` §5) or an adapter's capability
interface (`INTEGRATIONS.md` §1) — both already code, not data, in this
architecture. What *is* recorded per response is which mode(s) were
selected, stored in `ai.recommendation.context` (already a `jsonb` column,
no schema change needed) as `{mode_path: ["SENSORY", "DATA_ANALYSIS"]}` when
a suggestion is generated through Ask Néctar's routing — full conversation-
level logging is a NEXT-phase concern (§41), not required for MVP.

Each mode is a typed definition:

```ts
interface ProfessionalMode {
  key: string;                          // e.g. "SENSORY"
  purpose: string;
  personaEmphasis: string[];            // voice adjectives to foreground
  preferredInternalSources: string[];   // canonical entities/modules to query first
  preferredExternalSources: string[];   // knowledge_source keys, §8
  allowedTools: string[];               // §11 tool keys
  restrictedTools: string[];
  citationRequirement: "none" | "light" | "strict";
  uncertaintyStrictness: "low" | "medium" | "high";
  specialSafeguards: string[];
  groundingStatus: "live" | "partial" | "not_yet_grounded"; // §0-driven, honest
}
```

`groundingStatus` is the field that makes §0's inventory operational rather
than just descriptive — a mode whose underlying module doesn't exist yet is
marked `not_yet_grounded` and the intent router (§6) declines to route to it
with fabricated confidence, instead responding with what it *can* say from
general knowledge, explicitly labeled as not grounded in Néctar Nómada's own
records (same discipline as §3's "no sensory invention," generalized).

### Mode Registry & Matrix

| Mode | Purpose | Persona emphasis | Preferred internal data | Allowed tools (§11) | Citation requirement | Uncertainty strictness | Grounding status |
|---|---|---|---|---|---|---|---|
| FIELD | Concise field briefing/logging | Observant, direct | Task, FieldSubmission, Project | SEARCH, TASK_CREATION | Light | Medium | **Live** |
| OPERATOR | "What needs attention" | Action-oriented | Task, FieldSubmission, ai.recommendation (pending) | SEARCH, PROJECT_SEARCH | None | Low | **Partial** (no `Notification` yet, §0) |
| SENSORY | Descriptor/panel support, non-blind | Descriptive, attributed | SensorySession, Assessment, PanelResult, ReferenceStandard | SENSORY_ANALYSIS, SEARCH, COMPARE | Strict for claims | High | **Live** |
| COMPETITION / BLIND EVAL | Neutral scoresheet support during blind judging | Neutral, minimal (§27) | SensoryBlindSample only — no mapping | SENSORY_ANALYSIS (blind-scoped) | None (suppressed) | Highest | **Live** |
| COMMERCE | Discover/compare/purchase help | Concise, useful | Product, ProductVariant, Order | SEARCH, RECOMMEND, PROJECT_SEARCH | Light | Low | **Live** |
| TOURISM / EXPERIENCE | Inviting, narrative discovery | Expressive, grounded | Experience, ExperienceSession, Story, Location | SEARCH, RECOMMEND | Light | Medium | **Partial** (Experience exists; rich itinerary/media content doesn't, §0) |
| RESEARCH | Conservative, evidence-first | Conservative, explicit uncertainty | *(none yet — Research OS unbuilt)* | SEARCH (external knowledge only) | Strict | Highest | **Not yet grounded** |
| FERMENTATION | Applied fermentation practice | Curious, precise | *(none yet — FermentationRun unbuilt)* | SEARCH (external knowledge only) | Strict | High | **Not yet grounded** |
| BREWING | Beer-specific applied practice | Precise, engaged | *(none yet)* | SEARCH (external) | Strict | High | **Not yet grounded** |
| COFFEE / COFFEE_PROCESSING | Coffee-specific applied + cupping | Practical, precise | Sample, SensoryProtocol (coffee domain), Product | SENSORY_ANALYSIS, SEARCH | Strict for sensory claims | High | **Partial** (cupping live via Sensory; processing/lot chain unbuilt) |
| GASTRONOMY / PAIRING | Structured pairing reasoning | Expressive, comparative | Product (as beverage), SensoryProtocol descriptors | RECOMMEND, PAIR, COMPARE | Light–strict (§25 evidence states) | Medium–high | **Partial** (no `PairingHypothesis`/`PairingTrial` yet — §25) |
| STORYTELLING | Narrative from real records | Narrative, rhythmic | Story, Location, Project, Person | SEARCH, SUMMARIZE, CONTENT_GENERATION | Strict (cite records, never invent transitions) | High | **Partial** (flat `Story` only, no Interview/media, §0) |
| CREATIVE / AUDIOVISUAL | Content-opportunity detection | Practical, editorial | Story, Asset (thin) | MEDIA_SEARCH, CONTENT_GENERATION | Strict | High | **Partial**, low volume (no `MediaAsset`/rights model, §0) |
| CONSULTING | Client engagement synthesis | Structured, assertive | Project (client fields don't exist yet) | REPORT, SUMMARIZE | Strict | High | **Not yet grounded** (no `ServiceInquiry`/client FK, §0) |
| DATA_ANALYSIS | Cross-mode comparison/statistics | Methodical | Whatever the composed mode grounds (§10) | ANALYZE, COMPARE, VISUALIZE | Strict | High | Depends on composed mode |

`groundingStatus` values are the honest, current-as-of-this-inspection
answer, not a permanent classification — each becomes `live` the moment its
module ships, with no change to the mode's persona/tool definition, only its
grounding flag.

## 5. Mode Composition

Modes compose by simple set-union of `allowedTools` (intersected with the
user's actual RBAC-resolved permissions, §12 — composition never grants a
tool a single mode wouldn't already allow) and by taking the **strictest**
`citationRequirement`/`uncertaintyStrictness` across the composed set — a
`SENSORY + COMMERCE` query inherits Sensory's strict citation requirement,
never Commerce's light one, so composition can only tighten safeguards, not
loosen them. `personaEmphasis` lists concatenate (deduplicated); the persona
never contradicts itself, it just carries more adjectives.

Worked examples, using the input document's own queries:

- `"Compare fermentation A and B."` → `FERMENTATION + RESEARCH +
  DATA_ANALYSIS` — but `FERMENTATION`/`RESEARCH` are `not_yet_grounded`
  (§4), so today this composes to a general-knowledge answer with an
  explicit "Néctar Nómada doesn't have fermentation records to compare yet"
  disclosure, not a fabricated comparison.
- `"What would you pair with this Geisha?"` → `COFFEE + SENSORY +
  GASTRONOMY + PAIRING` — grounds in real `SensoryProtocol`/`Assessment`
  data if the specific coffee has been cupped, otherwise falls back to
  general coffee-Geisha characteristics from Tier A/B sources (§14),
  labeled accordingly.
- `"What should I do at the farm tomorrow?"` → `OPERATOR + FIELD +
  PROJECT_CONTEXT` — fully live: queries open `Task`/`FieldSubmission` rows
  for the user's Assignment-scoped Projects.

## 6. Intent Routing

```
ASK NÉCTAR (user message)
  ↓
Intent Classification       — which mode(s) does this request most resemble?
  ↓
Context Resolution          — current screen/object, if any (a Project page, a
                               SensorySession, a Product) supplies default
                               entity scope
  ↓
Permission Resolution       — resolvedPermissionKeys(userAccountId, scope)
                               (lib/rbac/service.ts, already exists)
  ↓
Professional Mode Selection  — §5's composition, filtered by groundingStatus
  ↓
Knowledge Routing            — §7-10
  ↓
Tool Selection                — §11-12, intersected with resolved permissions
  ↓
Grounded Response              — §28's provenance labeling
  ↓
Audit / Suggestion lifecycle    — only when the response constitutes a
                               suggestion-shaped output (§29); a plain
                               question-answer does not create an
                               ai.recommendation row, only a write-shaped
                               proposal does
```

Users never manually pick a persona. Intent classification (the first step)
is itself model-mediated once a real `AIProvider` exists (§0) — this
document does not specify the classification prompt/technique itself (a
NEXT-phase implementation detail, not an architecture question), only that
its **output** must be one or more `ProfessionalMode.key` values the rest of
the pipeline can act on deterministically.

**Required routing examples** (input §46), shown as mode path → grounding
reality today:

| Query | Mode path | Grounded today? |
|---|---|---|
| "Compare fermentation A and B." | FERMENTATION + RESEARCH + DATA_ANALYSIS | No — general knowledge only |
| "What would pair with this Geisha?" | COFFEE + SENSORY + GASTRONOMY + PAIRING | Partial |
| "Create an Instagram reel about CryoBloom." | CREATIVE + STORYTELLING + AUDIOVISUAL | Partial, thin |
| "What should I document at the farm tomorrow?" | OPERATOR + FIELD + PROJECT_CONTEXT | **Yes** |
| "Why is sample 117 scoring differently?" | SENSORY + DATA_ANALYSIS + RESEARCH | Partial (Sensory yes, Research no) |
| "Explain Brettanomyces to a visitor." | TOURISM + FERMENTATION (general knowledge, no internal grounding needed) | Yes, as general knowledge |
| "Prepare a consulting report." | CONSULTING + RESEARCH | No |
| "Show me everything Bob said about soil." | STORYTELLING | Partial — no `Interview`/`Quote` yet, falls back to `Story.bodyMarkdown` full-text search |
| "Which lots need attention today?" | OPERATOR + FIELD | No `Lot`/traceability model yet (`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F, not built) — falls back to `Task`/`FieldSubmission` |
| "What beer style does this most closely resemble?" | BREWING + SENSORY | No — no beer sensory data seeded yet (only the BJCP-adapted protocol shell exists, `BEVERAGE_SENSORY_PROTOCOLS.md`) |
| "What do we actually know about this yeast?" | FERMENTATION + RESEARCH | No — general knowledge only |

## 7. Knowledge Source Hierarchy

Three-axis retrieval order per query, **contextual, never one global
ranking** (input §15): (1) internal Néctar Nómada records for the specific
entity in question, (2) domain-appropriate external Tier A/B sources (§14),
(3) AI synthesis, always last and always labeled. `EXTERNAL_DATA_
ARCHITECTURE.md` §3 already states the adjacent principle for environmental/
geo data ("external data is context, not evidence"); this section states
the same discipline for textual/reference knowledge.

Priority orders per domain (input §13, adopted with one correction — every
list puts **internal data first**, unconditionally, since a Sample's own
recorded `Assessment` always outranks a generic style expectation):

- **Coffee + Sensory**: internal sensory/project data → SCA → World Coffee
  Research → primary literature → professional technical references →
  community sources.
- **Beer + Fermentation**: internal records → official methods/standards →
  primary literature → professional technical publications → specialist
  evidence-driven resources → community experience → AI synthesis.
- **Gastronomy + Pairing**: internal tested pairings (§25 — none exist yet)
  → sensory science → Cicerone/WSET frameworks → culinary science → expert
  applied references → community/anecdotal.

## 8. Knowledge Source Registry

Genuinely new infrastructure, structurally parallel to but distinct from
`EXTERNAL_DATA_ARCHITECTURE.md`'s `external.provider`/`external.dataset`
(§7 there): that schema is for structured *data* (weather, biodiversity,
terrain); this one is for textual/reference *knowledge* used to ground AI
responses (standards, papers, forum consensus). Same governance discipline
reused directly (license/access columns copied from `external.license`'s
shape), different content shape (documents/claims, not observations):

```
knowledge.source (id, name, organization, domain, source_type
  [official_standard|primary_literature|professional_reference|
  specialist_community|community_forum|internal], authority_tier
  [A|B|C|D|E|F, §14], authority_scope text, version, publication_date,
  last_reviewed, url, doi(nullable), license, access_rights,
  retrieval_allowed boolean, citation_allowed boolean,
  full_text_available boolean, commercial_use_allowed boolean, notes)

knowledge.document (id, source_id, title, retrieved_at, storage_key
  (nullable — object storage, only when retrieval_allowed and
  cache_allowed-equivalent), summary, superseded_by(nullable))

knowledge.claim_reference (id, document_id, claim_text, cited_in_type,
  cited_in_id)
  -- links a specific AI-generated claim back to the specific document
  -- passage it drew from, the textual-knowledge equivalent of
  -- external.observation's provenance columns
```

**This document does not recommend bulk ingestion** — per the input
document's own §16 instruction and matching `EXTERNAL_DATA_ARCHITECTURE.md`
§29's "no source polled just in case," `knowledge.source` rows are
registered (name, tier, licensing status) well before any `knowledge.
document` content is actually retrieved, and `retrieval_allowed`/
`citation_allowed` are hard gates checked before any retrieval job runs, not
documentation notes.

### Required Source Matrix (input §44)

| Source | Domain | Type | Authority tier | Recommended status |
|---|---|---|---|---|
| SCA (Coffee Value Assessment) | Coffee | Official standard | A (within CVA scope) | Registered, not ingested — already cited by name in `BEVERAGE_SENSORY_PROTOCOLS.md`, no bulk retrieval |
| World Coffee Research | Coffee | Professional/research org | B/C | Registered, retrieval on-demand only |
| ASBC | Beer (analytical) | Official method | A (analytical scope) | Registered |
| MBAA | Beer (technical) | Professional reference | C | Registered |
| Brewers Association | Beer | Professional reference | C | Registered |
| BJCP | Beer/Mead (style/judging) | Official standard, narrow scope | A (style/judging scope only, not chemistry — input §15's own caution) | Registered — already cited structurally in `BEVERAGE_SENSORY_PROTOCOLS.md` |
| Cicerone | Beer/Gastronomy | Professional certification body | A (within its domain) | Registered |
| Craft Beer & Brewing | Beer | Professional technical media | C | Registered, on-demand |
| AHA | Beer (homebrew) | Professional/enthusiast org | C/D | Registered |
| AHA Forum, HomebrewTalk | Beer | Community forum | E — `COMMUNITY_EXPERIENCE`, never technical authority | Registered, synthesis-only (§10) |
| Milk the Funk | Fermentation (mixed) | Specialist community | D — evidence-informed, trace to primary literature | Registered, synthesis-only |
| WSET | Wine/Gastronomy | Official certification body | A (within domain) | Registered |
| OIV | Wine | Official standard | A | Registered |
| UC Davis Viticulture & Enology | Wine | Academic/research | B | Registered |
| Australian Wine Research Institute | Wine | Academic/research | B | Registered |
| UC Davis Honey and Pollination Center | Honey | Academic/research | B | Registered — already the grounding cited in `BEVERAGE_SENSORY_PROTOCOLS.md`'s honey protocol |
| Peer-reviewed literature (general) | Cross-domain | Primary evidence | B | Registered, cited per-claim, never bulk-ingested |

Every row above is **registration only** — a `knowledge.source` row
recording what it is and its licensing posture. None is a recommendation to
retrieve or ingest content now; that is a NEXT-phase decision per source,
gated on `retrieval_allowed`/`citation_allowed` review (§38).

## 9. Domain-Specific Source Routing

Reuses §7's per-domain lists directly — this section exists to confirm that
a `ProfessionalMode` (§4)'s `preferredExternalSources` field is populated
from exactly the same per-domain ordering, so a Coffee-mode query and a
Sensory-mode query for the same coffee sample don't silently diverge in
source priority because one is defined in two places. One list, referenced
from both the mode registry and the routing table.

## 10. Community / Forum Knowledge Rules

Forum content is never a fact; it is synthesized into a structured shape
(input §17), rendered with hedged language ("Several brewers report...",
never "It is established that..." unless a Tier A/B source independently
confirms it):

```
Question
  → Reported Experiences (COMMUNITY_REPORT)
  → Areas of Agreement (COMMUNITY_PATTERN)
  → Contradictions
  → Important Variables
  → Relevant Technical Sources (Tier A-C, if any exist)
  → What Remains Unresolved
```

This is a response-composition template, not a new storage mechanism — the
underlying `knowledge.claim_reference` rows (§8) already distinguish
`source_type = community_forum` from `official_standard`, so the template
above is populated by a straightforward filter/group-by over sources already
tagged by tier.

## 11. Tool Architecture

**Every tool is read-only.** This is not a per-tool policy decision; it is
the same structural fact `AI_GOVERNANCE.md` §3 already enforces at the
database-permission level for suggestion generation, extended here to
conversational tool-calling: no tool in the registry below performs a
mutating database write. Any action that *would* naturally want to write
(create a Task, draft a report, generate a Story) instead produces an
`ai.recommendation` row (§29) for a human to act on — the tool itself still
only reads and composes.

| Tool | Purpose | Backing (real today?) |
|---|---|---|
| SEARCH | Cross-entity keyword/full-text search | Postgres `tsvector` full-text search is the stated v1 direction (`DATA_ARCHITECTURE.md` §8) but not yet implemented — currently, targeted `findMany` queries only |
| RETRIEVE | Fetch a specific entity by ID, RBAC-checked | Real — every service layer (`lib/sensory/service.ts`, `lib/competitions/service.ts`, etc.) already does this |
| COMPARE | Compare two/more entities of the same type | Real for Sensory (`PanelResult` comparison); general-purpose version not built |
| CALCULATE | Derived numeric computation (e.g. panel mean) | Real for Sensory (`computePanelResult`) |
| ANALYZE | Pattern/anomaly detection | Not built — `lib/ai/service.ts`'s completeness check is the only existing analyzer, and it's rule-based, not general-purpose |
| VISUALIZE | Chart generation | Not built |
| REPORT | Compose a draft report | Not built — would produce an `ai.recommendation`, never a direct write |
| PAIR | Structured pairing reasoning | Not built (§25) |
| RECOMMEND | Suggest related product/experience | Not built as an AI tool; `AI_GOVERNANCE.md` §1 lists it as an allowed capability |
| SUMMARIZE | Condense retrieved content | Not built |
| TRANSCRIBE | Audio → text | Not built, no provider selected (`ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §I) |
| TRANSLATE | Language conversion | Not built |
| MEDIA_SEARCH | Search Asset/MediaAsset | Thin — only basic `Asset` exists, no rich search |
| PROJECT_SEARCH | Search within a Project's data | Real, ad hoc per module |
| LOT_TRACE | Walk Lot Genealogy graph | Not built — `Lot`/`LotTransformation` don't exist yet (`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F) |
| SENSORY_ANALYSIS | Query Assessment/PanelResult | Real |
| RESEARCH_EVIDENCE | Query Evidence/EvidenceClaim | Not built — Research OS doesn't exist |
| EXTERNAL_DATA | Query `external.*` | Not built (`EXTERNAL_DATA_ARCHITECTURE.md`, approved design, unimplemented) |
| CONTENT_GENERATION | Draft text (story paragraph, report section) | Not built — would always produce a `pending` `ai.recommendation`, never publish |
| TASK_CREATION | Propose a new Task | Not built — would produce a suggestion, never a direct `Task` row |

**Do not implement all of these now** (input §19's own instruction). §40
specifies which subset is MVP.

## 12. Tool Permission Architecture

Every tool call is RBAC-scoped by construction, reusing the exact mechanism
already in production — no new permission model:

```ts
// Existing, real function — lib/rbac/service.ts
can(userAccountId, action, resourceType, scopeTarget): Promise<boolean>
resolvedPermissionKeys(userAccountId, scopeTarget): Promise<Set<string>>
```

A tool call executes **as the requesting user's resolved permissions**,
never as a privileged service account with a system prompt telling it to
behave — this is `AI_GOVERNANCE.md` §5 restated as a tool-execution rule,
not a new one. Concretely:

- **Customer**: `RECOMMEND`/`SEARCH` over `classification = public` records
  only (same hard filter `SECURITY.md` §4 already requires for the Discover
  surface — the AI tool reuses the identical query path, not a parallel
  one).
- **Producer/Partner**: `PROJECT_SEARCH`/`TASK_CREATION`-shaped suggestions
  scoped to their actual `Assignment`s — identical scope containment rules
  as `RBAC.md` §3, no broadening.
- **Researcher**: `RESEARCH_EVIDENCE`/`COMPARE` scoped to Projects they hold
  `research:view` on.
- **Judge during blind evaluation**: `SENSORY_ANALYSIS` scoped to the
  session, **explicitly excluding** `blind_mapping:view` — a Judge's AI tool
  session inherits exactly the Judge's own resolved permission set, so it is
  structurally incapable of revealing sample identity, the same way the
  Judge's own screen already is (`RBAC.md` §7, confirmed unchanged by this
  document, not a new control).

## 13. Ask Néctar Architecture

Ask Néctar is the unified conversational entry point — today, **the one
piece of this entire document with zero existing implementation** (§0). Its
architecture is exactly §6's routing pipeline, terminating in a real
`AIProvider.complete()` call (§0 — interface named in `INTEGRATIONS.md` §7,
never implemented) whose system prompt is composed from: persona (§2) +
composed mode(s) (§5) + retrieved grounding context (§7-10) + the
governance ordering (§3). Building this is the single largest genuinely-new
piece of engineering this document specifies — everything else (RBAC
scoping, the suggestion lifecycle, provenance labeling) is composition of
things that already exist.

## 14. Research Mode

Strictest epistemic posture (input §29): prefer record/measurement/method/
comparison/limitation/hypothesis language over narrative. **Not yet
grounded** (§0) — no Research OS tables exist. Until they do, Research Mode
can only answer from general external knowledge (Tier A-C, §8), always
explicitly labeled as not drawn from Néctar Nómada's own experiments, since
there are currently no experiments to draw from. This is not a limitation of
this document's design; it is an honest statement of current repository
state that should not be papered over by a confident-sounding response.

## 15. Sensory Mode

The one mode with full, real grounding today. Supports professional
terminology, structured descriptors, panel comparison via the existing
`PanelResult` computation, and consumer-simplification framing when the
audience warrants it (never for the *data*, only the *language* — the
underlying `Assessment` rows are never altered for a lay audience). **Never
biases an active blind evaluation** — see §27, which is not a variant of
this mode but its own, deliberately narrower one.

## 16. Fermentation Mode

**Not yet grounded** (§0) — no `FermentationRun`/`Vessel`/`Culture` tables
exist (`DOMAIN_MODEL.md`'s Fermentation & Beverage module is design only).
Persona emphasis (curious, precise) and knowledge routing (§7's Beer +
Fermentation list) are specified now so the mode is ready the moment that
module ships, matching every prior review's "specify ahead of code" pattern
— but the grounding status must stay honestly `not_yet_grounded` until then.

## 17. Brewing Mode

Same status as §16 — no operational brewing data exists. The BJCP-adapted
`SensoryProtocol` for beer (`BEVERAGE_SENSORY_PROTOCOLS.md`, implemented)
means Brewing Mode's *sensory* half is closer to live than its *production*
half — a cupping/judging question about a beer that has actually been
assessed is `live`; a "how's my mash going" question is `not_yet_grounded`.

## 18. Coffee Mode

**Partial**, the most mature of the "applied practice" modes: `Sample` and
the CVA-adapted coffee `SensoryProtocol` (`BEVERAGE_SENSORY_PROTOCOLS.md`,
live) ground real cupping questions; processing/lot-chain questions
(`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`'s Lot Genealogy, not built)
are not grounded yet. The mode should route a processing question honestly
to "not yet tracked in Néctar Nómada's records" rather than inventing a
plausible-sounding processing timeline.

## 19. Gastronomy / Pairing Mode

Structured reasoning across the beverage/food/context dimensions the input
document lists (its §6), using the strategy vocabulary (complement,
contrast, bridge, cut, echo, amplify, temper, reset) as response-composition
guidance, not stored data. See §25 for the evidence-state model this mode
must respect — a suggested pairing is never presented with the same
confidence as a tested one.

## 20. Storytelling Mode

Narrative structure (place + person + material + transformation + question
+ observation + result + what remains unknown, input §5) applied to real
records only — **narrative may organize facts, never manufacture them**
(the input document's own sentence, kept verbatim because it is the
clearest statement of this mode's one hard rule). Today this mode can query
`Story.bodyMarkdown` (full-text, once §8/§11's SEARCH tool is real) plus
`Location`/`Project`/`Person` FKs — it cannot yet retrieve interview quotes
or media, since neither exists (§0). The technical/public rendering split
(input §5's harvest-time example) is a response-composition instruction, not
a new data requirement — both renderings draw from the same underlying
record.

## 21. Creative / Audiovisual Mode

Coverage-gap detection ("we have enough approved material for a 60-second
story" / "we're missing a producer interview") requires a real content-
relationship graph (`ContentEntityLink`, per `ADAPTIVE_INTELLIGENCE_
EXPERIENCE_REVIEW.md` §D) that does not exist yet. Until `MediaAsset` and
that join table ship, this mode can only reason over the thin `Story`/
`Asset` data that exists today — genuinely useful for "what stories exist,"
not yet for "what footage exists and is rights-cleared." The rights-check
step (§38) is a hard prerequisite before this mode may ever propose a
publishable creative brief, not an optional enhancement.

## 22. Field Mode

Fully live. Prioritizes speed, structured data, minimal prose (input §28) —
concretely, a `Task`/`FieldSubmission`-grounded briefing, generated from
open Tasks + recent submissions for the user's Assignment-scoped Projects.
**Raw field logging is never transformed into narrative prose in the
primary record** (input §11) — a `FieldSubmission.notes` value is stored
exactly as entered; Storytelling Mode may later derive a narrative *from*
it, but the derivation is a new, separately-attributed piece of content, not
an edit to the original.

## 23. Operator Mode

**Partial** — `Task`/`FieldSubmission` grounding is real; the "what
changed"/digest framing the input document describes (its §6 LAS NUBES
example, and the prior Adaptive Intelligence review's §G) depends on
`Notification`, which does not exist yet (§0). Until it does, Operator Mode
can answer "what's open right now" (a live query) but not "what's new since
your last visit" (needs a read-cursor/notification concept this document
does not invent — that's `Notification`'s job when built, not a
persona-layer workaround).

## 24. Consulting Mode

**Not yet grounded** — no `client_organization_id`/`client_person_id` FK on
`Project` yet, no `ServiceInquiry`/`Proposal` chain
(`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §O, approved design,
unimplemented). Persona emphasis (structured, assertive) and the
"recommendations must be traceable to supporting information" rule (input
§32) are specified now for the same reason as §16-17 — ready when the
module ships, honestly inert until then.

## 25. Commerce Mode

Fully live. Low-friction discover/compare/choose/purchase help over real
`Product`/`ProductVariant`/`Order` data — deliberately not marketing
language dressed as an answer (input §33's own caution).

**Pairing evidence states** (input §7, formalized here since Gastronomy/
Commerce both touch it):

```
SUGGESTED_PAIRING → TESTED_PAIRING → PANEL_EVALUATED_PAIRING →
PANEL_PREFERRED_PAIRING → APPROVED_MENU_PAIRING
```

None of these states have backing tables yet (`PairingHypothesis` →
`PairingTrial` → `SensoryEvaluation` → `Result` → `ApprovedPairing`, input
§7's own proposed chain) — every pairing suggestion today is necessarily
`SUGGESTED_PAIRING`, and must say so explicitly rather than implying it was
tested. Building the full chain is a Sensory-OS-adjacent NEXT/ADVANCED item
(§41), reusing `SensorySession`/`Assessment` the same way Competitions
reuses them (`DECISIONS.md` ADR-034's precedent), not a parallel scoring
system.

## 26. Tourism Mode

**Partial** — `Experience`/`ExperienceSession` ground real availability
questions; the rich place/people/weather/history composition the input
document describes (its §34) needs `Story` content depth and (for weather)
`EXTERNAL_DATA_ARCHITECTURE.md`'s unimplemented `environmental.observation`
integration — both real but thin today.

## 27. Competition / Blind Evaluation Mode

**Deliberately not a variant of Sensory Mode — its own, narrower one**,
because persona suppression here is not optional styling, it is a security
requirement. During active blind judging:

- No producer, origin, process, project story, prior score, or AI sensory
  *prediction* is ever surfaced — the tool layer's RBAC scoping (§12)
  already makes this structurally true (no `blind_mapping:view`), this
  section states the persona-layer requirement on top: even where a tool
  technically could return non-identity metadata, the response stays
  minimal ("Sample 204 recorded. 2 attributes remain unanswered.") rather
  than elaborated.
- This is the concrete, tested instance of `RBAC.md` §7's blind-evaluation
  restriction extended to an AI assistant, not a new mechanism — verified
  this session that the underlying restriction holds even after the
  Assessment race-condition fix (`DECISIONS.md` ADR-032), so the security
  boundary this mode depends on is not just designed but actively tested.

## 28. Provenance / Citation Behavior

Every response distinguishes, per the input document's §22 taxonomy, mapped
onto columns/mechanisms that already exist or are specified elsewhere in
this document:

| Provenance category | Backing |
|---|---|
| Internal recorded fact | `provenance_class = measured_fact` etc. (`DATA_ARCHITECTURE.md` §4) |
| Internal approved conclusion | Future `Conclusion` row (Research OS) or `PanelResult` |
| External standard | `knowledge.source`, `authority_tier = A` (§8) |
| Primary literature | `knowledge.source`, tier B |
| Professional reference | `knowledge.source`, tier C |
| Community experience | `knowledge.source`, tier D/E, rendered per §10's template |
| AI interpretation | Explicitly labeled, never presented as any of the above |

Casual/consumer-facing responses do not surface citation clutter by default;
technical/research users can drill down (input §22) — a UI/rendering
decision, not an architecture one, deferred to implementation.

## 29. AI Suggestion Lifecycle

**Already fully built and live** (§0) — no design work needed here, only
confirmation that everything this document adds (Ask Néctar's write-shaped
outputs — a drafted Task, a drafted report section, a proposed entity link)
flows through the existing `ai.recommendation` table and `/ai` review
surface, extending its `suggestionType` taxonomy rather than building a
parallel table, exactly as both prior reviews already concluded
(`ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §E, `COMMERCE_OPERATIONS_
TOOLS_ARCHITECTURE.md` §T/§U). New `suggestionType` values this document
implies when its tools are built: `entity_link`, `quote_candidate`,
`editorial_opportunity`, `operator_signal`, `pairing_suggestion`,
`consulting_recommendation` — all additive rows on the existing table, zero
schema change to add a new mode's suggestion type.

## 30. Feedback / Learning

Structured `accept | modify | reject` with a reason taxonomy (input §41:
incorrect, unsupported, irrelevant, too generic, too technical, too
simplified, wrong tone, missing source, better alternative) — maps directly
onto `ai.recommendation.status` (`accepted|rejected|modified`, already
built) plus a new, optional `decision_reason` free-text/enum field (a
one-column, additive migration when this is actually built, not now).
**Historical user decisions do not automatically become scientific truth**
(input §40's own caution) — feedback informs future suggestion *quality*
(a NEXT-phase learning-loop concern), never retroactively upgrades a past
`interpretation`/`hypothesis` row's `provenance_class`.

## 31. Integration With AI_GOVERNANCE

Direct extension, no new mechanism: §3's ordering **is**
`AI_GOVERNANCE.md`'s "AI is never authoritative" principle applied one layer
up from database writes to conversational responses; §12's tool permissions
**are** §5's RBAC-scoped retrieval; §29 **is** §4's suggestion lifecycle.
This document adds nothing `AI_GOVERNANCE.md` didn't already require — it
specifies how that requirement is satisfied for a conversational assistant
specifically, which didn't exist when `AI_GOVERNANCE.md` was written.

## 32. Integration With Research OS

Research OS does not exist (§0). This document's Research Mode (§14)
specifies persona/routing ahead of the module, matching `EXTERNAL_DATA_
ARCHITECTURE.md` §17's and `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`
§J's identical stance: an AI-surfaced pattern or external-data correlation
becomes part of an `EvidenceClaim` **only** through the human-mediated
Research OS evidence workflow, once built — never automatically from a
retrieval result, no matter how confident the model sounds.

## 33. Integration With Sensory OS

The one module ready for real integration today. Sensory Mode (§15) and
Competition Mode (§27) query `SensorySession`/`Assessment`/`PanelResult`/
`ReferenceStandard` directly through the existing service layer
(`lib/sensory/service.ts`, `lib/sensory/calibration.ts`) — this document
adds no new Sensory table, only the AI-facing read tools (§11) that call
into what already exists.

## 34. Integration With Content Intelligence

Directly the Adaptive Intelligence review's §E conclusion, unchanged: all
"intelligences" (Content, Creative, Operator, Research, Sensory) share one
mechanism (trigger → RBAC-scoped retrieval → `ai.recommendation` →
human review → action → audit); this document's professional modes (§4) are
the **trigger/vocabulary layer** on top of that shared mechanism, not a
sixth parallel system. Storytelling/Creative modes (§20-21) are thin today
because the content model they'd query (`MediaAsset`/`StoryBlock`) is thin
today — the mechanism is ready; the substrate isn't.

## 35. Integration With External Data

`EXTERNAL_DATA_ARCHITECTURE.md` §20 already specifies how AI must cite
external data (`external_source_class`, resolution disclosure) — this
document's §28 extends that exact citation discipline to `knowledge.*`
sources (§8), using the same structured-citation-object shape, not a
second one. Tourism Mode's weather-context questions (§26) will draw on
`environmental.observation` once `EXTERNAL_DATA_ARCHITECTURE.md`'s P0
providers (Open-Meteo, NASA POWER) are actually implemented — not before.

## 36. Integration With Commerce / Operations

Commerce Mode (§25) is fully live over real `Product`/`Order` data.
`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`'s AI Operator Copilot (its §U)
and this document's Operator Mode (§23) are the same mechanism applied to
the same eventual data (`Lot`/`Alert`, once built) — this document does not
duplicate that design, it inherits it.

## 37. Security & RBAC

No new permission model. `ai:review_suggestion` (existing) continues to gate
the suggestion-review surface; Ask Néctar's tool calls (§12) require no new
permission *type* — they execute under the resolved permissions the calling
user already has, via the same `can()`/`resolvedPermissionKeys()` functions
already in production. **One new permission is worth flagging for when Ask
Néctar is actually built**: `ai:converse` (or similar) — a platform-scoped
permission gating who may use the conversational assistant at all, distinct
from `ai:review_suggestion` (who may review its written outputs) — not
required for MVP if the initial rollout is Platform Admin/Content-Ops only,
but worth deciding explicitly rather than defaulting silently to "every
authenticated user" (§43 decision).

**Testing requirement** (`SECURITY.md` §12, `RBAC.md` §9's existing
mandate, extended): every mode's tool-permission mapping needs a positive
case (the mode's allowed tools succeed within scope) and a negative case
(a Judge's session cannot reach `blind_mapping:view`-gated data via any
tool, even indirectly) — the same discipline already required for every
Role Profile, applied to modes.

## 38. Copyright / Licensing

Never ingest or reproduce copyrighted material without a permitted
retrieval path (input §16) — `knowledge.source.retrieval_allowed`/
`citation_allowed` (§8) are hard gates, not documentation notes, mirroring
`EXTERNAL_DATA_ARCHITECTURE.md` §24's identical enforcement pattern for
external datasets. SCA/BJCP/WSET/Cicerone material specifically: registered
as sources (§8's matrix) with citation permitted, full-text retrieval not
assumed permitted without explicit confirmation — the same posture
`BEVERAGE_SENSORY_PROTOCOLS.md` §1 already takes for protocol *design*
("adapt-original... never claim to be an official form unless actually
licensed"), extended here to AI *retrieval* of the same bodies' material.

## 39. Performance / Cost Considerations

Deferred to implementation (input §9's own framing) — model selection,
prompting strategy, and cost/latency trade-offs are the AI vertical slice's
own design notes, not this document's concern (`AI_GOVERNANCE.md` §9 states
this boundary explicitly already; restated here for this document
specifically). One architecture-level constraint worth stating now:
provider independence (`INTEGRATIONS.md` §7, `CLAUDE.md` §42) means cost/
performance tuning is a configuration change to the `AIProvider` adapter,
never a rewrite of §2-13's routing/mode/tool logic.

## 40. Recommended MVP

Smallest useful architecture, evaluated against §0's actual grounding
inventory rather than the input document's own generic MVP shape:

```
Ask Néctar (new: first real AIProvider implementation + intent router)
  +
Intent Router (new, §6)
  +
Five grounded modes: FIELD, OPERATOR (partial), SENSORY, COMPETITION,
  COMMERCE — plus a general DISCOVER mode over public Story/Product/
  Experience (not in the input document's own list, added here because
  it's the only mode with zero dependency risk: it's exactly Discover's
  existing public, unauthenticated read path)
  +
Internal Retrieval only (RETRIEVE, SEARCH, SENSORY_ANALYSIS tools — §11)
  +
Source Hierarchy for Coffee/Beer/Sensory only (§7-8, registration only,
  no ingestion)
  +
Read-only tools (§11's already-real subset)
  +
Provenance labeling (§28)
  +
AI Suggestion lifecycle (§29 — already built, zero new work)
```

Explicitly **not** MVP: Research, Fermentation, Brewing, Consulting modes
(no grounding data exists — building their persona/routing now would be
real work spent on modes that cannot yet say anything true about Néctar
Nómada specifically); embeddings/semantic search (§8's `knowledge.document`
retrieval, `pgvector`); Storytelling/Creative modes beyond a thin `Story`
full-text search; any tool from §11 marked "not built."

## 41. Implementation Phases

**FOUNDATIONAL** (prerequisite to Ask Néctar existing at all):
- First `AIProvider` implementation (real model SDK, behind the existing
  named interface).
- Intent router (§6), mode registry (§4, code-level).
- `RETRIEVE`/`SEARCH`/`SENSORY_ANALYSIS` tools, RBAC-scoped (§11-12).
- `knowledge.source` registration table (§8) — registration only.

**MVP** (§40's scope, makes Ask Néctar actually useful for one real
workflow):
- FIELD, OPERATOR, SENSORY, COMPETITION, COMMERCE, DISCOVER modes live.
- Provenance labeling (§28) in every response.
- `ai:converse` permission decision (§37) resolved.

**NEXT:**
- `Notification` table ships → OPERATOR mode's digest framing becomes real.
- Research OS ships → RESEARCH mode becomes real.
- `MediaAsset`/`StoryBlock`/`Interview` ship → STORYTELLING/CREATIVE modes
  mature.
- `pgvector` embeddings + semantic search over `knowledge.document`.
- `PairingHypothesis`→`ApprovedPairing` chain (§25) — reuses Sensory, not a
  parallel system.
- Feedback loop (§30) informing suggestion quality.

**ADVANCED:**
- `Lot`/`LotTransformation` ship → COFFEE mode's processing half matures,
  `LOT_TRACE` tool becomes real.
- `ServiceInquiry`/`Proposal`/client FKs ship → CONSULTING mode becomes
  real.
- Multi-source knowledge synthesis across all registered Tier A-E sources.
- Full rights/consent-gated CREATIVE mode content generation.

**EXPERIMENTAL** (per input §49, agreed without modification): fully
autonomous agents, predictive sensory modeling, automated recipe
optimization, complex multimodal generation, voice agents, large-scale
forum ingestion.

## 42. Risks

- **Confident voice masking thin grounding** — the single largest risk
  specific to this document, given §0's finding that most modes are not yet
  grounded. Mitigated structurally by `groundingStatus` (§4) gating what the
  router is allowed to claim, not just a style guideline.
- **AI hallucination generally** — mitigated the same way `ADAPTIVE_
  INTELLIGENCE_EXPERIENCE_REVIEW.md` §P already states: the AI role cannot
  write to any domain table directly, only `ai.recommendation`, so a
  hallucinated claim is a rejected suggestion, never a corrupted record.
- **Persona bleeding into blind evaluation** — mitigated by §27 being a
  structurally separate, narrower mode rather than a Sensory-Mode variant
  a prompt-engineering mistake could accidentally widen.
- **Duplicated infrastructure** — the risk of building a second knowledge/
  suggestion/personalization system instead of extending
  `ai.recommendation`/RBAC — mitigated by §29/§31's explicit reuse
  decisions, consistent with all three prior reviews.
- **Licensing exposure** — SCA/BJCP/WSET/Cicerone material specifically;
  mitigated by §38's hard retrieval/citation gates, not a documentation
  promise.
- **Maintenance burden** — the largest practical risk for a solo-maintained
  project (`PLATFORM_OVERVIEW.md` §9), directly proportional to how many
  `not_yet_grounded` modes get built out before their underlying module
  ships. §40's MVP scope is the concrete mitigation.

## 43. Decisions Requiring Product-Owner Approval

1. **Modes live in code, not the database** (§4) — confirm, since Role
   Profiles are DB data and this document deliberately treats modes
   differently; flag if you want modes to be admin-editable at runtime for
   a reason this document wouldn't know.
2. **`knowledge.*` as a new schema, structurally parallel to but distinct
   from `external.*`** (§8) — confirm this two-schema split rather than
   folding textual knowledge sources into the existing `external.*` design.
3. **MVP mode set: FIELD, OPERATOR, SENSORY, COMPETITION, COMMERCE,
   DISCOVER** (§40), explicitly deferring Research/Fermentation/Brewing/
   Consulting until their underlying modules exist — confirm, or specify
   which `not_yet_grounded` mode you want persona/routing work done on
   anyway, ahead of its module, for a business reason this review wouldn't
   know.
4. **A new `ai:converse` permission, not yet built, gating who may use Ask
   Néctar at all** (§37) — confirm this is wanted before Foundational-phase
   work starts, and who should hold it initially (Platform Admin only?
   Content/Ops Coordinator too? every authenticated customer?).
5. **No bulk knowledge ingestion; source registration only until retrieval/
   citation rights are individually confirmed** (§8, §38) — confirm this
   conservative posture, especially for BJCP/SCA/Cicerone material given
   their proprietary status already flagged in `BEVERAGE_SENSORY_
   PROTOCOLS.md` §1.
6. **First real `AIProvider` implementation and model choice** — this
   document deliberately defers vendor selection (§39, matching
   `AI_GOVERNANCE.md` §9's own boundary) — confirm Anthropic Claude remains
   the default per `PLATFORM_OVERVIEW.md` §8, or specify otherwise.
7. **Feedback taxonomy and `decision_reason` column** (§30) — confirm this
   is worth adding to `ai.recommendation` at Foundational-phase time versus
   deferring to NEXT phase once real usage volume exists to learn from.

---

*Architecture and behavioral design only. No model SDK installed, no
embeddings created, no RAG pipeline built, no tool executed, no permission
modified, no external knowledge source ingested, no AI agent created, no
production prompt modified, no migration created, per the constraint given
with this task.*
