"""BMP390 forced conversion. Polynomial implementation from datasheet equations.
Returns raw ADC values and per-device NVM trim bytes for later reprocessing.
"""
import struct
from compat import ticks_ms, ticks_diff, wait_ms

def compensate(trim, raw_p, raw_t):
    if len(trim) != 21 or trim == bytes(21) or trim == b'\xff' * 21:
        raise ValueError('BMP_TRIM')
    c = struct.unpack('<HHbhhbbHHbbhbb', trim)
    t1, t2, t3 = c[0]*256.0, c[1]/2**30, c[2]/2**48
    p = [(c[3]-16384)/2**20, (c[4]-16384)/2**29,
         c[5]/2**32, c[6]/2**37, c[7]*8.0, c[8]/64.0,
         c[9]/256.0, c[10]/32768.0, c[11]/2**48,
         c[12]/2**48, c[13]/2**65]
    d = raw_t-t1
    t = d*t2 + d*d*t3
    pressure = (p[4]+t*(p[5]+t*(p[6]+t*p[7]))) + raw_p*(
        p[0]+t*(p[1]+t*(p[2]+t*p[3]))) + raw_p*raw_p*(
        p[8]+p[9]*t+raw_p*p[10])
    if not (-40 <= t <= 85 and 30000 <= pressure <= 125000):
        raise ValueError('BMP_RANGE')
    return round(pressure, 2), round(t, 3)

class BMP390:
    def __init__(self, bus, address=0x77):
        self.bus, self.address = bus, address
    def reg(self, r, n=1): return self.bus.readfrom_mem(self.address, r, n)
    def write(self, r, v): self.bus.writeto_mem(self.address, r, bytes([v]))
    def read(self, feed=lambda: None):
        if self.reg(0)[0] != 0x60: raise ValueError('BMP_ID')
        self.write(0x7e, 0xb6)
        wait_ms(10, feed)
        trim = self.reg(0x31, 21)
        self.write(0x1c, 0x0b)  # pressure 8x, temperature 2x
        self.write(0x1f, 0)     # IIR off for cold-start measurements
        self.write(0x1b, 0x13)  # enable P,T and forced mode
        start = ticks_ms()
        while (self.reg(3)[0] & 0x60) != 0x60:
            if ticks_diff(ticks_ms(), start) > 250: raise OSError('BMP_TIMEOUT')
            wait_ms(5, feed)
        if self.reg(2)[0] & 7: raise ValueError('BMP_STATUS')
        b = self.reg(4, 6)
        rp = b[0] | b[1]<<8 | b[2]<<16
        rt = b[3] | b[4]<<8 | b[5]<<16
        pressure, temp = compensate(trim, rp, rt)
        return {'raw_p':rp, 'raw_t':rt, 'trim':list(trim),
                'pa':pressure, 'die_t_c':temp}
