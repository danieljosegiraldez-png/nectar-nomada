# Evidence register — accessed 2026-09-16

[O] Original files are preserved in source_original; provenance hashes in evidence/source-hashes.json. [R] Manufacturer/research facts below. [D] New design choices/targets appear in engineering documents. [U] Unknowns are in OPEN_ITEMS. A source link does not certify our assembled design. Prices/stock/shipping are observations, not quotes.

| Source | Facts used / scope |
|---|---|
| https://github.com/raspberrypi/pico-sdk/blob/master/src/rp2_common/pico_low_power/include/pico/low_power.h | Pico dormant example current and supply test condition; not guaranteed MicroPython board current |
| https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf | Pico electrical/pinout reference |
| https://dev.blues.io/datasheets/application-notes/notecard-carrier-design-guide/ | Continuous power domains, modem transient supply design |
| https://dev.blues.io/datasheets/notecard-datasheet/note-mbgln/ | Notecard family electrical specifications; delivered SKU revision must match |
| https://dev.blues.io/datasheets/notecarrier-datasheet/notecarrier-a-v2-3/ | Carrier candidate revision |
| https://dev.blues.io/example-apps/samples/putting-a-host-to-sleep-between-sensor-readings/ | ATTN host power control pattern |
| https://dev.blues.io/api-reference/notecard-api/card-requests/latest/ | card.time / card.attn requests |
| https://dev.blues.io/api-reference/notecard-api/note-requests/latest/ | note.add custody request |
| https://dev.blues.io/api-reference/notecard-api/hub-requests/latest/ | periodic/off mode |
| https://dev.blues.io/notecard/notecard-walkthrough/notecard-interfaces/ | UART NDJSON interface |
| https://dev.blues.io/notecard/notecard-walkthrough/advanced-notecard-configuration/ | Request IDs |
| https://docs.micropython.org/en/v1.26.0/rp2/quickref.html | Pin/peripheral API candidate baseline |
| https://docs.micropython.org/en/v1.26.0/library/machine.I2S.html | I2S async/sample API |
| https://docs.micropython.org/en/latest/library/machine.WDT.html | RP2040 watchdog maximum |
| https://cdn.sparkfun.com/datasheets/Sensors/ForceFlex/hx711_english.pdf | HX711 timing/gain/protocol |
| https://admin.sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf | SHT31 commands/CRC/conversion |
| https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp390-ds002.pdf | Pressure configuration/trim |
| https://raw.githubusercontent.com/boschsensortec/BMP3_SensorAPI/master/bmp3.c | Cross-reference pressure compensation equations |
| https://www.analog.com/en/products/adxl345.html | Accelerometer registers/capability reference |
| https://cdn-shop.adafruit.com/product-files/6049/6049_DS-000069-ICS-43434-v1.2.pdf | Microphone sample format |
| https://www.anyload.com/product/108ma-single-point-load-cell/ | Load cell capacity/platform/excitation candidate |
| https://www.anyload.com/wp-content/uploads/2014/03/ANYLOAD-108MA108MAUN-Load-Cell-Transducer-Datasheet-V3.pdf | Cell geometry and mounting source |
| https://www.anyload.com/product/108ta-single-point-load-cell/ | Rejected smaller platform alternative |
| https://www.ti.com/product/TPS22919 | Switch ratings |
| https://www.ti.com/product/TCA9548A | Multiplexer/reset isolation |
| https://www.ti.com/product/TPS3839/part-details/TPS3839K33DBZR | Supervisor candidate |
| https://www.pololu.com/product/4941 | Boost candidate/stock limitation |
| https://www.adafruit.com/free | Free-shipping threshold eligibility |
| https://www.adafruit.com/shipping | Address restrictions |
| https://www.digikey.com/en/help-support/delivery-information/delivery-time-and-cost | US delivery pricing options |
| https://shop.blues.com/products/notecard-cellular?variant=44541417029873 | Notecard procurement candidate |
| https://shop.blues.com/products/carr-al | Carrier procurement candidate |
| https://www.raspberrypi.com/documentation/accessories/camera.html | Optical specifications and lens geometry |
| https://www.raspberrypi.com/products/raspberry-pi-high-quality-camera/ | HQ camera still/video limits |
| https://www.raspberrypi.com/products/raspberry-pi-5/ | Two camera interfaces and recommended supply |
| https://stri-apps.si.edu/docs/publications/pdfs/Roubik_coffeepollination.pdf | 2002 open vs bagged coffee experiment; not proof for our site |

Specific component store links and snapshot prices are in BOM.md and VIDEO_MICROPARCEL_EXTENSION.md. Engineering current budgets, optical pixel estimates, structural calculations and acceptance thresholds are calculations/proposals, not measurements from these sources. Full copyrighted datasheets are not redistributed in the packet.
