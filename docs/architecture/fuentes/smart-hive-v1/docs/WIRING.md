# V1-P1 exact signal and power map

**Engineering wiring specification, not fabricated/verified PCB artwork.** Physical Pico pin numbers below are for standard 40-pin Pico H. Inspect delivered board silkscreen. GND is common; every signal is 3.3 V logic. Each breakout uses its labeled VIN at SENSOR3V3, not an assumed 5 V default. Work unpowered and verify with a meter before inserting modules.

## Pico GPIO map

| GPIO | Physical pin | Signal | Reset / off behavior |
|---:|---:|---|---|
| 0 | 1 | UART0 TX → buffer → Notecarrier RX | input/unpowered; AON-side RX pullup |
| 1 | 2 | UART0 RX ← buffer ← Notecarrier TX | protected from AON backfeed |
| 2,3 | 4,5 | Reserved I2C1 SDA/SCL | unconnected V1 |
| 4,5 | 6,7 | SoftI2C SDA/SCL → mux upstream | high impedance before sensor power off |
| 6 | 9 | TCA9548A /RESET | low reset before rail on/off |
| 7 | 10 | Spare | unconnected |
| 8,9 | 11,12 | Reserved UART1 TX/RX | unconnected |
| 10,11 | 14,15 | Entrance/expansion GPIO | unconnected |
| 12 | 16 | HX711 DOUT | input, no pullup |
| 13 | 17 | HX711 PD_SCK | low when powered; input when rail off |
| 14 | 19 | SENSOR_EN → two load-switch EN inputs | 100k pulldown; active high |
| 15 | 20 | BAT_DIV_EN | 100k pulldown; active high; never modem power |
| 16 | 21 | I2S1 SCK | input on power off |
| 17 | 22 | I2S1 WS | input on power off; SCK+1 constraint |
| 18 | 24 | I2S1 data from mic | 100k pulldown at mic data |
| 19 | 25 | conditioned reed state through buffer | high=open, low=lid closed |
| 20 | 26 | inspection event latch Q through buffer | high=one or more openings since clear |
| 21 | 27 | latch-clear NMOS gate | 100k pulldown, pulse high to clear |
| 22 | 29 | SERVICE jumper to GND | internal pullup; low skips application |
| 26 | 31 | ADC0 battery divider output | 100k to GND, 100nF at ADC |
| 27,28 | 32,34 | spare ADC | unconnected |
| RUN | 30 | supervised reset input | see supervisor isolation below |
| 3V3 OUT | 36 | HOST3V3 | output; never tie to AON3V3 |
| 3V3_EN | 37 | leave normal Pico configuration | VSYS switch provides host cutoff |
| VSYS | 39 | switched protected battery | host domain |
| VBUS | 40 | USB only | disconnect USB for true host-off tests |

UART0 is 9600, 8 data bits, no parity, 1 stop bit, newline JSON. No RS-232 voltage converter. HX711 PIO0 SM0 reserved. I2S ID1 expected to occupy PIO1; logic-analyzer and resource-collision test on the chosen MicroPython build is a release gate. Read API pin constraint in [MicroPython RP2 documentation](https://docs.micropython.org/en/v1.26.0/rp2/quickref.html).

## I2C branch map and cable limits

Mux TCA9548A address 0x70; A0/A1/A2 strapped low. Upstream and downstream pullups to SENSOR3V3 only. Starting target 4.7k effective pullup per active segment, adjusted after counting existing module pullups. Never connect parallel breakout pullups without checking effective resistance. One channel selected at a time, 100 kHz. Acceptance: rise time <1 µs; VOL <0.4 V and no errors in 10,000 reads with installed cables.

| Channel | Device | 7-bit address | Strap |
|---:|---|---|---|
| 0 | Brood SHT31 | 0x44 | ADDR low/default |
| 1 | Ambient SHT31 | 0x44 | ADDR low/default |
| 2 | BMP390 | 0x77 | SDO high/default, CS high for I2C |
| 3 | ADXL345 | 0x53 | ALT ADDRESS low, CS high |
| 4 | BH1750 | 0x23 | ADDR low |
| 5–7 | spare | none | disconnected |

The original two-address 0x44/0x45 scheme is intentionally replaced with separate mux channels for fault isolation. GP4/5 remain the upstream wires. The mux reset GPIO works even when a downstream sensor holds SDA low. It disconnects the fault; it does not repair a broken sensor. [TI TCA9548A](https://www.ti.com/product/TCA9548A).

Prototype I2C harness target ≤0.5 m per branch, SDA paired with GND and SCL paired with GND; no unqualified meter-long daisy chains. If brood placement needs longer, qualify a differential I2C extender or remote sensor MCU as a revision. Do not silently lengthen the cable. Separate all signal harnesses from modem antenna and boost inductor.

## Power switching subassembly

Four TI TPS22919DCKR switches on a soldered adapter/carrier: U1 battery→HOST_VSYS; U2 HOST3V3→SENSOR3V3; U3 battery→SCALE_BOOST_IN; U4 battery→divider top. U2/U3 EN=GP14; U4 EN=GP15. Each EN has 100k to GND. U1 EN selects ATTN or AON3V3 via a three-pin jumper; 100k pulldown. Do not use U1–U4 for the Notecard modem feed. Each switch has manufacturer-recommended local input/output decoupling and controlled output discharge; BOM population values are provisional pending scope testing.

5 V Pololu 4941 boost input from U3; output to **HX711 VCC** only. HX711 **VDD** from SENSOR3V3. Confirm SEN-13879 has separate VCC/VDD on the received revision; do not bridge them. HX E+/E− excite the cell; measured E+ expected below 5 V due to onboard analog regulation. Cell's nominal 10 V recommendation is **not** satisfied; this reduced-excitation ratiometric use needs supplier acknowledgement and accuracy/temperature validation before scale release. Never apply 10 V to HX711. Alternative revision: appropriately powered precision bridge ADC/front-end, not an improvised higher HX supply.

Battery divider U4 output→100k (0.1%)→ADC26→100k (0.1%)→GND; ADC26→100nF→GND. Ratio2, max 2.1V for4.2V pack. Wait50ms after enabling (~10 time constants of 50k/100nF) and average16 readings. Calibrate effective reference/ratio against a meter. Include series input protection and clamps on external cables in the custom carrier design; do not connect an external battery greater than1S.

## Always-on / host isolation

Use SN74LVC2G125DCUR ×2, VCC=HOST3V3, both /OE grounded, one 100nF bypass per IC. Four channels carry UART TX, UART RX, reed state, latch Q. Source/destination directions are fixed above. The chosen buffer family supports Ioff; qualification must confirm no phantom power with host off. AON-side Notecard RX uses 100k pullup to AON3V3, so idle remains high when host TX is disconnected. ATTN only drives U1 EN; never a bare host pad. [TI partial-power-down buffer family](https://www.ti.com/document-viewer/SN74LVC2G125-Q1/datasheet).

Use CARR-A documented regulated3V3 output as AON3V3 only after pin/output capacity check; label physically. It powers only the small inspection circuit and selection logic, not Pico or sensor loads. Carrier revision/header map must be verified against [CARR-A v2.3 drawings](https://dev.blues.io/datasheets/notecarrier-datasheet/notecarrier-a-v2-3/).

## Inspection latch circuit

Adafruit375 reed closed with magnet/lid in place. Reed to GND; signal has100k to AON3V3. Condition via 10k series and100nF shunt into SN74LVC1G17DCKR Schmitt buffer. Output feeds D-flip-flop CLK and isolated GP19. SN74HC74DR: D=high, /PRE=high, Q→isolated GP20, /CLR pulled up100k AON3V3. GP21 drives gate of2N7002-7 (100k gate pulldown), source=GND, drain=/CLR. Unused second flip-flop inputs tied to defined levels; outputs unconnected. 100nF bypass each AON IC. A lid opening produces a rising clock and latches Q; multiple openings coalesce. No exact opening time is available while host is off. First battery insertion latch state is unknown; mark first observation and clear once lid is closed and recorded. This circuit retains evidence of short inspections between hourly samples without keeping Pico awake.

## Brownout / USB / protection

TPS3839K33DBZR VDD=HOST3V3, GND=GND, /RESET pulls RUN down through BAT54H,115 with diode anode=RUN, cathode=supervisor /RESET. The diode prevents contention with a separate grounded RUN button; confirm low level and reset rise. No large hold-up capacitor substitutes for the watchdog/atomic-storage strategy. Use keyed battery connector, fuse at pack, reverse-polarity protection in the qualified harness and branch protection. Exact fuse/TVS selections remain hardware-release items; the qualified module path must be used until the custom carrier is reviewed.

Disconnect battery and place HOST_FORCE_ON for USB service. For any session with battery connected, verify Pico USB/VSYS ORing and carrier USB charging paths against schematics first. Never join two independently regulated3V3 outputs.
