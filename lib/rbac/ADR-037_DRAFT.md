## ADR-037 — AI Persona, Modes, Knowledge & Tools Architecture: approved decisions

**Context:** `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` §43 listed
seven open decisions after reviewing
`AI_PERSONA_MODES_KNOWLEDGE_TOOLS_PROMPT_CORRECTED.md`. All seven are
approved as recommended, resolved below. That document's status moves from
"awaiting product-owner approval" to approved; as with ADR-017/018/020,
approval covers architecture and sequencing only — nothing in it is
implemented, and no model SDK, embedding, retrieval pipeline, or permission
is created by this entry.

**Decisions (approved):**

1. Professional modes live as a **code-level registry** (a typed
   array/map, e.g. `lib/ai/modes.ts`), following the same "data-shaped
   constants in code" pattern `lib/rbac/catalog.ts` already uses — not a
   database table, not admin-editable at runtime. Approved. `RBAC.md` §2
   makes Role Profiles data because CLAUDE.md requires non-developers to
   add roles without a deploy; that requirement does not extend to
   prompt/product surface, which is the same category as email templates
   (`INTEGRATIONS.md` §5) and adapter capability interfaces
   (`INTEGRATIONS.md` §1), both already code in this architecture. Which
   mode(s) a given response used is recorded per response in
   `ai.recommendation.context` (already `jsonb`, no schema change).

2. `knowledge.*` is a **new schema, structurally parallel to but distinct
   from `external.*`** (`EXTERNAL_DATA_ARCHITECTURE.md` §7) — approved,
   explicitly rejecting folding textual knowledge sources into the
   external-data design. The two answer different questions and carry
   different shapes: `external.*` stores observations (value, unit, place,
   time), `knowledge.*` stores documents and claims. The licensing/access
   column shape is copied from `external.license` — that is the reuse that
   matters, not a shared table.

3. **MVP mode set: FIELD, OPERATOR, SENSORY, COMPETITION, COMMERCE, and a
   general DISCOVER mode** — approved per §40. RESEARCH, FERMENTATION,
   BREWING, and CONSULTING are explicitly deferred until their underlying
   modules exist, and stay marked `groundingStatus = not_yet_grounded`
   until then, with the intent router declining to route to them with
   fabricated confidence. No business reason was identified to build
   persona/routing for a mode ahead of its module. Each becomes `live` on
   its module shipping, with no change to the mode's persona or tool
   definition — only its grounding flag.

4. **`ai:converse` is a real new permission**, platform-scoped, distinct
   from the existing `ai:review_suggestion` (who may review AI-written
   output) — approved. Held initially by **Platform Admin and Content/Ops
   Coordinator**, the same two profiles that already hold
   `ai:review_suggestion`. Explicitly not defaulted to "every
   authenticated user"; widening is a later decision to make deliberately
   once real responses have been read. To be added to
   `lib/rbac/catalog.ts` when Ask Néctar is actually built, not now.

5. **No bulk knowledge ingestion — source registration only** until
   retrieval and citation rights are individually confirmed per source
   (§8, §38) — approved. `knowledge.source.retrieval_allowed` and
   `citation_allowed` are hard gates checked before any retrieval job
   runs, not documentation notes, mirroring
   `EXTERNAL_DATA_ARCHITECTURE.md` §24's enforcement pattern for external
   datasets. This applies with particular force to BJCP, SCA, WSET, and
   Cicerone material, whose proprietary status is already flagged in
   `BEVERAGE_SENSORY_PROTOCOLS.md` §1. A registered source with citation
   permitted and retrieval not assumed is the platform's representation of
   a pending licensing question — if a license is later obtained, that is
   a column change on one row plus a reference to the actual grant, not a
   new mechanism.

6. **Anthropic Claude remains the default `AIProvider`**, per ADR-011 and
   `PLATFORM_OVERVIEW.md` §8 — approved, confirming the existing decision
   rather than reopening it. No new information has arrived that would
   trigger re-evaluation. Provider independence is preserved by the
   adapter boundary (`INTEGRATIONS.md` §7, CLAUDE.md §42), so comparing or
   switching providers later remains a configuration change, not a rewrite
   of the routing/mode/tool logic.

7. **`ai.recommendation.decision_reason` is added at Foundational-phase
   time, with its taxonomy left open** — approved. The column is additive
   and nullable (a one-column migration, no backfill). The reason
   vocabulary suggested in §30 (incorrect, unsupported, irrelevant, too
   generic, too technical, too simplified, wrong tone, missing source,
   better alternative) is treated as a starting reference, not a fixed
   enum: the real taxonomy is derived from actual rejection reasons once
   there is review volume to learn from. Consistent with §30's own
   caution, historical user decisions never retroactively upgrade a past
   record's `provenance_class`.

**What this unblocks:** `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md`
is now an approved architecture document and can be cited as authority.
This specifically unblocks the brand/marketing review
(`BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`, not yet written), whose
own required conflict check — per its input document's §98 item 11 —
requires that its AI marketing guardrails and Ask Néctar marketing mode
defer to `AI_GOVERNANCE.md`'s suggestion lifecycle and to this document's
Commerce/Tourism mode definitions rather than defining a parallel AI
behavior model for marketing.

**Not decided here:** model selection specifics, prompting strategy, and
cost/latency trade-offs remain implementation details of the AI slice's own
design notes (`AI_GOVERNANCE.md` §9, this document's §39). The first real
`AIProvider` implementation, the intent router, and the mode registry are
Foundational-phase work (§41) to be kicked off explicitly, not started by
this approval.
