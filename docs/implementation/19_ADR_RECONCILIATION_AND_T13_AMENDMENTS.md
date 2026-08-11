# ADR log reconciliation, T13 ticket amendments, media readiness check

**Documentation and ticket edits only.** No code, no schema, no migrations.
Part C is read-only investigation — report, do not fix.

Do not begin T12, T13, or T14.

**Overlap note:** Part A absorbs `15_DOCUMENTATION_CORRECTION_PASS_PROMPT.md`
Part D item 3 (moving `ADR-037_DRAFT.md` out of `lib/rbac/`). When `15_` is
eventually run, treat that item as already done rather than repeating it.

---

## Part A — The decision log is three decisions stale

`DECISIONS.md` is described throughout the architecture set as the source of
truth for "why," and the mechanism that keeps a solo maintainer — or a
future session with no memory of this one — from re-deriving decisions
already made. It currently ends at ADR-036, while three approved decisions
sit in unappended draft files:

- **ADR-037** — AI Persona / Modes / Knowledge / Tools decisions. Currently
  at `lib/rbac/ADR-037_DRAFT.md`, which is application code and the wrong
  home entirely: an ADR there is invisible to anyone reading the
  architecture set and will drift from `DECISIONS.md`.
- **ADR-038** — whatever it records; locate it and confirm.
- **ADR-039** — v1 scope definition, at `docs/architecture/ADR-039_DRAFT.md`.

Do the following:

1. **Search the repository for any other unappended ADR drafts** before
   assuming these three are the complete set — three already escaped
   notice, so the list may be longer.
2. Confirm the last appended ADR number in the live `DECISIONS.md` and that
   037/038/039 are correctly sequenced against it and against each other.
3. Append all of them to `DECISIONS.md` following the existing format.
4. **Delete the draft files.** Leaving them creates a second copy that will
   diverge — the exact problem this task exists to fix.
5. Report what each ADR records, in one line each, so the decisions are
   visible in this session's output and not only in the file.

**One addition to ADR-039 before appending.** The v1 report closed with a
caveat that must survive into the ADR itself rather than remaining in a
session report: *T6–T14 plus T9.5 build the **capability** to carry a
harvest end to end; they do not themselves constitute having done so. A
truthful "yes" on the v1 test requires an actual harvest entered by a real
operator once T12–T14 ship.* This is the distinction between a v1 that is
genuinely finished and a v1 that is declared complete and never used —
which is the failure this project is most exposed to, and the thing most
likely to be forgotten first. Include it as an explicit clause.

Also confirm ADR-039 records the **deferral list** as an explicit logged
decision (Research OS, apiary, environmental, equipment/readiness,
dashboards, search, offline, mobile, import/export, plus T11 and
`Notification`) — not as an omission. The point of logging what is
deliberately not being built is that it cannot quietly return later without
a stated reason.

## Part B — T13 ticket amendments

Three changes to `PHASE_1_TECHNICAL_EXECUTION_PLAN.md`, recording decisions
the v1 pass reached but which currently live only in a report:

1. **T13's Lot Report must be designed print-friendly from the start.** The
   v1 pass recommended a printable authenticated page as the v1 reading of
   "a report you could send a client" — correct, and genuinely zero extra
   cost *if it is designed for print from the outset*. Retrofitting print
   layout afterwards is not zero cost. Put this in the ticket's own
   definition of done rather than leaving it as an assumption in a report
   nobody rereads. Note PDF export and login-free external client access as
   real future capabilities not built by any T6–T14 ticket.
2. **Correct the dependency graph in §35**: T13 depends on T10 and T12 only.
   T11 is deferred, so listing it as a T13 dependency is now wrong.
3. **Record T11's deferral in the plan document itself**, with the reason —
   T13's definition of done never renders a deviations section, and a
   harvest with zero deviations still satisfies the v1 test. Mark it
   deferred, not cancelled; it belongs on the v2 list.

## Part C — Media readiness (read-only, report only)

`core.asset` has zero rows and no R2 credentials exist in any environment,
so no object-storage round trip has ever completed. That does not block the
v1 test as defined — but field photographs are a large part of what makes a
lot report credible to a client, and this needs deciding **before** T14's
seed work rather than after.

Report:

1. Is there any working upload path today? Specifically, does T10's Operator
   Workbench include photo capture or asset attachment on any form, or was
   media left out entirely?
2. What would it actually take to attach a photo to a lot, harvest event, or
   measurement — R2 credentials alone, or is application work required as
   well? Be specific about which.
3. Does T13's Lot Report ticket contemplate rendering images at all?
4. If media were included in the pilot harvest, which tickets change and by
   how much?

Recommend whether media belongs in v1's pilot or is deferred with the rest
of the object-storage work. Do not implement anything.

## Part D — Report

List every change made in Parts A and B with file and section. Give Part C
as findings and a recommendation. Note anything found that seems wrong but
was out of scope to fix.
