"""PCM-derived features; RMS in normalized full-scale units, never dB SPL."""
import struct
import math

def features(pcm, rate=16000):
    n = len(pcm)//4
    if n < 2 or len(pcm)%4: raise ValueError('AUDIO_LENGTH')
    total, sq, peak, clipped = 0, 0, 0, 0
    for i in range(n):
        v = struct.unpack_from('<i', pcm, i*4)[0] >> 8
        total += v
        sq += v*v
        peak = max(peak, abs(v))
        clipped += abs(v) >= 8300000
    mean = total/n
    rms = math.sqrt(max(0, sq/n-mean*mean))/8388608
    return {'n':n,'rate_hz':rate,'rms_fs':round(rms,7),
            'peak_fs':round(peak/8388608,7), 'clipped':clipped,
            'dc_fs':round(mean/8388608,7)}
