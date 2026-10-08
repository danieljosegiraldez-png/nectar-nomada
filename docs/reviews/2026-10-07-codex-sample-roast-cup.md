# Sample → roast → cupping verification — 2026-10-07

## Baseline and isolation

Fetched origin/main at `536abf59b22c359f7adbafa443eaeb9f3224bfbe`.
Worked in `codex/sample-roast-cup`, separate from the shared main checkout.
Database: **only** `nectar_ci_codex_roast_20261007` on `127.0.0.1:55433`.
Created from empty, migrated and seeded with explicit demo flags. No production database
access, no reset of the shared `nectar_test`, no merge, and no SESSION_STATE.md edits.
Owner merge/continuity turn was not assigned to this session.

## Demonstrated defect and final fix

`/sensory/new` reads at most 50 visible samples, then expands sample-roast options.
When the first 50 have no roasts, the page used to hide the entire form and search,
claiming no roast exists even when a later sample has valid preparations.

Final change: show the definitive empty state only when options are empty **and
`hayMas` is false**. When more samples remain, retain the existing search form.
No service contract, migration, permission grant or domain rule changed.

Regression: `tests/sensory/nuevaCataConMasMuestras.test.ts`.
Before the fix: 1 failed / 3 passed, specifically the truncated-empty-batch case.
After the fix: all 4 pass. Controls retain empty-state and missing-protocol behavior,
and verify a roasted sample still opens the form without additional results.
The page test substitutes the client form boundary; real search interaction was
verified separately in the browser.

## Browser verification (synthetic local data)

Used a project-scoped **Farm Operator**, then a platform **Cupping Host**.
All fixture data are synthetic and all roasts were recorded through the real forms.
The upstream completed-drying lineage was a database fixture, not a browser-verified
drying or hulling workflow.

1. Opened a green lot with 2 kg through operator navigation.
2. Extracted `ZZZ-CODEX-SAMPLE`, 300 g; lot balance became 1.7 kg.
3. Recorded `CODEX-ROAST-A`, charge 0.100 kg / discharge 0.085 kg.
4. Reopened roast form; sample availability was 0.200 kg.
5. Attempted 0.250 kg charge; server rejected it with a readable sample-mass error.
6. Recorded `CODEX-ROAST-B`, charge 0.100 kg / discharge 0.085 kg.
7. With 51 earlier unroasted fixture samples, host opened `/sensory/new`:
   original page showed the false no-roast state and no search.
8. After the page fix, search was reachable; searching the sample found both roasts.
9. Created `CODEX Two Roast Verification`, using the illustrative coffee protocol,
   two preparations of the same sample, in A/B selection order.
10. Independently read persistence through the scoped quantity service and Prisma:
    sample mass 0.300 kg, total charged 0.200 kg, main lot 1.700 kg, outputs 0.085 kg
    each; blind mappings A/B retain the two intended roast IDs and same sample ID.

The successful cupping was created while evaluating an additional label fix below;
that experimental display/query change was then removed. Persisted mappings did not
rely on that display change. Final patch retains only the page gate and its tests.
No sensory scores were fabricated; participant invitation, judge submission, panel
calculation, full mobile review, and production deployment were not browser verified.

## Independent review

An independent read-only reviewer found no blocker in the page gate. They inspected
but did not run the tests. Their review identified the access-control implication of
adding output lot codes to sample labels, and that addition was excluded from the
final patch. The reviewer did not edit files or access any database.

## Remaining demonstrated problems

- **Ambiguous roast labels:** two roasts of the same sample/day/profile/equipment
  render identically. An experimental output-lot-code addition made them distinct,
  but read related output-lot metadata under sample authorization alone. It was
  removed rather than silently introducing an authorization rule. Resolve the
  metadata visibility contract, then add recognizable roast identity to the selector
  and host preparation display. Existing historical roasts without output lots need
  a fallback. Distinguish UI display from persisted mapping: the mapping was correct.
- **Roast form instructions overpromise optionality:** intro says only code and start
  are required, but selecting an extracted sample also requires charge weight.
- **Validation resets entered roast fields:** excess-charge rejection was readable,
  but the uncontrolled form fields reset and had to be re-entered.
- **Initial truncated-empty search copy is awkward:** after the gate fix it says
  no matches for an empty string and “showing 0; there are more.” Search works;
  wording could explain that no roasted options occurred in the initial batch.

## Environment notes

`npm ci` installed the locked dependencies. Prisma generation needed XDG_CACHE_HOME
inside the session work directory because the default global cache was not writable.
`next dev` with Turbopack hit EMFILE watcher errors and repeated restarts; webpack
with WATCHPACK_POLLING=true served the test app on 3028. Stopped both servers owned
by this session. Next dev appended agent instructions to CLAUDE.md; restored that
sole generated addition after shutdown, outside the final patch.
Default 2 GB Node heap caused typecheck OOM. Re-ran checks with
`NODE_OPTIONS=--max-old-space-size=6144`; this is an execution setting, not a repo change.

## Verification

- Baseline full seeded-database group: **211 files / 2,603 tests passed**.
- Page regression: original failing case proven, then **4/4 passed**.
- Final CI and production build results: recorded in the handoff completion below.
- This is a verified local entry-point fix, not certification of the entire platform.

### Completion checks

Final `bash scripts/ci.sh`: PASS — typecheck, state budget, route inventory, lint,
then **212 hermetic files / 2,886 tests passed**. The hermetic run used the script's
nonexistent local database URL, so the new page regression requires no database.
Final `npm run build`: PASS — compiled with Turbopack, typechecked, generated routes;
local pipeline explicitly skipped database migration and seed.
Both ran with the 6 GB Node heap execution setting above.
