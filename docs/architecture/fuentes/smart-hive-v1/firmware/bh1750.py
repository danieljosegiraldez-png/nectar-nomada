"""BH1750 one-shot high-resolution measurement, default MTreg=69."""
from compat import wait_ms
class BH1750:
    def __init__(self, bus, address=0x23): self.bus, self.address = bus, address
    def read(self, feed=lambda: None):
        self.bus.writeto(self.address, b'\x01')
        self.bus.writeto(self.address, b'\x07')
        self.bus.writeto(self.address, b'\x20')
        wait_ms(190, feed)
        b = self.bus.readfrom(self.address, 2)
        raw = b[0]*256+b[1]
        if raw == 65535: raise ValueError('LIGHT_SATURATED')
        return {'raw':raw, 'lux':round(raw/1.2, 2)}
