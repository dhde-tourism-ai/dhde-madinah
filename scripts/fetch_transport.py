"""
fetch_transport.py - public transport + parking layer for Madinah from OSM.

Overpass queries (cached in cache/):
  - route=bus relations intersecting the bbox (with member ways/nodes)
  - bus stops (highway=bus_stop, public_transport=platform+bus)
  - railways (rail/light_rail/tram/construction/proposed) and stations
  - amenity=parking ways/relations/nodes
Output: public/data/transport.json
  {bus_routes, bus_stops, rail, stations, parking, counts}
Run: python scripts/fetch_transport.py
"""
from shapely.geometry import LineString, Polygon
from shapely.ops import linemerge
from shapely import MultiLineString
import math

from common import overpass, write_out, BBOX, BBOX_STR, r5

PALETTE = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46f0f0",
           "#f032e6", "#bcf60c", "#008080", "#9a6324", "#800000", "#808000",
           "#000075", "#e6beff", "#ffe119", "#aaffc3"]
SIMPLIFY = 0.00005  # degrees (~5 m)


def in_bbox(lat, lon):
    s, w, n, e = BBOX
    return s <= lat <= n and w <= lon <= e


def lines_to_paths(coord_lists, tol=SIMPLIFY):
    """Merge way geometries into continuous lines, simplify, return [[ [lat,lon],...],...]."""
    segs = [LineString([(p[1], p[0]) for p in c]) for c in coord_lists if len(c) >= 2]
    if not segs:
        return []
    merged = linemerge(MultiLineString(segs))
    geoms = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    out = []
    for g in geoms:
        g = g.simplify(tol)
        out.append([[r5(y), r5(x)] for x, y in g.coords])
    return out


def poly_area_m2(coords):
    """coords [(lat,lon)] -> approx area m2 (equirectangular)."""
    lat0 = math.radians(sum(c[0] for c in coords) / len(coords))
    pts = [(c[1] * 111320 * math.cos(lat0), c[0] * 110540) for c in coords]
    return Polygon(pts).area if len(pts) >= 3 else 0


def main():
    # ---- bus routes
    q = """[out:json][timeout:240];
    rel[type=route][route~"^(bus|trolleybus|share_taxi|tram|light_rail|subway|train)$"](%s);
    out geom tags;""" % BBOX_STR
    routes = overpass(q, "transport_routes")
    bus_routes, rail = [], []
    i = 0
    for r in routes["elements"]:
        t = r.get("tags", {})
        ways = [[(g["lat"], g["lon"]) for g in m["geometry"]]
                for m in r.get("members", []) if m["type"] == "way" and m.get("geometry")]
        # clip loosely: keep ways with at least one vertex in bbox
        ways = [w for w in ways if any(in_bbox(*p) for p in w)]
        path = lines_to_paths(ways)
        if not path:
            continue
        if t.get("route") in ("bus", "trolleybus", "share_taxi"):
            bus_routes.append({
                "id": "r%d" % r["id"], "ref": t.get("ref"),
                "name": t.get("name:en") or t.get("name"), "name_ar": t.get("name:ar") or t.get("name"),
                "operator": t.get("operator:en") or t.get("operator"),
                "colour": t.get("colour") or PALETTE[i % len(PALETTE)],
                "path": path})
            i += 1
        else:
            rail.append({"id": "r%d" % r["id"], "name": t.get("name:en") or t.get("name"),
                         "kind": "high_speed" if "haramain" in (t.get("name:en", "") + t.get("name", "")).lower()
                         or "الحرمين" in t.get("name", "") else "other",
                         "route": t.get("route"), "path": path})

    # ---- stops, stations, railway ways
    q = """[out:json][timeout:240];
    (
      node[highway=bus_stop](%(b)s);
      node[public_transport=platform][bus=yes](%(b)s);
      nwr[amenity=bus_station](%(b)s);
      nwr[railway=station](%(b)s);
      nwr[public_transport=station](%(b)s);
    );
    out center tags;""" % {"b": BBOX_STR}
    st = overpass(q, "transport_stops")
    bus_stops, stations, seen = [], [], set()
    for e in st["elements"]:
        t = e.get("tags", {})
        c = e.get("center", e)
        lat, lon = c["lat"], c["lon"]
        if t.get("railway") == "station" or t.get("train") == "yes" or t.get("amenity") == "bus_station" \
                or (t.get("public_transport") == "station"):
            kind = "rail" if (t.get("railway") == "station" or t.get("train") == "yes") else "bus_station"
            stations.append({"id": "%s%d" % (e["type"][0], e["id"]),
                             "name": t.get("name:en") or t.get("name"),
                             "name_ar": t.get("name:ar") or t.get("name"),
                             "kind": kind, "lat": r5(lat), "lon": r5(lon)})
            continue
        key = (round(lat, 4), round(lon, 4))
        if key in seen:
            continue
        seen.add(key)
        bus_stops.append({"id": "n%d" % e["id"], "name": t.get("name:en") or t.get("name"),
                          "name_ar": t.get("name:ar") or t.get("name"), "lat": r5(lat), "lon": r5(lon)})

    q = """[out:json][timeout:240];
    way[railway~"^(rail|light_rail|tram|construction|proposed|subway|monorail)$"](%s);
    out geom tags;""" % BBOX_STR
    rw = overpass(q, "transport_railways")
    groups = {}
    for w in rw["elements"]:
        t = w.get("tags", {})
        rtype = t.get("railway")
        name = t.get("name:en") or t.get("name") or ""
        hs = (t.get("highspeed") == "yes" or "haramain" in name.lower() or "الحرمين" in t.get("name", "")
              or (rtype == "rail" and t.get("usage") == "main"))
        sub = t.get("construction") or t.get("proposed") or ""
        key = ("high_speed" if hs and rtype == "rail" else "other", rtype, sub, name)
        groups.setdefault(key, []).append([(g["lat"], g["lon"]) for g in w["geometry"]])
    for (kind, rtype, sub, name), ways in groups.items():
        path = lines_to_paths(ways)
        if not path:
            continue
        item = {"id": "rw-%s-%s" % (rtype, len(rail)), "name": name or None, "kind": kind,
                "railway": rtype, "path": path}
        if rtype in ("construction", "proposed"):
            item["note"] = "OSM railway=%s%s (planned/under construction)" % (rtype, (" (" + sub + ")") if sub else "")
        rail.append(item)

    # ---- parking
    q = """[out:json][timeout:240];
    nwr[amenity=parking](%s);
    out geom tags;""" % BBOX_STR
    pk = overpass(q, "transport_parking")
    parking = []
    for e in pk["elements"]:
        t = e.get("tags", {})
        cap = t.get("capacity")
        try:
            cap = int(str(cap).split(";")[0]) if cap else None
        except ValueError:
            cap = None
        poly, area = None, 0
        if e["type"] == "way" and e.get("geometry"):
            pts = [(g["lat"], g["lon"]) for g in e["geometry"]]
            if len(pts) >= 4:
                area = poly_area_m2(pts)
                poly = pts
        elif e["type"] == "relation":
            outer = [m for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
            if outer:
                pts = [(g["lat"], g["lon"]) for g in outer[0]["geometry"]]
                if len(pts) >= 4:
                    area = poly_area_m2(pts)
                    poly = pts
        if area < 2000 and (cap or 0) < 50:
            continue
        if poly:
            P = Polygon([(p[1], p[0]) for p in poly])
            cen = P.centroid
            lat, lon = cen.y, cen.x
            ps = P.simplify(0.00003)
            ring = [[r5(y), r5(x)] for x, y in ps.exterior.coords] if not ps.is_empty else None
        else:
            lat, lon = e.get("lat"), e.get("lon")
            if lat is None:
                b = e.get("bounds")
                lat, lon = (b["minlat"] + b["maxlat"]) / 2, (b["minlon"] + b["maxlon"]) / 2
            ring = None
        kind = t.get("parking")
        kind = kind if kind in ("surface", "multi-storey", "underground") else None
        parking.append({"id": "%s%d" % (e["type"][0], e["id"]),
                        "name": t.get("name:en") or t.get("name"), "lat": r5(lat), "lon": r5(lon),
                        "capacity": cap, "kind": kind, "area_m2": round(area), "polygon": ring})

    has_rel_bus = len(bus_routes)
    note = ("Bus routes from OSM route=bus relations intersecting the bbox (%d found); "
            "colours from OSM 'colour' tag or assigned from a palette. Rail = Haramain HSR "
            "(kind high_speed) and any other railway ways incl. construction/proposed (kind other). "
            "Parking: amenity=parking with area >= 2000 m2 or capacity >= 50; centroid given." % has_rel_bus)
    write_out("transport.json", {
        "bus_routes": bus_routes, "bus_stops": bus_stops, "rail": rail, "stations": stations,
        "parking": parking,
        "counts": {"bus_routes": len(bus_routes), "bus_stops": len(bus_stops), "parking": len(parking),
                   "rail": len(rail), "stations": len(stations)},
    }, "OpenStreetMap contributors via Overpass API (ODbL)", note)


if __name__ == "__main__":
    main()
