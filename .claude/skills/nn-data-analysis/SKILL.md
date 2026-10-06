---
name: nn-data-analysis
description: Analysis of Nectar Nomada drying and environment data - drying curves (moisture over time, drying rate in percentage points per day, falling-rate phase), water activity, mass-moisture consistency, room logs, lot comparisons and trial design - with honest uncertainty and no invented numbers. Use this skill whenever the user asks to analyze, chart, compare or summarize drying readings, room logs, CSV exports from the logger, lot results, sensory scores against process, or asks whether a lot dried "too fast", "too slow" or "evenly", even if they do not say "data".
---

# Data analysis (Nectar Nomada)

## Principles
- **Truthful over impressive.** Every figure must be reproducible from the data; state n, the date range, and how missing values were handled. If the sample is too small to say anything, say so. A credible-looking number that cannot be defended is worse than none (this mirrors the repository's veracity rubric, `docs/beneficio/21_rubrica_veracidad.md`).
- **Respect measurement error.** The AgraTronix 08150 is rated 0.5 % in its normal range with 0.1 % resolution; the user reports readings within 0.5-0.7 % are acceptable there. Differences smaller than that are not findings. aw is not measured today; do not infer it from moisture without saying it is an estimate.
- **Platform rules first.** Target band, cut-off, over-dried line, rate limit and stall rule come from `coffee-processing/references/nectar-nomada-integration.md` and the repository; apply them as written, with the falling-rate caveat (the 2.0 pp/day limit applies only below about 25 % moisture).

## Standard analyses
1. **Drying curve per lot:** moisture vs days since loading, at least three points per bed, plotted with the meter's uncertainty band; add mass-based moisture as a cross-check (flag disagreement beyond the platform's tolerance).
2. **Rate:** pp per day between readings; flag stalls (no decline for 24 h above 20 %), too-fast periods, and over-dried lots.
3. **Evenness:** range across points in a bed; flag spread above the platform's limit.
4. **Room context:** join the room log by time: time in each mode, mean and range of T, RH, AH, VPD; dehumidifier hours; ventilation hours; compare a lot's decline to its room exposure without implying causation from one lot.
5. **Comparisons across lots:** only compare lots with a recorded process, density and room; show each lot's own curve, not just averages. Link sensory results to process variables as hypotheses until there are enough lots.

## Output
Lead with the finding and the number, then the evidence and its limits, then what would change the conclusion. Charts: one message per chart, labeled axes with units, uncertainty visible. Keep scripts alongside results so the analysis can be re-run; do not hand-edit data.
