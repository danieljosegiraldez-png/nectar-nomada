"""V1-P1 wiring is fixed in docs/WIRING.md. All logic is 3.3V."""
from machine import Pin,SoftI2C,ADC,UART
from compat import wait_ms
class Board:
    def __init__(self):
        self.rail=Pin(14,Pin.OUT,value=0)
        self.divider=Pin(15,Pin.OUT,value=0)
        self.reset=Pin(6,Pin.OUT,value=0)
        self.reed=Pin(19,Pin.IN)  # always-on pullup, input through Ioff buffer
        self.latch=Pin(20,Pin.IN)
        self.clear=Pin(21,Pin.OUT,value=0)
        self.service=Pin(22,Pin.IN,Pin.PULL_UP)
        self.bus=None
        self.uart=UART(0,baudrate=9600,tx=Pin(0),rx=Pin(1),
                       timeout=10,timeout_char=10,txbuf=4096,rxbuf=4096)
    def sensors_on(self,feed):
        self.rail.value(1); wait_ms(500,feed)
        self.reset.value(1); wait_ms(2,feed)
        self.bus=SoftI2C(sda=Pin(4),scl=Pin(5),freq=100000,timeout=10000)
    def isolate(self):
        self.reset.value(0); wait_ms(1); self.reset.value(1)
    def branch(self,channel,operation):
        self.isolate()
        try:
            self.bus.writeto(0x70,bytes([1<<channel]))
            return operation(self.bus)
        finally:
            # Hardware reset disconnects a shorted downstream SDA or SCL.
            self.isolate()
    def battery(self,cfg,feed):
        self.divider.value(1)
        try:
            wait_ms(50,feed)
            adc=ADC(26); samples=[adc.read_u16() for _ in range(16)]
            raw=sum(samples)/len(samples)
            return {'raw_u16':round(raw),'mv':round(raw/65535*cfg['adc_reference_mv']*cfg['battery_gain'])}
        finally: self.divider.value(0)
    def inspection(self,feed):
        values=[]
        for _ in range(5):
            values.append(self.reed.value()); wait_ms(10,feed)
        if min(values)!=max(values): raise ValueError('REED_UNSTABLE')
        return {'open':bool(values[0]),'latched':bool(self.latch.value())}
    def clear_inspection(self):
        # Only clear while lid closed: avoid simultaneously asserted set/reset.
        if self.reed.value()==0:
            self.clear.value(1); wait_ms(1); self.clear.value(0)
    def off(self):
        self.reset.value(0)
        for p in (4,5,12,13,16,17,18): Pin(p,Pin.IN,pull=None)
        self.rail.value(0); self.divider.value(0)
