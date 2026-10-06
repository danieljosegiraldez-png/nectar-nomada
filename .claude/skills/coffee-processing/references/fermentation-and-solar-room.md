# Fermentation matrix, power resilience and the solar room

Contents: fermentation variables to track, mapping fermentation to drying-room decisions, power-quality recovery, vent isolation, solar room, dark-room temperature target.

## Fermentation variables (design and logging, not control constants)

Treat recipes as combinations of the variables below and log all of them per lot so results are comparable. Give no pH, brix, temperature or time targets as facts; they depend on cultivar, process and the user's own trials. Ask for the user's data or label figures as starting hypotheses.

| Group | Variables to record |
|---|---|
| Maceration style | washed, anaerobic (sealed tank, valve), carbonic maceration (CO2-flushed), hanging-bag or air-envelope oxidation, natural, honey |
| Inoculation | yeast strain or native culture, dose, timing, must recirculation, contact time. Verify exact commercial strain names and dosing against the supplier's technical sheet before writing them into a recipe |
| Physical | must temperature curve, pH, titratable acidity, brix decay, cherry-to-mucilage contact, tank headspace and pressure |
| Handoff to drying | end-of-fermentation criteria, wash or no wash, initial mass, initial moisture and aw |

Useful sensors per tank: temperature probe (immersion, food-safe), pH probe with regular calibration, brix by refractometer on a sampling schedule, pressure for sealed tanks. Pump and recirculation relays follow the same relay-isolation and contactor rules as the drying room.

## How fermentation choices change the drying room

- Higher residual mucilage or sugar (honey, natural, some inoculated lots) holds more surface moisture and ferments again if the bed stays wet and warm. Start those lots with more airflow and thinner beds, and weigh them more often.
- A lot that finishes fermentation wetter or warmer raises the first-days water load above the average figure in `control-logic.md`.
- Log the fermentation record next to the drying curve so a flavor result can be traced to both.

## Power quality (micro-cuts, brownouts, lightning)

Panama sites see short outages and surges. Design for recovery, not just operation:

1. **Cold-start rule.** On every boot, treat the compressor as just stopped: wait the full 300 s before it can run. `RoomController` does this on its first `step()`.
2. **Safe boot state.** Outputs initialise to OFF before pins are configured. Spring-return dampers close when power drops, which seals the room by themselves.
3. **Brownout behavior.** Use a supply and MCU with brownout detection and the hardware watchdog. Contactor coils drop out on low voltage, which protects compressors; do not defeat this.
4. **State recovery.** Persist only slow state (lot data, logs) to flash or SD. Do not persist actuator state; recompute it from sensors after boot.
5. **Surge protection.** SPD at the panel, a UPS or small battery for the controller, sensors and damper supply (not compressors), and a clean earth. Isolate the sensor and controller grounds from mains neutral noise as in `electrical-safety.md`.
6. **Logging.** Record boot events and outage durations; repeated reboots are a wiring or supply fault.

## Vent isolation

Exhaust and intake paths must never be open to outside air while the fans are stopped or coasting. Use powered spring-return dampers (backup: gravity backdraft dampers in series), keep the fan running until the damper has closed only if the damper closes under its own power, and otherwise let the sequencing in `control-logic.md` close the damper after the fan stops while the compressor stays off. The reference controller enforces the order.

## Solar room (future)

Different problem from the dark room: the aim is controlled radiation and airflow, with rain protection.

- Control targets: surface or bed temperature ceiling, airflow across beds, shading when radiation or temperature is too high, closing and covering when rain starts or RH spikes.
- Hardware: variable-speed exhaust fans, motorized shade cloth, circulation fans, a rain sensor and a pyranometer or a simple lux or temperature proxy, plus bed-level temperature probes.
- Logic: reuse `ah_gm3`, `SensorGuard` and the failsafe pattern. Rain or an AH rise outside overrides everything (cover or close). Never let the shade or vents depend on a single sensor.
- Do not assume dark-room setpoints apply. Ask for the user's drying curve and temperature limits for sun-exposed lots.

## Dark-room temperature target

A generic profile may list 18-22 C for the dark room. That needs inverter AC, a very tight envelope and strong dehumidification, and is the condensation-risk case in `SKILL.md`. For a room without AC the realistic range is higher (see the heat-load estimate). Ask the user which target is a quality requirement and which is an aspiration, then design to that.

## Yeasts and starters
The catalog is in `yeast-catalog/` (read its `README.md` first): Fermentis products, other commercial coffee yeasts, and the literature, each with its source and evidence level. Dose, rehydration and temperature come from the manufacturer's page for the exact product; for SafCoffee Cool Blue, Green Origins, Sunrise Orange and Deep Amber that is 1 g/kg of cherries (Deep Amber 2 g/kg), with the temperature and time ranges in the catalog.

Cautions that come from the catalog:
- "MP-72" is SafOeno Bioprotect MP-72 (*Metschnikowia pulcherrima*), the pre-fermentative protection yeast used in CryoBloom, with an oenological label dose of 10-20 g/hl; it is not a SafCoffee product.
- "LD20" in the metaskill documents matches SafBrew LD-20, a lager yeast with glucoamylase for dry, low-carbohydrate beer (160-240 g/hl on its page). It is not a coffee yeast; ask the user what they meant before using it in a recipe.
- A target of 72 h at 18 C does not match the manufacturers' ranges: Cool Blue is designed for 8-18 C with about 7 days, and Green Origins and Sunrise Orange for 20 C and above. Say so and let trial data decide.
- A lower "typical range" from memory (for example 0.1-0.5 g/kg) is not supported by these pages.
