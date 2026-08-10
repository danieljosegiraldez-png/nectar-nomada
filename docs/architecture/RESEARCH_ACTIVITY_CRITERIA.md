# Research Activity Criteria — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §4 (Research OS), `AI_GOVERNANCE.md`, `RBAC.md`,
and applies to activities already specified in `TOURISM_EXPERIENCES.md` and
CryoBloom-related work. This document specifies the gate that distinguishes
a genuine research activity from a commercial activity carrying research
language — tested by substance, not by labeling, linkage, or approval alone.

**Founding principle, stated once and enforced throughout**: a Project ID, a
Location, and a Person titled "Researcher" are necessary infrastructure, but
none of them — individually or together — make an activity research. What
makes it research is a real question that could turn out to be wrong, a real
method, and real data that gets used. This document exists specifically so
the platform can't be used to launder a commercial activity into a research
label, even by well-intentioned accident.

---

## 1. The five-part substance test

An activity qualifies as research when it has, before it happens:

1. A stated `ResearchQuestion`/`Hypothesis` that could genuinely be wrong —
   not "people enjoyed themselves," a real question with a real possible
   negative answer.
2. A `Protocol` — an actual method for how data gets collected, even if
   lightweight.
3. Real `Evidence`/data output that gets recorded and is usable for
   publication or citation — not just internal notes.
4. Honest informed-consent language — participants told what's actually
   being studied.
5. `ResearchProgram`/Project + Location + Researcher linkage (necessary
   infrastructure, not sufficient on its own — see founding principle above).

## 2. Tiered rigor by fee status

```
core.research_activity: add
  is_paid (boolean), research_question_structured jsonb (nullable —
  required when is_paid = true), compliance_status
  [pending_review|approved|rejected|recategorized]
```

- **Paid activities**: item 1 above must be **structured** — the submission
  must state what a positive finding and a negative finding would each
  actually look like, not just a topic. Reviewed by the Compliance Reviewer
  (§4) before publishing.
- **Free/no-cost activities**: lighter bar — self-declared research question,
  no structured falsifiability requirement. The commercial-mislabeling risk
  this document exists to prevent is inherent to paid activities; free
  participation doesn't carry the same risk, so it doesn't carry the same
  bar.

## 3. Language and framing

```
core.research_activity: add
  public_listing_copy text, consent_form_copy text,
  language_flag_status [clear|flagged|resolved] (nullable, applies when
  is_paid = true)
```

- **AI-assisted drafting**: AI can draft public-facing copy for a research
  activity (per `AI_GOVERNANCE.md` §1's allowed "generate drafts"
  capability) — always as a `pending` suggestion, always requiring human
  approval before publishing, same lifecycle as every other AI-authored
  content on this platform.
- **Tourism-coded language flag**: when `is_paid = true`, a defined
  vocabulary check (flagging terms like "tour," "tasting experience," and
  similar tourism-coded phrasing when applied to something claiming research
  status) is a **hard block** — `language_flag_status` must reach `resolved`
  before the activity can be published. When `is_paid = false`, the same
  check runs but is a **soft flag** only — noted, not blocking. The
  paid/free tiering here matches §2's tiering deliberately: the stricter
  check applies exactly where the mislabeling risk is real.
- **Disclosure split**: the **public listing** carries a brief, honest line
  identifying the activity as a research initiative (not full financial/
  data-use detail). The **consent form**, required before participation,
  carries the complete disclosure: paid/research nature stated explicitly
  (not styled as an ordinary purchase or booking), plus what happens to
  participants' data, photos, and stories if shared publicly.

## 4. Research Compliance Reviewer — a real, independent role

```
RBAC.md seed Role Profile, addition:
- Research Compliance Reviewer (scope: platform or program) — approve/
  reject research-activity submissions against this criteria; explicitly
  excludes permission to review an activity the same person designed or
  proposed (enforced at the permission-check layer, not just policy).
```

- This is a **dedicated role**, distinct from Admin or Research Lead —
  because a criteria gate reviewed by the same authority that benefits from
  activities passing it isn't an independent check.
- **Reviewer independence rule**: a Compliance Reviewer cannot approve or
  reject an activity they personally designed or proposed. Enforced the same
  way blind-evaluation judge/mapping restrictions are enforced elsewhere in
  this system (`RBAC.md` §7) — a structural rule, not a reminder.
- **Override authority**: the founder retains final override authority over
  a Compliance Reviewer's rejection — but **every override is logged in
  `DECISIONS.md`, visibly, not privately**. This was a deliberate
  reconsideration during design: an unlogged override would quietly
  re-establish self-review as the real gate; a logged one keeps the override
  itself accountable and visible, which is what actually matters to the
  external audiences (funders, regulators, participants) this whole
  criteria exists to hold up to.

## 5. Multi-organization neutrality

For research spanning multiple independent organizations (e.g., a
cross-brewery cultural-identity study), one organization can lead/coordinate
without undermining the activity's neutral framing — **as long as findings
aren't biased toward the coordinating organization.** This is a human
judgment call at review time, not an automated check: the Compliance
Reviewer's approval should specifically consider whether the research design
and eventual findings treat all participating organizations even-handedly,
not favor whoever's coordinating.

## 6. Rejection and recategorization

If a Compliance Reviewer rejects an activity's research claim, the outcome
is **case-by-case**, not automatic:

- It may be resubmitted as a clearly-labeled **commercial/tourism activity**
  instead — using `TOURISM_EXPERIENCES.md`'s existing model, honestly framed
  as what it actually is, not blocked from existing at all.
- It may need revision and resubmission for research review if the gap is
  fixable (e.g., the question needs sharpening, consent language needs
  correcting).
- It may simply not launch, if neither path fits.

The point of this flexibility is that failing the research bar isn't a dead
end — it's a redirect to honest framing, which is the actual goal.

## 7. Recurring activities and re-review

Approved research activities don't require automatic periodic
re-certification — an approval stands unless something changes materially
(fee introduced/changed, research question changed, format changed). What
counts as "material" is left to the Compliance Reviewer's judgment at the
time, not a fixed trigger list — this is deliberately flexible rather than
mechanically defined, trusting the same review judgment that gates initial
approval.

## 8. Fund-use transparency

Not required as part of this criteria. If/when paid research activities tie
directly to fundraising for a stated cause (e.g., farmer/seed-preservation
support), fund-use disclosure is a separate concern to design deliberately
on its own terms — not bundled into the research-substance gate this
document specifies.

## 9. Retroactive review — blocking

**This criteria applies retroactively.** `CryoBloom` and the gastro-tourism
activities specified in `TOURISM_EXPERIENCES.md` must be reviewed against
this document before any new activity launches. This is explicitly
**blocking**, not parallel — confirmed as the priority ordering. Practically:
whoever holds the Research Compliance Reviewer role reviews existing
designs against §1's five-part test before Claude Code or anyone else
proceeds with new activity-related feature work.

## 10. What this document is not

This is not legal advice on Panama's tourism-authority requirements, and
doesn't substitute for one. It specifies platform-level criteria for when an
activity has genuine research substance — a necessary condition for framing
something honestly as research, not a determination of regulatory
classification, which remains a real question for a Panama-licensed
attorney where it matters.
