# Verification and field acceptance

All thresholds in this file are proposed engineering acceptance targets [D]. Host tests in evidence/host-tests.txt are actual software results; all bench/field tests below are NOT RUN. Retain raw records and instrument traces. Use P1 for electronics, P2 for mechanical qualification, P3 for integration; do not place living colonies on destructive mechanical tests.

| Test | Method | Provisional pass criterion |
|---|---|---|
| Pinout | Continuity against WIRING; inspect voltages before attaching boards | No 5 V on RP2040 pins; all nets match approved drawing |
| Radio supply | Scope VMODEM/VIO at weak-signal registration/transmit and low pack voltage | Remain within exact delivered board requirements; no reset; pulse rating margin documented |
| Host-off | Measure whole pack-terminal current across 24 h with instrument capable of capturing radio peaks | Measured budget supports selected service interval with 30% reserve; no unexplained back-power |
| HX711 | Logic analyzer 25 clocks/sample, ready disconnect, known loads | Clock high stays below power-down threshold; timeout bounded; signed samples correct |
| I2C containment | Short SDA on each branch separately, remove probe, corrupt CRC | Other branches and local journal work; failed values null with fault, never plausible substituted values |
| Audio | Known digital pattern plus acoustic stimulus, timing trace | Correct channel/sign/bit alignment; RMS responds; bounded timeout and deinit; no PIO conflict |
| Accelerometer | Six static orientations and repeatable tilt | Orientation error ≤3° after alignment; movement appears in sampled interval; no continuous-detection claim |
| Battery | Calibrated meter over intended pack range | Error ≤50 mV after gain calibration; divider truly disconnected while off |
| Temperature/RH | Compare traceable reference at three expected conditions after equilibration | Temperature ≤0.5°C; RH ≤5 percentage points including enclosure effects |
| Pressure | Reference at same altitude | ≤150 Pa after reference alignment; no invented sea-level conversion |
| Light | Compare repeatability/reference under three light levels | Monotonic, ≤10% repeatability; document window attenuation; not a PAR sensor |
| Weight | 0,20,40,80,120 kg gross plus unload and corners at approved safe loads | ≤0.2 kg error/repeatability target, return-to-zero ≤0.2 kg; evaluate creep at 1/24 h and temperature |
| Mechanical | Approved load fixture, corners, stop travel, wet tray and sustained load | Meets signed MECHANICAL criteria, no bypass/friction/cracking/permanent deflection; no overloaded test without rated fixture |
| Inspection | 100 open/close cycles including MCU off, bounce and reboot | Each interval with opening remains latched until durable commit; no false clear |
| Watchdog | Force stuck driver / loss of ATTN response | Reset within nominal 8 s WDT where not fed; recovery after three incomplete boots; powered fallback detected |
| Brownout | Slowly ramp and step supply through threshold | Predictable supervisor reset, safe rails; valid previous committed records remain readable |
| Power cuts | At least 100 randomized cuts across temp-write/sync/rename/ack/state steps on real board | No reused event ID; committed records preserved or acknowledged custody; corruption explicit; newest in-flight record may be lost |
| Capacity | Fill journal; corrupt one metadata copy then both; fill Notecard separately | No silent overwrite; full/corrupt state reported; both metadata copies invalid fail closed |
| Network | Seven-day outage then recovery, repeated messages and server 500/429 | Local sampling continues within capacity; duplicates idempotent; no deletion on UART timeout/error |
| Platform | Wrong tenant, unknown UID, replay/duplicate/conflicting ID, malformed/oversize payload | Rejected/isolated per API; commit before success; no cross-tenant data exposure |
| Soak | Seven-day bench, then 30-day protected field trial | ≥99% scheduled core observations accounted for as valid or explicit faults; no unexplained resets/data gaps; battery budget within measured reserve |

Hourly sampling plus ten-day nominal journal must be confirmed on actual flash partition. Off-grid service interval cannot exceed tested storage/energy reserve. Environmental testing must include condensation, rain ingress, solar heating, cable strain, insects/propolis and RF shadowing. Enclosure IP rating is not inherited by an assembly after drilling.

Video acceptance is separate in VIDEO_MICROPARCEL_EXTENSION.md. Do not claim biological validation from electrical tests.

Record template: test ID; date/operator; hardware/firmware/hash; instruments and calibration dates; setup; raw evidence filenames; expected/observed; PASS/FAIL/NOT RUN; deviation; reviewer; corrective action. Store signed results alongside immutable firmware release rather than replacing earlier failed records.
