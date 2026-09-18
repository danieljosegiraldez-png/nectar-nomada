"""ADXL345 burst acquisition at 100Hz using FIFO; no spectral claims."""
import struct
import math
from compat import ticks_ms, ticks_diff, wait_ms
class ADXL345:
    def __init__(self, bus, address=0x53): self.bus, self.address = bus, address
    def reg(self, r, n=1): return self.bus.readfrom_mem(self.address, r, n)
    def write(self, r, v): self.bus.writeto_mem(self.address, r, bytes([v]))
    def read(self, feed=lambda: None, count=100):
        if self.reg(0)[0] != 0xe5: raise ValueError('ACCEL_ID')
        self.write(0x2d, 0)
        self.write(0x31, 0x0b)  # full resolution +/-16g
        self.write(0x2c, 0x0a)  # 100Hz normal power
        self.write(0x38, 0)
        self.write(0x38, 0x80)  # stream FIFO
        self.write(0x2e, 0)
        self.write(0x2d, 8)
        sums, squares = [0,0,0], [0,0,0]
        peak, n, start = 0, 0, ticks_ms()
        try:
            while n < count:
                entries = self.reg(0x39)[0] & 63
                if entries >= 32: raise OSError('ACCEL_FIFO_OVERRUN')
                for _ in range(min(entries, count-n)):
                    xyz = struct.unpack('<hhh', self.reg(0x32, 6))
                    if max(abs(v) for v in xyz) >= 4000:
                        raise ValueError('ACCEL_SATURATED')
                    for j,v in enumerate(xyz):
                        sums[j] += v
                        squares[j] += v*v
                    peak = max(peak, math.sqrt(sum(v*v for v in xyz))*0.0039)
                    n += 1
                if ticks_diff(ticks_ms(), start) > 2500: raise OSError('ACCEL_TIMEOUT')
                wait_ms(10, feed)
        finally:
            self.write(0x2d, 0)
        means = [s/count*0.0039 for s in sums]
        variance = sum(max(0, squares[i]/count-(sums[i]/count)**2) for i in range(3))
        x,y,z = means
        return {'mean_raw':[s/count for s in sums], 'n':n, 'rate_hz':100,
                'xyz_g':[round(v,5) for v in means],
                'ac_rms_g':round(math.sqrt(variance)*0.0039,5),
                'peak_total_g':round(peak,5),
                'tilt_deg':round(math.degrees(math.atan2(math.sqrt(x*x+y*y),z)),2)}
