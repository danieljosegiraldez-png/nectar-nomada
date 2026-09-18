# Field operation and service manual

## For the beekeeper

Install only a unit with signed load/power tests. Place the hive on a level approved stand. Keep total gross load within the marked working limit; set boxes down gently and never stand on the tray. Keep weeds, straps and propolis from touching both moving and fixed parts.

The unit samples approximately hourly. In the battery-saving cellular setup, dashboard data may arrive only once daily. A fresh-looking dashboard is not continuous monitoring, and notifications can be delayed by coverage. “Possible inspection” means the lid/contact changed; it does not prove a completed hive examination. Temperature/audio/weight alerts prompt an inspection, not a disease diagnosis.

Check daily that dashboard last measurement and last received times are reasonable, when platform integration is enabled. In standalone mode schedule USB exports before local storage fills: default count limit240samples (nominal10days hourly, potentially less if filesystem capacity is limiting). Set an initial weekly export/service routine until real retention and battery results are measured.

Log supers, feeding, harvest, treatments and sensor relocation as inspection events. These explain legitimate weight/temperature changes. Do not tare an occupied hive to make the number look plausible.

## Routine service

Before opening, record QR/device identity, installation/hive, last data received and symptoms. Remove heavy load using normal beekeeping procedures if working on structural parts. Disconnect battery before rewiring. Photograph corrosion/water ingress before cleaning. Check stop gaps and witness marks, drip loops, cable jacket damage, magnet alignment, optical window and sensor cages. Replace clogged membranes rather than solvents on sensor elements. Do not coat or scrape RH film or microphone opening.

Export and back up logs/config before firmware or calibration changes. Use SERVICE jumper and HOST_FORCE_ON. Keep device epoch unless intentionally resetting identity/history. Preserve calibration and device-to-hive assignment audit. After battery swap verify one complete cycle and known stable scale reading. Battery replacement does not require new tare.

## Troubleshooting

| Symptom | Action |
|---|---|
| All sensors missing | Check SENSOR3V3 and common ground, not five replacement sensors; inspect current-limit/short |
| One I2C branch missing | Inspect channel wiring/address; reset mux; test short cable; replace only that probe if failure follows it |
| HX timeout / saturation | Inspect separate VCC/VDD, DOUT/clock and load-cell wiring; no load/overload first; never swap by cable color without datasheet |
| Weight drifts/corner error | Remove mechanical bridges, inspect stops and mounts, compare temperature/creep; recalibrate only after load path repaired |
| Offline/unknown timestamp | Local records still meaningful but exact UTC unavailable; recover network time, keep original unknown quality |
| No cloud data | Check local outbox, Notecard queue and Notehub route separately; successful queue≠platform receipt |
| Battery drains in days | Look for USB/force-on jumper, failed host gate, repeated modem registration or UART fallback; measure total current |
| Host fails to wake | Select FORCE_ON; inspect ATTN/gate/battery; export diagnostic state. Do not repeatedly reset Notecard to hide the cause |
| LOGGING FAULT / full | Export before any purge. Do not format device or delete pending files blindly |
| Corrupt record/state | Copy whole filesystem, preserve bytes; technician validates/quarantines damaged record with explicit loss audit |
| Lid always open | Check magnet position and cable continuity; fault/open is fail-visible |

## Firmware service and recovery

Host updates are physical USB only for V1. Back up journal/config/runtime/state before update. Hold GP22 low, power through approved USB service arrangement, transfer reviewed release files, verify hashes, test with bench config, restore configuration, remove jumper/reset. A damaged main/boot file is recovered using BOOTSEL UF2 and restored backups. UF2 reflash/filesystem format behavior must be tested; do not assume it preserves files.

If a destructive reset is necessary, archive old records and generate a new epoch on the service computer. Record reason/data gap; never reuse acknowledged event IDs. Failed calibration: restore previous config and mark readings invalid until checked. End-of-service: disable Notehub sync, export, unassign device without moving prior hive history, revoke routes/claims, and dispose of pack through appropriate battery collection.
