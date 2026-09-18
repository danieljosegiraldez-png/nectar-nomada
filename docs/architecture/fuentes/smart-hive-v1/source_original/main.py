# main.py - Smart Hive Node Low-Power Operation Loop
# Target: Raspberry Pi Pico WH or ESP32 Microcontrollers
import machine
import time
import json
from machine import RTC, Pin, I2C

# Peripheral Power Rail Pins (Gated by P-Channel MOSFETs)
SENSOR_POWER = Pin(14, Pin.OUT)
CELLULAR_POWER = Pin(15, Pin.OUT)
DEEP_SLEEP_PERIOD_MS = 3600000  # 1-Hour Standby Interval

def get_timestamp(dt):
    # Formats hardware clock reading to ISO string
    return "{:04d}-{:02d}-{:02d}T{:02d}:00:00Z".format(dt[0], dt[1], dt[2], dt[4])

def read_hx711():
    # Placeholder for driver reading 24-bit raw scale differential value
    # In practice, substitute with an imported hx711 library
    return 245600 

def read_sht31():
    # Placeholder for I2C data conversion for SHT31-D climate probe
    # Implement standard I2C register query commands here
    return 34.5, 65.2

def save_log_entry(entry):
    try:
        with open("hive_data.json", "r") as f:
            data = json.load(f)
    except OSError:
        data = []
    
    data.append(entry)
    with open("hive_data.json", "w") as f:
        json.dump(data, f)

def transmit_batch_payload():
    # 1. Engage power gate to cellular hardware
    CELLULAR_POWER.value(1)
    time.sleep(5)  # Allow modem cell tower handshake
    
    try:
        with open("hive_data.json", "r") as f:
            payload = json.load(f)
            
        # Format for transmission to backend (e.g. Datacake via Blues Notecard)
        print("Transmitting payload via Blues Notecard:", json.dumps(payload))
        
        # Clean cache upon successful network transmission confirmation
        with open("hive_data.json", "w") as f:
            json.dump([], f)
    except OSError:
        pass
    finally:
        # Cut cellular power rail entirely
        CELLULAR_POWER.value(0)

def main():
    rtc = RTC()
    current_time = rtc.datetime()
    current_hour = current_time[4]
    
    # --- STEP 1: READ SENSORS ---
    SENSOR_POWER.value(1)
    time.sleep_ms(100)  # Allow sensor rails to settle
    
    raw_weight = read_hx711()
    temp, hum = read_sht31()
    
    SENSOR_POWER.value(0)  # Isolate sensor bus immediately
    
    # --- STEP 2: LOG PACKET TO FLASH ROM ---
    log_packet = {
        "ts": get_timestamp(current_time),
        "w": raw_weight,
        "t": temp,
        "h": hum
    }
    save_log_entry(log_packet)
    
    # --- STEP 3: CONDITIONAL TRANSMISSION WINDOW ---
    # Trigger cell tower transmission handshake once a day during the midnight window
    if current_hour == 0:
        transmit_batch_payload()
        
    # --- STEP 4: RE-ENTER ULTRA-LOW-POWER DEEP SLEEP ---
    machine.deepsleep(DEEP_SLEEP_PERIOD_MS)

if __name__ == "__main__":
    main()
