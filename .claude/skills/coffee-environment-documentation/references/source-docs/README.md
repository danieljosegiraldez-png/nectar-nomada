# Source documents and where each one lives in the skill

| Document | Status | Where it is used | Differences the skill makes on purpose |
|---|---|---|---|
| COFFEE_PROCESS_METASKILL_v1 | merged | SKILL.md identity, Panama baseline, dark room and solar room, guardrails | target moisture 11-12 % superseded by the user's platform (10.0-11.5 %, cut-off 11.0) |
| COFFEE_PROCESS_METASKILL_v2_with_loop | reviewed, not deployed | fermentation matrix (references/fermentation-and-solar-room.md), loop reviewed in vpd-and-pi5-companion.md | see table below; cacao, cannabis and Cropster/RedEarthOne are used as practice guidance, not setpoints: see ../cross-industry-practices.md |
| COFFEE_ENVIRONMENT_DOCUMENTATION | merged | vpd-and-pi5-companion.md, electrical-safety.md | VPD kept as a logged metric, not the control variable |
| COFFEE_DRYING_SKILL | merged | the three compulsory principles are SKILL.md Module 1/2 | see principle B and C notes |
| DRYING_ROOM_AUTOMATION_PRD | merged (truncated paste) | BOM in electrical-safety.md and vpd-and-pi5-companion.md | |

## Changes from the v2 loop and why
| v2 loop | Skill controller | Reason |
|---|---|---|
| Control variable: VPD 0.95 +/- 0.05 kPa | RH target with hysteresis, inside/outside absolute-humidity gate, VPD logged | fixed VPD lets RH climb as the room warms (0.95 kPa is 54 % RH at 18 C, 72 % at 26 C) |
| Low VPD opens exhaust and intake with the dehumidifiers | vent only if outside air is drier by >= 2 g/m3 and not hotter than inside + 2 C | Panama outside air is usually wetter; venting would import water and heat |
| Both compressors start at once, `last toggle = 0` allows an instant start after boot | 30 s stagger, boot counts as a compressor stop (300 s wait) | start-current spike; power-restore chatter |
| Dehumidifier only toggles on VPD thresholds, 300 s applies to the toggle | min off 300 s before any compressor start; vents have their own min on/gap (600 s) | protects the compressor where it matters (restart) |
| Sensor failure: `continue`, outputs stay as they were | FAILSAFE mode: compressors off, dampers closed after fan stop | a stuck-on dehumidifier or open damper is the dangerous state |
| `RPi.GPIO` | gpiozero / lgpio, or ESP32 as the controller | RPi.GPIO does not support the Pi 5 |
| No CRC check on the SHT4x read | CRC8 on both words | corrupt reads must not drive relays |
| Single sensor | inside + outside sensors, optional CO2, rain | the gate needs outside air |
| No power-restore logic | outputs boot OFF, boot guard | brownouts are normal in Panama |

## Notes on the compulsory principles
- Principle B (300 s): the skill enforces it on every compressor start after a stop and on boot, inside `RoomController`, not in a loop that can skip it. The user's wording is 'between state changes'; the code guards the restart (the damaging direction) and has no minimum run time for compressors, so add one if wanted.
- Principle C (dampers never open without fan power): the skill opens the damper first, then starts the fan after 10 s, and on stop turns the fan off and closes the damper after 30 s. With spring-return dampers a short overlap is needed so the fan never runs against a closed damper; the user's wording "synchronous" is met by driving damper and fan from the same decision, not by the same instant. Confirm the damper type (spring-return motorized vs. gravity backdraft) before wiring.
