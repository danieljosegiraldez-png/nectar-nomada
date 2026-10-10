# Electrical and wiring safety

This is engineering guidance, not a substitute for a licensed electrician. Confirm local code and the actual supply voltage before building. Contents: relay boards, compressor loads, protection, wet-room practice, wiring layout.

## Relay modules (ESP32 or Raspberry Pi)

- Use opto-isolated relay modules. On boards with a VCC / JD-VCC jumper, **remove the jumper**.
- Power the JD-VCC (relay-coil) side from a separate 5 V supply. Its ground must not be tied to the microcontroller's ground; the optocoupler is the only link. A shared ground defeats the isolation and lets coil switching noise reach the MCU.
- ESP32 GPIOs are 3.3 V. Check the module's opto LED can be driven at 3.3 V (many 5 V modules need a transistor or a 3.3 V-compatible version). Many modules are active-low; initialize outputs to the OFF state at boot, before configuring pins as outputs, so nothing pulses on reset.
- Put a flyback diode across any DC coil you drive directly (damper actuators, small contactors on DC) and an RC snubber across AC contactor coils.

## Compressor loads (dehumidifiers, AC)

- A compressor's locked-rotor current can be 5-7 times its running current. A relay module's contact is typically rated about 10 A resistive and is not suitable for direct switching of these loads.
- Drive the **coil** of a contactor from the relay output. Size the contactor contacts for at least 1.5-2x the equipment's full-load amps (check the nameplate), with an AC-3 or motor-rated duty class, and size breakers and wire to the nameplate and local code.
- Many dehumidifiers have their own controller board and humidistat. Switching their supply with a contactor works, but check whether the unit restarts in the state you want and whether it has its own built-in restart delay. Mini-splits should be controlled through their own thermostat or dry-contact input, not by cutting mains.
- Enforce the **300 s restart interlock** in software, and let the equipment's own delay act as a second layer.

## Protection

- One breaker per compressor load; GFCI/RCD protection on circuits in the wet room.
- Fuse or protect the low-voltage supplies. Use a 24 V supply for dampers and LED strips, sized with 20-25 % headroom.
- Use spring-return motorized dampers so the room seals itself on power loss.
- A hardware watchdog (or the ESP32 task watchdog) should reset the controller if the loop hangs. Outputs must default to the safe state after reset.

## Wet and dusty rooms

- IP65 or better enclosures, cable glands, drip loops, and conduit; keep the controller enclosure outside the humid room if possible, with only sensor and actuator wiring crossing the wall.
- Seal every wall penetration to keep the room's vapor barrier and light seal intact.
- Keep mains and low-voltage/sensor wiring in separate conduits; I2C runs should be short (use shielded cable or an I2C extender for long runs).

## Wiring layout (suggested)

1. Mains panel with breakers and GFCI, one circuit per compressor load, one for fans and controller, one for lighting drivers.
2. Control enclosure: MCU, relay module with isolated JD-VCC supply, contactors, 24 V supply, terminal blocks, fuses.
3. Field wiring: sensors (I2C or 1-wire), damper actuators (24 V), fan outputs, LED drivers (24 V), CO2 sensor.
4. Label everything and keep a wiring diagram with the project record.

## Worked example: two 600 W, 120 V dehumidifiers plus dampers on an ESP32 and an 8-channel board

Numbers are planning estimates; read the nameplates and have a licensed electrician confirm.

- Running current: 600 W / 120 V = 5 A each. Locked-rotor or start-up current can be 5-7 times that (25-35 A for a moment), which is why the contact is a contactor, not the relay.
- Contactor: 2-pole, contacts rated at least 20-25 A AC-3 class (1.5-2x the running current with margin for start-up), coil voltage matched to the relay supply you choose (24 V AC/DC or 120 V coil). Fit an RC snubber across an AC coil or a flyback diode across a DC coil.
- Breaker: one dedicated 15 A breaker with GFCI protection per dehumidifier, wire sized to code, so a trip on one does not take both down.
- Relay board: JD-VCC jumper removed, JD-VCC and its ground on a separate 5 V supply (rated for the sum of the coil currents), opto inputs driven from the ESP32 at 3.3 V (check the module). Outputs default OFF at boot.
- Dampers: 24 V spring-return actuators on a fused 24 V supply; relay ON = open, power loss = closed. One relay can drive several actuators if the supply covers their combined current.
- Fans: if each fan is small (<2 A), a relay contact can switch it; bigger fans go through a contactor or an SSR.
- Software: the 300 s restart interlock and the open/close sequencing are in `scripts/controller.py`; `scripts/esp32_main.py` shows the pin map.
- Bench test with all loads disconnected, then with lamps, before connecting the compressors.
