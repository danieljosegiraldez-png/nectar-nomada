# Firmware architecture, storage and release limits

## Target and modules

Target board RaspberryPi PicoH/RP2040, upstream MicroPython **v1.26.0 RPI_PICO** as a conservative initial qualification baseline. Pin a downloaded UF2 SHA-256 in the physical test report before deployment. This packet has not run on that UF2; Python API/PIO validation is an explicit gate. Re-test on any newer build. Do not load an ESP32, PicoW or Pico2 image.

| Module | Implemented responsibility |
|---|---|
| boot.py,board.py | Off defaults, rails, mux reset/selection, ADC, reed/latch and service jumper |
| hx711.py | Deterministic PIO25-clock channelA/gain128 read; nonblocking poll and bounded window |
| sht31.py | Reset/heater-off/single-shot conversion, both CRCs and raw conversion |
| bmp390.py | ChipID/trim read/forced conversion/status timeout and compensated pressure |
| bh1750.py | One-shot high-resolution lux and saturation rejection |
| adxl345.py | FIFO100Hz burst, means, AC RMS, tilt and clipping/overrun faults |
| microphone.py,audio_features.py | Async512ms mono burst after warmup; DC-corrected RMS, peak and clip count |
| calibration.py | Multi-point linear fit, negative polarity support, robust within-window filtering |
| storage.py | Bounded per-record journal, CRC, atomic replacement and redundant metadata |
| notecard.py | NDJSON UART, echoed request IDs, partial reads, timeout quarantine, queue and host sleep |
| config.py | Local-only allowlist/range validation; no executable remote configuration |
| main.py,compat.py | Orchestration, watchdog, recovery, time quality, alerts and powered fallback |

No fake readings, no TODO driver bodies, no `pass` placeholders. Catch blocks that skip invalid redundant metadata are intentional recovery. Desktop tests do not execute native machine/rp2 instructions.

## Time and sequence

`device_id` derives from hardware unique ID; `epoch` is a desktop-generated UUID assigned during commissioning. Reusing a device after a destructive journal reset requires a new epoch, preserving event uniqueness. Reserve sequence in **both** metadata slots before making a record visible; interrupted reservation can leave a harmless gap. Boot counter likewise uses two commits before seeding UART transaction IDs. `event_id=device_id:epoch:seq`. Do not infer delivery/order from UTC alone.

Notecard Unix seconds are used directly, avoiding MicroPython epoch differences. Unsynchronized/offline cold-start time is null. `boot` and `uptime_ms` establish partial ordering only; ticks can wrap, and no backend may synthesize exact collection time from receive time. The sample interval is sleep duration after work, not UTC-aligned exact hourly sampling. Work increases the period; test and record actual cadence.

## Flash/logging policy

Target LittleFS atomic rename; one checksummed JSON envelope per observation. Intermediate `.tmp` files are not treated as committed samples. Metadata is alternated with generation and CRC. Corrupt committed files halt draining to preserve evidence. Both invalid state slots cause service-required failure; never format or silently reset identifiers. Physical power-cut tests must establish the actual filesystem guarantees.

Default240records×≤2800bytes each gives672kB payload envelope budget, but per-file flash allocation/metadata increases actual consumption; maintain64KiB free. At hourly sampling, nominal count retention is10days. It is **not guaranteed** that every chosen UF2/filesystem partition can hold240records. Acceptance must fill the journal on the actual image and reduce capacity or increase storage if necessary. At5-minute sampling,240records cover20hours. When full, old pending data remains; new samples are missed and counted if metadata can still be written. Full filesystem/corrupt metadata can prevent even the counter from persisting; service telemetry and server missing-data alarms cover that residual.

At a2048-byte typical record, raw hourly payload is~17.9MB/year;1024-byte is~9MB/year. Actual erase wear includes filesystem blocks, metadata, boot/sequence reservation and deletion. Inspect flash chip/UF2 partition and specify endurance from its manufacturer; no“wear safe for10years” claim is made. Measure writes with a debug build and derive a5-year margin using real erase distribution. Larger flash and FRAM for counters are production options, not required-but-missing runtime drivers.

## Delivery guarantee

Firmware offers at-least-once transfer to Notecard custody: ack deletion is after matching ID and absence of `err`. A crash between accepted note and local delete results in a duplicate with the same event_id. A UART timeout quarantines transactions for the rest of the cycle, avoiding response confusion. No blind hub.sync loop or network power reset.

**A queued Note is not destination receipt.** Notehub route failures need server monitoring/replay; local outbox copies are removed after Notecard custody and cannot provide end-to-end archive. Before fleet release, verify Notehub retention/retry policy against the business requirement. If end-to-end acknowledgement is mandatory, retain local records until an authenticated application receipt or add a second archival store; this would be a specified revision, not existing behavior.

If cloud is disabled, never enqueue observations to a synchronizing file; records remain locally for USB export. Host sleep may still use the offline Notecard timer. With no Notecard/UART at all, fallback remains functional but consumes more power and reports unknown time. Toggling cloud off does not retract data already sent or currently in flight; disconnection procedure must verify `hub.get` mode off before moving/retiring device.

## Features and known limitations

Audio is normalized digital amplitude, not calibrated sound-pressure level. No raw audio leaves the node or is persisted. Continuous audio and frequency-band inference are not implemented or claimed. Accelerometer is a1-second100Hz snapshot; movement between samples is not generally detected. Inspection latch retains “one or more openings” but not counts/timestamps. Exact event timing and continuous motion wake require an AON sensing revision.

No host OTA code execution is exposed. Notecard firmware OTA is managed separately using Blues-supported operations and only during adequate power. Physical USB host updates are the released approach; see SECURITY_OTA.md. Config/calibration are changed in service mode, with preserved identity and backups. Local files are not a security boundary against physical access.
