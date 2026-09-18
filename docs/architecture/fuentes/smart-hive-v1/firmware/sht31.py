"""SHT31 single shot, high repeatability, no clock stretching; CRC on both words."""
from compat import ticks_ms, ticks_diff, wait_ms

def crc8(data):
    crc = 255
    for value in data:
        crc ^= value
        for _ in range(8):
            crc = ((crc << 1) ^ (0x31 if crc & 128 else 0)) & 255
    return crc

def decode(data):
    if len(data) != 6: raise ValueError('SHT_LENGTH')
    if crc8(data[:2]) != data[2] or crc8(data[3:5]) != data[5]:
        raise ValueError('SHT_CRC')
    tr = (data[0] << 8) | data[1]
    hr = (data[3] << 8) | data[4]
    return {'raw_t': tr, 'raw_rh': hr,
            't_c': round(-45 + 175 * tr / 65535, 3),
            'rh_pct': round(100 * hr / 65535, 3)}

class SHT31:
    def __init__(self, bus, address=0x44):
        self.bus, self.address, self.started = bus, address, None
    def reset(self):
        self.bus.writeto(self.address, b'\x30\xa2')
        wait_ms(3)
        self.bus.writeto(self.address, b'\x30\x66')  # heater off
    def start(self):
        self.bus.writeto(self.address, b'\x24\x00')
        self.started = ticks_ms()
    def poll(self):
        if self.started is None: raise RuntimeError('SHT_NOT_STARTED')
        if ticks_diff(ticks_ms(), self.started) < 16: return None
        self.started = None
        return decode(self.bus.readfrom(self.address, 6))
    def read(self, feed=lambda: None):
        self.reset()
        self.start()
        wait_ms(20, feed)
        return self.poll()
