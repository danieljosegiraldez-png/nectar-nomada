# Reference: Las Nubes Cerro Azul 12x12 ft dark room (draft, Oct 2026)

Read this when the user asks about this specific room. It summarizes the draft design spec; the full spec is `Dark_Room_12x12_Design_Spec.md`. Everything here is a draft and every performance figure is an estimate to verify.

## Geometry

- Interior 12x12 ft (exterior about 14x14 with the block walls), full concrete block with plycem on the upper part, sealed. 7 ft ceiling. This room replaces Dark Room I (14x14, 72 trays); the new design holds 84. Two racks facing each other against opposite 12 ft walls; 6 trays (4x2 ft) per row; **7 levels** at a 7 in pitch with the first tray bottom at 24 in. Top tray at 68.5 in leaves 15.5 in to the ceiling.
- 84 trays. At a 3 cm bed of whole cherry (net 0.675 m2, about 20 L per tray): 8 / 10 / 12 / 13 kg per tray at 400 / 500 / 600 / 650 kg/m3, so about 680-1,106 kg per full room (Dark Room I's 72 trays: 583-948 kg). Bulk density is unverified; weigh one filled tray. Freeboard at 3 cm is about 1.3 in.
- Rack run needs about 145.5 in (6 x 24.25). The interior is 144 in or a little more, so a nominal 24 in tray does not fit with seams: measure the interior at three heights and the real tray width before building; options are 23.5 in trays or five per row. Wall names: the two RACK walls are the 12 ft walls the racks stand against; the two END walls are the walls each row of six trays runs up to (the door wall is one of them). Interior insulation on the two end walls costs run length; on the rack walls or ceiling it only costs aisle (about 44 in available). Without AC, insulate outside or on the roof, or add insulation together with the cooling plan.
- Door: flush sliding, about 30-36 in wide, centered on an end wall so it opens into the aisle; add a compression gasket and a short black-curtain vestibule or light-trap baffle.
- Rack depth 50 in (48 in carriola + 2 in plenum gap); aisle about 44 in.
- Structure: wall-mounted combs of 50x30 mm steel tube, 4 ft cantilevered carriolas under each tray seam.

## Width update (user, Oct 2026)

The user first gave 144 in (12 ft) interior and later said the room has more space than 12 ft, almost 14 ft. These disagree and neither is measured. Treat the room as unmeasured: run `sizing.run_width_check` and `insulation_effect` with the real number. At 168 in (14 ft) the row has about 22 in of slack, interior insulation on both end walls of up to about 10 in each still fits, and the aisle grows if the depth is also larger. Ask for the measurement at three heights before building anything.

## Cooling

AC is planned and the 18-22 C target is a requirement. Provision the mini-split hole and 220 V circuit now, seal the envelope first, and insulate together with the AC.

## Loads (full room, placeholders)

- Water to remove about 60 % of fresh mass (unverified): roughly 410-660 kg over 12-20 days, about 1.1-1.7 kg/h averaged over 16 days, higher in the first days.
- Ventilation alone at 600 m3/h needs about 2.5 g/m3 average advantage for 1.5 kg/h, which Panama rarely gives, so dehumidifiers carry the load: two 50-70 pint units at full load, a third or an AC dehumidify mode as backup, and staggered lot starts to flatten the peak.
- Wall load per 12 ft rack wall about 650-860 kg including steel (placeholder tray 4 kg, steel 141 kg); have Bob or an engineer check the combs and anchors on the concrete block.
- `scripts/sizing.py` reproduces these numbers.

## Air system

- 6 extraction ports (2-3 per rack wall, staggered heights), 1 low intake on the far end wall, 1 main circulation fan by the door, 2 portable fans.
- Every port: motorized spring-return damper with EPDM gasket, rain hood, 1 mm insect screen, matte-black light-trap baffle.
- Extraction about 100 m3/h per fan (est.), 400-600 m3/h total, 14-21 air changes per hour, 3 cm/s through tray gaps. The fans move moisture, they do not dry the beds by velocity.

## Control

- Modes: CLOSED, DEHUMIDIFY, VENTILATE, plus PURGE and FAILSAFE from `scripts/controller.py`.
- Gate: absolute-humidity advantage >= 2 g/m3 (close below 1), outside <= 30 C, no rain, inside RH above 58 % target.
- Sensors: 2 inside (about 30 in and 60 in), 1 outside in a radiation shield, CO2 inside.
- Dehumidifiers: two 50-70 pint units on separate circuits, with a 300 s restart interlock. Provision a hole and a 220 V circuit for a mini-split; the unit is bought later.

## Lighting

- Half-length (front 2 ft) 24 V LED strips under carriolas: one strip on each wall-side carriola aimed inward, two on 45 degree channels on each interior carriola. 168 strips, about 102 m, about 460 W with all zones on, 4 zones with door switch or PIR timer.

## Open items

Exact interior width and real tray width, which wall holds the door, wall construction, tray weight, controller platform, whether this room replaces Dark Room I, and real site temperature and humidity logs.
