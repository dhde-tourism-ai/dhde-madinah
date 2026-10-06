"""
fetch_roads.py - major road network (motorway/trunk/primary/secondary + links
excluded) in the Madinah bbox for a traffic layer.

Ways are grouped by (class, name), merged with shapely linemerge, simplified
(~10 m) and capped at ~400 output lines (longest kept).
Output: public/data/roads.json  {roads:[{id,name,name_ar,class,path:[[lat,lon],...]}]}
Run: python scripts/fetch_roads.py
"""
from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge

from common import overpass, write_out, BBOX_STR, r5

CLASSES = ["motorway", "trunk", "primary", "secondary"]
CAP = 400


def main():
    q = """[out:json][timeout:240];
    way[highway~"^(motorway|trunk|primary|secondary)$"](%s);
    out geom tags;""" % BBOX_STR
    d = overpass(q, "roads_major")
    groups = {}
    for w in d["elements"]:
        t = w.get("tags", {})
        cls = t["highway"]
        nm = t.get("name") or ""
        key = (cls, nm)
        g = groups.setdefault(key, {"ways": [], "name_en": t.get("name:en"), "name_ar": t.get("name:ar") or t.get("name"), "id": w["id"]})
        g["ways"].append(LineString([(p["lon"], p["lat"]) for p in w["geometry"]]))
        if not g["name_en"] and t.get("name:en"):
            g["name_en"] = t.get("name:en")
    roads = []
    for (cls, nm), g in groups.items():
        merged = linemerge(MultiLineString(g["ways"]))
        geoms = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
        for k, ln in enumerate(geoms):
            s = ln.simplify(0.0001)
            if s.length < 0.0015 and not nm:  # drop tiny unnamed fragments (<~150 m)
                continue
            roads.append({"id": "w%d-%d" % (g["id"], k), "name": g["name_en"] or (nm or None),
                          "name_ar": g["name_ar"] or None, "class": cls,
                          "path": [[r5(y), r5(x)] for x, y in s.coords], "_len": ln.length})
    # keep the most important / longest
    roads.sort(key=lambda r: (CLASSES.index(r["class"]), -r["_len"]))
    rank = sorted(roads, key=lambda r: -r["_len"] * (4 - CLASSES.index(r["class"])))[:CAP]
    keep = set(id(r) for r in rank)
    roads = [r for r in roads if id(r) in keep]
    for r in roads:
        r.pop("_len")
    write_out("roads.json", {"roads": roads, "count": len(roads)},
              "OpenStreetMap contributors via Overpass API (ODbL)",
              "highway=motorway/trunk/primary/secondary (no *_link) within bbox; ways merged by class+name, "
              "simplified ~10 m, capped at %d lines ranked by length x class weight." % CAP)


if __name__ == "__main__":
    main()
