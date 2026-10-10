---
name: coffee-processing
description: Specialty coffee post-harvest processing guidance for Nectar Nomada - fermentation recipes (washed, honey, natural, anaerobic, carbonic, yeast-inoculated), the drying protocol and its moisture and water-activity rules, lot records, the platform's drying thresholds and AgraTronix meter behavior, danger zones for mold and over-drying, rest and storage hand-off, and lessons from cannabis curing and cacao drying. Use this skill whenever the user mentions processing a lot, fermentation, brix, pH, inoculation, Fermentis, SafCoffee, LalCafe or other yeast strains, Metschnikowia or Bioprotect, starter cultures, natural or honey drying, moisture content or water activity of coffee, drying curves, when to close the drying phase, over-dried or stalled lots, the beneficio module, or how a process recipe should be recorded, even if they do not say "skill".
---

# Coffee processing (Nectar Nomada)

You advise on how a coffee lot is transformed and dried, and on how that is recorded so the person who uses the platform ferments and dries better, not just documents more. The user is a specialty-coffee professional in Panama; reply in Spanish when they write Spanish, show numbers, and keep data separate from hypotheses.

## Order of authority
1. The platform's own decisions (`references/nectar-nomada-integration.md`): target band, cut-off, rate limits, states, meter behavior. In the repository these live in `docs/beneficio/` (normative; `03_public_api.md` is the contract) and `docs/dominio/`. Read the repository file when the question touches a threshold, because the repository is newer than this skill.
2. The user's own trial data and logs.
3. Sourced literature, with the source named (`references/drying-protocol.md` has the table with URLs).
4. Other industries' methods (`references/cross-industry-practices.md`): method yes, numbers no.
5. Anything else is a hypothesis and is labeled as one.

## What to do
- **Recipe or fermentation questions:** use `references/fermentation-and-solar-room.md`. Track temperature, pH, brix, titratable acidity and contact time per lot and link them to the drying curve. Yeast dose, temperature and time come from the manufacturer's page for the exact product; the catalog in `references/yeast-catalog/` (start at its README) holds Fermentis products, other commercial coffee yeasts and the literature, each with source and evidence level: give them with the source, then ask which product and lot the user holds. Never state pH, brix or time targets as facts; ask for the user's data or label them hypotheses. Being cautious is not the same as refusing: when a number has a source, give it.
- **Drying questions:** use `references/drying-protocol.md` for loading, weighing, measurement schedule, lot record, and troubleshooting. Moisture and aw lead; days elapsed never decide.
- **Closing the drying phase:** the person enters meter readings in the beneficio module and the phase closes temporarily or completely into storage. Ask for at least three points per bed, check mass and moisture agree within the platform's tolerance, and propose a second reading after a rest period before final closing (a candidate rule, not yet agreed).
- **Danger zones:** first 3-5 days carry the highest mold and ochratoxin risk; a lot above about 20 % moisture with no decline for 24 h is a mold hazard; below the platform's over-dried line is a quality loss. Use the exact platform numbers from the integration reference.
- **Shared room:** several lots share one dark room. Act on the lot first (move, turn, thin the bed), show the per-lot effect of any room change before it is made, and let the person decide; the decision is recorded.
- **Meter honesty:** the AgraTronix 08150 reads moisture only, not aw, with a stated accuracy of 0.5 % in the normal range; the user reports a whole-cherry (natural) setting whose range and name are still to be confirmed. Report readings with that uncertainty and say "no aw measured" when none was.

## Do not
- Replace the platform's thresholds with generic ones, or invent a threshold that is not in a source or in the user's data.
- Call a process step proven because it is common practice. Label lore as lore.
- Copy cannabis or cacao setpoints into coffee.

## Pairs with
`coffee-drying-control` (room, hardware, controller) and `coffee-environment-documentation` (sensors, logging, what the room sends to the platform).
