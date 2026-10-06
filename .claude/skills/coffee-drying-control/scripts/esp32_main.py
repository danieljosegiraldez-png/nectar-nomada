"""MicroPython hardware layer for RoomController (ESP32). TEMPLATE: review pins and
wiring, then bench-test with the loads DISCONNECTED before connecting mains.

Copy controller.py next to this file as controller.py. This file only does I/O:
all decisions, interlocks and sequencing live in controller.RoomController.

Safety design
  * Relay outputs are driven to OFF *before* anything else runs at boot.
  * Relay board: VCC/JD-VCC jumper removed, coil side on its own 5 V supply.
  * Compressor loads go through a contactor whose coil the relay drives.
  * Dampers are spring-return: relay ON = open, power loss = closed.
  * Hardware watchdog resets the board if the loop hangs; reset => outputs OFF
    and the controller waits the 300 s compressor interlock again.
"""
import time

from machine import I2C, Pin, WDT  # type: ignore  (MicroPython)

from controller import Config, RoomController

# ---- pins (EDIT) -----------------------------------------------------------
ACTIVE_LOW = True            # most opto relay boards switch on a LOW input
RELAY_PINS = {
    "damper": 25,            # spring-return damper actuators (open when ON)
    "fans": 26,              # extraction + intake fans (contactor or SSR if > relay rating)
    "dehu1": 27,             # contactor coil, dehumidifier 1
    "dehu2": 14,             # contactor coil, dehumidifier 2
    "circ": 12,              # circulation fan
}
I2C_IN = dict(scl=22, sda=21)     # inside SHT45/SHT31 (addr 0x44)
I2C_OUT = dict(scl=19, sda=18)    # outside sensor on a separate bus (same address)
LOOP_S = 5
DEHU2_DELAY_S = 30           # stagger second dehumidifier start (inrush)
WDT_MS = 20000
LOG_URL = None               # e.g. 'http://192.168.1.50:8080' to log to pi_logger.py
LOG_EVERY_S = 60

# ---- outputs: safe state first ----------------------------------------------
_OFF = 1 if ACTIVE_LOW else 0
_ON = 0 if ACTIVE_LOW else 1
relays = {}
for _name, _pin in RELAY_PINS.items():
    # value=_OFF in the constructor sets the level as the pin becomes an output.
    relays[_name] = Pin(_pin, Pin.OUT, value=_OFF)


def set_relay(name, on):
    relays[name].value(_ON if on else _OFF)


def all_off():
    for n in relays:
        relays[n].value(_OFF)


# ---- SHT4x / SHT3x style read (SHT45 shown) ---------------------------------
def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def read_sht4x(i2c, addr=0x44):
    """Return dict(t, rh, ts) or None. Never raises, never blocks long."""
    try:
        i2c.writeto(addr, b"\xfd")           # measure, high precision
        time.sleep_ms(12)
        d = i2c.readfrom(addr, 6)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            return None                      # corrupted frame: let SensorGuard fall back
        t = -45 + 175 * ((d[0] << 8) | d[1]) / 65535
        rh = -6 + 125 * ((d[3] << 8) | d[4]) / 65535
        return {"t": t, "rh": max(0.0, min(100.0, rh)), "ts": time.time()}
    except Exception:  # noqa: BLE001  I2C errors must not stop the loop
        return None


def post_log(ins, outs, out, co2):
    """Best-effort sample upload to the Pi. Failure is ignored: control never depends on it."""
    if not LOG_URL:
        return
    try:
        import json
        import urequests  # type: ignore  (MicroPython)
        body = {"t_in": ins and ins["t"], "rh_in": ins and ins["rh"],
                "t_out": outs and outs["t"], "rh_out": outs and outs["rh"],
                "mode": out["mode"], "reason": out["reason"], "damper": int(out["damper_open"]),
                "fans": int(out["extraction_fans"]), "dehu": int(out["dehumidifier_compressor"]),
                "co2": co2, "alarms": out["alarms"]}
        r = urequests.post(LOG_URL, data=json.dumps(body))
        r.close()
    except Exception:  # noqa: BLE001
        pass


def read_co2():
    """Hook for an SCD4x or other NDIR sensor. Return ppm or None."""
    return None


def is_raining():
    """Hook for a rain sensor (digital pin). Return bool."""
    return False


# ---- main loop --------------------------------------------------------------
def main():
    i2c_in = I2C(0, **I2C_IN, freq=100000)
    i2c_out = I2C(1, **I2C_OUT, freq=100000)
    rc = RoomController(Config())
    wdt = WDT(timeout=WDT_MS)
    last_mode = None
    dehu_on_since = None
    last_log = 0
    while True:
        try:
            ins, outs, co2 = read_sht4x(i2c_in), read_sht4x(i2c_out), read_co2()
            out = rc.step(time.time(), ins, outs, co2_ppm=co2, raining=is_raining())
            if time.time() - last_log >= LOG_EVERY_S:
                last_log = time.time()
                post_log(ins, outs, out, co2)
            set_relay("circ", out["circulation_fan"])
            set_relay("damper", out["damper_open"])
            set_relay("fans", out["extraction_fans"])
            # One compressor decision drives both dehumidifiers. The second starts
            # DEHU2_DELAY_S after the first so their start-up currents do not stack;
            # both stop together.
            now = time.time()
            want = out["dehumidifier_compressor"]
            if want and dehu_on_since is None:
                dehu_on_since = now
            if not want:
                dehu_on_since = None
            set_relay("dehu1", want)
            set_relay("dehu2", want and now - dehu_on_since >= DEHU2_DELAY_S)
            if out["mode"] != last_mode or out["alarms"]:
                print(time.time(), out["mode"], out["reason"], out["alarms"])
                last_mode = out["mode"]
        except Exception as exc:  # noqa: BLE001  hardware layer: never leave relays unknown
            all_off()
            print("fault", repr(exc))
        wdt.feed()
        time.sleep(LOOP_S)


main()
