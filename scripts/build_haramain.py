"""
build_haramain.py - Haramain High Speed Railway timetable at Madinah station.

Source: the official timetable search at https://sar.hhr.sa/timetable (scraped for one
weekday, one Friday and one Thursday; see data/haramain_raw.json). Writes
data/haramain_timetable.json and adds the weekday departures/arrivals to the rail line in
public/data/transport_map.json, so trains on the map leave and arrive on the real times.

Run after build_madinah_bus.py:  python scripts/build_haramain.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "haramain_raw.json")
OUT_TT = os.path.join(ROOT, "data", "haramain_timetable.json")
TMAP = os.path.join(ROOT, "public", "data", "transport_map.json")

# which scraped date stands for which day type (Saudi weekend: Friday, Saturday)
DAYS = {"weekday": "11/10/2026", "friday": "09/10/2026", "thursday": "08/10/2026"}


def main():
    with open(RAW, encoding="utf-8") as f:
        raw = json.load(f)
    tt = {"source": "Saudi Arabia Railways, Haramain High Speed Railway timetable (https://sar.hhr.sa/timetable)",
          "station": "Madinah", "days": {}}
    for kind, date in DAYS.items():
        dep, arr = [], []
        for key, rows in raw.items():
            d, route = key.split("|")
            if d != date:
                continue
            frm, to = route.split("->")
            for r in rows:
                if frm == "Madinah":
                    dep.append({"time": r["dep"], "to": to, "train": r.get("train_no")})
                elif to == "Madinah":
                    arr.append({"time": r["arr"], "from": frm, "train": r.get("train_no")})
        # one train can serve several destinations: keep each time once
        dep = sorted({x["time"]: x for x in dep}.values(), key=lambda x: x["time"])
        arr = sorted({x["time"]: x for x in arr}.values(), key=lambda x: x["time"])
        tt["days"][kind] = {"date": date, "departures": dep, "arrivals": arr}
        print(kind, len(dep), "departures,", len(arr), "arrivals")
    with open(OUT_TT, "w", encoding="utf-8") as f:
        json.dump(tt, f, ensure_ascii=False, indent=1)

    with open(TMAP, encoding="utf-8") as f:
        tm = json.load(f)
    wk = tt["days"]["weekday"]
    for line in (tm.get("rail") or {}).get("lines", []):
        if line["id"] == "haramain_hsr":
            line["service"] = {"basis": "illustrative", "interval_min": 60, "speed_kmh": 250, "first": "06:00", "last": "23:30",
                               "depart": [x["time"] for x in wk["departures"]],
                               "arrive": [x["time"] for x in wk["arrivals"] if x["time"] >= "05:00"],
                               "timetable_source": tt["source"]}
    with open(TMAP, "w", encoding="utf-8") as f:
        json.dump(tm, f, ensure_ascii=False, separators=(",", ":"))
    print("rail service updated")


if __name__ == "__main__":
    main()
