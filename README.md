# dhde-madinah

**DHDE · Madinah Visitor Intelligence**: the Madinah version of the DHDE dashboard ([dhde-app](https://github.com/dhde-tourism-ai/dhde-app)), for the visitor-flow pilot with MRDA, STC, Taibah University and the University of Fukui. Same stack and look as dhde-app (React, Vite, Leaflet, recharts; dark theme), in English and Arabic (right-to-left).

It answers four questions for MRDA:

1. How many visitors reach each historic site, and when?
2. How long do they stay, and what cuts visits short?
3. Where do they come from, and where do they go next?
4. Which visitor groups leave Madinah early, and how do we keep them longer and spending?

## Views

- **Summary**: the questions, headline figures, the twelve sites.
- **Map**: historic sites (from the earlier Madinah prototype, plus the Prophet's Mosque and al-Khandaq), visitors on site by hour with prayer times on the timeline, trips between sites, card spend, proposed Wi-Fi zones, bus stops and stations, Haramain rail, car parks, traffic on main roads, 5/10/15-minute walking reach, and food, shops, shade and services around each site. Live temperature and feels-like from Open-Meteo.
- **Sites**: per site, visitors hour by hour around the five prayers, time on site, nationality mix, card spend by category, and what is within a 10-minute walk.
- **Networks**: the site network (trips between sites), the visitor–place graph (each anonymised visitor linked to the places they visit, in order), visitor types, and length of stay by nationality against the 7–8 day target.
- **Strategy**: keeping visitors longer and spending. A what-if model for three levers (Haram-only visitors adding Quba, longer visits at open-air sites, extra nights), the five policy levers with measures of success, SAMA weekly card spending in Madinah, and published facts with sources.
- **Data**: every source, its status, and what the STC data replaces.

## Every number is labelled

| Label | Meaning |
|---|---|
| Real | Published or open data, with its source |
| Reported | Stated by MRDA or a partner, not yet measured |
| Modelled | Calculated from other data (e.g. walking reach, the strategy what-if) |
| Illustrative | Simulated to show how the real data will be used. Do not quote. |
| Pending | Requested, not yet received |

Visitor, time-on-site, flow, length-of-stay and spend layers run on **illustrative** data (`telecom_demo.json`, "Demo data · STC pending" badge) in the exact shape of the STC request: aggregates only, cells under 25 devices suppressed. When STC data arrives, it replaces that file with `"demo": false` and the badges disappear.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type check + production build into dist/
npm run lint
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Data (`public/data/`)

| File | Built by | Status | Contents |
|---|---|---|---|
| `sites.json` | `scripts/build_sites.py` (from `sites_proto.json` + `site_coords.json`) | Real | 12 sites: names (EN/AR), descriptions, photos, clusters, pilot phase |
| `site_coords.json` | `scripts/fetch_site_coords.py` | Real | OpenStreetMap coordinates of each site |
| `transport.json` | `scripts/fetch_transport.py` | Real | bus stops, bus and rail stations, Haramain line, car parks (OSM). Madinah Bus route lines are not in OSM yet. |
| `roads.json` | `scripts/fetch_roads.py` | Real | main roads (for the traffic layer, whose congestion is illustrative) |
| `pois.json` | `scripts/fetch_pois.py` | Real | food, shops, hotels, services, shade, mosques within 800 m of each site |
| `isochrones.json` | `scripts/build_isochrones.py` | Modelled | 5/10/15-minute walking reach on the OSM network at 4.5 km/h |
| `prayer_times.json` | `scripts/fetch_prayer_times.py` | Real | Umm al-Qura prayer times (Aladhan API) |
| `spend.json` | compiled by hand from the SAMA weekly POS bulletin (press reports) | Real, partial | weekly card spending in Madinah; national sectors |
| `context.json` | compiled by hand, one URL per fact | Real | visitors, stay, spend per night, occupancy, bus and rail ridership, Vision 2030 targets, climate |
| `telecom_demo.json` | `scripts/gen_telecom_demo.py` | **Illustrative** | visitors per site and hour, time on site, origin–destination trips, nationality mix, length of stay, visitor segments, sample visitor–place graph, card spend, proposed Wi-Fi zones |

Rebuild open data (Python 3, `pip install requests networkx shapely`):

```bash
cd scripts
python fetch_site_coords.py && python build_sites.py
python fetch_transport.py && python fetch_roads.py && python fetch_pois.py
python build_isochrones.py && python fetch_prayer_times.py
python gen_telecom_demo.py
```

Overpass responses are cached in `cache/` (git-ignored); delete a file to re-fetch it.

OpenStreetMap data © OpenStreetMap contributors (ODbL). Photos from Wikimedia Commons, credited in `sites.json`.
