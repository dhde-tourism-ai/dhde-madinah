"""
fetch_pois.py - visitor amenities within 800 m of each study site (OSM).

Categories:
  food     amenity=restaurant|cafe|fast_food
  shop     any shop=*
  lodging  tourism=hotel|guest_house|apartment|hostel|motel
  services amenity=toilets|drinking_water|atm|pharmacy
  shade    amenity=shelter, leisure=park
  mosque   amenity=place_of_worship + religion=muslim
Needs public/data/site_coords.json (run fetch_site_coords.py first).
Output: public/data/pois.json {points:[{lat,lon,cat,name}], by_site:{id:{food,...,total}}}
points are de-duplicated across sites, capped at 6000 (named first).
Run: python scripts/fetch_pois.py
"""
from common import overpass, write_out, load_sites, haversine, r5

R = 800
CAP = 6000


def classify(t):
    a = t.get("amenity")
    if a in ("restaurant", "cafe", "fast_food", "food_court"):
        return "food"
    if a == "place_of_worship" and t.get("religion") == "muslim":
        return "mosque"
    if a in ("toilets", "drinking_water", "atm", "pharmacy"):
        return "services"
    if t.get("tourism") in ("hotel", "guest_house", "apartment", "hostel", "motel"):
        return "lodging"
    if a == "shelter" or t.get("leisure") == "park":
        return "shade"
    if "shop" in t:
        return "shop"
    return None


def main():
    sites = load_sites()
    clauses = []
    for lat, lon in sites.values():
        a = "(around:%d,%f,%f)" % (R, lat, lon)
        clauses += [
            'nwr[amenity~"^(restaurant|cafe|fast_food|food_court|toilets|drinking_water|atm|pharmacy|shelter)$"]' + a,
            "nwr[shop]" + a,
            'nwr[tourism~"^(hotel|guest_house|apartment|hostel|motel)$"]' + a,
            "nwr[leisure=park]" + a,
            "nwr[amenity=place_of_worship][religion=muslim]" + a,
        ]
    q = "[out:json][timeout:300];(%s);out center tags;" % ";".join(clauses)
    d = overpass(q, "pois_sites")
    pts = {}
    for e in d["elements"]:
        t = e.get("tags", {})
        cat = classify(t)
        if not cat:
            continue
        c = e.get("center", e)
        if "lat" not in c:
            continue
        pts["%s%d" % (e["type"][0], e["id"])] = (c["lat"], c["lon"], cat, t.get("name:en") or t.get("name"))
    cats = ["food", "shop", "lodging", "services", "shade", "mosque"]
    by_site = {}
    for sid, (slat, slon) in sites.items():
        cnt = dict.fromkeys(cats, 0)
        for lat, lon, cat, _ in pts.values():
            if haversine(slat, slon, lat, lon) <= R:
                cnt[cat] += 1
        cnt["total"] = sum(cnt[c] for c in cats)
        by_site[sid] = cnt
    plist = sorted(pts.values(), key=lambda p: p[3] is None)[:CAP]
    points = [{"lat": r5(a), "lon": r5(b), "cat": c, "name": n} for a, b, c, n in plist]
    write_out("pois.json", {"radius_m": R, "points": points, "by_site": by_site,
                            "counts": {"points": len(points), "unique_found": len(pts)}},
              "OpenStreetMap contributors via Overpass API (ODbL)",
              "Amenities within %d m (straight line) of each site. by_site counts use all features found; "
              "points de-duplicated, capped at %d preferring named. OSM coverage of shops/food in Madinah "
              "is incomplete, so counts are lower bounds." % (R, CAP))


if __name__ == "__main__":
    main()
