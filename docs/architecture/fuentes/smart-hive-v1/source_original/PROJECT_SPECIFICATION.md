# Project Engineering Specification: Smart Hive Node
**System Identification:** Ultra-Low-Power Cellular Hive Scale & Climate Monitor  
**Target Deployment Context:** Standalone remote apiary installations lacking localized network gateways.

---

## 1. System Engineering Blueprint & Power Strategy

Standard microcontrollers running continuous operating loops exhibit high parasitic current draws that deplete battery arrays in days. This architecture forces the device into a strict **Hardware-Level Deep Sleep Loop governed by an internal Real-Time Clock (RTC) Interrupt** to minimize standby consumption.

### Operating States & Power Profiling
1. **State 0: Deep Sleep (Duration: 59m 58s)**
   - Microcontroller enters deep sleep standby draw (~20µA).
   - Sensor power lines, HX711 operational rails, and Cellular modems are completely isolated via MOSFET gates (0mA draw).
2. **State 1: Sensory Logging (Duration: <2s)**
   - System wakes up via RTC timer match.
   - GPIO 14 drives high to connect sensor VCC power bus.
   - SHT31-D queried via I2C; HX711 raw registers read via digital lines.
   - Log block structures stored directly to local Flash ROM.
   - GPIO 14 drops low; system falls back to State 0.
3. **State 2: Cellular Transmission (Duration: ~30s, Every 24 Hours)**
   - Triggered strictly within a scheduled time block.
   - GPIO 15 drives high to fire the cellular modem rail.
   - The modem establishes its network handshake with local tower providers.
   - JSON array is compiled, synced via cellular webhook, and memory arrays are cleared.
   - GPIO 15 drops low; cellular modem returns to complete isolation.

---

## 2. Comprehensive Bill of Materials (BOM)

- **Logic Engine:** Raspberry Pi Pico WH. RP2040 Dual ARM Cortex-M0+, native deep sleep routines, 2MB onboard Flash, integrated RTC tracking. ($6.00 – $8.00)
- **Cellular Modem:** Blues Wireless Notecard. LTE-M / NB-IoT narrow-band IoT module. Native asset payload batching, embedded 10-year global prepaid data plan. ($49.00 – $60.00)
- **Weight Transducer:** TAL203 or GPB144R. 100kg–150kg single-point parallel beam load cell. Built-in internal off-center load compensation. ($10.00 – $14.00)
- **ADC Amplifier:** HX711 Breakout Board. 24-bit high-precision analog-to-digital converter designed explicitly for weigh scales. ($3.00)
- **Climate Suite:** Sensirion SHT31-D. Digital I2C interface. High accuracy (±2% RH, ±0.2°C) with low calibration drift over outdoor exposure. ($10.00 – $14.00)
- **Power Plant:** 2x 18650 Li-Ion Cells. 3.7V nominal, wired parallel (~6800mAh capacity) managed by a TP4056 protective charge circuit. ($15.00 – $20.00)
- **Enclosures:** Custom Fiberglass. Low-weight, RF-transparent structural composite layout (provided by project partner). ($15.00 – $20.00)

**Total Estimated Hardware Cost:** $90.00 – $134.00 (One-time direct hardware baseline. Software cloud tiers are free.)

---

## 3. Hardware Interconnect & Pin Mapping

### Pin Assignment Mapping
- **I2C0 Communications (SHT31-D Probe):** `GPIO 4` (SDA), `GPIO 5` (SCL)
- **Weigh Scale ADC (HX711 Interface):** `GPIO 12` (Data Output - DT), `GPIO 13` (Serial Clock - SCK)
- **Cellular Serial (Blues Notecard):** `GPIO 0` (TX), `GPIO 1` (RX)
- **Power Rail Control Gates:** `GPIO 14` (Sensors/ADC Bus Gate), `GPIO 15` (Cellular Modem Bus Gate)

---

## 4. Mechanical & Fiberglass Housing Blueprint

To track weight data collection without changing the working height of the brood boxes or compromising the existing hive stand layout, a low-profile, integrated **Floating Base Tray** design is used.

### Fiberglass Molding Engineering Specifications
1. **RF Transparency Preservation:** The housing protecting the cellular module must utilize zero metallic foil sheets, carbon-fiber composites, or graphite-based texturing. Fiberglass is naturally transparent to RF, ensuring the internal flexible PCB cellular antenna can easily connect to network towers from completely inside the frame.
2. **Structural Rigidity Profiles:** The upper moving rim and the lower floor tray require integrated, high-stiffness structural ribs. If the fiberglass warps, twists, or bows under a heavy 3-super load (~90kg), the structural shift misaligns the strain gauges, causing major calibration errors.
3. **The 2mm Eccentric Safety Bumpers:** Mold small internal bumpers at the four outer corners of the lower tray, leaving a precise **2mm clearance air gap** below the top plate under standard static load. Under extreme wind conditions, the plate shifts 2mm and rests securely on the corner bumpers, stopping lateral forces from damaging or snapping the central beam sensor.

---

## 5. Environmental & Biological Protections

- **The Propolis Isolation Cage:** Honeybees treat exposed electronics as an intrusion, coating components in propolis (bee glue). This ruins relative humidity sensing films. The inside-hive SHT31-D probe must be housed within a fine-mesh, breathable screening cage right beneath the screened bottom board out of reach of the bees.
- **Dual Climate Reference Sampling:**
  - *Internal Hive Probe:* Placed directly under the bottom mesh screen to read the heat and moisture venting down from the cluster.
  - *External Ambient Probe:* Mounted flat to the exterior bottom plate of the electronics box hung under the stand, providing accurate shaded weather references unaffected by direct sunlight.
- **Condensation Management:** All cabling exiting the tray or hive bodies must follow a sharp, downward **drip loop** before entering the liquid-tight nylon cable glands on the main electronics box, ensuring water cannot track inside the enclosures.

---

## 6. Target JSON Sync Transmission Payload Structure

When the 24-hour window arrives, the buffered local history is dumped into an array configuration matching the following schema block:

```json
{
  "device_id": "hive_node_alpha_rp2040",
  "battery_voltage_mv": 3942,
  "sync_timestamp_utc": "2026-09-16T00:00:00Z",
  "data_points": [
    {
      "ts": "2026-09-15T01:00:00Z",
      "w_raw": 245610,
      "t_int_c": 34.2,
      "h_int_pct": 64.8
    },
    {
      "ts": "2026-09-15T02:00:00Z",
      "w_raw": 245590,
      "t_int_c": 33.9,
      "h_int_pct": 65.1
    }
  ]
}
```
