"""Build public/data/sites.json: the historic sites shown on the dashboard.

Base list: the ten sites of the DHDE Madinah heritage prototype (MRDA site list),
kept in public/data/sites_proto.json. Added here: the Prophet's Mosque (central
area, the anchor every visitor starts from) and al-Khandaq (Seven Mosques), a
pilot site in the STC request. Coordinates are replaced by OpenStreetMap ones
where scripts/fetch_open_data.py found the named feature (site_coords.json).

Run: python scripts/build_sites.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")

EXTRA = [
    {
        "id": "haram", "num": 0, "name": "Masjid an-Nabawi (central area)", "name_ar": "المسجد النبوي (المنطقة المركزية)",
        "cluster": "center", "lat": 24.46723, "lon": 39.61111, "typical_visit_min": 95,
        "desc": "The Prophet's Mosque and the hotel district around it. Almost every visitor starts and ends here; the goal is to draw them from here to the historic sites.",
        "desc_ar": "المسجد النبوي والمنطقة الفندقية المحيطة به. يبدأ منه كل زائر تقريبًا وينتهي إليه؛ والهدف جذب الزوار منه إلى المواقع التاريخية.",
        "photo": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Green_Dome_of_Al-Masjed_Al-Nabawi.jpg/960px-Green_Dome_of_Al-Masjed_Al-Nabawi.jpg",
                  "credit": "آرمین, CC0, via Wikimedia Commons"},
    },
    {
        "id": "al-khandaq", "num": 11, "name": "Al-Khandaq (Seven Mosques)", "name_ar": "الخندق (المساجد السبعة)",
        "cluster": "B", "lat": 24.47970, "lon": 39.59900, "typical_visit_min": 22,
        "desc": "The site of the Battle of the Trench, with the small Seven Mosques and al-Fath Mosque. A pilot site in the STC request; too close to other cells for the network to separate, so Wi-Fi counts help here.",
        "desc_ar": "موقع غزوة الخندق، ويضم المساجد السبعة ومسجد الفتح. موقع تجريبي في طلب بيانات STC؛ قريب جدًا من خلايا أخرى، لذا تساعد عدادات الواي فاي هنا.",
        "photo": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Mosque_of_Ali_ibn_Abi_Talib_at_the_Seven_Mosques%2C_Madinah%2C_Saudi_Arabia_%282%29.jpg/960px-Mosque_of_Ali_ibn_Abi_Talib_at_the_Seven_Mosques%2C_Madinah%2C_Saudi_Arabia_%282%29.jpg",
                  "credit": "Richard Mortel, CC BY 2.0, via Wikimedia Commons"},
    },
]

# Pilot sites named in the STC request (deck, October 2026)
PILOT = {"quba": 1, "shuhada": 1, "al-khandaq": 2, "qiblatain": 2}
SHORT = {
    "haram": ("Haram", "الحرم"), "jabal-ayr": ("Jabal Ayr", "جبل عير"), "uhud": ("Uhud summit", "قمة أحد"),
    "shuhada": ("Sayyid al-Shuhada", "سيد الشهداء"), "faqir-well": ("Faqir Well", "بئر الفقير"), "gharas-well": ("Gharas Well", "بئر غرس"),
    "safiya": ("Al-Safiya", "الصافية"), "biography-museum": ("Seerah Museum", "متحف السيرة"), "qiblatain": ("Qiblatain", "القبلتين"),
    "quba": ("Quba", "قباء"), "al-hayy": ("Al-Hayy", "الحي"), "al-khandaq": ("Al-Khandaq", "الخندق"),
}
# Operator figures from the Madinah prototype (MRDA brief): coach groups per hourly slot,
# weather exposure (0-1) and a baseline satisfaction score. All illustrative until the
# ministry publishes site capacities; the Haram is not bookable.
CAPACITY = {"jabal-ayr": 2, "uhud": 6, "shuhada": 6, "faqir-well": 3, "gharas-well": 3, "safiya": 5,
            "biography-museum": 8, "qiblatain": 6, "quba": 8, "al-hayy": 4, "al-khandaq": 4}
EXPOSURE = {"jabal-ayr": 0.95, "uhud": 0.85, "shuhada": 0.6, "faqir-well": 0.5, "gharas-well": 0.5, "safiya": 0.25,
            "biography-museum": 0.1, "qiblatain": 0.3, "quba": 0.35, "al-hayy": 0.4, "al-khandaq": 0.6, "haram": 0.2}
SATISFACTION = {"jabal-ayr": 78, "uhud": 88, "shuhada": 84, "faqir-well": 74, "gharas-well": 75, "safiya": 80,
                "biography-museum": 90, "qiblatain": 92, "quba": 94, "al-hayy": 72, "al-khandaq": 82, "haram": 95}
OPEN_AIR = {"uhud", "shuhada", "faqir-well", "gharas-well", "jabal-ayr", "al-khandaq"}


def main():
    with open(os.path.join(DATA, "sites_proto.json"), encoding="utf-8") as f:
        proto = json.load(f)
    coords = {}
    p = os.path.join(DATA, "site_coords.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            raw = json.load(f)
        coords = raw.get("sites", raw)  # file is {source, ..., sites:{id:{lat,lon,source}}}
    sites = EXTRA[:1] + proto["sites"] + EXTRA[1:]
    for s in sites:
        s.pop("status_note", None)
        c = coords.get(s["id"])
        if c and c.get("source") == "osm":
            s["lat"], s["lon"] = round(c["lat"], 5), round(c["lon"], 5)
        s["coord_source"] = "osm" if c and c.get("source") == "osm" else "prototype"
        s["pilot_phase"] = PILOT.get(s["id"])
        s["open_air"] = s["id"] in OPEN_AIR
        s["capacity_per_slot"] = CAPACITY.get(s["id"])
        s["exposure"] = EXPOSURE.get(s["id"], 0.4)
        s["satisfaction_base"] = SATISFACTION.get(s["id"], 80)
        s["short"], s["short_ar"] = SHORT.get(s["id"], (s["name"], s["name_ar"]))
    out = {"source": proto["source"] + "; OpenStreetMap coordinates where found", "status": "real",
           "sites": sites, "origins": proto["origins"]}
    with open(os.path.join(DATA, "sites.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(len(sites), "sites")


if __name__ == "__main__":
    main()
