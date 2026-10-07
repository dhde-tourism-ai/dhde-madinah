"""
build_isochrones.py - 5/10/15-minute walking reach around each site (OSM walking network).

For each site in public/data/sites.json: fetch walkable ways within 1.6 km (Overpass,
cached), build a graph weighted by metres, run Dijkstra from the nearest node, and
wrap the reached edges in a polygon (edges buffered ~35 m, unioned, simplified).
Walking speed 4.5 km/h -> 375 / 750 / 1125 m of network distance.

Output: public/data/isochrones.json
  { minutes:[5,10,15], speed_kmh:4.5,
    sites:{id:{"5":[[lat,lon]...], "10":[...], "15":[...], reach_m2:{"5":m2,...}}} }
Run: python scripts/build_isochrones.py   (needs networkx, shapely)
"""
import json
import math
import os

import networkx as nx
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

from common import OUT, overpass, haversine, r5, write_out

SPEED_KMH = 4.5
MINUTES = [5, 10, 15]
RADIUS = 1600
WALKABLE = "footway|pedestrian|path|steps|living_street|residential|service|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|track|corridor"


def to_xy(lat, lon, lat0):
    """Local equirectangular metres (good enough at 1.6 km)."""
    return (lon * 111320 * math.cos(math.radians(lat0)), lat * 110540)


def to_ll(x, y, lat0):
    return (y / 110540, x / (111320 * math.cos(math.radians(lat0))))


def one_site(sid, lat, lon):
    q = f"""[out:json][timeout:120];
way(around:{RADIUS},{lat},{lon})["highway"~"^({WALKABLE})$"]["foot"!~"no"]["access"!~"private|no"];
(._;>;);
out body;"""
    data = overpass(q, f"walk_{sid}")
    nodes = {e["id"]: (e["lat"], e["lon"]) for e in data["elements"] if e["type"] == "node"}
    g = nx.Graph()
    for e in data["elements"]:
        if e["type"] != "way":
            continue
        nd = [n for n in e["nodes"] if n in nodes]
        for a, b in zip(nd, nd[1:]):
            (la1, lo1), (la2, lo2) = nodes[a], nodes[b]
            g.add_edge(a, b, w=haversine(la1, lo1, la2, lo2))
    if not g.number_of_nodes():
        return None
    # start from the main street network, not an isolated courtyard or plaza path
    g = g.subgraph(max(nx.connected_components(g), key=len)).copy()
    start = min(g.nodes, key=lambda n: haversine(lat, lon, *nodes[n]))
    snap = haversine(lat, lon, *nodes[start])
    dist = nx.single_source_dijkstra_path_length(g, start, cutoff=max(MINUTES) * SPEED_KMH * 1000 / 60, weight="w")
    out = {"reach_m2": {}}
    for m in MINUTES:
        budget = m * SPEED_KMH * 1000 / 60 - snap
        lines = []
        for a, b in g.edges():
            da, db = dist.get(a), dist.get(b)
            if da is None and db is None:
                continue
            pa = to_xy(*nodes[a], lat)
            pb = to_xy(*nodes[b], lat)
            if da is not None and db is not None and da <= budget and db <= budget:
                lines.append(LineString([pa, pb]))
            else:
                # partial edge: walk in from the reached end as far as the budget allows
                if da is not None and da < budget:
                    near, far, d0 = pa, pb, da
                elif db is not None and db < budget:
                    near, far, d0 = pb, pa, db
                else:
                    continue
                L = math.dist(near, far) or 1
                f = min(1, (budget - d0) / L)
                lines.append(LineString([near, (near[0] + (far[0] - near[0]) * f, near[1] + (far[1] - near[1]) * f)]))
        if not lines:
            continue
        shape = unary_union([ln.buffer(35, resolution=4) for ln in lines])
        if shape.geom_type == "MultiPolygon":
            shape = max(shape.geoms, key=lambda p: p.area)  # the part connected to the site
        shape = Polygon(shape.exterior).simplify(12)
        out[str(m)] = [[r5(la), r5(lo)] for la, lo in (to_ll(x, y, lat) for x, y in shape.exterior.coords)]
        out["reach_m2"][str(m)] = round(shape.area)
    return out


def main():
    with open(os.path.join(OUT, "sites.json"), encoding="utf-8") as f:
        sites = json.load(f)["sites"]
    res = {}
    for s in sites:
        try:
            iso = one_site(s["id"], s["lat"], s["lon"])
        except Exception as e:  # one site failing must not stop the rest
            print(s["id"], "failed:", e)
            continue
        if iso:
            res[s["id"]] = iso
            print(s["id"], {k: v for k, v in iso["reach_m2"].items()})
    write_out(
        "isochrones.json",
        {"minutes": MINUTES, "speed_kmh": SPEED_KMH, "sites": res},
        "OpenStreetMap contributors via Overpass API (ODbL); computed walking network distance",
        "Walking reach on the OSM path and street network at 4.5 km/h from the nearest network node to each site. Ignores heat, crossings and gates; a planning approximation.",
        status="modelled",
    )


if __name__ == "__main__":
    main()
