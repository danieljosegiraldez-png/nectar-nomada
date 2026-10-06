#!/usr/bin/env python3
"""Raspberry Pi 5 hardware layer for RoomController. UNTESTED TEMPLATE.

Prefer the ESP32 controller (esp32_main.py) with the Pi as logger. Use this only if the Pi
is the controller. Read references/vpd-and-pi5-companion.md first, especially the boot-time
relay hazard: fit external pull-up resistors (about 4.7-10 kohm to 3.3 V) on every relay
input so the board is OFF while Linux boots and whenever this script is not running.

Requires: gpiozero + lgpio (RPi.GPIO does not support the Pi 5), smbus2.
Run as a systemd service with Restart=always and the hardware watchdog enabled.
"""
import sys
import time

from smbus2 import SMBus, i2c_msg

try:
    from gpiozero import OutputDevice
except ImportError:  # development machine: dry run
    OutputDevice = None

from controller import Config, RoomController

I2C_IN, I2C_OUT = 1, 3           # two I2C buses (same sensor address); edit for your wiring
SHT_ADDR = 0x44
ACTIVE_LOW = True
PINS = {"damper": 5, "fans": 6, "circ": 13, "dehu1": 16, "dehu2": 19}   # BCM numbers (EDIT)
LOOP_S = 5
DEHU2_DELAY_S = 30


class Relay:
    def __init__(self, pin):
        # active_high=False: .on() drives the line LOW. initial_value=False: starts OFF.
        self.dev = OutputDevice(pin, active_high=not ACTIVE_LOW, initial_value=False) if OutputDevice else None
        self.state = False

    def set(self, on):
        self.state = bool(on)
        if self.dev is not None:
            self.dev.on() if on else self.dev.off()


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def read_sht4x(bus_no):
    """dict(t, rh, ts) or None. Never raises."""
    try:
        with SMBus(bus_no) as bus:
            bus.i2c_rdwr(i2c_msg.write(SHT_ADDR, [0xFD]))
            time.sleep(0.012)
            rd = i2c_msg.read(SHT_ADDR, 6)
            bus.i2c_rdwr(rd)
            d = list(rd)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            return None
        t = -45 + 175 * ((d[0] << 8) | d[1]) / 65535
        rh = max(0.0, min(100.0, -6 + 125 * ((d[3] << 8) | d[4]) / 65535))
        return {"t": t, "rh": rh, "ts": time.time()}
    except Exception as exc:  # noqa: BLE001
        print("sensor error", repr(exc), file=sys.stderr)
        return None


def main():
    relays = {k: Relay(p) for k, p in PINS.items()}
    rc = RoomController(Config())
    dehu_since = None
    try:
        while True:
            try:
                out = rc.step(time.time(), read_sht4x(I2C_IN), read_sht4x(I2C_OUT))
                now = time.time()
                want = out["dehumidifier_compressor"]
                dehu_since = (dehu_since or now) if want else None
                relays["circ"].set(out["circulation_fan"])
                relays["damper"].set(out["damper_open"])
                relays["fans"].set(out["extraction_fans"])
                relays["dehu1"].set(want)
                relays["dehu2"].set(want and now - dehu_since >= DEHU2_DELAY_S)
                print(time.strftime("%H:%M:%S"), out["mode"], out["reason"], out["alarms"])
            except Exception as exc:  # noqa: BLE001
                for r in relays.values():
                    r.set(False)
                print("fault", repr(exc), file=sys.stderr)
            time.sleep(LOOP_S)
    finally:
        for r in relays.values():
            r.set(False)   # external pull-ups keep the lines OFF after this process exits


if __name__ == "__main__":
    main()
