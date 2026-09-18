# Three-prototype BOM and production strategy

Date:2026-09-16; destination Florida33195. USD prices below are **observed page prices**, unless marked estimate. No order has been placed. Tax, shipping, supplier inventory changes and forwarding/export costs are excluded. This is a manufacturer/part-number-level **candidate** BOM with explicit purchase holds; it is not a falsely complete, checkout-confirmed kit.

## Main modules — installed quantities

| Item | Manufacturer / exact prototype part | Each | 3 nodes | Observed unit USD | Source and purchasing status |
|---|---|---:|---:|---:|---|
| MCU | Raspberry Pi Pico H SC0917 |1|3|5.00 reference|[Raspberry Pi](https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf); distributor quote needed |
| Cellular | Blues NOTE-MBGLN, shop SKU992-00139-B, ordinary non-XP |1|3|59.00|[Blues selected global variant](https://shop.blues.com/products/notecard-cellular?variant=44541417029873); confirm actual field coverage before all3 |
| Carrier + onboard antennas | Blues CARR-A v2.3, SKU992-00071-C |1|3|25.00|[Blues](https://shop.blues.com/products/carr-al); included M.2 mounting hardware/antenna connection must be checked on receipt |
| Load cell | ANYLOAD108MA-150kg, metric version |1|3|232.00|[Manufacturer](https://www.anyload.com/product/108ma-single-point-load-cell/), [Scales Plus listing](https://www.scalesplus.com/weighing-components/load-cells/single-point/?page=26&sort=featured); **HOLD** footprint/height, mounting drawing, low-excitation confirmation and landed quote |
| Bridge ADC | SparkFun SEN-13879, HX711 |1|3|4.95|[SparkFun](https://www.sparkfun.com/sparkfun-load-cell-amplifier-hx711.html); page has conflicting stock/backorder text, confirm inventory |
| Brood and ambient probes | Adafruit2857, Sensirion SHT31-D filtered |2|6|13.95|[Adafruit](https://www.adafruit.com/product/2857); exact module, protective cages separate |
| Pressure | Adafruit4816, Bosch BMP390 |1|3|10.95|[Adafruit](https://www.adafruit.com/product/4816); direct page showed **out of stock**, source exact part from distributor; do not replace with BMP280 without firmware change |
| Acceleration | Adafruit1231, Analog Devices ADXL345 |1|3|17.50|[Adafruit](https://www.adafruit.com/product/1231) |
| Light | Adafruit4681, ROHM BH1750 |1|3|4.50|[Adafruit](https://www.adafruit.com/product/4681) |
| Microphone | Adafruit6049, TDK ICS-43434 |1|3|8.95|[Adafruit](https://www.adafruit.com/product/6049); remaining stock, **EOL prototype only**. Buy exact part; no SPH0645 substitution under this driver qualification |
| I2C isolation | Adafruit2717, TI TCA9548A |1|3|6.95|[Adafruit](https://www.adafruit.com/product/2717) |
| Inspection | Adafruit375 reed + magnet pair |1|3|3.95|[Adafruit](https://www.adafruit.com/product/375) |
| Battery | Adafruit353, protected1S3P6600mAh pack |1|3|24.50|[Adafruit](https://www.adafruit.com/product/353); select pack version; **HOLD for pulse-margin and shipment/forwarding confirmation** |
| HX analog boost | Pololu4941 / U3V16F5 |1|3|quote|[Pololu](https://www.pololu.com/product/4941); catalog showed out of stock, exact distributor stock required |

Known-price subtotal excluding boost: **$431.15/node; $1,293.45 for3**. This includes the professional load-cell candidate; it does not support the earlier $180–250 complete-prototype estimate. Electronics excluding load cell total$199.15/node before boost and support circuitry. No statement of exact stock is a reservation.

## Power/inspection carrier — installed parts to procure after schematic check

All rows below are **engineering-selected candidates, quote/footprint review required**. Buy from DigiKey or Mouser using exact MPN; no unverified low-leakage claim for an Amazon module. Small ICs require a soldered adapter PCB or skilled assembly. Quantities are installed counts, excluding recommended spares.

| Function | Manufacturer / MPN | Each | 3 nodes | Notes |
|---|---|---:|---:|---|
| Host, sensor, boost-input, divider switches | Texas Instruments TPS22919DCKR |4|12|SC70; never modem supply |
| Four host isolation channels | TI SN74LVC2G125DCUR |2|6|VSSOP8; Ioff partial-power-down buffer |
| Inspection event DFF | TI SN74HC74DR |1|3|SOIC14; second half tied off |
| Reed input Schmitt conditioning | TI SN74LVC1G17DCKR |1|3|SC70; AON supply |
| Latch clear transistor | Diodes Inc2N7002-7 |1|3|SOT23; GPIO21 active-high gate |
| Host brownout supervisor | TI TPS3839K33DBZR |1|3|Threshold/timing must be checked in assembled board |
| Supervisor reset isolation diode | Nexperia BAT54H,115 |1|3|Anode RUN; cathode RESET; validate VOL |
| Precision divider top/bottom | Yageo RT0603BRD07100KL |2|6|100k,0.1%; verify packaging/current catalog |
| EN, pullup and discharge configuration resistors | Yageo RC0603FR-07100KL |10 allowance|30|100k1%; final count from netlist |
| Reed conditioning resistor | Yageo RC0603FR-0710KL |1|3|10k1% |
| I2C pullups | Yageo RC0603FR-074K7L |12 allowance|36|4.7k1%; DNP duplicates if effective pullup too strong |
| IC bypass + ADC/reed filters | Murata GRM188R71H104KA93D |14 allowance|42|100nF; count includes two signal filters |
| Switch rail decoupling | Murata GRM21BR71A106KE51L |8 allowance|24|10µF10V X7R; assess DC bias |
| Supplemental modem bulk | Panasonic EEU-FR1A471L |1 candidate|3|470µF10V; scope first, not a replacement for source current |
| Host gate selection jumper | Samtec TSW-103-07-G-S + SNT-100-BK-G |1set|3sets|3-pin selection, never short two sources |
| Service jumper | Samtec TSW-102-07-G-S + SNT-100-BK-G |1set|3sets|GP22 to GND |
| Carrier/adapter | Custom NN-HIVE-PWR-P1 |1|3|**HOLD:** schematic, PCB footprint review and assembly quote; not an off-the-shelf SKU |

These components do not constitute a released fabrication BOM. Exact short-circuit fuse, reverse-polarity protection, TVS, power connector and environmental harness parts must be selected together with wire gauge, fault current, cable diameter and enclosure drawing. Missing specifications are purchase holds, not omitted costs. Budget **$35–65/node** for power subassembly parts/assembly (engineering allowance, not quote).

## Harness, mechanical and service procurement

| Item | Candidate / procurement specification | Each | 3 nodes | Status |
|---|---|---:|---:|---|
| Bench QT cables | Adafruit4209,100mm JST-SH cable |5|15|Confirm exact current listing and termination against selected mux; bench only |
| Pico header carrier/perfboard | Adafruit1609 half-size Perma-Proto candidate |1|3|Confirm footprint; separate small-IC adapters needed |
| Stand-off enclosure | Hammond1554H2GYCL candidate |1|3|**HOLD** internal-layout drawing; do not assume carrier/pack fits without trial |
| Cable glands | LAPP SKINTOP ST-M12×1.5 family |4 allowance|12|**HOLD** exact suffix by measured cable jacket diameter; four glands may need multi-hole inserts |
| External probe harnesses |4-conductor shielded flexible cable,0.5m max qualified branch |2|6|**HOLD** connector/pinout and installed length; no bare QT connections outdoors |
| Battery harness/fuse/reverse protection |1S keyed harness, pulse-rated≥2A; fuse coordinated to wire and pack |1|3|**HOLD** assembly manufacturer/part number and test; cannot invent final fuse rating |
| Fiberglass shell, top/base structural frames | NN-HIVE-MECH-P1 custom drawing |1set|3sets|**HOLD** laminate, load path, mounting holes and vendor quote |
| Cell mounting fasteners/spacers | Per exact cell drawing, torque spec and insert design |1set|3sets|**HOLD** lengths/grade/quantity derived from actual stack-up |
| Adjustable corner stops + anti-lift capture | Custom structural design |4stops+capture|12stops+3captures|**HOLD** gap and load capacity validation |
| Probe cage/radiation shield/acoustic membrane | Custom replaceable assemblies |1set|3sets|**HOLD** material/sample tests; sensor opening cannot be conformally coated |
| Bench charger | Adafruit259 USB LiIon/LiPoly charger,500mA setting |shared|1|[Manufacturer](https://www.adafruit.com/product/259); confirm connector polarity and USB cable |
| Meter, scope, current logger, calibrated masses | Borrow/rent lab equipment |shared|1set|Not included in hardware estimate |

Allow **$70–140/node** for harness/enclosure/mechanics, **$10–20/node** for boost and small omitted consumables, plus **$100–200 shared** spares/service materials. Three-prototype planning range: **$1,740–2,170 before tax/shipping/labor/test equipment**, based on the professional-cell candidate and allowances; custom mold tooling is extra. Requote after decisions close. Recommended spares:1Pico,1HX711,1SHT31,1mic,2extra switches; buy3cells only after the first geometry sample is accepted.

## Production BOM strategy

| Group | Prototype |100-unit strategy / decision gate |
|---|---|---|
| MCU | PicoH | RP2040 + QSPI flash custom board, or reevaluate a lower-power MCU after measured system budget; no MCU-only current used as total |
| Scale |$232 reference cell + HX module | Competitive RFQ for150kg, actual platform envelope, creep/temp limits, sealing and mounting geometry. Original$8–14 expectation is not supported by this qualified-candidate path |
| Climate | Two filtered breakout boards | Sensirion SHT31-DIS-F on replaceable probe PCBs; retain protective filter and calibration traceability |
| Pressure | BMP390 module | Bosch BMP390 on main PCB with vent; approve lifecycle/availability and actual MPN |
| Accel | ADXL345 module | ADXL345BCCZ-RL7 candidate; consider continuous low-power activity wake as distinct hardware/firmware revision |
| Microphone | EOL ICS-43434 stock | Active-lifecycle MEMS/I2S alternative selection is mandatory. SPH0645 timing must be explicitly qualified; no drop-in assumption |
| Light | BH1750 module | ROHM BH1750FVI candidate; assess availability, window calibration and daylight saturation |
| Cellular | CARR-A + NOTE-MBGLN | Retain certified modem module; integrate carrier reference circuits and antenna, validate final enclosure RF |
| Storage | Pico LittleFS | Larger external flash/FRAM metadata or greater onboard flash; select capacity from retention and write-amplification measurements |
| Power | Multiple modules | Integrated gate/isolation/supervisor and qualified pack harness; temperature-aware charger only as separately reviewed option |
| Mechanics | Sample frames/shell | Fixed laminate, insert process, stop-setting jig and serial acceptance record |

No substantiated$125 production BOM is possible until a lower-cost cell and all integration quotes are obtained. Request10/100/500-unit prices separately, including MOQ, freight, lead time, lifecycle, calibration yield and warranty. COGS = materials + PCB assembly + mechanical labor + calibration/test + yield/rework + packaging + inbound freight/duty + warranty allocation. Platform hosting/Notehub/data and installation are recurring or downstream costs; do not call them universally free.
