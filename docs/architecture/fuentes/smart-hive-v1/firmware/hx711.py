"""HX711 channel A / gain 128. Nonblocking readiness, bounded sample windows.
PIO makes clock-high widths independent of Python garbage collection/interrupts.
Uses PIO0 SM0; I2S must use ID1 (PIO1). RATE is physically strapped to 10 SPS.
"""
from compat import ticks_ms, ticks_diff, sleep_ms
import rp2
from machine import Pin

@rp2.asm_pio(sideset_init=rp2.PIO.OUT_LOW, in_shiftdir=rp2.PIO.SHIFT_LEFT)
def _shift():
    pull(block).side(0)
    wait(0, pin, 0).side(0)
    set(x, 23).side(0)
    label('bit')
    nop().side(1) [1]
    in_(pins, 1).side(1)
    jmp(x_dec, 'bit').side(0) [1]
    nop().side(1) [1]
    push(block).side(0)

class HX711:
    def __init__(self, data=12, clock=13):
        self.data = Pin(data, Pin.IN)
        self.clock = Pin(clock, Pin.OUT, value=0)
        self.sm = rp2.StateMachine(0, _shift, freq=1000000,
                                  in_base=self.data, sideset_base=self.clock)
        self.pending = False
        self.sm.active(1)

    def start(self):
        if self.pending: raise RuntimeError('HX_BUSY')
        self.sm.put(0)
        self.pending = True

    def poll(self):
        if not self.pending or not self.sm.rx_fifo(): return None
        value = self.sm.get() & 0xffffff
        self.pending = False
        if value & 0x800000: value -= 0x1000000
        if value in (-8388608, 8388607): raise ValueError('HX_SATURATED')
        return value

    def samples(self, count=15, timeout_ms=3000, feed=lambda: None):
        start = ticks_ms()
        result = []
        self.start()
        while len(result) < count:
            if ticks_diff(ticks_ms(), start) >= timeout_ms:
                raise OSError('HX_TIMEOUT')
            value = self.poll()
            if value is not None:
                result.append(value)
                if len(result) < count: self.start()
            feed()
            sleep_ms(1)
        return result

    def close(self):
        self.sm.active(0)
        self.clock.init(Pin.OUT, value=0)
        self.data.init(Pin.IN, pull=None)
