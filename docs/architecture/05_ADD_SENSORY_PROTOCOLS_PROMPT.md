# Adding Beverage Sensory Protocols & Reference Standards — Instructions + Prompt

This document is treated separately from the other planning docs batch
because it's core, load-bearing infrastructure for the platform's actual
sensory/research practice — not a future-facing extension.

## Step 1 — Check current status first

Same discipline as always: confirm what Claude Code is currently working on
before adding this. Do not interrupt in-progress slice work.

## Step 2 — Place the file

```
docs/architecture/BEVERAGE_SENSORY_PROTOCOLS.md
```

```bash
git add docs/architecture/BEVERAGE_SENSORY_PROTOCOLS.md
git commit -m "Add beverage sensory protocols and reference standards architecture (coffee/beer/mead/honey priority, open-supplier calibration system)"
```

## Step 3 — Hand Claude Code the prompt

```
I've added docs/architecture/BEVERAGE_SENSORY_PROTOCOLS.md. This is core,
load-bearing infrastructure, not a peripheral feature — read it carefully.

It has two parts:

1. Sections 1-6: sensory protocol content for coffee (adapted from SCA's
   CVA structure), beer and mead (adapted from BJCP structure), and honey
   (grounded in ISO/academic literature) — reusing the existing
   SensoryProtocol/SensoryProtocolVersion entities from DOMAIN_MODEL.md,
   populated with real content rather than left abstract. Other categories
   (wine, cacao, chocolate, spirits, rum, gin, infused liquors, water,
   non-alcoholic) get placeholder structure only, per section 4.

2. Section 7: a Reference Standards & Panel Calibration system — this is
   the part that makes sensory evaluation on this platform professional-
   grade rather than descriptor collection. It tracks real, precisely-dosed
   flavor/off-flavor reference standards (the kind AROXA and FlavorActiV
   manufacture) used to calibrate evaluators against known compounds,
   records per-evaluator calibration history (including known insensitivity/
   anosmia to specific compounds, which materially affects how much weight
   an evaluator's assessment of a related defect should carry), and
   extends Person with real, structured certification tracking (UC Davis,
   FlavorActiV, BJCP judge rank, CQI Q-Grader, and similar).

Important specifics to get right:

- The reference-standard supplier model is deliberately OPEN, not a fixed
  list. FlavorActiV is my current supplier, but I also create and sell my
  own reference standard kits. Suppliers are core.Organization records,
  same as any other organization in the platform — do not hard-code
  FlavorActiV or any single supplier into the schema or business logic.
- Self-created standards (standard_origin = 'self_created') are real
  production/sales infrastructure for me, not a hypothetical extensibility
  point. When a self-created standard is also something I sell, it links
  to a real core.Product (commerce_product_id) — one record serving both
  a commercial listing and internal calibration use, per section 7.1.
- Never invent threshold values, descriptor terminology, or compound data
  for a commercial standard — every commercial reference_standard row must
  cite a real supplier data sheet. For self-created standards, composition
  and validation method get recorded honestly (including
  validated_against = 'none' when a standard hasn't been externally
  validated yet) rather than implying rigor that doesn't exist yet.
- This is Slice 6 (Sensory) scope, not immediate build work — standard
  planning-doc discipline applies: read, cross-check against DOMAIN_MODEL.md
  and RBAC.md for conflicts, log acceptance in DECISIONS.md, do not
  implement yet.

Cross-check specifically: does core.Organization as currently modeled
support being both a reference-standard supplier AND other organization
types simultaneously (e.g., could Néctar Nómada's own Organization record
serve as both a standards creator/seller and everything else it already
is)? Flag if the organization_type model needs adjustment to cleanly
support this, rather than silently working around a gap.

Stop after cross-checking and log the acceptance — give me a summary of
any conflicts or gaps found, especially around the Organization model
question above.
```

## Why this one gets its own prompt

The other five planning docs are legitimately deferred, no-urgency
territory. This one is different: reference standards and evaluator
calibration are things you're already actually doing — selling kits,
holding real certifications, running real panels. Treating it with the
same "file it and forget it until Slice 6" pattern as purely speculative
future work would undersell how load-bearing this actually is to your
current practice.
