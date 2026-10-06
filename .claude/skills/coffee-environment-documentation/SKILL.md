---
name: coffee-environment-documentation
description: How the Nectar Nomada dark room and solar room are measured, logged and documented - sensor choices (SHT45/SHT31, CO2, outside probe), absolute humidity, dew point and VPD definitions, the ESP32 controller plus Raspberry Pi logger design, the Pi 5 option, daily CSV logs, the environment record the platform should receive, and the archive of the user's source documents. Use this skill whenever the user asks what to log, how to document an environment, how room readings reach the beneficio module, what a sensor or log field means, how VPD relates to RH, how to review the user's Raspberry Pi or ESP32 scripts, or how to build the environmental layer of the platform, even if they do not say "documentation".
---

# Coffee environment documentation

The platform's spec has an environmental layer with no models yet. This skill defines what the room measures, how it is stored, and what the platform should receive, so the room's behavior can be explained to a lot owner months later.

## Definitions (use these exact meanings)
- **Absolute humidity (AH, g/m3)** and **dew point** decide ventilation: `ah_gm3`, `dew_point_c` in `coffee-drying-control/scripts/controller.py`.
- **VPD (kPa)** is logged, never the control variable. A fixed VPD lets RH rise as the room warms (0.95 kPa is about 54 % RH at 18 C and 72 % at 26 C). See `references/vpd-and-pi5-companion.md`.
- **dAH** is inside minus outside absolute humidity: positive means outside air is drier and ventilation can help.

## What to log (and why)
Read `references/environment-record.md` for the field list the room should send per sample and per event, with the reason for each field. In short: every sample carries time, inside and outside T and RH, derived AH, dAH, dew point and VPD, the controller mode, the state of each output, CO2 and rain when present, and any fault; every approval request, escalation and protective action is an event with who and when.

## Tools
- `scripts/pi_logger.py`: receives samples from the controller over HTTP, adds derived fields, writes one CSV per day, `report` summarizes time in each mode and dehumidifier hours. Control never waits on it.
- The controller and I/O layers are in `coffee-drying-control`.

## When reviewing the user's scripts
Compare against `references/source-docs/README.md` first; it lists what was kept and what was changed from the user's Raspberry Pi loop and why (venting on low VPD, simultaneous compressor starts, no boot wait, no failsafe, `RPi.GPIO` on the Pi 5, no CRC). Source documents are archived under `references/source-docs/`.

## Rules
- Quote the source for any threshold; label estimates.
- Logs must survive power cuts: write whole rows, keep the controller state machine independent of the logger, and mark gaps instead of filling them.
- Never log or display a value the sensor guard rejected as if it were good; log the rejection.
