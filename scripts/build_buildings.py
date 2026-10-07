"""
build_buildings.py - building footprints and heights around each site, for sun and shade.

OpenStreetMap buildings within 350 m of each site (the Haram: 600 m). Height from the
`height` tag, else `building:levels` x 3.4 m, else a default by type (mosque 12 m,
minaret 60 m, hotel 30 m near the Haram, house 7 m, other 9 m). Heights not tagged in OSM
are estimates, flagged per building.

Output: public/data/buildings.json
  { sites: { id: [ { h, est, ring:[[lat,lon],...] } ] } }
Run: python scripts/build_buildings.py
"""
import json
import os

from common import OUT, overpass, r5, write_out


def height(t, near_haram):
    h = t.get("height") or t.get("building:height")
    if h:
        try:
            return float(str(h).replace("m", "").strip()), False
        except ValueError:
            pass
    lv = t.get("building:levels")
    if lv:
        try:
            return float(lv) * 3.4, False
        except ValueError:
            pass
    b = t.get("building", "yes")
    if t.get("man_made") == "minaret" or b == "minaret":
        return 60.0, True
    if b in ("mosque", "religious") or t.get("amenity") == "place_of_worship":
        return 12.0, True
    if b == "hotel" or t.get("tourism") == "hotel":
        return 30.0 if near_haram else 15.0, True
    if b in ("house", "residential", "detached"):
        return 7.0, True
    return 9.0, True


def main():
    with open(os.path.join(OUT, "sites.json"), encoding="utf-8") as f:
        sites = json.load(f)["sites"]
    out = {}
    for s in sites:
        r = 600 if s["id"] == "haram" else 350
        q = f"""[out:json][timeout:90];
(way(around:{r},{s['lat']},{s['lon']})["building"];way(around:{r},{s['lat']},{s['lon']})["man_made"="minaret"];);
out geom;"""
        d = overpass(q, f"bldg_{s['id']}")
        items = []
        for e in d["elements"]:
            g = e.get("geometry") or []
            if len(g) < 4:
                continue
            h, est = height(e.get("tags", {}), s["id"] == "haram")
            ring = [[r5(p["lat"]), r5(p["lon"])] for p in g[:-1]]
            # thin very detailed rings: keep about 12 points
            step = max(1, len(ring) // 12)
            items.append({"h": round(h, 1), "est": est, "ring": ring[::step]})
        out[s["id"]] = items
        print(s["id"], len(items), "buildings", sum(1 for i in items if not i["est"]), "with mapped height")
    write_out("buildings.json", {"sites": out}, "OpenStreetMap contributors via Overpass API (ODbL)",
              "Building footprints near each site with heights from OSM tags where mapped, else estimates by type (flag est).",
              status="modelled")


if __name__ == "__main__":
    main()
