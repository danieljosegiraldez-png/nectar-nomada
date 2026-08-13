# AI Governance — Néctar Nómada Digital Platform

Implements CLAUDE.md Sections 3, 17, 31, and 32. The governing principle, stated
once and enforced structurally throughout this document: **AI is never an
authoritative source, and its output is never accepted into the system except
through the same human-review path every time, with no shortcut for "obviously
correct" suggestions.**

---

## 1. What AI is allowed to do

Search · summarize · compare · identify missing information · recommend next
operational steps · suggest related content/products/experiences · identify
patterns · detect anomalies · generate drafts · prepare report drafts · assist
data interpretation (as a suggestion, not a conclusion) · prepare customer
recommendations · support navigation. All of these produce **suggestions**, never
direct writes to authoritative tables.

## 2. What AI is never allowed to do (CLAUDE.md §32, verbatim scope)

AI must not, under any code path:

- approve research conclusions;
- change authoritative source data;
- overwrite protocols;
- publish unsupported claims;
- change competition results;
- alter submitted sensory forms (which are immutable once submitted per
  `DOMAIN_MODEL.md` §4);
- infer missing measurements and save them as fact;
- expose restricted information through a *reviewer-facing* surface without
  going through the standard permission check (see §5 for the current,
  narrower state of this guarantee than earlier drafts of this document
  described).

## 3. Technical enforcement, not policy-only

The prohibition in §2 is enforced at the database permission layer, not only in
application logic, so a prompt-injection or application bug cannot route around
it:

- The AI service runs under its own Postgres role (`ai_service`) with `INSERT`
  grant on `ai.recommendation` only — it has **no** `INSERT`/`UPDATE`/`DELETE`
  grant on any `research.*`, `sensory.*`, `competitions.*`, or `core.*` table.
  Verified live against the production database (17_ audit, Part A item 1):
  `ai_service` holds exactly `INSERT`+`SELECT` on `ai.recommendation`, `USAGE`
  only on the `public`/`ai` schemas, and nothing else.
- **What this role does *not* have, corrected from an earlier draft of this
  section**: `ai_service` carries no `SELECT` grant on any module table at
  all — the write restriction above is a real, database-enforced control, but
  reads for suggestion generation do not go through this restricted role or
  through any RBAC-scoped connection. They go through the platform's ordinary
  full-access application database client (§5 describes exactly what that
  means for the one generator built so far). This is a real gap between what
  this document originally claimed ("SELECT grants scoped the same way a
  human's resolved RBAC permissions would be") and what is actually built;
  logged here rather than silently corrected, per C1 §4.
- Because the write path physically does not exist for the AI role, "AI silently
  mutates a scientific record" is not a bug class that can occur in production
  regardless of prompt content — this is the concrete difference between a
  governance policy and a governance control.
- A human accepting an AI suggestion performs the actual write themselves (or
  triggers a service call that runs under their own UserAccount's RBAC-resolved
  permissions, not the AI's), and that write is attributed to them, with
  `source_ai_recommendation_id` recorded for traceability.

## 4. The suggestion lifecycle

```
core schema: ai.recommendation(
  id, suggestion_type, model, model_version, created_at,
  context jsonb,                 -- related entity refs, input summary
  recommendation text,
  supporting_evidence jsonb,     -- links/refs to the data the suggestion cites
  confidence numeric(nullable),
  related_entity_type, related_entity_id,
  status  text  -- pending | accepted | rejected | modified
  reviewer_user_account_id (nullable until reviewed),
  decision_at (nullable),
  action_taken text (nullable)   -- what the reviewer actually did, which may
                                  -- differ from the raw suggestion ("modified")
)
```

Flow: `AI Suggestion → Evidence/Reason (stored alongside it) → Human Review →
Accept / Reject / Modify → Action (a normal, RBAC-checked write by the human) →
Audit Record` (CLAUDE.md §32's loop, implemented literally as this table plus the
standard `AuditEvent` triggered by the resulting human write).

Every suggestion is visible in an "AI Suggestions" review surface scoped by the
reviewer's own RBAC permissions — a reviewer only sees AI suggestions touching
entities they already have permission to act on, so the review queue cannot be
used to leak restricted context through the AI layer.

## 5. AI reads — design intent vs. what is actually built

This section originally described a per-user AI assistant: a researcher asks a
question, the retrieval step resolves through `RBAC.md` §4 scoped to that
person's own access, and the AI never sees more than the requesting human
could see directly. **That interactive assistant does not exist yet.** The
only AI feature built so far (`lib/ai/service.ts`'s
`generateDataCompletenessSuggestions`) is not a per-user query at all — it is
an internally-triggered generator with no requesting-user context to scope
against. It reads via the platform's ordinary full-access `prisma` client
(the same one every other server-side module uses), running an **unscoped**
query across every `Project` regardless of classification or which human
triggered generation.

The RBAC control that *is* real and verified today sits downstream, not
upstream: every suggestion this generator produces still requires
`review_suggestion` permission to see or act on (§4, `app/actions/ai.ts`), so
nothing reaches an unauthorized viewer through the review surface. What is
not true is the upstream claim that generation itself only reads what a
particular human could already see — today it reads everything, and the
access control is entirely at the review gate, not at the read.

If and when a real per-user, interactive AI assistant is built, this
section's original design — retrieval scoped through the resolved-permission
service, per §1's "search/summarize/compare" — is still the right target,
and should replace this note once that assistant exists. Until then, this is
the accurate description of what runs today.

## 6. Provenance labeling

Any AI-authored or AI-assisted text that reaches a human-facing surface
(a drafted story paragraph, a generated report section, a customer
recommendation blurb) carries `provenance_class = 'ai_suggestion'`
(`DATA_ARCHITECTURE.md` §4) until a human explicitly promotes it — at which point
the promoted content is a new/updated record attributed to the human who approved
it, with the AI-authored version retained (not deleted) as the traceable origin,
consistent with the version-preservation rule in `PLATFORM_OVERVIEW.md` §3.

## 7. Missing data stays missing

AI is explicitly disallowed from inferring a missing measurement, price, date, or
any other factual field and writing it as if observed (CLAUDE.md §32). Where an
AI feature would naturally want to fill a gap (e.g., "estimate the likely harvest
date based on comparable lots"), the only permitted output is a **suggestion**
with `suggestion_type = 'estimate'`, explicit supporting evidence, and it can only
ever be accepted into a field explicitly modeled as `interpretation` or
`recommendation` provenance — never into a field whose provenance_class is
`measured_fact` or `direct_observation`. The schema itself prevents this
category of error: those provenance-class values are not legal targets for
AI-suggestion-derived writes, enforced by application-layer validation on the
accept action.

## 8. Provider independence

The AI service is implemented behind a single internal adapter interface
(`INTEGRATIONS.md` §7) so governance controls in this document (the RBAC-scoped
retrieval, the recommendation-table-only write path, the provenance labeling) are
enforced in the adapter boundary itself, not duplicated per-provider. Swapping or
adding a model provider does not change any rule in this document — the controls
live in the platform's own service layer, not in provider-specific configuration.

## 9. What this does not cover

Model selection, prompting strategy, and cost/latency trade-offs are
implementation details for the AI vertical slice (`MVP_ROADMAP.md`, deliberately
last) and belong in that slice's own design notes, not in this governance
document — this document specifies constraints implementation must satisfy,
not how the AI feature itself is built.
