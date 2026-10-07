"""
common.py - shared helpers for the Madinah open-data build scripts.

- Overpass API access with polite retry/backoff and endpoint fallback, with
  on-disk caching in ../cache/ (delete the cache file to force a re-fetch).
- Study area bbox, site list (given coordinates), output writer.

Requires: requests (pip install --user requests shapely networkx)
"""
import json
import os
import time
import datetime as dt

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache")
OUT = os.path.join(ROOT, "public", "data")
os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

# south, west, north, east
BBOX = (24.36, 39.53, 24.56, 39.72)
BBOX_STR = "%s,%s,%s,%s" % BBOX

# main endpoint is tried twice for each fallback attempt
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
UA = {"User-Agent": "dhde-madinah-dashboard/1.0 (open-data build script)"}

# Given (fallback) coordinates of the study sites.
SITES_GIVEN = {
    "haram": (24.4672, 39.6112),
    "quba": (24.4393, 39.6173),
    "qiblatain": (24.46937, 39.58080),
    "shuhada": (24.48657, 39.60353),
    "uhud": (24.50372, 39.61283),
    "jabal-ayr": (24.38522, 39.59444),
    "faqir-well": (24.44557, 39.62444),
    "gharas-well": (24.44252, 39.62300),
    "safiya": (24.45660, 39.60741),
    "biography-museum": (24.45955, 39.60728),
    "al-khandaq": (24.4797, 39.5990),
    "al-hayy": None,  # only if found in OSM
}


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def overpass(query, cache_name, timeout=300):
    """Run an Overpass QL query (JSON output). Cached in cache/<cache_name>.json."""
    path = os.path.join(CACHE, cache_name + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    last = None
    for attempt in range(10):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            t = timeout if "overpass-api.de" in url else 120
            r = requests.post(url, data={"data": query}, headers=UA, timeout=t)
            if r.status_code == 200:
                data = r.json()
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f)
                time.sleep(2)  # politeness
                return data
            last = "HTTP %s %s" % (r.status_code, r.text[:200])
        except Exception as e:  # network / JSON errors
            last = repr(e)
        wait = 10 * (attempt + 1)
        print("overpass attempt %d failed (%s); retry in %ds" % (attempt + 1, last, wait))
        time.sleep(wait)
    raise RuntimeError("Overpass failed: %s" % last)


def r5(x):
    return round(x, 5)


def write_out(name, payload, source, note, status="real"):
    doc = {"source": source, "fetched_at": now_iso(), "status": status, "note": note}
    doc.update(payload)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote %s (%.1f KB)" % (path, os.path.getsize(path) / 1024))
    return path


def load_sites():
    """Final site coordinates written by build_sites.py -> {id: (lat, lon)}."""
    with open(os.path.join(OUT, "site_coords.json"), encoding="utf-8") as f:
        d = json.load(f)
    return {k: (v["lat"], v["lon"]) for k, v in d["sites"].items()}


def haversine(lat1, lon1, lat2, lon2):
    import math
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))
