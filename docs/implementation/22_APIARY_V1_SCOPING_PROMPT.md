# Apiary in v1 — scoping pass, and an amendment to ADR-039

**Scoping only.** No code, no schema, no migrations. Produce a scoped ticket
breakdown and a draft ADR amendment. Build happens in a later, separate pass
after review.

---

## 1. What changed, and why this reverses a logged decision

ADR-039 deferred apiary out of v1 on the reasoning that the harvest test —
*carry one real harvest from cherry to a cupping score to a lot report* —
doesn't require it. That reasoning was sound at the time and is now
outdated, for a reason that has nothing to do with architecture: **the
platform's pilot users are mostly beekeepers.**

Named testers: Kenneth (Cerro Azul), Chayanne (Kiva/Toabré), Mickelle (San
Juan, Veraguas) on apiary; Bob and Sherry (Cerro Azul) on coffee. Three of
five work apiary. Deferring apiary means three of five have nothing to use.

The v1 test was written before the users were named. That is exactly the
circumstance in which a logged decision should be revisited openly rather
than quietly overridden.

**Draft an amendment to ADR-039** (do not append — draft for review)
recording: what changed, that apiary enters v1, the scope boundary below,
and what remains deferred. State plainly that this expands v1 and moves
risk, rather than presenting it as a free addition.

## 2. The timeline is production, not testing

**Coffee harvest runs November–April. Apiary season runs December–April.
These are live production windows, not test windows.** Real cherry, real
inspections, real data that cannot be re-entered.

Consequences to hold throughout:

- Ready before **November** — roughly eleven weeks — with coffee's T12.6,
  T13, T14 still outstanding in the same window.
- **There is no test period inside the season.** Testing happens in
  September, with Kenneth, on fabricated or prior-season data. Whatever he
  cannot do unaided in five minutes is what October fixes.
- Anything that breaks in December breaks *during* the season, with no
  fallback. Design for that, not for a demo.

## 3. The apiary v1 boundary — a falsifiable test, same discipline as ADR-039

> **Can the platform carry one apiary through a season of inspections to a
> honey batch with a sensory result?**

Evaluate each of the following against that test and say whether it passes.
Do not assume the list below is correct — it is a starting proposal, and
finding that something on it is unnecessary is as valuable as finding a gap.

**Proposed in:**
- `Apiary`, `Hive`, `Colony` — the canonical structure
- `Inspection` — the highest-frequency form in the whole platform, and the
  irrecoverable one
- `HealthObservation` and interventions (feeding, treatment)
- **Colony origin** — that a colony arrived as a purchased nucleus, was
  captured, or was split from another. The *fact* of origin is
  irrecoverable; the full division mechanics are not required (see below)
- `Harvest → HoneyBatch`
- Sensory linkage to the existing honey protocol, reusing T12's mechanism

**Proposed out, deferred to v1.1:**
- Full colony division mechanics and queen genealogy. Kenneth will populate
  Apiary 2's two empty hives by nucleus purchase, not splitting, so
  divisions are not exercised this season. Record origin; defer lineage.
- Pollination projects
- Honey processing, packaging, and the path to a commerce Product
- Apibotanical/floral studies (`GUIDED_FIELD_STUDY_TOOL.md` — its own
  substantial feature)

**Flag anything the test requires that neither list covers.**

## 4. Reuse before creating — this is not a greenfield domain

`DOMAIN_MODEL.md` §4 already specifies the apiary entity chain. Several
patterns are built and proven; use them rather than inventing parallels.

- **`Sample` is canonical.** A honey sample reaches Sensory the same way a
  coffee sample does — `HoneyBatch` produces a `Sample`, and T12's
  `getSensoryLinkageForSamples` already renders results per-sample.
  `DOMAIN_MODEL.md` §4 is explicit that Sensory and Competitions need no
  per-domain special cases.
- **The honey sensory protocol already exists** —
  `BEVERAGE_SENSORY_PROTOCOLS.md`'s 100-point rubric and defect taxonomy,
  rebuilt as original work in commit `c913595`.
- **Provenance is required, not optional.** Every fact-bearing apiary table
  carries `provenanceClass` (required, no default), `sourceReference`,
  `dataQuality`, and an observer field per ADR-038. An inspection is a
  `direct_observation`; a colony strength recalled that evening is not.
- **Photo attachment follows T12.5's pattern** — nullable FKs per parent on
  `Asset`, never polymorphic (ADR-020 decision 8).
- **Colony origin, when it eventually extends to divisions, reuses the
  `lot_transformation` DAG shape** — parent colony as input, children as
  outputs, append-only. Note this for v1.1; do not build it now.
- **Partner-site access** reuses `SPECIMEN_AND_MATERIAL_TRACEABILITY.md`
  §7 — each engagement its own Project, `classification = partner`,
  leaf-scope containment already preventing cross-client visibility.
  Chayanne at Kiva and Mickelle at San Juan are different engagements from
  Kenneth at Cerro Azul.

Report anything that genuinely cannot reuse an existing pattern, with
reasoning. A new entity should be the exception.

## 5. The inspection form decides whether this succeeds

Everything else is scaffolding around one form used dozens of times a
season, standing at an open hive, one-handed, in gloves, in sun, often with
no signal.

Design it explicitly, not as a field list:

- What is **required** versus optional. Optional fields are empty fields —
  but a required field an operator can't answer produces garbage, which is
  worse because it looks like data.
- What is **pre-filled** from context. Standing at H-014, the hive is known;
  the operator should not select apiary and hive for every entry.
- How long the common case takes. Give the actual tap sequence for a
  routine inspection with nothing unusual found.
- How **"nothing unusual"** is recorded — the most common outcome, and the
  one most likely to be skipped if it costs the same as a detailed entry.

Note that `OFFLINE_FIELD_CAPABILITY.md` specifies the offline mechanism.
Do not build it here, but do not design a flow that precludes it.

## 6. Deliverables

1. **The boundary analysis** — each item in §3 against the test, with
   verdicts and anything missing.
2. **A ticket breakdown** — numbered, sized relative to T1–T12.5 (which are
   built and provide real calibration), sequenced against coffee's
   outstanding T12.6, T13, T14 in the same eleven weeks. Be honest about
   whether it fits; if it does not, say what gives.
3. **The inspection form design** per §5.
4. **What is deliberately not built**, with the consequence of each — the
   record of what the December–April season gives up.
5. **Draft ADR amendment to ADR-039** per §1 (do not append).

Report, then stop. Do not begin building, and do not begin T12.6.
