# Néctar Nómada beneficio module: decisions the room must respect

Source: the user's repository `nectar-nomada-package` (read on the user's computer, Oct 2026): `docs/beneficio/13_drying_moisture.md` (v3.1, thresholds marked PROVISIONAL), `docs/dominio/agratronix-coffee-tester-08150.md`, `docs/architecture/DECISIONS.md` (ADR-181, decisions 17-18 and 19-20), and `docs/superpowers/specs/2026-09-15-muestra-y-topologia-de-secado-design.md`. These are the user's own decisions. Where they differ from a number elsewhere in this skill, they win. Contents: moisture instrument, drying parameters, kinetics rules, shared-environment rule, what the platform lacks, open items.

## The moisture instrument

AgraTronix Coffee Tester, ref. 08150 (catalog text quoted in the repo): measures green and parchment coffee; range green 7-35 %, parchment 8-38 %; use 0-45 C; repeatability and accuracy +/-0.5 % "in normal moisture range for stored grain"; resolution 0.1 %; capacitive; shows a running average. Consequences:

- Green and parchment scales differ; every reading records which was used. For drying use the parchment scale.
- It does not measure water activity. Finished is declared by moisture and marked "sin actividad de agua medida" until an aw meter exists.
- The user states the meter has a setting for whole cherries (cerezas, natural process). The repo's catalog extract lists only the green and parchment ranges and says there is no scale for husk (cascara), which is a different thing from whole cherry. The whole-cherry range and mode name are not recorded in the repo: open item.
- +/-0.5 % applies in the normal moisture range, not the whole range; the tolerance accepted near a recipe target is not yet defined.
- There is no husk (cascara) scale. Parchment readings only exist inside 8-38 %; a reading outside the range of the selected scale is not usable. Natural lots use the whole-cherry setting; its range must be taken from the manual or the instrument.

## Drying parameters (user's decisions; thresholds come from the recipe, provisional)

| Parameter | Value | Emitted state |
|---|---|---|
| Target moisture (parchment) | 10.0-11.5 % wet basis; recommended cut-off 11.0 % | TARGET_REACHED |
| Over-dried | below 9.5 % | OVER_DRIED |
| Water activity for storage | 0.60 or lower (needs an aw meter; none yet) | stability criterion |
| Max bean temperature (mechanical drying) | 40 C | BEAN_TEMP_EXCEEDED |
| Max rate of decline, falling-rate phase only | 2.0 percentage points per day | RATE_TOO_FAST |
| Dangerous plateau | moisture above 20 % with no decline for 24 h or more | STALLED_MOLD_HAZARD |
| Minimum rest in parchment before milling | 30 days (recipes now set their own; suggestions: washed 60-90 days, natural Catuai 45-60) | RESTING to MILLED |

The band closes at 11.5 %, not 12.0 %, because parchment near 12 % typically sits at aw 0.62-0.68. 12-12.5 % is a commercial limit, not the stability criterion. Without a recipe the engine gives no verdict.

## Kinetics rules the room must not fight

- Constant-rate phase (above about 25 % moisture): high decline rates are normal. Falling-rate phase (below about 25 %): forced drying risks case hardening, where the surface seals, the core stays wet, the meter reads low and false, and mold appears in storage weeks later. Apply the rate limit only in the falling-rate phase.
- Rate is the 24 h moving mean against the preceding 24 h moving mean, in points per day. Overnight moisture regain in parchment is normal.
- Moisture-mass cross-check: expected wet mass = dry matter / (1 - current moisture/100); a divergence above 3 % between weighed and expected mass raises MOISTURE_MASS_INCONSISTENT. It is the only automatic defense against case hardening.
- Sampling: at least three points per bed (two ends and the middle, mid-depth), evaluate the mean, flag UNEVEN_DRYING when the range (max minus min) exceeds 1.5 points.

## Shared environment (decision 17)

Drying is a shared environment. The recipe sets the targets, subject to capacity and weather. When a lot lags, act on the lot first (move a tray, use a fan). If a change to the room is proposed (for example dehumidifying), show its effect on every lot before deciding: "we cannot sacrifice the others for one." A person decides, and who and why is recorded.

User's answer (Oct 2026): a mix. The room holds its configured limits automatically. Below a certain level of action it acts alone; if conditions change, more drastic actions and changes to device settings need approval. Which actions count as drastic, the level, and who approves are not yet defined; do not invent them. Per-lot effect is shown before a room-wide change, and who decided and why is recorded.

## Workflow around the controller

A person enters the daily moisture reading in the Néctar Nómada beneficio module during the drying phase, once the beans are inside the meter's range. The reading is used to close the drying phase, temporarily or completely, and move the lot to storage. The platform is where lot state, recipe thresholds and the assessment live; the room controller is the environment layer.

## What the platform lacks (from its own spec)

The environmental layer has zero models: no source, no sensor, no deployment, no time series. The spec states that the dark room with AC and dehumidifier needs it entirely. Separate rows for environment (humidity attached to the facility) and grain (humidity attached to the sample). Facilities have `drying_facility`, beds have `rackLevel` for dark-room levels, and `dryingEnvironment` includes "cuarto oscuro con control climatico". Any integration should feed environment readings to that layer rather than invent a parallel store.

## Open items recorded in the repo or found here

- Real mode names of the user's meter (to seed instrument modes), including the whole-cherry mode.
- Tolerance accepted near the recipe target given the +/-0.5 % specification.
- aw meter not yet owned, so TARGET_REACHED stays "sin actividad de agua medida".
- Whole-cherry (natural) setting: range and mode name not recorded in the repo.
- Which room actions are routine (automatic) and which are drastic (approval), and who approves.
- The user said 15-40 days for a lot (earlier 12-20 days in this project); the recipe fixes the window.
