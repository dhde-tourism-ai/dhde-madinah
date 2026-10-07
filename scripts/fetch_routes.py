"""
fetch_routes.py - road geometry for every coach leg (origin -> site, site -> site).

Uses the public OSRM demo server (router.project-osrm.org, driving profile, OpenStreetMap
data), about one request a second, cached in cache/osrm_<a>_<b>.json. The Madinah
prototype fetched these live in the browser; storing them keeps the app offline-safe.

Output: public/data/coach_legs.json
  { legs: { "<from>|<to>": { km, min, path:[[lat,lon],...] } } }   (keys sorted, one per pair)
Run: python scripts/fetch_routes.py
"""
import json
import os
import time

import requests

from common import CACHE, OUT, UA, r5, write_out

OSRM = "https://router.project-osrm.org/route/v1/driving/{a};{b}?overview=full&geometries=geojson"


def simplify(path, tol=0.00012):
    """Douglas-Peucker on lat/lon degrees (~12 m)."""
    if len(path) < 3:
        return path

    def dist(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == dy == 0:
            return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5

    i, dmax = 0, 0.0
    for k in range(1, len(path) - 1):
        d = dist(path[k], path[0], path[-1])
        if d > dmax:
            i, dmax = k, d
    if dmax <= tol:
        return [path[0], path[-1]]
    return simplify(path[: i + 1], tol)[:-1] + simplify(path[i:], tol)


def route(a, b, pa, pb):
    cache = os.path.join(CACHE, f"osrm_{a}_{b}.json")
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    url = OSRM.format(a=f"{pa[1]},{pa[0]}", b=f"{pb[1]},{pb[0]}")
    for attempt in range(5):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            if r.status_code == 200 and r.json().get("code") == "Ok":
                rt = r.json()["routes"][0]
                out = {"km": round(rt["distance"] / 1000, 2), "min": round(rt["duration"] / 60, 1),
                       "path": [[lat, lon] for lon, lat in rt["geometry"]["coordinates"]]}
                with open(cache, "w", encoding="utf-8") as f:
                    json.dump(out, f)
                time.sleep(1.1)
                return out
        except Exception as e:  # network blips
            print("retry", a, b, e)
        time.sleep(4 * (attempt + 1))
    return None


def main():
    with open(os.path.join(OUT, "sites.json"), encoding="utf-8") as f:
        d = json.load(f)
    pts = {s["id"]: (s["lat"], s["lon"]) for s in d["sites"]}
    pts.update({o["id"]: (o["lat"], o["lon"]) for o in d["origins"]})
    sites = [s["id"] for s in d["sites"] if s["id"] != "haram"]
    origins = [o["id"] for o in d["origins"]]
    pairs = set()
    for o in origins + ["haram"]:
        for s in sites:
            pairs.add((o, s))
    # arrival hubs into the central area (people-flow corridors)
    pairs.update({("airport", "haram"), ("rail-station", "haram")})
    for i, a in enumerate(sites):
        for b in sites[i + 1:]:
            pairs.add(tuple(sorted((a, b))))
    legs = {}
    for n, (a, b) in enumerate(sorted(pairs)):
        res = route(a, b, pts[a], pts[b])
        if res:
            legs[f"{a}|{b}"] = {"km": res["km"], "min": res["min"], "path": [[r5(x), r5(y)] for x, y in simplify(res["path"])]}
        if n % 20 == 0:
            print(n, "/", len(pairs))
    write_out(
        "coach_legs.json",
        {"legs": legs},
        "OSRM demo server (router.project-osrm.org), driving profile; OpenStreetMap contributors (ODbL)",
        "Road geometry and free-flow driving time for each coach leg. Paths are symmetric: reverse a path for the opposite direction.",
    )


if __name__ == "__main__":
    main()
