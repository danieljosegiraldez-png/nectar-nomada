"""Self-checking tests for controller.py. Run:  python3 test_controller.py

No pytest needed (also runs on a Pi). Prints the humidity-gate scenario table
so you can sanity-check the thresholds against your own site data.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from controller import Config, RoomController, SensorGuard, ah_gm3, dew_point_c, vpd_kpa  # noqa: E402

T0 = 100000.0


def reading(t, rh, now):
    return {"t": t, "rh": rh, "ts": now}


def run_case(inside, outside, co2=None, raining=False):
    """Fresh controller, one tick, long after startup so dwell timers are met."""
    rc = RoomController()
    now = T0
    out = rc.step(now, reading(*inside, now), reading(*outside, now) if outside else None,
                  co2_ppm=co2, raining=raining)
    return out


def test_psychrometrics():
    assert abs(ah_gm3(25, 60) - 13.8) < 0.2
    assert abs(dew_point_c(25, 60) - 16.7) < 0.2
    assert dew_point_c(30, 100) > 29.9


def test_scenarios():
    cases = [
        # name, inside(T,RH), outside(T,RH), expected mode
        ("warm, drier outside (+1 C)", (26, 65), (27, 45), "VENTILATE"),
        ("drier but 3 C hotter than room", (26, 65), (29, 42), "DEHUMIDIFY"),
        ("user's 3 pm case (heat import)", (25, 66), (29, 44), "DEHUMIDIFY"),
        ("hot dry afternoon (above temp cap)", (26, 65), (31, 38), "DEHUMIDIFY"),
        ("similar air", (26, 65), (29, 55), "DEHUMIDIFY"),
        ("cool humid night", (25, 70), (22, 92), "DEHUMIDIFY"),
        ("rain-saturated", (25, 65), (24, 95), "DEHUMIDIFY"),
        ("RH trap (lower RH, warmer)", (25, 60), (31, 52), "DEHUMIDIFY"),
        ("room already dry", (25, 50), (24, 95), "CLOSED"),
    ]
    print("\n%-38s %-9s %-9s %-7s %s" % ("case", "inside", "outside", "dAH", "mode"))
    for name, i, o, expected in cases:
        mode = run_case(i, o)["mode"]
        d_ah = ah_gm3(*i) - ah_gm3(*o)
        print("%-38s %-9s %-9s %+6.1f  %s" % (name, "%d/%d" % i, "%d/%d" % o, d_ah, mode))
        assert mode == expected, (name, mode, expected)


def test_failure_modes():
    assert run_case((26, 65), None)["mode"] == "DEHUMIDIFY"          # no outside data: never vent
    assert "outside_sensor" in run_case((26, 65), None)["alarms"]
    rc = RoomController()
    out = rc.step(T0, None, reading(29, 42, T0))                      # no inside data
    assert out["mode"] == "FAILSAFE" and not out["damper_open"]
    assert not out["dehumidifier_compressor"] and out["circulation_fan"]
    assert run_case((26, 65), (29, 42), raining=True)["mode"] == "DEHUMIDIFY"


def test_sensor_guard():
    cfg = Config()
    g = SensorGuard(cfg)
    now = 1000.0
    assert g.accept(reading(25, 60, now), now) is not None
    assert g.accept(reading(float("nan"), 60, now + 10), now + 10) is not None  # falls back to fresh last
    assert g.accept({"t": "x"}, now + 20) is not None                           # garbage, still fresh
    assert g.accept(None, now + cfg.max_age + 5) is None                        # last value now stale
    g2 = SensorGuard(cfg)
    g2.accept(reading(25, 60, now), now)
    assert g2.accept(reading(25, 99, now + 10), now + 10)["rh"] == 60           # spike rejected
    assert g2.accept(reading(25, 99, now + 20), now + 20)["rh"] == 60
    assert g2.accept(reading(25, 99, now + 30), now + 30)["rh"] == 60
    assert g2.accept(reading(25, 99, now + 40), now + 40)["rh"] == 99           # persistent: accepted


def test_compressor_interlock_and_sequencing():
    cfg = Config()
    rc = RoomController(cfg)
    wet_in, rain_out = (26, 70), (24, 95)
    t = T0
    o = rc.step(t, reading(*wet_in, t), reading(*rain_out, t))
    assert not o["dehumidifier_compressor"]          # boot counts as a compressor stop
    t += 10
    o = rc.step(t, reading(*wet_in, t), reading(*rain_out, t))
    assert not o["dehumidifier_compressor"]
    t += cfg.comp_min_off
    o = rc.step(t, reading(*wet_in, t), reading(*rain_out, t))
    assert o["mode"] == "DEHUMIDIFY" and o["dehumidifier_compressor"]
    # RH drops below target - hysteresis -> CLOSED, compressor stops
    t += 10
    o = rc.step(t, reading(26, 50, t), reading(*rain_out, t))
    assert o["mode"] == "CLOSED" and not o["dehumidifier_compressor"]
    stopped = t
    # Humid again immediately: must NOT restart until 300 s have passed
    while t < stopped + cfg.comp_min_off - 10:
        t += 10
        o = rc.step(t, reading(*wet_in, t), reading(*rain_out, t))
        assert o["mode"] == "DEHUMIDIFY" and not o["dehumidifier_compressor"], t - stopped
    t += 20
    o = rc.step(t, reading(*wet_in, t), reading(*rain_out, t))
    assert o["dehumidifier_compressor"], "should restart after interlock"

    # The outside air dries out gradually (the sensor guard rightly rejects a
    # 50 %RH jump in one sample). Ventilation starts once the AH advantage >= 2 g/m3:
    # compressor off first, damper opens, fans follow damper_open_delay later.
    waypoints = [(25, 75), (27, 58), (29, 42)]
    o = None
    for wp in waypoints:
        t += 10
        o = rc.step(t, reading(*wet_in, t), reading(*wp, t))
        if o["mode"] == "VENTILATE":
            break
    good_out = wp
    assert o["mode"] == "VENTILATE", o
    assert not o["dehumidifier_compressor"] and o["damper_open"] and not o["extraction_fans"]
    t += cfg.damper_open_delay
    o = rc.step(t, reading(*wet_in, t), reading(*good_out, t))
    assert o["extraction_fans"] and o["intake_fan"]
    # Rain starts: ventilation is held for min_vent_on, then fans stop before dampers close
    t += cfg.min_vent_on
    o = rc.step(t, reading(*wet_in, t), reading(*good_out, t), raining=True)
    assert o["mode"] == "DEHUMIDIFY" and not o["extraction_fans"] and o["damper_open"]
    assert not o["dehumidifier_compressor"], "compressor must wait for sealed room"
    t += cfg.damper_close_delay
    o = rc.step(t, reading(*wet_in, t), reading(*good_out, t), raining=True)
    assert not o["damper_open"]


def test_co2_override():
    o = run_case((26, 65), (24, 95), co2=2500)
    assert o["mode"] == "PURGE" and o["damper_open"]          # purge even though outside is wetter
    o = run_case((26, 65), (24, 95), co2=5200)
    assert o["mode"] == "PURGE" and "co2_alarm" in o["alarms"]
    o = run_case((26, 65), (24, 95), co2=600)
    assert o["mode"] == "DEHUMIDIFY"


def test_fault_goes_failsafe():
    rc = RoomController()
    rc.cfg = None  # force an exception inside step()
    o = rc.step(T0, reading(26, 65, T0), reading(29, 42, T0))
    assert o["mode"] == "FAILSAFE" and "fault" in o["alarms"] and not o["damper_open"]


def test_power_restore_waits_for_interlock():
    # First tick after boot with a humid room: dehumidify is wanted, but the
    # compressor must stay off until 300 s have passed since power returned.
    rc = RoomController()
    o = rc.step(T0, reading(26, 70, T0), reading(24, 95, T0))
    assert o["mode"] == "DEHUMIDIFY" and not o["dehumidifier_compressor"]
    t = T0 + 301
    o = rc.step(t, reading(26, 70, t), reading(24, 95, t))
    assert o["dehumidifier_compressor"]


def test_vpd():
    assert abs(vpd_kpa(20, 55) - 1.05) < 0.02 and abs(vpd_kpa(18, 58) - 0.87) < 0.02
    assert vpd_kpa(25, 100) == 0.0


def test_sizing():
    import sizing
    assert not sizing.run_width_check(144.0)["fits"] and sizing.run_width_check(146.0)["fits"]
    t = sizing.tray_load(600)
    assert abs(t["area_m2"] - 0.675) < 0.005 and abs(t["kg"] - 12.1) < 0.2
    assert abs(sizing.vent_advantage_needed(1.5, 600) - 2.5) < 1e-9
    assert sizing.insulation_effect(144, 1, 0)["run_in"] == 142


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in tests:
        fn()
        print("ok   %s" % fn.__name__)
    print("\nall %d tests passed" % len(tests))
