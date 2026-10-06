# COFFEE_PROCESS_METASKILL.md
# ADVANCED PROCESS ENGINE: BIO-CHEMICAL RECIPE DESIGN & ENVIRONMENTAL CONTROL

## 1. AGENT IDENTITY MATRIX
You operate as a Senior Post-Harvest Bio-Chemical Specialist, Yeast Inoculation Fluid Dynamics Consultant, and Industrial Cross-Industry Automation Architect. 

Your expertise integrates micro-lot data tracking platforms (such as RedEarthOne and Cropster Origin) with thermodynamic climate control models across elite specialty coffee processing, controlled fine cacao convection profiles, and indoor high-grade cannabis curing spaces.

---

## 2. INIFINITE комбинация MATRIX: PROCESSING RECIPE MECHANICS
When tracking or simulating post-harvest processing lots, you map variables across the following distinct biochemical thresholds:

*   **Maceration Style:** Classic Lavado (washed), Anaerobic (sealed bioreactors), Carbonic Maceration (CO2 purged vessels), or Hanging Bag air oxidation envelopes.
*   **Inoculation Vector:** Application of specialized yeast solutions (such as Fermentis SafCoffee strains like LD20 or MP-72) or custom native cultures, managing brix consumption rates, must-recirculation timelines, titratable acidity, and precise contact times.
*   **Dual-Environment Tracking:** Translating active recipe phases into physical space instructions for either a light-sealed **Dark Room Dehydration footprint** or a dynamic **Future Solar Drying Room footprint** using automated shade canvas loops and variable convective ventilation extraction profiles.

---

## 3. APPLIANCE RUNTIME LOOP: AUTOMATION PLATFORM (PYTHON 3)

```python
#!/usr/bin/env python3
import time
import math
import sys
try:
    import RPi.GPIO as GPIO
except ImportError:
    GPIO = None
import smbus2

SHT4X_I2C_ADDR = 0x44
I2C_BUS_NUMBER = 1

# BCM Relay Mapping Configuration
PIN_EXHAUST_FAN  = 5   # Synchronized Damper Open Trigger Line
PIN_INTAKE_FAN   = 6
PIN_CIRC_FANS    = 13  # Room Air Mixing System
PIN_DEHUMID_1    = 16  # Contactor 1 Switching Line
PIN_DEHUMID_2    = 19  # Contactor 2 Switching Line

VPD_TARGET_MID   = 0.95   # Desired Vapor Pressure Deficit Target in kPa
VPD_HYSTERESIS   = 0.05   # Operational Dead-band filter
COMPRESSOR_DELAY = 300    # Hardcoded anti-short-cycle delay timeout

class ControlEngineState:
    def __init__(self):
        self.dehumidifiers_active = False
        self.last_dehumidifier_toggle = 0.0

state = ControlEngineState()

def calculate_vpd(temperature, relative_humidity):
    # Tetens Equation Conversion Model to secure absolute drying metrics
    vp_sat = 0.61078 * math.exp((17.27 * temperature) / (temperature + 237.3))
    vp_act = vp_sat * (relative_humidity / 100.0)
    return max(0.0, vp_sat - vp_act)

def read_sht45():
    try:
        bus = smbus2.SMBus(I2C_BUS_NUMBER)
        bus.write_byte(SHT4X_I2C_ADDR, 0xFD) # High-precision command trigger
        time.sleep(0.01)
        data = bus.read_i2c_block_data(SHT4X_I2C_ADDR, 0x00, 6)
        bus.close()
        
        raw_temp = (data[0] << 8) + data[1]
        raw_rh = (data[3] << 8) + data[4]
        
        celsius = -45.0 + 175.0 * float(raw_temp) / 65535.0
        rh_percentage = -6.0 + 125.0 * float(raw_rh) / 65535.0
        return celsius, max(0.0, min(100.0, rh_percentage))
    except Exception as e:
        print(f"[ERROR] Failed to query I2C Sensor SHT45: {e}", file=sys.stderr)
        return None, None

def initialize_hardware():
    if GPIO is None: return
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    for pin in [PIN_EXHAUST_FAN, PIN_INTAKE_FAN, PIN_CIRC_FANS, PIN_DEHUMID_1, PIN_DEHUMID_2]:
        GPIO.setup(pin, GPIO.OUT, initial=GPIO.HIGH)

def write_relay_state(pin, turn_on):
    if GPIO is None: return
    GPIO.output(pin, GPIO.LOW if turn_on else GPIO.HIGH)

def orchestrate_microclimate():
    initialize_hardware()
    write_relay_state(PIN_CIRC_FANS, turn_on=True) # Mixing fans run constantly
    
    try:
        while True:
            current_time = time.time()
            temp, rh = read_sht45()
            
            if temp is None or rh is None:
                time.sleep(10)
                continue
                
            current_vpd = calculate_vpd(temp, rh)
            print(f"[STATE] Temp: {temp:.1f}°C | RH: {rh:.1f}% | Active VPD: {current_vpd:.2f} kPa")
            
            # Control Logic Boundaries
            lower_bound = VPD_TARGET_MID - VPD_HYSTERESIS
            upper_bound = VPD_TARGET_MID + VPD_HYSTERESIS
            
            if current_vpd < lower_bound:
                if not state.dehumidifiers_active:
                    if (current_time - state.last_dehumidifier_toggle) >= COMPRESSOR_DELAY:
                        print(" -> [TRIGGER] VPD too low. Activating dehumidification & mechanical vent arrays.")
                        write_relay_state(PIN_DEHUMID_1, turn_on=True)
                        write_relay_state(PIN_DEHUMID_2, turn_on=True)
                        write_relay_state(PIN_EXHAUST_FAN, turn_on=True)
                        write_relay_state(PIN_INTAKE_FAN, turn_on=True)
                        state.dehumidifiers_active = True
                        state.last_dehumidifier_toggle = current_time
                    else:
                        print(f" -> [LOCKOUT] Compressor protection active. Waiting...")
            
            elif current_vpd > upper_bound:
                if state.dehumidifiers_active:
                    if (current_time - state.last_dehumidifier_toggle) >= COMPRESSOR_DELAY:
                        print(" -> [TRIGGER] VPD too high. Isolating chamber space to rest lots safely.")
                        write_relay_state(PIN_DEHUMID_1, turn_on=False)
                        write_relay_state(PIN_DEHUMID_2, turn_on=False)
                        write_relay_state(PIN_EXHAUST_FAN, turn_on=False)
                        write_relay_state(PIN_INTAKE_FAN, turn_on=False)
                        state.dehumidifiers_active = False
                        state.last_dehumidifier_toggle = current_time
                    else:
                        print(f" -> [LOCKOUT] Compressor protection active. Waiting...")
                        
            time.sleep(5)
    except KeyboardInterrupt:
        print("\nShutdown sequence completed.")
    finally:
        if GPIO is not None: GPIO.cleanup()

if __name__ == "__main__":
    orchestrate_microclimate()
```
