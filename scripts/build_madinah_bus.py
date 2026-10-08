"""
build_madinah_bus.py - Madinah Bus lines, the City Sightseeing bus and moving-bus trips.

Sources
  - Madinah Bus official route map (https://madinahbus.mda.gov.sa/, map page): every line's
    stops in order, with coordinates and the line colour -> data/madinah_bus_official.json
  - Madinah Bus FAQ: buses run daily 06:00 to 24:00 (some lines 24 hours).
  - City Sightseeing Madinah (https://csmadinah.com/): its stops as mapped in OpenStreetMap.
  - Road geometry through the stops: OSRM demo server (driving, OpenStreetMap).

Headways are NOT published, so trips use an ESTIMATED headway (20 min on city lines,
30 min on the airport express and the sightseeing bus), labelled as such in the app.

Writes public/data/transport_map.json (lines, stops, rail) and transport_trips.json
(the DHDE dhde-app shapes), plus transport_madinah.json (provenance per line).
Run: python scripts/build_madinah_bus.py
"""
import datetime as dt
import json
import os
import time

import requests

from common import CACHE, OUT, UA, overpass, r5
from fetch_routes import simplify

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OFFICIAL = os.path.join(ROOT, "data", "madinah_bus_official.json")

LINE_NAMES = {
    "400": ("Airport express: Airport – Prophet's Mosque", "خط المطار السريع: المطار – المسجد النبوي"),
    "130": ("Al-Miqat – Haramain station", "الميقات – محطة قطار الحرمين"),
    "150": ("Al-Faisaliyah loop", "حلقة الفيصلية"),
    "190": ("Sayyid al-Shuhada loop", "حلقة ميدان سيد الشهداء"),
    "191": ("Al-Khalidiyah loop", "حلقة الخالدية"),
    "230": ("Al-Khandaq loop", "حلقة الخندق"),
    "231": ("Al-Faisaliyah – Khandaq", "الفيصلية – الخندق"),
    "290": ("Jabal Ayr loop", "حلقة جبل عير"),
    "291": ("Industrial city", "المدن الصناعية"),
    "310": ("Mahzur loop", "حلقة مهزور"),
    "390": ("King Fahd district loop", "حلقة حي الملك فهد"),
    "391": ("Shuran loop", "حلقة شوران"),
    "450": ("Al-Mabuth loop", "حلقة المبعوث"),
    "490": ("Airport district loop", "حلقة حي المطار"),
    "590": ("Al-Qaswa loop", "حلقة القصواء"),
}
# Service per line, from the published 1447 AH (2026) schedule:
#  - five lines run 24 hours (Akhbaar 24, 29 Mar 2026: "5 routes around the clock";
#    Al-Weeam / Economy Today, 8 Jun 2026: route 400 airport - Prophet's Mosque 24 h),
#    with the reported intervals (130 and 150 every 15 min, 190 and 191 every 20 min;
#    400 reported as 20 to 40 min, taken as 30);
#  - the other ten lines run 18 hours, 06:00 to midnight (Madinah Bus FAQ); their
#    intervals are only in the Madinah Bus app, so they are ESTIMATED at 20 min.
# Each line: (first departure, closing time, interval, hours status, interval status).
H24 = (0, 24 * 60)
DAY = (6 * 60, 24 * 60)
SCHEDULE = {
    "400": (*H24, 30, "reported", "reported (20-40)"),
    "130": (*H24, 15, "reported", "reported"),
    "150": (*H24, 15, "reported", "reported"),
    "190": (*H24, 20, "reported", "reported"),
    "191": (*H24, 20, "reported", "reported"),
    "cs": (8 * 60, 22 * 60, 30, "estimated", "estimated"),
}
DEFAULT_SCHEDULE = (*DAY, 20, "official", "estimated")


def osrm_through(key, pts):
    """Road path through the stops in order (chunks of 40 waypoints)."""
    cache = os.path.join(CACHE, f"osrm_line_{key}.json")
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    path, legs_min = [], []
    i = 0
    while i < len(pts) - 1:
        chunk = pts[i:i + 40]
        coords = ";".join(f"{lon},{lat}" for lat, lon in chunk)
        url = f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson&continue_straight=false"
        for attempt in range(5):
            try:
                r = requests.get(url, headers=UA, timeout=60)
                j = r.json()
                if j.get("code") == "Ok":
                    rt = j["routes"][0]
                    seg = [[la, lo] for lo, la in rt["geometry"]["coordinates"]]
                    path += seg if not path else seg[1:]
                    legs_min += [lg["duration"] / 60 for lg in rt["legs"]]
                    break
            except Exception as e:
                print("retry", key, e)
            time.sleep(4 * (attempt + 1))
        else:
            return None
        time.sleep(1.1)
        i += len(chunk) - 1
    out = {"path": path, "legs_min": legs_min}
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(out, f)
    return out


def sightseeing_stops():
    q = """[out:json][timeout:60];
node["highway"="bus_stop"]["website"~"csmadinah"](24.36,39.53,24.56,39.72);
node["highway"="bus_stop"]["name"~"الحافلة السياحية"](24.36,39.53,24.56,39.72);
out;"""
    d = overpass(q, "cs_stops")
    seen, stops = set(), []
    for e in d["elements"]:
        if e["id"] in seen:
            continue
        seen.add(e["id"])
        t = e.get("tags", {})
        try:
            ref = int(t.get("ref", "99"))
        except ValueError:
            ref = 99
        stops.append((ref, t.get("name:en") or t.get("name"), t.get("name"), e["lat"], e["lon"]))
    stops.sort()
    return [{"name": n.replace("Siightseeing", "Sightseeing") if n else "Sightseeing stop", "name_ar": a, "lat": la, "lon": lo} for _, n, a, la, lo in stops]


def main():
    with open(OFFICIAL, encoding="utf-8") as f:
        official = json.load(f)
    lines, stops, routes, trips_idx, prov = [], [], [], [], []
    stop_index = {}

    def stop_id(name, lat, lon):
        key = (round(lat, 5), round(lon, 5))
        if key not in stop_index:
            stop_index[key] = len(stops)
            stops.append({"id": f"s{len(stops)}", "name": name, "feed": "madinah_bus", "lat": r5(lat), "lon": r5(lon), "nodes": []})
        return stop_index[key]

    defs = []
    for ref, v in official.items():
        en, ar = LINE_NAMES.get(ref, (f"Line {ref}", f"خط {ref}"))
        defs.append((ref, f"{ref} · {en}", f"{ref} · {ar}", v["colors"][0] if v["colors"] else "#3987e5", v["stops"], "madinah_bus",
                     "Madinah Bus official route map (madinahbus.mda.gov.sa)"))
    cs = sightseeing_stops()
    if len(cs) >= 3:
        loop = cs + [cs[0]]
        defs.append(("cs", "City Sightseeing (hop-on hop-off)", "الحافلة السياحية (اصعد وانزل)", "#e0262b",
                     [{"name_ar": s["name_ar"], "name": s["name"], "lat": s["lat"], "lon": s["lon"]} for s in loop], "sightseeing",
                     "City Sightseeing Madinah stops, OpenStreetMap"))

    for ref, en, ar, colour, sts, feed, src in defs:
        pts = [(s["lat"], s["lon"]) for s in sts]
        geo = osrm_through(ref, pts)
        if not geo:
            print("no road path for", ref)
            continue
        line_id = f"mb_{ref}"
        lines.append({"id": line_id, "name": en, "name_ja": ar, "mode": "bus", "feed": feed, "colour": colour,
                      "path": [[r5(a), r5(b)] for a, b in simplify([tuple(p) for p in geo["path"]], 0.00008)]})
        ridx = len(routes)
        routes.append({"id": line_id, "name": en})
        sidx = [stop_id(s.get("name") or s["name_ar"], s["lat"], s["lon"]) for s in sts]
        for s, i in zip(sts, sidx):
            stops[i]["name"] = s.get("name") or s["name_ar"]
            stops[i]["name_ar"] = s["name_ar"]
        # minute offsets along the line: OSRM free-flow x1.35 for traffic, 0.5 min dwell per stop
        offs = [0.0]
        for m in geo["legs_min"]:
            offs.append(offs[-1] + m * 1.35 + 0.5)
        first, last, hw, hours_status, hw_status = SCHEDULE.get(ref, DEFAULT_SCHEDULE)
        h24 = last - first >= 24 * 60
        dep = first
        # 24-hour lines leave all day and night (a late trip runs on past midnight); day lines
        # stop sending buses out so the last one finishes its run by closing time.
        while (dep < last) if h24 else (dep + offs[-1] <= last):
            trips_idx.append([ridx, sidx, [round(dep + o, 1) for o in offs]])
            dep += hw
        prov.append({"id": line_id, "ref": ref, "name": en, "name_ar": ar, "stops": len(sts), "source": src,
                     "hours": "24 hours" if h24 else f"{first // 60:02d}:00–{last // 60:02d}:00",
                     "hours_status": hours_status, "headway_min": hw, "headway_status": hw_status,
                     "round_trip_min": round(offs[-1])})
        print(ref, len(sts), "stops,", round(offs[-1]), "min round trip")

    # rail: Haramain from OSM transport.json
    rail = None
    tp = os.path.join(OUT, "transport.json")
    if os.path.exists(tp):
        with open(tp, encoding="utf-8") as f:
            t = json.load(f)
        hsr = [seg for r in t["rail"] if r["kind"] == "high_speed" for seg in r["path"]]
        st = [s for s in t["stations"] if s["kind"] == "rail" and s.get("name")]
        rail = {
            "source": "OpenStreetMap contributors (ODbL)", "url": "https://www.openstreetmap.org", "licence": "ODbL", "credit": "© OpenStreetMap contributors",
            "lines": [{"id": "haramain_hsr", "name": "Haramain High Speed Railway", "name_ja": "قطار الحرمين السريع", "operator_ja": "الخطوط الحديدية السعودية",
                       "kind": "shinkansen", "paths": hsr}],
            "stations": [{"id": f"st{i}", "name_ja": s["name"], "lat": s["lat"], "lon": s["lon"], "lines": ["haramain_hsr"]} for i, s in enumerate(st)],
        }

    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).isoformat(timespec="seconds")
    with open(os.path.join(OUT, "transport_map.json"), "w", encoding="utf-8") as f:
        json.dump({"generated_at": now, "lines": lines, "stops": stops, "walk_areas": None, "rail": rail}, f, ensure_ascii=False, separators=(",", ":"))
    today = dt.date.today().isoformat()
    with open(os.path.join(OUT, "transport_trips.json"), "w", encoding="utf-8") as f:
        json.dump({"generated_at": now,
                   "note": "Stops and lines: Madinah Bus official route map (sightseeing: OpenStreetMap). Hours per line: 400, 130, 150, 190, 191 run 24 hours (1447 AH schedule); the rest 06:00-24:00 (Madinah Bus FAQ). Intervals: reported for the 24-hour lines, ESTIMATED (20 min) for the others: they are published only in the Madinah Bus app.",
                   "days": {"weekday": today, "saturday": today, "sunday": today},
                   "stops": [[s["lat"], s["lon"]] for s in stops], "stop_ids": [s["id"] for s in stops], "stop_names": [s["name"] for s in stops],
                   "routes": routes, "trips": {"weekday": trips_idx, "saturday": trips_idx, "sunday": trips_idx}},
                  f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "transport_madinah.json"), "w", encoding="utf-8") as f:
        json.dump({"generated_at": now, "operator_hours": "06:00–24:00 daily (Madinah Bus FAQ); some lines 24 hours",
                   "faq_url": "https://madinahbus.mda.gov.sa/", "lines": prov}, f, ensure_ascii=False, indent=1)
    print(len(lines), "lines,", len(stops), "stops,", len(trips_idx), "trips a day")


if __name__ == "__main__":
    main()
