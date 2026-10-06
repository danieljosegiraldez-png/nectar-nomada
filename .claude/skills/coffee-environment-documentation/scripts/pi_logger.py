"""Raspberry Pi side of the "ESP32 controls, Pi logs" split. Standard library only.

The ESP32 keeps control on its own (it must work when the Pi or Wi-Fi is down) and
POSTs one JSON sample every LOG_EVERY_S seconds. The Pi only stores and reports, so
a Pi crash, SD-card problem or power cut can never affect the room.

  python3 pi_logger.py serve [--port 8080] [--dir ./roomlogs]   # receive and store
  python3 pi_logger.py report [--dir ./roomlogs] [--day YYYY-MM-DD]   # daily summary

Sample JSON from the ESP32 (extra keys are kept):
  {"t_in":25.1,"rh_in":62.0,"t_out":27.0,"rh_out":80.0,"mode":"CLOSED","reason":"...",
   "damper":0,"fans":0,"dehu":1,"co2":650,"alarms":[]}
Computed on arrival: AH inside/outside, dAH, inside dew point. One CSV per UTC day.
"""
import argparse
import csv
import json
import math
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

_HERE = os.path.dirname(os.path.abspath(__file__))
# controller.py lives in the coffee-drying-control skill (or beside this file when deployed on the Pi)
for _p in (_HERE, os.path.join(_HERE, '..', '..', 'coffee-drying-control', 'scripts')):
    sys.path.insert(0, _p)
from controller import ah_gm3, dew_point_c, vpd_kpa  # noqa: E402

FIELDS = ["ts", "iso", "t_in", "rh_in", "t_out", "rh_out", "ah_in", "ah_out", "d_ah", "dew_in", "vpd_in",
          "mode", "reason", "damper", "fans", "dehu", "co2", "alarms"]


def _num(v):
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def enrich(sample, now=None):
    """Validate one sample and add AH, dAH and dew point. Returns a CSV row dict or None."""
    now = now or time.time()
    t_in, rh_in = _num(sample.get("t_in")), _num(sample.get("rh_in"))
    if t_in is None or rh_in is None:
        return None
    t_out, rh_out = _num(sample.get("t_out")), _num(sample.get("rh_out"))
    row = {"ts": int(now), "iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
           "t_in": t_in, "rh_in": rh_in, "t_out": t_out, "rh_out": rh_out,
           "ah_in": round(ah_gm3(t_in, rh_in), 2), "dew_in": round(dew_point_c(t_in, rh_in), 1),
           "vpd_in": round(vpd_kpa(t_in, rh_in), 3),
           "ah_out": None, "d_ah": None}
    if t_out is not None and rh_out is not None:
        row["ah_out"] = round(ah_gm3(t_out, rh_out), 2)
        row["d_ah"] = round(row["ah_in"] - row["ah_out"], 2)
    for k in ("mode", "reason", "damper", "fans", "dehu", "co2"):
        row[k] = sample.get(k)
    row["alarms"] = ";".join(sample.get("alarms") or []) if isinstance(sample.get("alarms"), list) else ""
    return row


def append_row(row, outdir):
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, "room_%s.csv" % row["iso"][:10])
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if new:
            w.writeheader()
        w.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in FIELDS})
    return path


class Handler(BaseHTTPRequestHandler):
    outdir = "roomlogs"

    def do_POST(self):  # noqa: N802
        try:
            n = min(int(self.headers.get("Content-Length", 0)), 4096)
            row = enrich(json.loads(self.rfile.read(n) or b"{}"))
            if row is None:
                self.send_response(400)
            else:
                append_row(row, self.outdir)
                self.send_response(204)
        except Exception:  # noqa: BLE001  bad packets must never kill the server
            self.send_response(400)
        self.end_headers()

    def log_message(self, *a):  # keep the console quiet
        pass


def report(outdir, day=None):
    day = day or time.strftime("%Y-%m-%d", time.gmtime())
    path = os.path.join(outdir, "room_%s.csv" % day)
    if not os.path.exists(path):
        print("no log for", day)
        return 1
    rows = list(csv.DictReader(open(path)))
    f = lambda k: [float(r[k]) for r in rows if r.get(k) not in ("", None)]  # noqa: E731
    span = (int(rows[-1]["ts"]) - int(rows[0]["ts"])) or 1
    modes = {}
    for a, b in zip(rows, rows[1:]):
        modes[a["mode"]] = modes.get(a["mode"], 0) + int(b["ts"]) - int(a["ts"])
    print("%s: %d samples over %.1f h" % (day, len(rows), span / 3600.0))
    for k, label in (("t_in", "inside T (C)"), ("rh_in", "inside RH (%)"), ("ah_in", "inside AH"),
                     ("t_out", "outside T (C)"), ("ah_out", "outside AH"), ("d_ah", "AH advantage")):
        v = f(k)
        if v:
            print("  %-15s min %.1f  mean %.1f  max %.1f" % (label, min(v), sum(v) / len(v), max(v)))
    print("  time in mode:", ", ".join("%s %.1f h" % (m, s / 3600.0) for m, s in sorted(modes.items())))
    dehu = sum(int(b["ts"]) - int(a["ts"]) for a, b in zip(rows, rows[1:]) if str(a.get("dehu")) in ("1", "True", "true"))
    print("  dehumidifier on: %.1f h" % (dehu / 3600.0))
    alarms = sorted({r["alarms"] for r in rows if r.get("alarms")})
    print("  alarms seen:", alarms or "none")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["serve", "report"])
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--dir", default="roomlogs")
    ap.add_argument("--day")
    a = ap.parse_args()
    if a.cmd == "report":
        return report(a.dir, a.day)
    Handler.outdir = a.dir
    print("listening on :%d, logging to %s" % (a.port, a.dir))
    HTTPServer(("0.0.0.0", a.port), Handler).serve_forever()


if __name__ == "__main__":
    sys.exit(main())
