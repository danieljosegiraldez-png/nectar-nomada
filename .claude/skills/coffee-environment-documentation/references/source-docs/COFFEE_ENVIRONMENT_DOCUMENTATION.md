# COFFEE_ENVIRONMENT_DOCUMENTATION.md
# TECHNICAL COMPANION PACK: ADVANCED CLIMATE DESIGN & RASPBERRY PI 5 AUTOMATION LOOP

---

## 1. THERMODYNAMIC CORE: THE VPD CONVERSION FRAMEWORK
Operating a premium drying dark room in a tropical climate requires abandoning standard Relative Humidity (RH) triggers. RH is a percentage relative to temperature; it does not measure the actual moisture extraction pressure on the cellular walls of a drying seed. We use Vapor Pressure Deficit (VPD), calculated via the Tetens Equation.

### The Mathematics
1. **Saturated Vapor Pressure ($VP_{sat}$)** in kilopascals (kPa) at a given Celsius temperature ($T$):
   $$VP_{sat} = 0.61078 \times e^{\left(\frac{17.27 \times T}{T + 237.3}\right)}$$

2. **Actual Vapor Pressure ($VP_{act}$)** based on the measured Relative Humidity ($RH$):
   $$VP_{act} = VP_{sat} \times \left(\frac{RH}{100}\right)$$

3. **Vapor Pressure Deficit (VPD):**
   $$VPD = VP_{sat} - VP_{act} = VP_{sat} \times \left(1 - \frac{RH}{100}\right)$$

### Cross-Industry Target Thresholds
- **Specialty Coffee Cold Cure:** $15.5^\circ\text{C} - 20.0^\circ\text{C}$ | $55\% - 60\% \text{ RH}$ | **Target VPD:** $0.85\text{ kPa} - 1.05\text{ kPa}$
- **Top-Tier Cannabis Drying:** $15.0^\circ\text{C} - 16.5^\circ\text{C}$ | $60\% - 62\% \text{ RH}$ | **Target VPD:** $0.75\text{ kPa} - 0.85\text{ kPa}$
- **Fine Convective Cacao Phase:** $45.0^\circ\text{C} - 55.0^\circ\text{C}$ | Controlled Convection | Focused Acid Diffusion

---

## 2. HARDWARE INFRASTRUCTURE & ISOLATION BLUEPRINT

### The VCC-JDVCC Separation Protocol
To prevent high-voltage electrical inductive spikes (back-EMF) from heavy compressor magnetic coils from reaching the Raspberry Pi 5 processor logic, you must pull the physical jumper off the relay board and isolate power.

```
       [ RASPBERRY PI 5 ]                          [ ISOLATED RELAY BOARD ]
   +-----------------------+                    +----------------------------+
   | Pin 4 (5V Power)      |------------------->| VCC (Input Logic Power)    |
   | GPIO Pins (Logic Out) |------------------->| IN1, IN2, IN3, IN4         |
   |                       |                    |                            |
   |   [DO NOT CONNECT]    |                    | JD-VCC (Coil Power Input)  |<-+
   | Pin 6 (Pi Ground)     |                    | GND (Input Logic Ground)   |  |
   +-----------------------+                    +----------------------------+  |
                                                                                |
       [ EXTERNAL AC-DC SUPPLY ]                                                |
   +-----------------------+                                                    |
   | 5V Positive (+) Out   |----------------------------------------------------+
   | Ground (-) Out        |----------------------------------------------------> [Relay Coil GND]
   +-----------------------+
```

### Complete System Bill of Materials (BOM)
- **Computing Hub:** Raspberry Pi 5 (4GB/8GB) with Active Cooler and Battery Backed RTC.
- **Sensory Array:** Sensirion SHT45 (or SHT31-D) via I2C protocol enclosed in an IP65 sintered weather-proof mesh cap.
- **Relay Mechanism:** 5V multi-channel optocoupled relay board.
- **Heavy Power Switches:** 2-Pole Definite Purpose Contactors (25A Inductive rating) for Dehumidifiers.
- **Vapor Isolation:** Spring-loaded butterfly backdraft dampers with neoprene gaskets integrated into the exhaust loops.

---

## 3. MASTER AUTOMATION ENGINE: PYTHON LOGIC LOOP
This production-ready Python script runs on the Raspberry Pi 5. It interfaces with an SHT4x sensor via I2C, calculates real-time VPD using the Tetens Equation, manages the physical isolation of the room via synchronous fan/damper controls, and strictly enforces a 5-minute compressor anti-short-cycle delay.

```python
#!/usr/bin/env python3
import time
import math
import sys
try:
    import RPi.GPIO as GPIO
except ImportError:
    # Fallback simulation flag for development testing
    GPIO = None
import smbus2

# ==========================================
# CONSTANTS & ENVIRONMENT SETTINGS
# ==========================================
SHT4X_I2C_ADDR = 0x44  # Standard SHT4x I2C address
I2C_BUS_NUMBER = 1     # Default Pi 5 I2C interface bus

# GPIO Pin Mapping (Broadcom BCM numbering)
PIN_EXHAUST_FAN  = 5   # Channel 1: Vent Fan & Mechanical Backdraft Damper
PIN_INTAKE_FAN   = 6   # Channel 2: Intake Fan
PIN_CIRC_FANS    = 13  # Channel 3: Internal Room Circulation Fans (Mixing)
PIN_DEHUMID_1    = 16  # Channel 4: Dehumidifier 1 Contactor Coil
PIN_DEHUMID_2    = 19  # Channel 5: Dehumidifier 2 Contactor Coil

# Target VPD Operating Windows (in kilopascals)
VPD_TARGET_MID   = 0.95   # Ideal moisture-driving vapor pressure deficit
VPD_HYSTERESIS   = 0.05   # Dead-band filter to stabilize appliance flapping
COMPRESSOR_DELAY = 300    # Hardcoded anti-short-cycle timeout (5 Minutes)

# ==========================================
# DATA STRUGGLE & STATE ENGINE STATE
# ==========================================
class ClimateEngineState:
    def __init__(self):
        self.dehumidifiers_active = False
        self.last_dehumidifier_toggle = 0.0  # Unix timestamp tracking epochs

state = ClimateEngineState()

# ==========================================
# THERMODYNAMIC CALCULATIONS
# ==========================================
def calculate_vpd(temperature, relative_humidity):
    """
    Calculates Vapor Pressure Deficit (VPD) in kPa using the Tetens Equation.
    """
    # Saturated vapor pressure equation
    vp_sat = 0.61078 * math.exp((17.27 * temperature) / (temperature + 237.3))
    # Actual vapor pressure equation
    vp_act = vp_sat * (relative_humidity / 100.0)
    # Deficit calculation
    vpd = vp_sat - vp_act
    return max(0.0, vpd)

# ==========================================
# HARDWARE INTERFACE DRIVERS
# ==========================================
def read_sht45():
    """
    Issues commands over I2C to read temperature and humidity from the SHT45.
    Returns a tuple of (Temperature_C, Relative_Humidity_Pct)
    """
    try:
        bus = smbus2.SMBus(I2C_BUS_NUMBER)
        # High precision measurement command code
        bus.write_byte(SHT4X_I2C_ADDR, 0xFD)
        time.sleep(0.01) # SHT4x measurement delay requirement
        
        # Read back 6 bytes of data (Temp MSB/LSB/CRC, Humidity MSB/LSB/CRC)
        data = bus.read_i2c_block_data(SHT4X_I2C_ADDR, 0x00, 6)
        bus.close()
        
        raw_temp = (data[0] << 8) + data[1]
        raw_rh = (data[3] << 8) + data[4]
        
        # Physical scale transformations
        celsius = -45.0 + 175.0 * float(raw_temp) / 65535.0
        rh_percentage = -6.0 + 125.0 * float(raw_rh) / 65535.0
        rh_percentage = max(0.0, min(100.0, rh_percentage))
        
        return celsius, rh_percentage
    except Exception as e:
        print(f"[CRITICAL ERROR] Failed to parse SHT45 via I2C: {e}", file=sys.stderr)
        return None, None

def initialize_hardware():
    if GPIO is None:
        print("[SIMULATION MODE] Running without physical RPi.GPIO library bindings.")
        return
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    
    output_pins = [PIN_EXHAUST_FAN, PIN_INTAKE_FAN, PIN_CIRC_FANS, PIN_DEHUMID_1, PIN_DEHUMID_2]
    for pin in output_pins:
        # Standard relay configurations: Low Trigger arrays require default HIGH initialization
        GPIO.setup(pin, GPIO.OUT, initial=GPIO.HIGH)

def write_relay_state(pin, turn_on):
    if GPIO is None:
        return
    # Logic inversion mapping: Low Trigger Relays close contact when line pulled LOW (0)
    GPIO.output(pin, GPIO.LOW if turn_on else GPIO.HIGH)

# ==========================================
# CONTROL ENGINE RECURSION LOOP
# ==========================================
def orchestrate_microclimate():
    initialize_hardware()
    # Continuous internal circulation must always run to eliminate stagnant air layers
    write_relay_state(PIN_CIRC_FANS, turn_on=True)
    
    print("\n--- COFFEE METASKILL SYSTEM AUTOMATION ONLINE ---")
    print(f"Target Core VPD: {VPD_TARGET_MID} kPa | Hysteresis Band: +/- {VPD_HYSTERESIS} kPa")
    
    try:
        while True:
            current_time = time.time()
            temp, rh = read_sht45()
            
            if temp is None or rh is None:
                time.sleep(10)
                continue
                
            current_vpd = calculate_vpd(temp, rh)
            print(f"\n[METRICS] Temp: {temp:.2f}°C | RH: {rh:.1f}% | Calculated VPD: {current_vpd:.3f} kPa")
            
            # Action boundary parameters
            vpd_lower_limit = VPD_TARGET_MID - VPD_HYSTERESIS
            vpd_upper_limit = VPD_TARGET_MID + VPD_HYSTERESIS
            
            # -------------------------------------------------------------
            # CASE A: VPD IS TOO LOW (Air is too damp, coffee cannot dry)
            # Action: Fire up Dehumidifiers, cycle fresh air handling loops
            # -------------------------------------------------------------
            if current_vpd < vpd_lower_limit:
                if not state.dehumidifiers_active:
                    if (current_time - state.last_dehumidifier_toggle) >= COMPRESSOR_DELAY:
                        print(" -> [ACTION] VPD below thresholds. Triggering moisture extraction.")
                        write_relay_state(PIN_DEHUMID_1, turn_on=True)
                        write_relay_state(PIN_DEHUMID_2, turn_on=True)
                        write_relay_state(PIN_EXHAUST_FAN, turn_on=True)  # Forces damper valve open
                        write_relay_state(PIN_INTAKE_FAN, turn_on=True)
                        
                        state.dehumidifiers_active = True
                        state.last_dehumidifier_toggle = current_time
                    else:
                        time_left = int(COMPRESSOR_DELAY - (current_time - state.last_dehumidifier_toggle))
                        print(f" -> [ASYNCHRONOUS DELAY] Low VPD detected, but compressor is locked out for {time_left}s.")
            
            # -------------------------------------------------------------
            # CASE B: VPD IS TOO HIGH (Air is too dry, outer layer skin shock hazard)
            # Action: Kill active extraction, isolate room using dampers
            # -------------------------------------------------------------
            elif current_vpd > vpd_upper_limit:
                if state.dehumidifiers_active:
                    if (current_time - state.last_dehumidifier_toggle) >= COMPRESSOR_DELAY:
                        print(" -> [ACTION] Optimal drying speed exceeded. Shutting down systems to rest lot.")
                        write_relay_state(PIN_DEHUMID_1, turn_on=False)
                        write_relay_state(PIN_DEHUMID_2, turn_on=False)
                        write_relay_state(PIN_EXHAUST_FAN, turn_on=False)  # Mechanical damper snaps closed
                        write_relay_state(PIN_INTAKE_FAN, turn_on=False)
                        
                        state.dehumidifiers_active = False
                        state.last_dehumidifier_toggle = current_time
                    else:
                        time_left = int(COMPRESSOR_DELAY - (current_time - state.last_dehumidifier_toggle))
                        print(f" -> [ASYNCHRONOUS DELAY] High VPD detected, but compressor change is locked out for {time_left}s.")
            
            else:
                print(" -> [EQUILIBRIUM] Microclimate within target parameters. No structural modifications executed.")
                
            time.sleep(5)  # Scan frequency rate interval
            
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Terminating control engines safely.")
    finally:
        if GPIO is not None:
            GPIO.cleanup()

if __name__ == "__main__":
    orchestrate_microclimate()
```