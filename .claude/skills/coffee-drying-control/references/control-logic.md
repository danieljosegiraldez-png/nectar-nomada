# Control logic reference

Contents: psychrometrics, the ventilation gate, scenario table, modes and sequencing, water and heat load estimates, sensor placement, tuning.

## Psychrometrics

Compare **absolute humidity (AH, g/m3)**, never RH% alone, because warmer air holds more water at the same RH.

```
es(T)  = 6.112 * exp(17.67*T / (T + 243.5))            # hPa, T in C
AH     = es(T) * RH * 2.1674 / (273.15 + T)            # g/m3, RH in %
Td     = 243.12*g / (17.62 - g),  g = ln(RH/100) + 17.62*T/(243.12 + T)
```

`scripts/controller.py` implements both as `ah_gm3` and `dew_point_c`.

## Ventilation gate (all must hold)

| Condition | Default | Why |
|---|---|---|
| AH inside minus AH outside | open at >= 2.0 g/m3, close below 1.0 | Hysteresis stops chatter; below ~1.3 g/m3 advantage the fans cannot remove the average water load |
| Outside temperature | <= 30 C and <= inside + 2 C to open (inside + 3 C to keep going) | Do not import heat; the relative rule catches 29 C air entering a 25 C room, which the absolute cap alone would pass |
| Rain | none | Wind-driven rain and 95 %+ RH |
| Inside RH | above target (58 %) to open, keep going until target - 3 | No need to ventilate a room that is already dry enough |
| Dwell | >= 600 s on, >= 600 s between episodes | Protects fans, dampers and stability |

A temperature advantage never opens the room by itself. In Panama, cooler outside air (night, rain) is usually the wetter air.

## Scenario table (inside vs outside, inside RH above target)

| Case | Inside | Outside | AH in | AH out | dAH | Result |
|---|---|---|---|---|---|---|
| Warm, drier outside (+1 C) | 26/65 | 27/45 | 15.8 | 11.6 | +4.2 | VENTILATE |
| Drier but 3 C hotter than room | 26/65 | 29/42 | 15.8 | 12.1 | +3.8 | DEHUMIDIFY (heat import) |
| User's 3 pm case | 25/66 | 29/44 | 15.2 | 12.7 | +2.5 | DEHUMIDIFY (heat import) |
| Hot dry afternoon | 26/65 | 31/38 | 15.8 | 12.2 | +3.7 | DEHUMIDIFY (above 30 C cap and 3+ C over inside) |
| Similar air | 26/65 | 29/55 | 15.8 | 15.8 | 0.0 | DEHUMIDIFY |
| Cool humid night | 25/70 | 22/92 | 16.1 | 17.9 | -1.7 | DEHUMIDIFY |
| Rain-saturated | 25/65 | 24/95 | 15.0 | 20.7 | -5.7 | DEHUMIDIFY |
| RH trap | 25/60 | 31/52 | 13.8 | 16.7 | -2.8 | DEHUMIDIFY |

Run `python3 scripts/test_controller.py` to reproduce these, and to re-check them after changing any threshold.

## Modes and sequencing

| Mode | Ports | Fans | Compressor |
|---|---|---|---|
| CLOSED | shut | circulation only | off |
| DEHUMIDIFY | shut | circulation | on, after 300 s interlock and dampers sealed |
| VENTILATE | open | circulation + intake + extraction | off |
| PURGE | open | same as VENTILATE | off |
| FAILSAFE | shut | circulation | off, alarm |

Order of operations when entering ventilation: compressor off, dampers open, wait 10 s, fans on. Leaving: fans off, wait 30 s, dampers close, wait 5 s, then the compressor may start if 300 s have passed since it last stopped.

## Water load and ventilation capacity (estimates, verify with logs)

- Water to remove ~ mass x (initial - final moisture fraction) for the drying mass; for fresh cherry the order of magnitude is roughly half the mass over 2-3 weeks. In the 12x12 design, ~700 kg of cherry gave ~19 L/day average, higher in the first days. This is unverified for the site.
- Moisture removed by ventilation = airflow (m3/h) x dAH (g/m3) / 1000 kg/h. At 600 m3/h, each 1 g/m3 of advantage removes 0.6 kg/h.
- Check: average water load of 0.8 kg/h needs about 1.3 g/m3 advantage at 600 m3/h; a 1 kg/h peak needs about 1.7 g/m3.

## Heat load (sealed room)

Equilibrium rise above outside ~ internal heat (W) / (U x area) where the product is roughly 100-130 W/C for an uninsulated 45 m2 envelope and 30-45 W/C when well insulated. Add: dehumidifier electrical power (all of it becomes heat), fans, lights, product respiration. Insulation without AC traps heat, so only recommend it together with a cooling plan.

## Sensors and logging

- Inside: T/RH at two heights (about 30 in and 60 in in a 7 ft room), plus optionally one probe in a tray.
- Outside: T/RH in a radiation shield, rain-protected, at least 3 m from extraction outlets and dehumidifier exhaust.
- Add CO2 (NDIR) inside. Log everything at 10-60 s with timestamps; compute AH and dew point at log time.
- Per drying lot, record the fields the user's traceability system needs: lot code, cultivar, process, initial mass, bed depth, turn frequency, mass-loss curve, moisture, aw, start/end times.

## Tuning

Start with the defaults in `Config`, log for one to two weeks, then adjust: lower `ah_open` if the room cannot keep up and outside is often only slightly drier; raise `rh_target` only if the drying curve is too fast; shorten `min_vent_gap` only if fan and damper wear is acceptable.
