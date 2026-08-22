# Brand, Marketing, Community & Sales Architecture

**Planning document. Architecture and behavioural design only — no code, no
migrations, no credentials, no live accounts** (input §97). Produced from
`NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT_CORRECTED.md` per ticket
`09_ADD_BRAND_MARKETING_PROMPT.md`, whose deliverable had never been written.

---

## 0. Which input this was written from, and a filing problem

**Written from `..._INPUT_CORRECTED.md`.** Ticket `09_` says to use the
corrected version and place it *at* the plain `..._INPUT.md` filename. That did
not happen — both files are in `docs/architecture/`, and the one at the plain
name is the **uncorrected original**.

Verified by reference check: `..._INPUT.md` cites
`MASTER_IMPLEMENTATION_ROADMAP.md` and `PLATFORM_ARCHITECTURE_RECONCILIATION.md`,
neither of which exists — two of the invented references `09_` warned about, and
the same two `20_CAPTURE_OR_LOSE_IT_REPORT.md` independently found missing. The
corrected version's only unresolved references are this document (correctly
absent until now) and `CLAUDE.md` (which is at the repository root, not in
`docs/architecture/`).

**Consequence:** anyone following `09_`'s own hand-off text — *"I've added
docs/architecture/NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT.md …
follow its own instructions exactly"* — reads the wrong document. Resolving
which file is authoritative is a product-owner action, listed in §50.

---

## 1. Executive summary

Marketing here is not a channel bolted onto a platform. The platform already
holds what most marketing organisations lack: real projects, real places, real
people, real harvests, real sensory results, and the provenance chain that says
which of those are true. The architecture's whole job is to let campaigns
*originate from that*, and to carry the evidence forward rather than restating
it as copy.

Three boundaries carry most of the weight:

1. **Publer distributes; Néctar Nómada understands.** Strategy, approval,
   evidence and attribution stay canonical here. Scheduling and network
   mechanics go out to the provider.
2. **Content generation already exists** and belongs to the AI Suggestion
   lifecycle. Marketing must not build a second one. (§13, conflict check §51.)
3. **Community is a different provider boundary from publishing**, because the
   input's own §31 is right that a unified inbox is not confirmed.

The largest risk is not technical. It is that a marketing module becomes the
place where the platform starts asserting things it cannot evidence — and this
codebase's entire discipline is built against exactly that.

---

## 2. Repository current state

Verified against `prisma/schema.prisma`, not assumed.

**None of the thirteen entities in input §94 exist**: `Brand`, `Campaign`,
`CampaignObjective`, `AudienceSegment`, `MarketingOpportunity`, `CreativeBrief`,
`ContentPiece`, `ContentVariant`, `SocialPublication`, `TrackedLink`,
`CampaignTouch`, `CommunityInteraction`, `MarketingInsight`. This is greenfield.

**Everything they would attach to does exist**: `Story`, `Asset`, `Product`,
`ProductVariant`, `Experience`, `Booking`, `Order`, `Recommendation`, `Person`,
`Organization`, `Project`, `AuditEvent`.

Four facts about that existing state change the design:

- **`Story` is built but flat.** `DOMAIN_MODEL.md` §4 records it as *"a single
  flat model, not the content-type family"* with *"no type discriminator"*.
  Adding `ContentPiece` risks a third content concept beside `Story` and
  `Asset`.
- **AI content generation is already specified and governed.**
  `MEDIA_INTELLIGENCE_PIPELINE.md` §3 (Phase B) is explicitly *"a
  `suggestion_type` family within the existing AI Suggestion lifecycle
  (`AI_GOVERNANCE.md` §4) — not a new governance model"*, and already names
  marketing copy drafts and social crops among its outputs.
- **`Notification` does not exist.** Confirmed: no model. ADR-060 already
  counted four consumers waiting on it; marketing and community signalling make
  **six**.
- **No `Discount`/`Promotion`/`Coupon` model exists**, so campaign-linked
  offers have nothing to hook into yet.

---

## 3. Architecture principles

1. **Marketing originates from real activity** (input §2). A campaign points at
   Projects, Products, Experiences, Assets and — where a claim is scientific —
   at the evidence that supports it.
2. **Canonical strategy never lives in the provider.** Input §80. Publer history
   is not a strategy record and cannot be reconstructed into one.
3. **Nothing is published that a human did not approve.** Consistent with
   `AI_GOVERNANCE.md` §2, which already forbids AI publishing unsupported
   claims.
4. **Marketing inherits governance; it does not define its own.** AI rules,
   rights, RBAC and provenance all come from existing documents (input §95).
5. **Reuse before creating.** Every proposed entity is justified against what
   exists or is not created (§14).

---

## 4. Brand System

`Brand` is canonical and small: name, positioning, voice attributes, visual
tokens (colour, type, logo lockups as `Asset` references), and the claim
vocabulary it is permitted to use.

Brand assets are `Asset` rows, not a parallel store. `Asset` already carries
checksum, MIME type, usage rights, provenance class and derivative lineage —
which is precisely what a brand asset needs and more than most DAMs record.

---

## 5. Brand Voice / AI Persona relationship

Input §5 separates these, correctly. **Brand Voice is how Néctar Nómada sounds
in published output. AI Persona is how the assistant behaves in conversation.**
They are related but not the same object, and collapsing them would make every
persona tweak a brand change.

`AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` owns persona. Brand Voice
constrains *generated content* — a Phase B suggestion is checked against brand
voice before a human sees it, not after they publish it.

---

## 6. Brand hierarchy

Néctar Nómada is the parent; projects such as CryoBloom, Las Nubes and client
engagements sit beneath it (input §4). Hierarchy attaches to existing
`Organization` and `Project` rather than duplicating them — `Brand` references
them, and a project-level brand inherits parent tokens unless it overrides them.

---

## 7. Marketing objectives

Objectives are typed and measurable — awareness, consideration, bookings,
sales, community growth, recruitment — and every `Campaign` carries at least
one. An objective without a measurable outcome is a slogan, and the campaign
scorecard (§34) cannot score it.

---

## 8. Marketing Opportunity Engine

The differentiated part, and the reason this is not generic agency software.

Real activity produces candidate opportunities: a harvest completed, a sensory
result released, an experience with unsold capacity, a research milestone, a
project with enough approved media to tell a story. Each is a **suggestion**,
never an action.

Opportunities enter as `ai.recommendation` rows in the existing lifecycle
(`AI_GOVERNANCE.md` §4) rather than a bespoke queue — the review, accept/reject
and audit machinery already exists and is already governed.

---

## 9. Campaign model

`Campaign` — objective, audience, window, budget reference, owning
project/organization, status. Campaigns reference offerings (`Product`,
`Experience`, `Event`) rather than restating them.

---

## 10. Audience / segmentation model

`AudienceSegment` is a **declared** definition, not an inferred profile.
`CLAUDE.md` §15 is explicit that behavioural inference must not become personal
factual information, and §70/privacy in the input agrees. Segments describe
criteria; they do not assert facts about individuals.

---

## 11. Creative Brief model

`CreativeBrief` connects a campaign to what should be made: message, evidence
references, required assets, constraints, claim boundaries. It is the artifact
that carries *which evidence supports this* into the creative process, and is
where a scientific claim gets bound to its source (§34 of the input, and §16
below).

---

## 12. Content Piece / Variant / Publication model

Input §13's three-level split is right and is standard for a reason: the master
idea, its channel adaptations, and the specific act of publishing one.

```
ContentPiece   → the idea, evidence-bound
ContentVariant → per-channel execution
SocialPublication → account + time + state
```

**Channel adaptation must not introduce unsupported facts** (input §13). A
variant may shorten, reorder or restyle; it may not add a claim the piece did
not carry.

**Relationship to `Story`, which is built.** A `Story` is editorial/documentary
and is a first-class platform object. A `ContentPiece` is a marketing artifact.
They overlap where a story is promoted. Recommendation: **`ContentPiece`
references `Story` rather than copying it**, and a story-derived campaign piece
carries the story's own evidence links. Creating marketing copies of stories
would produce two divergent narratives about the same project.

---

## 13. Content approval workflow

Draft → internal review → brand check → claim check → approved → scheduled →
published. Approval is attributable and audited.

**Claim check is not a formality.** Where a piece asserts a sensory,
agricultural or scientific result, approval requires the evidence reference to
resolve — the same discipline `AI_GOVERNANCE.md` §2 applies to AI output,
applied to human output too.

---

## 14. Rights / consent

`Asset` already carries `usageRights`. UGC and testimonials (input §45–46) need
explicit consent records naming who consented, to what use, and when —
revocable, with revocation propagating to a review queue rather than silently
unpublishing.

**Dependency:** this leans on classification actually gating reads. It does not
today — see §48.

---

## 15. Social publishing architecture

One adapter interface, provider behind it (`CLAUDE.md` §44). The platform holds
`SocialAccount` (network, handle, workspace mapping) and `SocialPublication`
(what, where, when, state). Publer holds scheduling and network mechanics.

---

## 16. Publer adapter

Behind `SocialPublishingProvider`. No provider types leak into domain code —
the same boundary `lib/integrations/storage/types.ts` already demonstrates for
R2, whose own comment notes the adapter exists so a vendor change is *"a
credentials/endpoint change in the adapter file, not a rewrite."*

---

## 17. Publer capability assessment

**I could not verify Publer's API.** This document has no access to
`publer.com/docs`, and input §93 requires marking anything not confirmed in
current official documentation as `UNCONFIRMED — DO NOT IMPLEMENT` rather than
inferring. The column below therefore records **whether the input document
cites a specific documentation URL** — which is a weaker claim than
verification, and is labelled as such.

Every row must be re-checked against live documentation at implementation time
(input §15's own first line).

| Publer capability | Cited in input? | Néctar use case | Canonical data impact | Sync | Fallback | Priority |
|---|---|---|---|---|---|---|
| Workspaces | prose only, no URL | map brand/project → workspace | `SocialAccount.workspaceRef` | read | manual mapping | MVP |
| Accounts | **yes** — `/api-reference/accounts` | which handles exist | `SocialAccount` | read | manual entry | MVP |
| Media | **yes** — `/api-reference/media` | upload approved asset | none (Asset is canonical) | write | none | MVP |
| Create post | **yes** — `/posting/create-posts` | publish approved variant | `SocialPublication` | write | manual publish | MVP |
| Draft | not cited | stage before approval | — | — | approve here first | **UNCONFIRMED — DO NOT IMPLEMENT** |
| Schedule | not separately cited | timed publication | `SocialPublication.scheduledAt` | write | publish-now only | verify first |
| Publish | via create-posts | — | — | write | — | MVP |
| Posts listing | **yes** — `/api-reference/posts` | reconcile state | `SocialPublication.state` | read | manual reconcile | MVP |
| Post insights | **yes** — `/analytics/post-insights` | per-post metrics | `MarketingInsight` | read | none | NEXT |
| Analytics charts | **yes** — `/analytics/charts` | aggregate views | — (do not store charts) | read | own aggregation | NEXT |
| Competitor analysis | **yes** — `/analytics/competitor-analysis` | benchmarking | — | read | none | LATER |
| Comments | not cited | community ingestion | `CommunityInteraction` | — | — | **UNCONFIRMED — DO NOT IMPLEMENT** |
| AI comment replies | not cited (input §79 bounds it) | — | — | — | draft here instead | **UNCONFIRMED — DO NOT IMPLEMENT** |
| Unified inbox / DMs | not cited; input §31 warns explicitly | — | — | — | platform-native later | **UNCONFIRMED — DO NOT IMPLEMENT** |
| Webhooks / status callbacks | not cited | publication state | `SocialPublication.state` | push | **polling** | verify; assume polling |
| Channel capability rules | **yes** — `/posting/create-posts/networks` | validate variant per network | variant validation | read | conservative subset | MVP |

**The consequence is structural, not cosmetic.** Four of the community
capabilities are unconfirmed, which is why community cannot be assumed to ride
on the publishing provider (§20).

---

## 18. Publer data mapping

| Néctar | Publer | Direction |
|---|---|---|
| `SocialAccount` | account | read, mapped once |
| `ContentVariant` (approved) | post payload | write |
| `Asset` (approved derivative) | media | write |
| `SocialPublication.state` | post status | read |
| `MarketingInsight` | post insights | read |

Canonical strategy — brief, evidence, approval, objective — maps to **nothing**
in Publer, by design (input §80).

---

## 19. Social account / workspace mapping

One Publer workspace per brand or major project, mapped explicitly rather than
inferred from names. `SocialAccount` records the mapping so a workspace
reorganisation is a data change, not a code change.

---

## 20. Publication state machine

```
draft → pending_approval → approved → scheduled → publishing
      → published | failed | cancelled
```

`failed` is terminal-with-retry, not silently retried: a failed publication
that quietly succeeds later publishes something nobody re-approved.

**Reconciliation is by polling** until webhooks are confirmed (§17).

---

## 21. Media handoff

Approved `Asset` derivative → Publer media → publication. The original `Asset`
is never sent or altered; `MEDIA_INTELLIGENCE_PIPELINE.md` §1's non-destructive
principle applies, and any crop or treatment is a new derivative with its own
provenance.

---

## 22. Community management architecture

`CommunityInteraction` — an inbound message, comment or mention, its network,
its subject, its state, and any reply. Interactions link to the
`SocialPublication` they arrived on where known.

---

## 23. Community provider boundary

**Separate from publishing** (input §31), because unified inbox, DMs and
comment ingestion are unconfirmed. `CommunityProvider` is its own interface with
no implementation committed. **No scraping** — the input says so and it is also
the only position compatible with network terms of service.

---

## 24. AI community response

Drafts only, into the existing suggestion lifecycle. A drafted reply is an
`ai.recommendation` a human accepts, edits or rejects. **No autonomous replies**
(input §97, and `CLAUDE.md` §32's human-in-the-loop requirement).

---

## 25. Moderation / risk classes

Interactions carry a risk class — routine, sensitive, scientific-claim,
complaint, legal/press. **Scientific-claim interactions never receive an AI
draft**, because the platform's own rule is that AI is not authoritative on
research (`CLAUDE.md` §32, `AI_GOVERNANCE.md` §2). They route to a human with
the relevant evidence attached.

---

## 26. Community learning

Approved replies become reusable answers — a knowledge base grown from real
resolved questions rather than authored in advance. Reuse is suggestion, not
auto-reply.

---

## 27. CRM / lead integration

The input (§58) bounds CRM deliberately. Recommendation: **no CRM entity yet.**
`Person` and `Organization` already exist and already carry relationships. A
lead is a state on an existing party plus a `CampaignTouch`, not a parallel
contact database.

---

## 28. Commerce / sales integration

`Order` and `Payment` exist. Attribution links a conversion to a
`CampaignTouch`; it does not modify commerce. **No checkout changes** (§97).
Campaign-linked discounts have nothing to attach to — no `Discount` model
exists — so offer mechanics are deferred, not designed around.

---

## 29. Experience / booking integration

`Experience`, `ExperienceSession` and `Booking` exist. Promoting an experience
with unsold capacity is one of the strongest opportunity signals available
(§8), because the platform already knows the capacity.

---

## 30. Consulting lead integration

Consulting is a deferred persona mode (ADR-037 defers `CONSULTING` until its
module exists). Consulting leads are therefore `CampaignTouch` + `Person` today,
with no dedicated pipeline.

---

## 31. UTM / attribution architecture

`TrackedLink` — campaign, variant, destination, UTM parameters, canonical short
form. Generated by the platform so the taxonomy is consistent, rather than
hand-built per post and inconsistent by the third campaign.

---

## 32. First-party analytics

`CampaignTouch` records an arrival: link, timestamp, landing surface, and — only
where the visitor is authenticated or has consented — the party. This is the
attribution spine, and it is first-party by construction.

**Privacy:** no cross-site tracking, no third-party pixels in this design.
`CLAUDE.md` §15's separation of declared from inferred preference applies.

---

## 33. Social analytics

Pulled from the provider, stored as `MarketingInsight` snapshots with the
retrieval timestamp and source. Provider metrics are **observations with
provenance**, not platform truth — they change retroactively and must not be
mistaken for measured facts.

---

## 34. Campaign reporting

The scorecard joins: objective → publications → provider metrics → tracked
links → touches → conversions. It is the one place where "did this work" is
answerable, and it works only because attribution is first-party.

---

## 35. Competitor analytics

Provider-supplied, LATER, read-only, and never re-published as a claim.

---

## 36. Marketing intelligence

The loop: activity → opportunity → campaign → publication → performance →
learning. Learning feeds future opportunity detection as suggestions. Nothing in
the loop closes autonomously.

---

## 37. Creative intelligence

**This is Phase B, not a new pipeline.** See the conflict check in §51.
Marketing contributes brand voice and claim constraints as inputs to Phase B's
existing suggestion generation; it does not build a second generator.

---

## 38. Ask Néctar marketing mode

A new mode in the existing table (`AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md`),
with the same columns every other mode has: persona, knowledge scope, tools,
citation strictness, risk, status.

**It enters as `not_yet_grounded`**, per ADR-037 decision 3's own rule that
modes stay ungrounded until their module exists and the intent router declines
to route to them with fabricated confidence. See the conflict check in §52.

---

## 39. Privacy

Declared over inferred (`CLAUDE.md` §15). No profile is asserted from
behaviour. Consent is recorded, revocable, and revocation is actioned.
Community interactions frequently contain personal information and inherit
classification accordingly.

---

## 40. Security

Provider credentials are secrets, held as the platform already holds R2 and
Neon credentials — environment, never in the database, never in the repository.
Marketing adds no new secret-handling pattern.

RBAC: new verbs (`campaign:manage`, `content:approve`, `publication:publish`,
`community:respond`), no new machinery. `content:approve` and
`publication:publish` are deliberately distinct — approving a message and
pushing it to the public are different acts, and the second is the irreversible
one.

---

## 41. Audit / observability

Every approval, publication and community reply writes an `AuditEvent` — actor,
operation, entity, timestamp. `AuditEvent` exists and is already used this way
elsewhere. Publication failures are observable, not silent.

---

## 42. Vendor lock-in strategy

The adapter is the strategy. Canonical strategy, content, approval, evidence and
attribution never leave the platform, so switching provider costs the adapter
and the account mapping — not the marketing history. This is the same posture
ADR-055 took for the database and ADR-003/ADR-007 for storage.

---

## 43. Cost considerations

Provider subscription, media egress, and AI generation cost. AI generation is
the one that scales with enthusiasm rather than with need — the suggestion
lifecycle's human review is also the natural cost control.

---

## 44. What not to build

Input §88, adopted verbatim in intent: no social network clone, generic agency
software, generic CRM, generic help desk, generic DAM, ad-buying engine,
unrestricted social listening, autonomous publisher, influencer marketplace,
sentiment-scoring engine, or virality predictor.

To which this document adds: **no second content-generation pipeline** (§51),
**no parallel AI behaviour model** (§52), and **no marketing-owned copy of
`Story`** (§12).

---

## 45. MVP recommendation

`Brand`, `Campaign`, `CreativeBrief`, `ContentPiece`, `ContentVariant`,
`SocialAccount`, `SocialPublication`, `TrackedLink`, `CampaignTouch`. Approval
workflow. Publer adapter for accounts, media, create-post, posts listing.
First-party attribution through to `Order`/`Booking`.

Deliberately excluded from MVP: opportunity detection, community, analytics
ingestion, competitor analysis, AI drafting.

---

## 46. First vertical slice

Input §89's slice, endorsed: **Product/Experience campaign → Publer →
attribution.** It touches brand, campaign, brief, content, approval, adapter,
publication state and conversion — which is the whole spine — and it ends at a
number someone actually cares about.

Recommended concretely: one real experience with unsold capacity, because the
platform already knows the capacity and the conversion is unambiguous.

---

## 47. Phase roadmap

Adopts input §96. **FOUNDATION** canonical brand/campaign/content/attribution ·
**MVP** the slice above · **NEXT** opportunity detection, social analytics,
reporting · **ADVANCED** community intelligence, CRM routing, reusable answers ·
**LATER** personalisation, experimentation · **EXPERIMENTAL** autonomous
optimisation and replies — which `CLAUDE.md` §32 currently forbids and which
would need that decision revisited first.

---

## 48. Risks

1. **Marketing becomes where the platform starts asserting the unevidenced.**
   The whole codebase is built against this. Mitigation: claim check at
   approval, evidence references on briefs, no AI claim generation.
2. **A parallel content system emerges** beside `Story` and Phase B. §51.
3. **Unconfirmed Publer capabilities get built anyway** because the UI shows
   them. §17 marks them; the discipline has to hold at implementation.
4. **Rights and consent depend on a classification gate that is not enforced**
   (ADR-059). Community and UGC handle personal data; this needs resolving
   before community ships, not after.
5. **`Notification` blocks the useful half.** Six consumers now wait on it.
6. **Scope.** Every architecture review in this set names it; this domain has
   the most commercially available adjacent software to be tempted by.

---

## 49. Open decisions

- Whether `ContentPiece` and `Story` converge into the content-type family
  `DOMAIN_MODEL.md` §4 originally specified, or stay separate with references.
- Whether opportunity detection is worth building before one campaign has run
  manually.
- Polling interval for publication reconciliation, pending webhook confirmation.

---

## 50. Product-owner decisions required

1. **Which brand/marketing input file is authoritative** (§0). The corrected
   version should replace the original at the plain filename, and the original
   should be deleted rather than left to be read by mistake.
2. **Does `ContentPiece` reference `Story`, or replace it?** Recommended:
   reference. Replacing means migrating a built model with real rows.
3. **Publer re-verification before any implementation.** Everything in §17 is
   the input document's citation, not a verification.
4. **Community provider**: Publer if officially supported at the time,
   platform-native APIs otherwise, or defer community entirely. Recommended:
   defer until publishing has run.
5. **Consent revocation behaviour** — review queue versus automatic unpublish.
   Recommended: queue, because automatic unpublishing is itself an unreviewed
   public action.
6. **Classification enforcement** (ADR-059's open defect) must be settled before
   community handles personal data.

---

## 51. Conflict check — content model vs Phase B and the Story engine

**Required by input §98 item 10. There is a real overlap, and it must be
reconciled rather than built around.**

`MEDIA_INTELLIGENCE_PIPELINE.md` §3 (Phase B) already specifies AI-assisted
content generation, explicitly as *"a `suggestion_type` family within the
existing AI Suggestion lifecycle (`AI_GOVERNANCE.md` §4) — not a new governance
model."* Its named outputs already include **"marketing copy drafts"**, **story
narrative drafts assembled from multiple Assets**, and **"social media
crops/treatments."**

The input's Creative Intelligence sections (§47–49) describe substantially the
same capability. **Building them separately would create two AI content
pipelines with two governance stories** — the exact divergence `README.md` warns
about for Resource.

**Reconciliation:**

- **Generation belongs to Phase B.** Marketing does not generate; it supplies
  brand voice and claim constraints as inputs, and consumes the suggestions.
- **`ContentPiece` begins where Phase B ends.** A promoted suggestion becomes a
  `ContentPiece`; the AI-generated origin is retained, not deleted
  (`AI_GOVERNANCE.md` §6).
- **`ContentPiece` does not duplicate `Story`.** `Story` is built, flat, and
  first-class; `ContentPiece` references it. §12, §49, §50.2.
- **Derivatives, never in-place edits.** Phase B §1's non-destructive principle
  already governs this.

---

## 52. Conflict check — marketing AI vs AI governance and persona modes

**Required by input §98 item 11. The input's own framing is compatible; the
risk is in implementation, and one thing needs correcting.**

**Guardrails (input §71) defer correctly.** Input §95 already subordinates
marketing AI to `AI_GOVERNANCE`, research governance, brand rules, rights and
RBAC, and states suggestions can never override them. That matches
`AI_GOVERNANCE.md` §2 and needs no new model. Marketing adds *content* to the
suggestion lifecycle, not a second lifecycle.

**The marketing mode (input §73) needs one correction.** ADR-037 decision 3
approved a specific MVP mode set — FIELD, OPERATOR, SENSORY, COMPETITION,
COMMERCE, DISCOVER — and deferred RESEARCH, FERMENTATION, BREWING and
CONSULTING *"until their underlying modules exist"*, staying
`groundingStatus = not_yet_grounded` with the router declining to route to them
with fabricated confidence.

A marketing/community mode is **not in the approved set**. It must therefore
enter the existing mode table as `not_yet_grounded`, becoming live when the
marketing module ships — the same treatment every other deferred mode gets. It
must not be introduced as a live mode, and it must not define its own
persona/knowledge/tool semantics: the table already has those columns, and a
parallel behaviour model for marketing is precisely what §98 item 11 asks to
prevent.

**One further inheritance worth stating:** ADR-037 decision 4 makes
`ai:converse` a real permission held initially by Platform Admin and
Content/Ops Coordinator, *"explicitly not defaulted to every authenticated
user."* A marketing mode inherits that gate rather than inventing its own.
