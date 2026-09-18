# Engineering specification — V1-P1 / firmware 1.0.0-rc1

## Evidence convention and precedence

**[O]** original attachment; **[R]** newly researched manufacturer information; **[D]** design decision or analytical assumption; **[U]** unresolved / requires measurement. Current user scope overrides the old code. This document and WIRING.md supersede the original pin/power scheme; SOURCE_RECONCILIATION.md records differences. Research date: 2026-09-16. No supplier has endorsed this assembled design.

## Requirements and implemented behavior [D]

Hourly cold-start capture of scale, brood and ambient climate, pressure, ambient light, acceleration and acoustic features; battery and inspection status every cycle. All readings carry raw observations where practical, units, calibration/configuration versions and faults. Acoustic/vibration windows are short snapshots, not continuous monitoring. No swarm, queen-status or disease diagnosis is claimed from these features.

Three identical prototypes: P1 bench/power and firmware fault testing; P2 mechanical/environmental testing using inert loads; P3 field pilot only after electrical and load-path release. Firmware defaults to offline and powered bench mode. Field power-off is enabled only after the actual host gate and isolation tests pass.

Sensors: ANYLOAD 108MA-150kg candidate + SparkFun SEN-13879 HX711 at 10 SPS, two SHT31 modules, BMP390, ADXL345, BH1750, ICS-43434 prototype microphone, switched ADC divider and reed contact with always-powered event latch. Use a non-wireless Pico H SC0917. Notecard candidate NOTE-MBGLN (ordinary, **not XP**) + CARR-A v2.3. See BOM for purchase holds and production changes.

## System boundary

```
Protected 1S pack -> fused battery distribution -> always-on Notecarrier/Notecard
                                             -> ATTN-controlled host switch -> Pico VSYS
Pico 3V3 -> sensor switch -> mux, digital sensors, mic, HX711 digital VDD
Battery  -> scale boost-input switch -> 5V boost -> HX711 analog VCC
Battery  -> divider switch -> 100k/100k -> ADC26
AON 3V3 -> reed conditioning + event latch -> isolated host inputs
```

The host switch must cut VSYS, not merely RUN. USB can bypass power-off; disconnect it for power testing. The Notecard AON regulator is not supplied from Pico 3V3. All cross-domain lines require partial-power-down protection. See WIRING for exact nets and defaults.

## Operating sequence

1. Hardware pulldowns and `boot.py` hold sensors/divider off. GP22 service jumper prevents application start and watchdog activation.
2. Validate local config/identity epoch. Reserve a durable boot counter. Read Notecard time if available; otherwise `ts=null`, never invent wall time.
3. Read battery and inspection. On unsafe/unknown battery skip high loads; shut off future Notecard sync when UART works. Hardware pack protection is the final undervoltage guard.
4. Energize sensors, wait 500 ms, discard first two HX conversions, take 15 readings, then sample each isolated I2C branch and audio. Each operation is bounded. A failed sensor produces null and a fault, not a repeated stale value.
5. De-energize sensors in `finally`; reserve event sequence and atomically commit a checksummed observation. Clear the inspection latch only after durable logging and only with lid closed.
6. Optional delivery transfers up to 8 backlog records per wake to `hive.qo`. Delete each local pending record only after its matching, error-free response. An uncertain acknowledgement can produce duplicate delivery, resolved by immutable `event_id` at ingestion.
7. Flush filesystem. `card.attn` sleep controls only host power. If it fails, use a powered, watchdog-fed timed wait and retry next cycle. This has no low-power lifetime guarantee.

## Fault boundaries and availability

| Fault | Containment / outcome | Residual limitation |
|---|---|---|
| Shorted I2C branch | SoftI2C clock timeout; hardware mux reset isolates branch; continue others | Common sensor-rail short can take all sensor channels down |
| HX711 never ready | PIO transfer bounded by Python deadline; stop state machine, rail off | Physical timing/PIO qualification required |
| Audio stalled | Async capture deadline, deinit I2S, rail off | Firmware API compatibility must pass on pinned UF2 |
| Modem unavailable | Local outbox retained; no modem rail cycling | Host may remain in high-power fallback |
| UART stale response | Unique persistent boot-seeded IDs, discard mismatched responses | Losing both counter snapshots is service-required |
| Notecard queue full | Error response leaves local record pending | Finite storage eventually fills |
| Local log full | Do not overwrite untransferred records; increment durable missed counter | New readings cannot be preserved indefinitely |
| Corrupt record | Stop export/delivery at that record; retain evidence | Technician quarantine/recovery required |
| Brownout | Supply supervisor holds RUN; atomic files and redundant metadata | Last in-flight sample can be absent |
| Repeated WDT resets | 3 incomplete boots trigger one reduced-load recovery cycle | Corrupt boot/import code needs physical service |
| Jammed lid or lost magnet | Open state is reported as possible inspection | Cannot distinguish inspection from broken cable |
| Complete battery loss | Existing journal survives where storage remains intact | Offline wall time is unknown until re-established |

The 8 s internal watchdog is fed during bounded I/O waits; no handler may feed it forever outside an explicitly timed fallback. No code asserts Notecard reset. No chip-internal brownout claim substitutes for supply measurements. Data-loss boundaries and flash wear are detailed in FIRMWARE.md.

## Expansion reserved [D]

GP2/3 = I2C1, GP8/9 = UART1, GP10/11 = auxiliary GPIO. Provide GND and separately fused/switchable expansion power; leave V1 connectors unpopulated/covered. Camera acquisition belongs on a companion MCU with its own memory/power budget; UART carries metadata/trigger/status, not an assumed raw camera stream. CO2 may use I2C1 or UART1 after voltage/inrush review. Entrance sensing uses GP10/11 counters with external conditioning, or companion firmware for continuous counting. Expansion cannot borrow the Notecard supply headroom without requalification. No fictitious camera/CO2 drivers are included in V1.

## Release model

This is a complete RC implementation and engineering plan. It is not a certified scale, sealed production device, or verified biological diagnostic. Production release requires all critical gates in OPEN_ITEMS and TEST_PLAN closed with real evidence. No previous $125 target overrides component qualification or measured cost.
