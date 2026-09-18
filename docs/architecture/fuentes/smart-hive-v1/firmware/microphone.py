"""ICS-43434, left channel, 32-bit I2S. Prototype-only EOL part; no auto substitutes."""
from machine import I2S, Pin
from compat import ticks_ms, ticks_diff, sleep_ms
from audio_features import features

def capture(feed=lambda: None):
    audio = I2S(1, sck=Pin(16), ws=Pin(17), sd=Pin(18),
                mode=I2S.RX, bits=32, format=I2S.MONO, rate=16000, ibuf=8192)
    done = [False]
    def completed(_): done[0] = True
    audio.irq(completed)
    try:
        # Discard 256 ms after clock startup; collect a separate 512 ms burst.
        for length in (16384, 32768):
            pcm = bytearray(length)
            done[0] = False
            audio.readinto(pcm)
            start = ticks_ms()
            while not done[0]:
                if ticks_diff(ticks_ms(), start) > 1500: raise OSError('AUDIO_TIMEOUT')
                feed()
                sleep_ms(2)
        result = features(pcm)
        if result['peak_fs'] == 0: raise ValueError('AUDIO_STUCK_ZERO')
        return result
    finally:
        audio.deinit()
        for p in (16,17,18): Pin(p, Pin.IN, pull=None)
