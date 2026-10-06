"""controller.py -- reference control core for a sealed specialty-coffee drying room.

Hardware-agnostic and dependency-free so it runs on CPython (Raspberry Pi) and
MicroPython (ESP32). It decides WHAT the room should do each tick; a thin
hardware layer (not included, it depends on the board) reads sensors and drives
relays/contactors. Keeping the decision logic pure is what makes it testable.

Modes
  CLOSED      all ports shut, nothing running except circulation
  DEHUMIDIFY  ports shut, compressor dehumidifier runs on a closed air volume
  VENTILATE   ports open, intake + extraction fans run (outside air is drier)
  PURGE       ports open, fans run to dilute CO2 (safety; overrides humidity gate)
  FAILSAFE    inside sensor lost: ports shut, compressor off, alarm raised

Design rules enforced here (see references/control-logic.md for the why):
  * Compare ABSOLUTE humidity (g/m3), never RH% alone.
  * Compressor cannot restart within comp_min_off seconds (300 s) of stopping.
  * Compressor is always OFF before any damper opens.
  * Dampers open BEFORE fans start; fans stop BEFORE dampers close.
  * Any invalid/missing sensor degrades toward the sealed, safe state.
"""
import math


# --------------------------------------------------------------------------
# Psychrometrics
# --------------------------------------------------------------------------
def ah_gm3(t_c, rh_pct):
    """Absolute humidity in g/m3 from temperature (C) and RH (%).

    Magnus-type saturation vapour pressure (hPa) -> ideal-gas water density.
    """
    rh = max(0.1, min(100.0, rh_pct))
    es_hpa = 6.112 * math.exp(17.67 * t_c / (t_c + 243.5))
    return es_hpa * rh * 2.1674 / (273.15 + t_c)


def dew_point_c(t_c, rh_pct):
    """Dew point in C (Magnus). Use it to check surface condensation risk."""
    rh = max(0.1, min(100.0, rh_pct))
    g = math.log(rh / 100.0) + 17.62 * t_c / (243.12 + t_c)
    return 243.12 * g / (17.62 - g)


# --------------------------------------------------------------------------
# Configuration -- every number here is a starting point to tune from logs
# --------------------------------------------------------------------------
def vpd_kpa(t_c, rh_pct):
    """Vapor pressure deficit in kPa (Tetens). A restatement of T and RH at ONE temperature,
    useful as a monitored metric; it does not compare inside air with outside air, so do not
    use it alone to decide ventilation."""
    vs = 0.61078 * math.exp(17.27 * t_c / (t_c + 237.3))
    return max(0.0, vs * (1.0 - rh_pct / 100.0))


class Config:
    # Humidity target inside the room (%RH). We act above target, stop below
    # target - rh_hyst.
    rh_target = 58.0
    rh_hyst = 3.0

    # Ventilation gate: absolute-humidity advantage of outside air (g/m3).
    ah_open = 2.0       # open only if inside holds >= this much MORE water
    ah_close = 1.0      # close when the advantage falls below this
    out_t_max = 30.0    # never pull in air hotter than this (C)
    out_over_in_open = 2.0   # open only if outside <= inside + this (C): do not import heat
    out_over_in_keep = 3.0   # while venting, tolerate up to inside + this (hysteresis)

    # Dwell times (s) so modes do not chatter.
    min_vent_on = 600
    min_vent_gap = 600  # minimum time between ventilation episodes

    # Compressor protection (s). The 300 s restart interlock is a hard rule.
    comp_min_off = 300

    # Port sequencing (s).
    damper_open_delay = 10   # fans wait for dampers to be open
    damper_close_delay = 30  # dampers wait for fans to spin down
    damper_seal_wait = 5     # dampers must be closed this long before compressor

    # Sensor validation.
    max_age = 120            # a reading older than this is stale (s)
    t_range = (-5.0, 60.0)
    max_step_t = 5.0         # jump limits between consecutive samples
    max_step_rh = 25.0
    accept_after_rejects = 3 # accept a "jump" if it persists this many samples

    # CO2 (ppm). Fermenting/drying cherries off-gas CO2 in a sealed room.
    co2_purge_on = 2000
    co2_purge_off = 1200
    co2_alarm = 5000         # common 8-hour occupational limit; treat as alarm
    purge_max_run = 300      # s per purge episode (limits moisture ingress)
    purge_min_gap = 900      # s between non-alarm purges


# --------------------------------------------------------------------------
# Sensor validation
# --------------------------------------------------------------------------
class SensorGuard:
    """Validates one temperature/RH sensor.

    Rejects NaN, out-of-range, stale and implausibly large step changes, and
    falls back to the last good value only while it is still fresh. Never
    raises: a bad sensor must not stall the control loop.
    """

    def __init__(self, cfg):
        self.cfg = cfg
        self.last = None
        self._rejects = 0

    def _fallback(self, now):
        if self.last is not None and now - self.last["ts"] <= self.cfg.max_age:
            return self.last
        return None

    def accept(self, raw, now):
        """raw: dict(t=, rh=, ts=) or None. Returns validated dict or None."""
        c = self.cfg
        try:
            t = float(raw["t"])
            rh = float(raw["rh"])
            ts = float(raw["ts"])
        except (KeyError, TypeError, ValueError):
            return self._fallback(now)
        if t != t or rh != rh:  # NaN
            return self._fallback(now)
        if not (c.t_range[0] <= t <= c.t_range[1]) or not (0.0 <= rh <= 100.5):
            return self._fallback(now)
        if now - ts > c.max_age:
            return self._fallback(now)
        if self.last is not None:
            jump = (abs(t - self.last["t"]) > c.max_step_t
                    or abs(rh - self.last["rh"]) > c.max_step_rh)
            if jump and self._rejects < c.accept_after_rejects:
                self._rejects += 1
                return self._fallback(now)
        self._rejects = 0
        self.last = {"t": t, "rh": min(rh, 100.0), "ts": ts}
        return self.last


# --------------------------------------------------------------------------
# Room controller
# --------------------------------------------------------------------------
class RoomController:
    def __init__(self, cfg=None):
        self.cfg = cfg or Config()
        self.g_in = SensorGuard(self.cfg)
        self.g_out = SensorGuard(self.cfg)
        self.mode = "CLOSED"
        self.mode_since = -1e9
        self.vent_ended = -1e9
        self.purge_started = -1e9
        self.purge_ended = -1e9
        self.damper_open = False
        self.damper_changed = -1e9
        self.fans_on = False
        self.fans_off_at = -1e9
        self.comp_on = False
        self.comp_changed = -1e9
        self._booted = False  # power-restore guard, see step()

    # ---- decision ---------------------------------------------------------
    def _decide(self, now, ins, out, co2, raining):
        c = self.cfg
        alarms = []

        if ins is None:
            return "FAILSAFE", "inside sensor invalid", ["inside_sensor"]

        # CO2 safety comes before humidity: people work in this room.
        if co2 is not None:
            if co2 >= c.co2_alarm:
                return "PURGE", "CO2 at alarm level", ["co2_alarm"]
            if self.mode == "PURGE":
                if co2 > c.co2_purge_off and now - self.purge_started < c.purge_max_run:
                    return "PURGE", "purging CO2", alarms
            elif co2 >= c.co2_purge_on and now - self.purge_ended >= c.purge_min_gap:
                return "PURGE", "CO2 above purge threshold", alarms

        acting = self.mode in ("DEHUMIDIFY", "VENTILATE")
        need = ins["rh"] > c.rh_target - (c.rh_hyst if acting else 0.0)

        vent_ok, detail = False, "no outside data"
        if out is not None:
            d_ah = ah_gm3(ins["t"], ins["rh"]) - ah_gm3(out["t"], out["rh"])
            thr = c.ah_close if self.mode == "VENTILATE" else c.ah_open
            if raining:
                detail = "rain"
            elif out["t"] > c.out_t_max:
                detail = "outside too hot (%.1f C)" % out["t"]
            elif out["t"] > ins["t"] + (c.out_over_in_keep if self.mode == "VENTILATE"
                                        else c.out_over_in_open):
                detail = "outside %.1f C would heat the room (inside %.1f C)" % (out["t"], ins["t"])
            elif d_ah < thr:
                detail = "AH advantage %.1f g/m3 < %.1f" % (d_ah, thr)
            else:
                vent_ok, detail = True, "AH advantage %.1f g/m3" % d_ah
        else:
            alarms.append("outside_sensor")

        if self.mode == "VENTILATE":
            held = now - self.mode_since < c.min_vent_on
            if (need and vent_ok) or held:
                return "VENTILATE", detail, alarms
        elif need and vent_ok and now - self.vent_ended >= c.min_vent_gap:
            return "VENTILATE", detail, alarms

        if need:
            return "DEHUMIDIFY", "RH above target; vent blocked: " + detail, alarms
        return "CLOSED", "RH within target", alarms

    # ---- actuation --------------------------------------------------------
    def _actuate(self, now, mode):
        c = self.cfg
        vent = mode in ("VENTILATE", "PURGE")

        # Compressor off FIRST whenever ports are about to open or on failsafe.
        if self.comp_on and (vent or mode in ("FAILSAFE", "CLOSED")):
            self.comp_on, self.comp_changed = False, now

        if vent:
            if not self.damper_open:
                self.damper_open, self.damper_changed = True, now
            if not self.fans_on and now - self.damper_changed >= c.damper_open_delay:
                self.fans_on = True
        else:
            if self.fans_on:
                self.fans_on, self.fans_off_at = False, now
            ref = max(self.fans_off_at, self.damper_changed)
            if self.damper_open and now - ref >= c.damper_close_delay:
                self.damper_open, self.damper_changed = False, now

        if mode == "DEHUMIDIFY":
            sealed = (not self.damper_open
                      and now - self.damper_changed >= c.damper_seal_wait)
            if (not self.comp_on and sealed
                    and now - self.comp_changed >= c.comp_min_off):
                self.comp_on, self.comp_changed = True, now
        elif self.comp_on:
            self.comp_on, self.comp_changed = False, now

    # ---- public tick ------------------------------------------------------
    def step(self, now, inside_raw, outside_raw, co2_ppm=None, raining=False):
        """Run one control tick and return the desired outputs.

        Wrapped so that ANY exception drives the room to the sealed safe state
        instead of leaving relays in an unknown condition.
        """
        try:
            if not self._booted:
                # Power just came back (brownout, lightning trip, reboot). The
                # compressor may have been running a moment ago, so treat boot
                # as a compressor stop and honor the full 300 s before restart.
                self._booted = True
                self.comp_changed = now
            ins = self.g_in.accept(inside_raw, now)
            out = self.g_out.accept(outside_raw, now)
            new_mode, reason, alarms = self._decide(now, ins, out, co2_ppm, raining)

            if new_mode != self.mode:
                if self.mode == "VENTILATE":
                    self.vent_ended = now
                if self.mode == "PURGE":
                    self.purge_ended = now
                if new_mode == "PURGE":
                    self.purge_started = now
                self.mode, self.mode_since = new_mode, now

            self._actuate(now, self.mode)
        except Exception as exc:  # noqa: BLE001 -- deliberate catch-all
            self.mode, reason, alarms = "FAILSAFE", "controller fault: %r" % (exc,), ["fault"]
            self.comp_on, self.comp_changed = False, now
            self.fans_on = False
            self.damper_open = False  # spring-return dampers close on power loss anyway

        return {
            "mode": self.mode,
            "reason": reason,
            "alarms": alarms,
            "circulation_fan": True,   # runs almost continuously in every mode
            "damper_open": self.damper_open,
            "extraction_fans": self.fans_on,
            "intake_fan": self.fans_on,
            "dehumidifier_compressor": self.comp_on,
        }
