# VPD framework and Raspberry Pi 5 companion pack (reviewed)

Source: the user's COFFEE_ENVIRONMENT_DOCUMENTATION.md (VPD framework, VCC-JDVCC diagram, BOM, Pi 5 Python loop). This file records what the skill adopts, what it changes and why. Contents: VPD, thresholds, what we adopt, problems found in the sample loop, Pi 5 notes.

## VPD in this skill

`VPD = VPsat(T) x (1 - RH/100)`, with `VPsat = 0.61078 exp(17.27 T / (T + 237.3))` kPa. It is implemented as `vpd_kpa` in `coffee-drying-control/scripts/controller.py` and logged by `scripts/pi_logger.py`.

VPD is a re-expression of T and RH at one temperature. Its value is that it normalizes RH across temperature, so a warm room and a cool room can be compared. Its limits:

- It describes the air only. The real drying force is the difference between the vapor pressure at the bean surface (set by the bean's water activity and temperature) and the vapor pressure of the air. Use aw and the mass-loss curve for the bean side. The claim that VPD measures "moisture extraction pressure on the cellular walls" is a simplification; label it that way.
- It cannot say whether outside air would help. That needs the inside-versus-outside comparison in absolute humidity (`ah_gm3`), which the controller uses for ventilation.
- A single fixed VPD target lets RH climb as the room warms. At a 0.95 kPa target the matching RH is about 54 % at 18 C, 64 % at 22 C, 72 % at 26 C and 75 % at 28 C. In a sealed room without AC that reaches mold-risk RH. Always keep an RH ceiling and an aw check alongside any VPD target.

## Threshold table (hypotheses, not verified for this user's coffee)

| Source row | Stated | Checked |
|---|---|---|
| Specialty coffee cold cure, 15.5-20 C, 55-60 % RH, VPD 0.85-1.05 kPa | from the document | recomputed: 20 C/55 % = 1.05; 18 C/58 % = 0.87; 15.5 C/60 % = 0.70 and 15.5 C/55 % = 0.79, so the low end of the stated VPD window is not reached at 15.5 C |
| Cannabis drying row | from the document | not a coffee setpoint; its methods are used in cross-industry-practices.md |
| Cacao convective phase 45-55 C | from the document | a different process (heated); its method lessons are in cross-industry-practices.md |

Treat the coffee row as a starting window. Ask the user whether it comes from their own trials or a source, and let their drying curves and aw results set the final window.

## What the skill adopts

- VPD as a logged and displayed metric, and as an optional comfort band for the user's own targets.
- The JD-VCC isolation diagram and the BOM (2-pole 25 A inductive contactors, SHT45, IP65 sensor cap, spring-return gasketed dampers, RTC), which match the skill's electrical rules.
- Continuous circulation, the 300 s anti-short-cycle, and fail-toward-sealed behavior.

## Problems found in the sample Python loop (fix before use)

1. **Dehumidifiers run with the dampers open.** Case A starts both compressors and opens the exhaust and intake at the same time. With 90 % RH outside air that imports moisture and fights the dehumidifiers. Dehumidify with the dampers shut, and ventilate only when outside air is drier in absolute terms (`RoomController` does this).
2. **No restart wait after boot.** `last_dehumidifier_toggle` starts at 0, so after a power cut the compressors can start the moment the script runs. Treat boot as a compressor stop (done in `RoomController`).
3. **Boot-time relay state.** Setting pins HIGH inside the script comes too late: before the script runs, Raspberry Pi GPIOs sit at their default pulls (per Raspberry Pi documentation GPIO 0-8 pull up, 9-27 pull down; verify on your board). On an active-low relay board a pulled-down line means relay ON, so contactors can energize during boot. Fix: external pull-up resistors (about 4.7-10 k to 3.3 V) on each relay input, or a relay board with a defined default-off state. A reboot or crash that releases the pins has the same hazard, so the script must not rely on `GPIO.cleanup()` for a safe state.
4. **Sensor fault leaves outputs unchanged.** On a failed read the loop sleeps and continues, so a running dehumidifier keeps running indefinitely. A fault should go to the sealed safe state with an alarm. Reads also lack CRC and stale or jump checks (`SensorGuard`).
5. **`RPi.GPIO` does not support the Raspberry Pi 5.** Use `gpiozero` or `lgpio` (or the `rpi-lgpio` compatibility package).
6. **I2C read pattern.** `read_i2c_block_data(addr, 0x00, 6)` sends a command byte 0x00 before reading, which the SHT4x does not define; use a plain 6-byte read (`i2c_msg.read`) after the 0xFD command and check both CRCs. Verify on the bench.
7. **Single sensor, no outside data, no CO2, no rain.** The loop cannot tell when ventilation would help or when CO2 needs a purge.
8. **Tight hysteresis.** A band of +/- 0.05 kPa is about 2 %RH at 20 C. The compressor lockout limits the damage, but the logic will sit at the edge of the band.

## Using a Pi 5 as the controller

The user's chosen split is an ESP32 that controls plus a Pi that logs, because the ESP32 boots in a fraction of a second, has hardware watchdog behavior and no SD card to corrupt, and keeps working when the Pi is down. A Pi 5 can still be the controller: `coffee-drying-control/scripts/pi5_main.py` wraps `RoomController` with a gpiozero hardware layer. It is untested on hardware. If you use it: fit the pull-ups, power the Pi from a UPS or a battery-backed supply, use the hardware watchdog (`dtparam=watchdog` / systemd `RuntimeWatchdogSec`), run it as a systemd service with `Restart=always`, and treat a reboot as a compressor stop.
