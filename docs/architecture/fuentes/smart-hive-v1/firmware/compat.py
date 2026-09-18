"""Small clock compatibility layer; desktop tests do not emulate electrical timing."""
import time
try:
    ticks_ms = time.ticks_ms
    ticks_diff = time.ticks_diff
    sleep_ms = time.sleep_ms
    sleep_us = time.sleep_us
except AttributeError:
    def ticks_ms(): return int(time.monotonic() * 1000)
    def ticks_diff(a, b): return a - b
    def sleep_ms(ms): time.sleep(ms / 1000)
    def sleep_us(us): time.sleep(us / 1000000)

def wait_ms(ms, feed=lambda: None):
    start = ticks_ms()
    while ticks_diff(ticks_ms(), start) < ms:
        feed()
        sleep_ms(min(20, max(1, ms - ticks_diff(ticks_ms(), start))))
