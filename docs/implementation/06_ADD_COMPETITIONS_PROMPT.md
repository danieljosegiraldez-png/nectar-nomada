# Adding Competitions Architecture — Instructions + Prompt

Given its own prompt, same reasoning as the Beverage Sensory Protocols
document: this is real infrastructure for something you'd actually run
(a Panama-style lager competition, potentially honey/coffee competitions
too), not speculative future work.

## Step 1 — Check current status first

Confirm what Claude Code is currently working on before adding this.

## Step 2 — Place the file

```
docs/architecture/COMPETITIONS.md
```

```bash
git add docs/architecture/COMPETITIONS.md
git commit -m "Add Competitions operational architecture (category-agnostic: beer, honey, coffee, cacao, wine, spirits)"
```

## Step 3 — Hand Claude Code the prompt

```
I've added docs/architecture/COMPETITIONS.md. This extends the existing
Competition entity chain in DOMAIN_MODEL.md §4 with the operational layer
a real competition needs — roles, physical logistics, judge-facing
workflow — researched from professional competition management platform
patterns (Beer Awards Platform specifically, for operational pattern
research only).

Important — read this carefully before anything else: THIS IS NOT
BEER-SPECIFIC. The document is explicit about this in its opening section,
but I want it verified in your understanding before you engage with the
rest: the entity structure reuses the same generic CompetitionCategory/
Division model already in DOMAIN_MODEL.md. A honey competition, a
specialty coffee competition, a cacao competition, and a beer competition
all use identical operational infrastructure (Organizer/Entries
Receptionist/Cellar Master roles, check-in, pull sheets, blind coding,
Best of Show structure) — the only thing that varies by category is which
sensory protocol from BEVERAGE_SENSORY_PROTOCOLS.md a given competition's
judging reuses. Confirm this understanding explicitly in your summary
response.

Key sections to cross-check against existing architecture:

1. Section 1 (new roles: Organizer, Entries Receptionist, Cellar Master) —
   confirm these work as straightforward RBAC.md Role Profile additions
   (data, not schema), scoped per competition, consistent with existing
   project-scoped roles.
2. Section 3 (blind coding at intake) — confirm this correctly reuses the
   existing blind-mapping restriction from RBAC.md §7 rather than
   introducing a parallel mechanism, and that assignment vs. lookup
   permissions are properly separated for the Entries Receptionist role.
3. Section 6 (Best of Show as bos_round, not an overloaded Flight) — confirm
   this doesn't conflict with how Flight is already used elsewhere in
   Sensory Evaluation.
4. Section 9 (entry fee payments) — this is a DELIBERATE, explicitly
   confirmed decision: competition entry fees use a genuinely separate
   PaymentsProvider adapter instance from Commerce, NOT shared Stripe
   configuration or Order/Payment tables. Do not "simplify" this into
   reusing Commerce's payment system — the separation is intentional, not
   an oversight, even though it means two payment integrations to
   maintain. It should still implement the same PaymentsProvider interface
   shape from INTEGRATIONS.md §6 for consistency, and still gets the same
   mandatory audit trail SECURITY.md §6 already requires for any payment
   event.

This is Slice 6+/Competitions-phase scope per MVP_ROADMAP.md's existing
note that Competitions is sequenced after Sensory, reusing its Assessment
engine. Standard planning-doc discipline: do not implement yet, cross-check
against DOMAIN_MODEL.md/RBAC.md/SECURITY.md/INTEGRATIONS.md for conflicts,
log acceptance in DECISIONS.md.

Stop after cross-checking and give me a summary, explicitly confirming your
understanding of the category-agnostic point above and flagging any
conflicts found in sections 1, 3, 6, or 9.
```

## Why the explicit category-agnostic confirmation matters

Research grounding in one real example (Beer Awards Platform) is a normal,
good way to design an operational layer — but it creates a real risk that
an implementation ends up subtly beer-coded (field names, default category
lists, assumed terminology) even when the architecture doc itself is
careful to stay generic. Asking Claude Code to explicitly confirm this
understanding before proceeding is cheap insurance against that drift.
