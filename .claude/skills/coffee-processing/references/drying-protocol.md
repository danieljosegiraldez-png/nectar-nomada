# Drying protocol, lot records and troubleshooting

Contents: loading rules, schedule, measurements, lot record, troubleshooting, quality checks. Every number is a starting point; the user's logged lots override it.

## Loading

- Working depth: whole cherry up to about 3 cm in a 2.5 in (6.35 cm) deep tray leaves about 1.3 in freeboard. Thinner beds dry faster and more evenly; deeper beds need more airflow and turning.
- Weigh one filled tray to get bulk density instead of assuming it (`coffee-drying-control/scripts/sizing.py` shows the range, 400-650 kg/m3 across assumptions).
- Stagger lot starts. Loading all trays on one day maximizes the first-days water load; two or three start dates reduce the peak that dehumidifiers and ventilation must handle.
- Keep different processes and fermentation styles on separate racks or levels with their own labels, because they dry at different rates.

## Schedule (adapt to the process)

| Phase | What to watch | Typical action |
|---|---|---|
| First days, high water load | surface wetness, sweet or fermented smell, tray condensation | thin beds, high circulation, turn often, check humidity gate runs |
| Middle | steady mass loss | turn on schedule, weigh reference trays |
| Last days | slow tail, moisture equalizing | reduce airflow if drying too fast, consolidate trays |
| Rest | moisture and aw stabilize | bag or rest per the user's protocol, re-measure |

Typical total is 12-20 days depending on process. Judge by mass-loss curve, moisture and aw, never by the calendar alone.

> The user's own thresholds and meter details are in `nectar-nomada-integration.md` and win over the generic figures below.

## Measurements (per lot)

- Reference trays: weigh 2-3 marked trays per lot at a fixed time daily, same scale, tared tray. Plot mass vs time.
- Moisture meter and water activity (aw) at checkpoints and at the end. Ask the user for the aw acceptance range; treat it as their decision.
- Room logs at 10-60 s: T and RH at two heights, outside T and RH, CO2, mode, dehumidifier runtime, vent minutes. Compute AH and dew point at log time.

## Lot record fields

Lot code, cultivar, process and fermentation notes (links to tank records), initial mass, bed depth, tray count and rack positions, start and end times, turns, daily reference-tray masses, moisture and aw checkpoints, room mode summary, issues, final moisture and aw, sensory notes. Keep it in CSV or JSON so it joins the user's traceability system.

## Troubleshooting

| Symptom | Likely causes to check | Fix direction |
|---|---|---|
| Mold at the bed surface | bed too deep or too wet early, stagnant pockets, RH in room above target for days, temperature high | thin bed, raise circulation, verify the gate and dehumidifier output, remove affected cherries |
| Dehumidifier runs constantly, RH won't fall | leaks or open door, water load above capacity, unit derated by heat, drain blocked | seal, stagger lots, add a unit or AC dehumidify, check drain |
| Room temperature climbs | equipment heat in a sealed room, no AC | log it, reduce load or add cooling; insulate only with a cooling plan |
| Condensation on metal or walls | cold surface below dew point (AC, ducts, rack steel) | warm the surface, raise setpoint, seal, check `dew_point_c` |
| Uneven drying between levels or positions | airflow shadows, light and heat gradients | move or add circulation, rotate trays between levels |
| Fast surface drying, wet core | too much airflow or heat early, deep bed | lower airflow, thin the bed, rest and equalize |
| Frequent mode chatter or damper cycling | thresholds too tight, sensor noise | check `min_vent_on`, hysteresis, sensor placement |
| Controller reboots | brownouts, supply sag, watchdog | log boot events, add a UPS for the controller, check supplies |

## Quality checks before sign-off

Final moisture and aw in range, no off odors, uniform color, no visible mold, record complete, lot labeled and stored away from humid air.

## Sourced thresholds (researched Oct 2026; verify before treating as a requirement)

These come from web sources read in this project; some are trade or secondary sources. The user decides the acceptance range; do not present these as the user's own targets.

| Point | Value | Source |
|---|---|---|
| Moisture when drying is complete | 12 % (FAO); 12.5 % maximum to avoid OTA (Frontiers 2026 study); 10-11.5 % in that study's 40 C dried samples | FAO coffee drying/storage page; Frontiers in Plant Science 2026 (10.3389/fpls.2026.1734522) |
| Water activity at 10-12 % moisture | below 0.62 (400 Colombian samples) | Cenicafé article 1552 |
| Water activity optimal for green coffee storage | 0.45-0.55 (most stable about 0.50), about 10.5-11.5 % moisture | Sustainable Harvest study as reported by Daily Coffee News (2021) |
| Water activity "ideal" and soft limit for >6 months | close to 0.60 | Royal Coffee, green coffee analytics part I |
| Mold and yeast growth | about 0.61; mycotoxigenic molds lower limit 0.78 aw (Royal Coffee); OTA minimum 0.85 aw (about 20 % moisture) and aflatoxin 0.82 aw (Frontiers 2026) | as listed |
| Time in the high-aw window | no more than four days between aw 0.95 and 0.80 | Royal Coffee (secondary; underlying source not checked) |
| Highest-risk period for OTA fungi | first 3-5 days of drying for fresh ripe cherries; pulp-bearing (natural/honey) lots are more susceptible than washed | Barista Hustle citing Schillinger et al. 2010 and Huch and Franz 2014 |
| Rewetting | avoid at all times during and after drying | FAO |

Gaps: no source found that quantifies a "too fast" limit (cracking, case hardening) or a day-by-day moisture curve for natural and honey lots. Those limits have to come from the user's own logged lots.

Design implication: the early days of natural and honey lots are the danger zone, so the controller's job in that window is strong dehumidification with the dampers shut, thin beds and high circulation, then a slower, steadier decline once surface water is gone. A moisture-versus-day target curve is a user input; record each lot's measured moisture and aw against days so the curve can be built from data.
