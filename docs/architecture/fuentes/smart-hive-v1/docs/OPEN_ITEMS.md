# Release gates and unresolved items

All physical gates are NOT RUN. Owner roles below are assignments for the engineering team, not statements that a named person accepted work.

| ID | Gate / unresolved item | Owner | Blocks |
|---|---|---|---|
| G1 | Delivered CARRA revision supply/header/ATTN polarity and power domain verification; modem pulse capture; supervisor and host-off leakage | Electronics | Unattended operation |
| G2 | Exact cell excitation compatibility at HX711 E+; signed mounting drawing, screw engagement, allowable corner loads | Mechanical + vendor | Cell bulk purchase / fabrication |
| G3 | Tray dimensions, laminate schedule, inserts, ribs, drainage, deflection/stop clearances and post wind foundation analysis | Mechanical | Production drawings / safe load release |
| G4 | PIO/I2S allocation on pinned MicroPython UF2, waveform and sensor acceptance | Firmware + test | Firmware release |
| G5 | Power-cut LittleFS/dual metadata and Notecard custody outage tests | Firmware + test | Data reliability release |
| G6 | Exact lithium pack pulse margin, fusing, charger connector/polarity and charging temperature controls | Electronics | Battery field deployment |
| G7 | ICS-43434 discontinued; qualify active-life microphone and actual raw PCM format; booster stock/substitute | Procurement + firmware | Production BOM freeze |
| G8 | Florida 33195 address eligibility, freight-forwarder status if relevant, shipping/tax/stock cart | Procurement | Final order total |
| G9 | Field cellular coverage and delivered Notecard SKU/firmware voltage limits | Field + electronics | Radio deployment |
| G10 | Platform repository/auth/tenant model/storage/provider not supplied; route transform, API and documentation publishing remain to implement | Platform | OS integration launch |
| G11 | Coffee species/cultivar, bee species/minimum size, distances, net protocol and annotation expert | Research | Video taxonomic claims |
| G12 | Camera optical pilot, dual capture throughput, exposure, power/weather package | Imaging | Multi-kit video purchase |
| G13 | 150 kg range may lack useful resolution for small stingless hives; define required mass-change resolution and qualify alternate lower-capacity mechanical variant if necessary | Research + mechanical | Stingless-hive mass claims |

Closure requires dated evidence, hardware revision, instrument/calibration IDs, actual measurements, acceptance decision and reviewer. A failed gate requires a documented correction and focused retest. Do not turn NOT RUN into PASS from a code review or calculated estimate.
