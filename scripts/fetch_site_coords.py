"""
fetch_site_coords.py - resolve final coordinates of the study sites from OSM.

For each site a specific, manually verified OSM feature (ids found by name search
in the Madinah bbox) is looked up and its centre used; if no matching OSM feature
exists, the coordinates given in the brief are used (source "given").

Output: public/data/site_coords.json
  top level: source, fetched_at, status, note, plus {site_id: {lat, lon, source, osm?, osm_name?}}
  (the same mapping is also under "sites").
Run: python scripts/fetch_site_coords.py   (cached Overpass responses live in cache/)
"""
from common import overpass, write_out, SITES_GIVEN, r5

# site_id -> (osm type, osm id)  -- verified by name search
OSM_MATCH = {
    "haram": ("way", 461699097),        # المسجد النبوي / Prophet's Mosque
    "quba": ("relation", 18051738),     # مسجد قباء / Quba Mosque
    "qiblatain": ("way", 66510098),     # مسجد القبلتين
    "shuhada": ("way", 444240031),      # مسجد سيد الشهداء
    "jabal-ayr": ("node", 1236691857),  # جبل عير (peak)
    "safiya": ("way", 1357107466),      # متحف وبستان الصافية / As-Safiyyah Museum & Park
    "al-khandaq": ("way", 1544963301),  # The Seven Mosques (Masjid al-Sab'a)
}
# Not matched (given coords used): uhud (OSM 'Mount Uhud' is the summit ~2 km N;
# the brief's point is the martyrs / Archers' Hill visitor area), faqir-well,
# gharas-well, biography-museum.  al-hayy: no matching feature -> omitted.


def main():
    parts = "".join("%s(%d);" % (t, i) for t, i in OSM_MATCH.values())
    q = "[out:json][timeout:60];(%s);out center tags;" % parts
    d = overpass(q, "site_features", timeout=90)
    found = {}
    for e in d["elements"]:
        c = e.get("center", e)
        found[(e["type"], e["id"])] = (c["lat"], c["lon"], e.get("tags", {}).get("name"))
    sites = {}
    for sid, given in SITES_GIVEN.items():
        m = OSM_MATCH.get(sid)
        if m and m in found:
            lat, lon, nm = found[m]
            sites[sid] = {"lat": r5(lat), "lon": r5(lon), "source": "osm",
                          "osm": "%s/%d" % m, "osm_name": nm}
        elif given:
            sites[sid] = {"lat": given[0], "lon": given[1], "source": "given"}
    payload = dict(sites)
    payload["sites"] = sites
    write_out("site_coords.json", payload,
              "OpenStreetMap (Overpass API) + coordinates given in brief",
              "OSM centre of the named feature where found; else given coords. "
              "al-hayy not found in OSM and omitted. uhud uses the given point "
              "(OSM 'Mount Uhud' is the summit, not the visitor area).")


if __name__ == "__main__":
    main()
