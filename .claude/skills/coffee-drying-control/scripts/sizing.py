"""Sizing helpers for a tray-rack drying room. Pure Python 3, no dependencies.

Every default below is a PLACEHOLDER to replace with the user's own
measurement. The quickest ones to measure: fill one tray to the working depth
and weigh it (gives bulk density), and weigh a lot before and after drying
(gives the real water fraction).

CLI:  python3 sizing.py            -> prints the 12x12 ft / 84-tray example
"""
import math

IN = 0.0254
LB = 2.20462


# ---- room geometry ---------------------------------------------------------
def run_width_check(interior_in, trays=6, tray_w_in=24.0, seam_in=0.25):
    """Does a row of `trays` fit? seam_in = carriola web / tolerance allowance per tray
    (0.25 in x 6 = 1.5 in). Returns needed width and slack (in)."""
    need = trays * (tray_w_in + seam_in)
    return {"need_in": need, "interior_in": interior_in, "slack_in": interior_in - need,
            "fits": interior_in >= need}


def insulation_effect(interior_in, end_wall_ins_in, rack_wall_ins_in, depth_in=50.0, aisle_min_in=36.0):
    """Interior insulation on the two END walls (the walls each row of trays runs up to)
    shortens the rack run; on the RACK walls (the walls the racks stand against) it only
    shrinks the aisle. Returns new run length and aisle (in)."""
    run = interior_in - 2 * end_wall_ins_in
    aisle = interior_in - 2 * (depth_in + rack_wall_ins_in)
    return {"run_in": run, "aisle_in": aisle, "aisle_ok": aisle >= aisle_min_in}


# ---- tray load -------------------------------------------------------------
def tray_load(bulk_kg_m3, depth_cm=3.0, outer_l_in=48.0, outer_w_in=24.0, frame_in=0.75):
    """Net mesh area = outer minus the frame on all sides. Returns area (m2), litres, kg, lb."""
    a = (outer_l_in - 2 * frame_in) * (outer_w_in - 2 * frame_in) * IN * IN
    litres = a * depth_cm / 100.0 * 1000.0
    kg = a * depth_cm / 100.0 * bulk_kg_m3
    return {"area_m2": a, "litres": litres, "kg": kg, "lb": kg * LB}


def freeboard_in(tray_h_in=2.5, depth_cm=3.0):
    return tray_h_in - depth_cm / 2.54


# ---- water and equipment ---------------------------------------------------
def water_removed_kg(fresh_kg, water_fraction=0.6):
    """Placeholder: ~0.6 of fresh cherry mass leaves. Replace with weighed lots."""
    return fresh_kg * water_fraction


def avg_water_rate_kg_h(water_kg, days=16.0):
    return water_kg / (days * 24.0)


def vent_advantage_needed(rate_kg_h, flow_m3_h):
    """Average absolute-humidity advantage (g/m3) the outside air must have to remove
    rate_kg_h by ventilation alone."""
    return rate_kg_h * 1000.0 / flow_m3_h


def dehumidifier_units(rate_kg_h, unit_l_day=24.0, share=1.0):
    """Units needed for `share` of the load. unit_l_day: derated real output at room
    conditions (rated 50-70 pint units are ~24-33 L/day at the test point and less at 26 C)."""
    return math.ceil(rate_kg_h * 24.0 * share / unit_l_day)


# ---- structure -------------------------------------------------------------
def wall_load_kg(trays_per_wall, tray_load_kg, tray_empty_kg=4.0, steel_kg=141.0):
    """Static load carried by one rack wall (steel + trays + cherry), kg."""
    return trays_per_wall * (tray_load_kg + tray_empty_kg) + steel_kg


# ---- heat ------------------------------------------------------------------
def equilibrium_rise_c(heat_w, ua_w_per_c=115.0):
    """Sealed-room temperature rise over outside. UA ~100-130 W/C uninsulated 45 m2 envelope,
    30-45 W/C well insulated (estimates)."""
    return heat_w / ua_w_per_c


def example():
    print("== 12x12 ft room, 7 levels x 6 trays x 2 racks (placeholder inputs) ==")
    w = run_width_check(144.0)
    print("row width need %.2f in, interior %.1f in, slack %+.2f in -> %s"
          % (w["need_in"], w["interior_in"], w["slack_in"], "fits" if w["fits"] else "DOES NOT FIT"))
    for ins in (0.0, 1.0):
        e = insulation_effect(144.0, ins, 0.0)
        print("  %.0f in on end walls -> run %.1f in" % (ins, e["run_in"]))
    print("freeboard at 3 cm: %.2f in" % freeboard_in())
    print("%8s %8s %10s %10s %10s %10s %9s" % ("kg/m3", "kg/tray", "84 trays", "wall kg", "water kg", "kg/h avg", "dehus"))
    for rho in (400, 500, 600, 650):
        t = tray_load(rho)
        tot = 84 * t["kg"]
        wk = water_removed_kg(tot)
        r = avg_water_rate_kg_h(wk)
        print("%8d %8.1f %10.0f %10.0f %10.0f %10.2f %9d"
              % (rho, t["kg"], tot, wall_load_kg(42, t["kg"]), wk, r, dehumidifier_units(r, share=0.8)))
    print("ventilation advantage needed at 600 m3/h for 1.5 kg/h: %.1f g/m3" % vent_advantage_needed(1.5, 600))


if __name__ == "__main__":
    example()
