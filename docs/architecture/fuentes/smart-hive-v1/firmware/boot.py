"""Leave rails off before importing application modules."""
from machine import Pin
Pin(14,Pin.OUT,value=0)
Pin(15,Pin.OUT,value=0)
Pin(6,Pin.OUT,value=0)
