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
- expose restricted information (AI queries run through the same RBAC resolution
  as a human user — see §5).

## 3. Technical enforcement, not policy-only

The prohibition in §2 is enforced at the database permission layer, not only in
application logic, so a prompt-injection or application bug cannot route around
it:

- The AI service runs under its own Postgres role (`ai_service`) with `INSERT`
  grant on `ai.recommendation` only, and `SELECT` grants on module tables scoped
  the same way a human UserAccount's resolved RBAC permissions would be (§5) —
  it has **no** `INSERT`/`UPDATE`/`DELETE` grant on any `research.*`,
  `sensory.*`, `competitions.*`, or `core.*` table.
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

## 5. AI queries respect RBAC, always

When AI is asked to search, summarize, or compare across platform data (§1), the
retrieval step runs through the same permission-resolution service described in
`RBAC.md` §4, scoped to the requesting user's own resolved access — never a
privileged "AI has read access to everything" bypass. A researcher's AI assistant
cannot surface another project's confidential protocol just because the model
technically has a database connection; it has the same visibility the requesting
human does, because the query is executed as that human, not as a superuser
service account with a system prompt telling it to behave.

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
