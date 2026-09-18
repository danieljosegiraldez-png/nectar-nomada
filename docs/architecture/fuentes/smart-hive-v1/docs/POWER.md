# Power architecture and lifetime audit

## What research establishes [R]

Raspberry Pi's `pico_low_power` source reports about **0.95 mA from VSYS at 5.2 V** for a Pico dormant example; it also reports different values when supplied directly at 3V3. These are board/test conditions, not a guarantee for a Pico WH running arbitrary MicroPython. [Raspberry Pi source S01](https://github.com/raspberrypi/pico-sdk/blob/master/src/rp2_common/pico_low_power/include/pico/low_power.h). Bare-die sleep figures exclude regulator, flash, wireless device and breakout leakage; no bare-RP2040 figure is used as the assembled budget.

Blues' carrier guide specifies a modem rail capable of **750 mA sustained and short 2 A bursts**, and a separate logic-power allocation. [S02](https://dev.blues.io/datasheets/application-notes/notecard-carrier-design-guide/). The selected Notecard documentation calls for continuous power on both domains and distinguishes XP supply constraints; its mixed generic/XP voltage descriptions must be reconciled against the exact received SKU. [S03](https://dev.blues.io/datasheets/notecard-datasheet/note-mbgln/). Ordinary NOTE-MBGLN on supported CARR-A is the prototype candidate; XP is excluded. Do not transfer an idle-current figure from a legacy board to the full assembly.

MicroPython watchdog on RP2040 has a maximum timeout of 8388 ms. This implementation uses 8000 ms. The firmware does not claim a working timed dormant/RTC combination merely because `machine.deepsleep` exists. [S04](https://docs.micropython.org/en/latest/library/machine.WDT.html).

## Correct the original arithmetic

Original deliberately optimistic model: 6800 mAh / (0.020 mA × 24 h + 500 mA × 30/3600 h) = **1463 days**, before all other loads, battery aging and self-discharge. That is a mathematical upper estimate under the assumed currents, not an attainable guarantee.

It is also incorrect to apply 0.95 mA measured at 5.2 V directly to a 3.7 V battery. 0.95 × 5.2 = 4.94 mW. If an external 90%-efficient converter actually generated 5.2 V, battery-equivalent idle current would be 4.94/(3.7×0.9) = 1.48 mA. That example costs about 35.6 mAh/day before sensing/radio; it does **not** measure a directly battery-fed Pico. Direct battery operation needs its own current trace.

## Implemented low-power route [D]

The Notecard's timed ATTN sleep command controls a TPS22919 host VSYS switch. Notecard and its carrier remain powered; host flash survives each cold start. The same mechanism works in offline `hub.set mode=off`; verify timer behavior offline during acceptance. [Blues host-sleep example S05](https://dev.blues.io/example-apps/samples/putting-a-host-to-sleep-between-sensor-readings/).

A physical HOST_FORCE_ON jumper selects AON3V3 instead of ATTN at the switch EN input (do not short ATTN to a driven high). Commission in forced-on mode. Scope initial boot, sleep and cold battery reconnect before enabling field operation. Host gate failure has a firmware fallback, but Notecard timer failure while host is off remains a single point of failure; independent AON wake/watchdog is a production reliability option requiring a hardware revision.

TPS22919 is **not** used in the modem power path: its 1.5 A rating is below the 2 A burst requirement. It switches host, sensors, scale boost input and ADC divider only. All grounds join at a low-impedance distribution point; do not return modem current through HX711 ground wiring. [S06](https://www.ti.com/product/TPS22919).

## Battery and charging [D]

Use Adafruit 353 assembled protected 1S3P 6600 mAh pack as a candidate; the original 6800 mAh capacity is not retained. Manufacturer lists a 2 A cable and cautions about sustained load; prototype peak margin is narrow and must pass droop testing. [S07](https://www.adafruit.com/product/353). Use a keyed harness, replaceable battery-side fuse and strain relief. Do not solder on cells or parallel random batteries.

Field V1 is battery swap only. Disconnect the pack from the node to charge with a matching 1S 4.2 V CC/CV charger set to 500 mA. No solar charging or simultaneous independent chargers. CARR-A contains charging circuitry; leave solar disconnected, and do not apply carrier USB while the battery is connected during the prototype procedure. Charge away from the hive, within the selected pack's documented temperature range. Pack protection is not a substitute for temperature-controlled field charging.

## Supply acceptance design [D]

At the minimum approved loaded battery voltage, scope VMODEM and VIO directly at the carrier. Test actual modem registration/retries plus a 0.75 A load and 2 A / 10 ms pulse fixture. Target modem terminal droop <0.25 V, no reset or protector trip; neither rail may cross its exact SKU limit. A resistor/lead budget follows R_total ≤ ΔV/I: 0.25/2 = 0.125 Ω for battery ESR, fuse, contacts, wires and PCB combined. Measure aged/cold pack too.

Bulk capacitance is supplemental. For a 2 A, 10 ms event and 0.25 V permitted droop, C = IΔt/ΔV = 0.08 F if the capacitor supplied everything. A 470 µF capacitor cannot replace a capable battery; its equivalent support is only 59 µs at those values before ESR effects. Start with carrier reference decoupling and add a tested 470 µF low-ESR capacitor if needed; check inrush and stability, not just capacitance.

Supply supervisor TPS3839K33DBZR monitors host3V3 and resets RUN through an isolating diode/open-drain interface, not a conflicting push-pull connection to a service reset switch. Validate the actual threshold, reset delay and regulator discharge slope against the memory write window. Maintain >=64 KiB free filesystem headroom. Slow undervoltage and abrupt cuts are both required tests.

## Energy model — assumptions at battery terminals

The following are **scenario inputs**, not measured performance: 40 mA total active for 8 s each hour; total idle current shown; radio 500 mA for accumulated active seconds/day. Avoid double counting once measured total traces replace these estimates. Use 70% of 6600 mAh provisionally for usable capacity.

| Idle | Radio seconds/day | Approx mAh/day | Runtime with 4620 mAh usable |
|---|---:|---:|---:|
| 0.1 mA | 30 | 8.695 | 531.4 days |
| 0.3 mA | 120 | 25.98 | 178 days |
| 1.5 mA | 300 | 79.72 | 58 days |
| 20 mA powered fallback | 30 | 485.23 | 9.5 days |

Reproduce with `python3 tools/power_budget.py`. Assumptions omit calendar aging and chemistry-specific capacity variation. No multi-year promise is justified. Provisional target: ≥180 days under a declared field coverage/battery profile, which requires ≤25.67 mAh/day at this derating. Until measured, service interval is **unassigned**.

Record active UART time too: one 2 kB JSON message at 9600 baud takes about 2.1 s on the wire. Backlog drain, cold boots, boost settling, Notecard CPU work, reed pullup (~33 µA at 100k/3.3V), gate leakage and carrier charging IC all matter. 8 queued records take longer than one record; measure normal and recovery cycles separately.
