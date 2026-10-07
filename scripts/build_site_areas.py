"""
build_site_areas.py - the ground visitors actually use at each site, and where they arrive.

For the "People on foot" layer: visitors spread over a site's real footprint (not the
roads) and arrive from where they are dropped off.

  area   OpenStreetMap footprint of the site (mosque, museum, garden, historic area),
         with a forecourt margin; the Haram includes its plazas. Mountains (Uhud summit,
         Jabal Ayr): the hiking paths on the slope, buffered, so visitors climb and explore.
  gates  the nearest drop-off points: car parks (transport.json), Madinah Bus and
         sightseeing stops (transport_map.json), else the 5-minute walking edge.

Output: public/data/site_areas.json
  { sites: { id: { kind, area:[[lat,lon],...], gates:[{lat,lon,kind,name}] } } }
Run: python scripts/build_site_areas.py   (needs shapely)
"""
import json
import math
import os

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from common import OUT, overpass, r5, write_out

MOUNTAINS = {"uhud", "jabal-ayr"}
MARGIN_M = {"haram": 90, "quba": 45}


def proj(lat0):
    k = math.cos(math.radians(lat0))
    return (lambda lat, lon: ((lon) * 111320 * k, lat * 110540)), (lambda x, y: (y / 110540, x / (111320 * k)))


def load(name):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def footprint(s, fwd, back):
    lat, lon = s["lat"], s["lon"]
    if s["id"] in MOUNTAINS:
        q = f"""[out:json][timeout:60];
(way(around:900,{lat},{lon})["highway"~"^(path|footway|track|steps)$"];);
out geom;"""
        d = overpass(q, f"area_trail_{s['id']}")
        lines = []
        for e in d["elements"]:
            g = e.get("geometry") or []
            if len(g) > 1:
                lines.append(LineString([fwd(p["lat"], p["lon"]) for p in g]))
        peak = Point(fwd(lat, lon))
        if lines:
            near = [ln for ln in lines if ln.distance(peak) < 700]
            if near:
                shape = unary_union([ln.buffer(45) for ln in near]).union(peak.buffer(90))
                return "mountain", shape
        return "mountain", peak.buffer(220)
    q = f"""[out:json][timeout:60];
(
 way(around:300,{lat},{lon})["amenity"="place_of_worship"];
 relation(around:300,{lat},{lon})["amenity"="place_of_worship"];
 way(around:300,{lat},{lon})["tourism"~"^(museum|attraction)$"];
 way(around:300,{lat},{lon})["historic"];
 way(around:300,{lat},{lon})["leisure"~"^(park|garden)$"];
 way(around:450,{lat},{lon})["highway"="pedestrian"]["area"="yes"];
 way(around:450,{lat},{lon})["place"="square"];
);
out geom;"""
    d = overpass(q, f"area_{s['id']}")
    here = Point(fwd(lat, lon))
    polys = []
    for e in d["elements"]:
        rings = []
        if e["type"] == "way" and e.get("geometry") and len(e["geometry"]) > 3:
            rings.append(e["geometry"])
        elif e["type"] == "relation":
            rings += [m["geometry"] for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry") and len(m["geometry"]) > 3]
        for g in rings:
            try:
                pg = Polygon([fwd(p["lat"], p["lon"]) for p in g]).buffer(0)
            except Exception:
                continue
            if pg.is_valid and pg.area > 80:
                polys.append((pg, e.get("tags", {})))
    margin = MARGIN_M.get(s["id"], 35)
    containing = [pg for pg, _ in polys if pg.buffer(25).contains(here)]
    if s["id"] == "haram":
        # the mosque and every plaza touching it
        core = max(containing or [pg for pg, _ in polys], key=lambda p: p.area, default=None)
        if core is not None:
            plazas = [pg for pg, t in polys if t.get("highway") == "pedestrian" or t.get("place") == "square"]
            shape = unary_union([core] + [p for p in plazas if p.distance(core) < 60])
            return "mosque", shape.buffer(margin)
    if containing:
        core = max(containing, key=lambda p: p.area)
        kind = "mosque" if "mosque" in s["name"].lower() or "masjid" in s["name"].lower() else "site"
        return kind, core.buffer(margin)
    near = sorted([pg for pg, _ in polys], key=lambda p: p.distance(here))
    if near and near[0].distance(here) < 60:
        return "site", near[0].buffer(margin)
    return "site", here.buffer(70 if "well" in s["id"] else 110)


def main():
    sites = load("sites.json")["sites"]
    transport = load("transport.json") or {}
    tmap = load("transport_map.json") or {}
    iso = (load("isochrones.json") or {}).get("sites", {})
    drop = []
    for p in transport.get("parking", []):
        drop.append((p["lat"], p["lon"], "parking", p.get("name") or "Car park"))
    for st in tmap.get("stops", []):
        drop.append((st["lat"], st["lon"], "bus", st.get("name") or "Bus stop"))
    out = {}
    for s in sites:
        fwd, back = proj(s["lat"])
        kind, shape = footprint(s, fwd, back)
        if shape.geom_type == "MultiPolygon":
            shape = max(shape.geoms, key=lambda g: g.area)
        shape = Polygon(shape.exterior).simplify(6)
        here = Point(fwd(s["lat"], s["lon"]))
        cands = []
        for la, lo, k, name in drop:
            d = Point(fwd(la, lo)).distance(shape)
            if 5 < d < (900 if s["id"] in MOUNTAINS else 550):
                cands.append((d, la, lo, k, name))
        cands.sort()
        gates, used = [], []
        for d, la, lo, k, name in cands:
            pt = Point(fwd(la, lo))
            # spread out: skip a drop-off within 120 m of one already chosen
            if any(pt.distance(u) < 120 for u in used):
                continue
            gates.append({"lat": r5(la), "lon": r5(lo), "kind": k, "name": name})
            used.append(pt)
            if len(gates) == 4:
                break
        if len(gates) < 2:
            ring = iso.get(s["id"], {}).get("5") or []
            for la, lo in ring[:: max(1, len(ring) // 4)][: 4 - len(gates)]:
                gates.append({"lat": r5(la), "lon": r5(lo), "kind": "street", "name": "Street"})
        area = [[r5(a), r5(b)] for a, b in (back(x, y) for x, y in shape.exterior.coords)]
        out[s["id"]] = {"kind": kind, "area_m2": round(shape.area), "area": area, "gates": gates}
        print(f"{s['id']:18s} {kind:9s} {round(shape.area):>8} m2  gates: {[g['kind'] for g in gates]}")
    write_out("site_areas.json", {"sites": out},
              "OpenStreetMap contributors via Overpass API (ODbL)",
              "Visit area per site (OSM footprint plus forecourt; mountains: hiking paths on the slope) and the nearest drop-off points visitors arrive from (car parks, bus and sightseeing stops).",
              status="modelled")


if __name__ == "__main__":
    main()
