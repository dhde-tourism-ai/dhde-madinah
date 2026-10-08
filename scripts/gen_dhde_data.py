"""
gen_dhde_data.py - the DHDE map files for Madinah, in the same shapes dhde-app uses.

Writes (public/data/):
  nodes.json              sites (and transport hubs) as DHDE nodes, coloured by cluster
  routes.json             corridors for people flow and traffic (OSRM road paths), the
                          Haramain line as a rail inflow, and one alternate route
  live_demo.json          8 days x 24 h from 2 days ago: people on site and arriving (DEMO,
                          prayer-time profile), flows, traffic, Jumu'ah advisories, and
                          REAL weather (Open-Meteo) with heat alerts from that forecast
  market_voice_demo.json  hotels, search interest, survey, social posts, reviews (DEMO)

Everything marked demo is illustrative, in the shape of the STC request, until real feeds
arrive. Re-run daily (the GitHub workflow does) so the timeline stays on today.
Run: python scripts/gen_dhde_data.py
"""
import datetime as dt
import json
import math
import os
import random

import requests

from common import OUT, UA, r5
from fetch_routes import route, simplify

TZ = dt.timezone(dt.timedelta(hours=3))  # Asia/Riyadh
DAYS = 8
rnd = random.Random(1447)


def load(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return json.load(f)


def write(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", name, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")


SITES = load("sites.json")
SITE = {s["id"]: s for s in SITES["sites"]}
ORIGIN = {o["id"]: o for o in SITES["origins"]}
LEGS = load("coach_legs.json")["legs"]
PRAYERS = load("prayer_times.json")["days"] if os.path.exists(os.path.join(OUT, "prayer_times.json")) else {}
TRANSPORT = load("transport.json") if os.path.exists(os.path.join(OUT, "transport.json")) else None

# the Madinah prototype's cluster colours (dhde-ai-demo/medina)
CLUSTER_COLOUR = {"center": "#c99a3b", "A": "#0ca3a3", "Asat": "#0ca3a3", "B": "#eda100", "outlier": "#d03b3b"}
# typical people on site at the busiest hour (demo), and a comfortable level
PEAK = {"haram": 260000, "quba": 9000, "shuhada": 4200, "uhud": 1100, "qiblatain": 2100, "al-khandaq": 900,
        "biography-museum": 700, "safiya": 520, "faqir-well": 180, "gharas-well": 160, "al-hayy": 300, "jabal-ayr": 60}
COMFORT = {k: round(v * 0.9) for k, v in PEAK.items()}
COMFORT["haram"] = 300000


def now_local():
    return dt.datetime.now(TZ)


def prayer_hours(date):
    d = PRAYERS.get(date) or {"fajr": "05:00", "dhuhr": "12:00", "asr": "15:25", "maghrib": "17:55", "isha": "19:25"}

    def h(s):
        a, b = s.split(":")[:2]
        return int(a) + int(b) / 60

    return {k: h(d[k]) for k in ("fajr", "dhuhr", "asr", "maghrib", "isha")}


def presence(site, hour, ph, weekday, heat):
    """Relative presence 0..~1.6: prayer surges, morning tours, heat dip at open-air sites."""
    v = 0.05
    for name, t in ph.items():
        w = 1.2 if name in ("maghrib", "isha") else 1.0
        v += w * math.exp(-((hour + 0.5 - (t + 0.4)) ** 2) / (2 * 0.7 ** 2))
    if site != "haram":
        v *= 0.55
        if 7 <= hour <= 11:
            v += 0.6
        if 15 <= hour <= 17:
            v += 0.3
        if SITE[site]["open_air"] and heat:
            v *= max(0.35, 1 - (heat - 34) / 18)
    if hour < 4:
        v *= 0.3 if site == "haram" else 0.04
    if site == "quba" and weekday == 5:
        v *= 1.35
    if weekday == 4:
        v *= 1.3 if site == "haram" else 0.8
    return v


# ---------------------------------------------------------------- weather (real)
WMO = {0: "clear", 1: "clear", 2: "partly", 3: "cloudy", 45: "fog", 48: "fog", 51: "rain", 53: "rain", 55: "rain",
       61: "rain", 63: "rain", 65: "heavy_rain", 80: "rain", 81: "rain", 82: "heavy_rain", 95: "thunder", 96: "thunder", 99: "thunder"}


def weather(start):
    url = ("https://api.open-meteo.com/v1/forecast?latitude=24.467&longitude=39.611"
           "&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code,is_day"
           f"&wind_speed_unit=ms&timezone=Asia%2FRiyadh&start_date={start}&end_date={(dt.date.fromisoformat(start) + dt.timedelta(days=DAYS - 1)).isoformat()}")
    try:
        h = requests.get(url, headers=UA, timeout=40).json()["hourly"]
        cond = []
        for code, day in zip(h["weather_code"], h["is_day"]):
            c = WMO.get(code, "cloudy")
            if not day and c == "clear":
                c = "clear_night"
            if not day and c == "partly":
                c = "partly_night"
            cond.append(c)
        return {"temp_c": h["temperature_2m"], "precip_pct": [p or 0 for p in h["precipitation_probability"]],
                "precip_mm": h["precipitation"], "wind_ms": h["wind_speed_10m"], "condition": cond, "real": True}
    except Exception as e:  # offline: a typical October day
        print("weather fallback:", e)
        temp = [27 + 9 * math.sin((i % 24 - 9) / 24 * 2 * math.pi) for i in range(DAYS * 24)]
        return {"temp_c": temp, "precip_pct": [0] * (DAYS * 24), "precip_mm": [0] * (DAYS * 24), "wind_ms": [3] * (DAYS * 24),
                "condition": ["clear" if 6 <= i % 24 <= 17 else "clear_night" for i in range(DAYS * 24)], "real": False}


# ---------------------------------------------------------------- routes
def leg(a, b):
    key, rev = (f"{a}|{b}", False) if f"{a}|{b}" in LEGS else (f"{b}|{a}", True)
    if key in LEGS:
        p = LEGS[key]["path"]
        return (p[::-1] if rev else p), LEGS[key]["km"], LEGS[key]["min"]
    pa = SITE.get(a) or ORIGIN[a]
    pb = SITE.get(b) or ORIGIN[b]
    res = route(a, b, (pa["lat"], pa["lon"]), (pb["lat"], pb["lon"]))
    p = [[r5(x), r5(y)] for x, y in simplify(res["path"])]
    return p, res["km"], res["min"]


CORRIDORS = [
    # id, from, to, kind, label en, label ar
    ("haram-quba", "haram", "quba", "corridor", "Haram – Quba", "الحرم – قباء"),
    ("haram-shuhada", "haram", "shuhada", "corridor", "Haram – Sayyid al-Shuhada (Uhud)", "الحرم – سيد الشهداء (أحد)"),
    ("haram-qiblatain", "haram", "qiblatain", "corridor", "Haram – Qiblatain", "الحرم – القبلتين"),
    ("haram-khandaq", "haram", "al-khandaq", "corridor", "Haram – al-Khandaq", "الحرم – الخندق"),
    ("haram-museum", "haram", "biography-museum", "corridor", "Haram – Seerah Museum", "الحرم – متحف السيرة"),
    ("quba-wells", "quba", "faqir-well", "corridor", "Quba – historic wells", "قباء – الآبار التاريخية"),
    ("shuhada-uhud", "shuhada", "uhud", "corridor", "Shuhada – Uhud summit", "الشهداء – قمة أحد"),
    ("airport-haram", "airport", "haram", "inflow", "Airport – Haram", "المطار – الحرم"),
    ("station-haram", "rail-station", "haram", "inflow", "Haramain station – Haram", "محطة الحرمين – الحرم"),
]


def build_routes():
    routes = []
    for rid, a, b, kind, en, ar in CORRIDORS:
        path, km_, mins = leg(a, b)
        routes.append({"id": rid, "from": a, "to": b, "via": [], "kind": kind, "label": en, "label_ja": ar,
                       "distance_km": km_, "duration_min": mins, "path": path})
    # alternate Haram -> Quba via the Seerah Museum / al-Safiya (used during Jumu'ah closures)
    p1, k1, m1 = leg("haram", "safiya")
    p2, k2, m2 = leg("safiya", "quba")
    routes.append({"id": "haram-quba-alt", "from": "haram", "to": "quba", "via": ["safiya"], "kind": "alternate",
                   "label": "Haram – Quba via al-Safiya", "label_ja": "الحرم – قباء عبر الصافية",
                   "distance_km": round(k1 + k2, 2), "duration_min": round(m1 + m2, 1), "path": p1 + p2[1:]})
    # Haramain HSR into the station (rail inflow): the longest OSM rail piece
    if TRANSPORT and TRANSPORT.get("rail"):
        pieces = [seg for r in TRANSPORT["rail"] if r["kind"] == "high_speed" for seg in r["path"]]
        if pieces:
            st = ORIGIN["rail-station"]
            best = max(pieces, key=len)
            # orient towards the station
            d0 = math.hypot(best[0][0] - st["lat"], best[0][1] - st["lon"])
            d1 = math.hypot(best[-1][0] - st["lat"], best[-1][1] - st["lon"])
            path = best if d1 < d0 else best[::-1]
            routes.append({"id": "hsr", "from": "makkah", "to": "rail-station", "via": [], "kind": "rail",
                           "label": "Haramain High Speed Railway", "label_ja": "قطار الحرمين السريع",
                           "distance_km": None, "duration_min": None, "approximate": True,
                           "path": [[r5(x), r5(y)] for x, y in simplify([tuple(p) for p in path], 0.0003)]})
    return routes


# ---------------------------------------------------------------- live
def build_live(routes):
    now = now_local()
    start = (now - dt.timedelta(days=2)).date()
    dates = [(start + dt.timedelta(days=d)) for d in range(DAYS)]
    observed_until = 2 * 24 + now.hour
    w = weather(start.isoformat())
    H = DAYS * 24
    days = [{"date": d.isoformat(), "dow": d.strftime("%a"), "weekend": d.weekday() in (4, 5), "holiday": False} for d in dates]

    nodes = {}
    for sid, s in SITE.items():
        actual, pred, lo, hi, arr_a, arr_p = [], [], [], [], [], []
        for di, d in enumerate(dates):
            ph = prayer_hours(d.isoformat())
            for hr in range(24):
                i = di * 24 + hr
                v = presence(sid, hr, ph, d.weekday(), w["temp_c"][i] if w["temp_c"][i] and w["temp_c"][i] > 34 else 0)
                p = PEAK[sid] * v / 1.6
                noise = 0.9 + 0.2 * rnd.random()
                a = round(p * noise)
                pred.append(round(p))
                lo.append(round(p * 0.82))
                hi.append(round(p * 1.18))
                actual.append(a if i <= observed_until else None)
                arr = p * 0.55 * (1.2 if hr in (7, 8, 9, 10) else 1)
                arr_p.append(round(arr))
                arr_a.append(round(arr * noise) if i <= observed_until else None)
        kw = {
            "haram": [("peaceful", "سكينة"), ("crowded at Maghrib", "زحام وقت المغرب"), ("Rawdah permit", "تصريح الروضة")],
            "quba": [("Saturday visit", "زيارة السبت"), ("parking", "المواقف"), ("beautiful", "جميل")],
            "shuhada": [("history", "التاريخ"), ("hot", "حار"), ("parking full", "المواقف ممتلئة")],
            "uhud": [("climb", "الصعود"), ("view", "الإطلالة"), ("no shade", "لا يوجد ظل")],
        }.get(sid, [("history", "التاريخ"), ("guide", "مرشد"), ("quiet", "هادئ")])
        nodes[sid] = {
            "measure": "people",
            "annual_visitors_2025": None,
            "comfortable_capacity": COMFORT[sid],
            "on_site": {"actual": actual, "predicted": pred, "lo": lo, "hi": hi},
            "arrivals": {"actual": arr_a, "predicted": arr_p},
            "weather": {"station": "Madinah (Open-Meteo)", "station_ja": "المدينة المنورة (Open-Meteo)",
                        "temp_c": w["temp_c"], "precip_pct": w["precip_pct"], "precip_mm": w["precip_mm"],
                        "wind_ms": w["wind_ms"], "condition": w["condition"]},
            "sentiment": {
                "score": [round(0.45 + 0.25 * rnd.random() - (0.15 if s["open_air"] else 0), 2) for _ in dates],
                "posts": [round((40 if sid == "haram" else 8) * (0.7 + 0.6 * rnd.random()) * (PEAK[sid] / 4000) ** 0.3) for _ in dates],
                "keywords": [[{"en": a, "ja": b} for a, b in kw] for _ in dates],
            },
        }

    # people flow per corridor (people per hour, forward = towards `to`)
    flows, traffic = {}, {}
    for r in routes:
        if r["kind"] == "alternate":
            continue
        fwd, rev = [], []
        dest = r["to"] if r["to"] in SITE else "haram"
        for di, d in enumerate(dates):
            ph = prayer_hours(d.isoformat())
            for hr in range(24):
                base = presence(dest, hr, ph, d.weekday(), 0)
                scale = {"inflow": 900, "rail": 1400, "corridor": 260}[r["kind"]]
                f = scale * base * (0.85 + 0.3 * rnd.random())
                fwd.append(round(f))
                rev.append(round(f * (0.6 + 0.5 * math.sin(hr / 24 * math.pi))))
        flows[r["id"]] = {"mode": "rail" if r["kind"] == "rail" else "road", "forward": fwd, "reverse": rev, "unit": "people_per_hour"}
        if r["kind"] == "rail":
            continue
        # traffic: three segments; the Haram end is busiest around prayers
        segs = [[0, 0.33], [0.33, 0.66], [0.66, 1]]
        cong = [[], [], []]
        vph = []
        for di, d in enumerate(dates):
            ph = prayer_hours(d.isoformat())
            for hr in range(24):
                c = 0.18 + 0.25 * math.exp(-((hr - 8) ** 2) / 3) + 0.3 * math.exp(-((hr - 17.5) ** 2) / 4)
                for t in ph.values():
                    c += 0.28 * math.exp(-((hr + 0.5 - (t + 0.6)) ** 2) / 0.8)
                if d.weekday() == 4 and 10 <= hr <= 13:
                    c += 0.35
                if hr < 5:
                    c *= 0.4
                for k in range(3):
                    near_haram = (k == 0 and r["from"] == "haram") or (k == 2 and r["to"] == "haram")
                    cong[k].append(round(min(1, c * (1.25 if near_haram else 0.85) * (0.9 + 0.2 * rnd.random())), 2))
                vph.append(round(1800 * c))
        traffic[r["id"]] = {"segments": segs, "congestion": cong, "vehicles_per_hour": vph}

    # Jumu'ah: the Haram end of the Quba corridor closes around Friday prayer (demo advisory)
    advisories = []
    for di, d in enumerate(dates):
        if d.weekday() == 4:
            advisories.append({"id": f"jumuah-{d.isoformat()}", "corridor": "haram-quba", "alternate": "haram-quba-alt",
                               "start": di * 24 + 10, "end": di * 24 + 14,
                               "reason_en": "Jumu'ah: roads around the Haram closed to coaches; use the al-Safiya route to Quba",
                               "reason_ja": "صلاة الجمعة: الطرق حول الحرم مغلقة أمام الحافلات؛ استخدم طريق الصافية إلى قباء"})
    # heat alerts from the real forecast
    open_air = [s for s in SITE if SITE[s]["open_air"]]
    weather_alerts = []
    for di in range(DAYS):
        temps = w["temp_c"][di * 24:(di + 1) * 24]
        tmax = max(t for t in temps if t is not None)
        if tmax >= 40:
            hot = [di * 24 + h for h, t in enumerate(temps) if t is not None and t >= 38]
            weather_alerts.append({
                "id": f"heat-{dates[di].isoformat()}", "type": "heat", "level": "warning" if tmax >= 44 else "advisory",
                "nodes": open_air, "start": min(hot), "end": max(hot) + 1,
                "title_en": f"Heat {round(tmax)}°C at open-air sites", "title_ja": f"حرارة {round(tmax)}° في المواقع المكشوفة",
                "detail_en": "Move coach visits to Uhud, Shuhada and the wells before 10:00 or after Asr; open shade and water points.",
                "detail_ja": "انقل زيارات أحد والشهداء والآبار إلى ما قبل العاشرة أو بعد العصر؛ وافتح نقاط الظل والماء.",
                "demo": not w["real"],
            })

    live = {
        "demo": True,
        "note": "DEMO people, flows and traffic in the shape of the STC request (prayer-time profile). Weather and heat alerts: real Open-Meteo forecast.",
        "generated_at": now.isoformat(timespec="seconds"), "timezone": "Asia/Riyadh",
        "start": start.isoformat(), "step_minutes": 60, "hours": H, "observed_until": observed_until,
        "days": days, "nodes": nodes, "flows": flows, "traffic": traffic,
        "advisories": advisories, "weather_alerts": weather_alerts,
    }
    return live, dates


# ---------------------------------------------------------------- market / voice (demo)
def build_market(dates):
    n = len(dates)
    hotels_def = [
        ("central", "Central area (Markaziya)", "المنطقة المركزية", 24.4688, 39.6090, "haram", 52000, 0.86),
        ("quba-d", "Quba district", "حي قباء", 24.4430, 39.6165, "quba", 3800, 0.71),
        ("airport-rd", "Airport Road", "طريق المطار", 24.4970, 39.6540, "haram", 9000, 0.64),
        ("uhud-d", "Uhud / Sayyid al-Shuhada", "أحد / سيد الشهداء", 24.4950, 39.6100, "shuhada", 2100, 0.58),
    ]
    hotels = []
    for hid, en, ar, lat, lon, node, rooms, occ in hotels_def:
        occs = [round(min(98, occ * 100 * (1.08 if d.weekday() in (3, 4) else 1) + rnd.uniform(-4, 4))) for d in dates]
        hotels.append({
            "id": hid, "name": en, "name_ja": ar, "lat": lat, "lon": lon, "node": node, "feed": "demo",
            "rooms_total": rooms, "occupancy_pct": occs, "rooms_left": [round(rooms * (100 - o) / 100) for o in occs],
            "booking_curve": {"target_day": 2, "points": [{"days_ahead": da, "booked_pct": round(occ * 100 * (1 - da / 45)), "last_year_pct": round(occ * 100 * (0.95 - da / 45))} for da in (30, 14, 7, 3, 1)]},
            "rakuten": {"radius_km": 1.5, "hotels_checked": 0, "share_with_rooms_pct": {"d1": 100 - occs[2], "d7": 100 - occs[-1] + 6, "d30": 40}},
        })
    rsi = []
    for sid, s in SITE.items():
        base = {"haram": 96, "quba": 82, "shuhada": 64, "uhud": 58, "qiblatain": 55, "al-khandaq": 41, "biography-museum": 47}.get(sid, 22)
        hist = [round(max(3, min(100, base + rnd.uniform(-8, 8)))) for _ in range(14)]
        rsi.append({"id": sid, "name": s["short"], "name_ja": s["short_ar"], "lat": s["lat"], "lon": s["lon"],
                    "index": hist[-1], "history": hist, "change_7d_pct": round((hist[-1] - hist[-8]) / max(1, hist[-8]) * 100, 1)})
    reasons = [("Religious visit (ziyarah)", "زيارة دينية"), ("History", "التاريخ"), ("With family", "مع العائلة"), ("Tour group programme", "برنامج المجموعة")]
    origins = [("South Asia", "جنوب آسيا"), ("Southeast Asia", "جنوب شرق آسيا"), ("GCC", "الخليج"), ("MENA", "الشرق الأوسط وشمال أفريقيا"), ("Saudi", "السعودية"), ("Other", "أخرى")]
    survey, social, reviews = {}, {}, {}
    posts_en = {
        "haram": [("Fajr at the Prophet's Mosque, the peace is unreal", "الفجر في المسجد النبوي، سكينة لا توصف", 0.9),
                  ("Took 40 minutes to get out of the car park after Maghrib", "استغرقنا ٤٠ دقيقة للخروج من المواقف بعد المغرب", -0.5)],
        "quba": [("Saturday morning at Quba, as the Prophet ﷺ did", "صباح السبت في قباء كما كان النبي ﷺ يفعل", 0.85),
                 ("Coach dropped us 1 km away, no shade on the walk", "أنزلتنا الحافلة على بعد ١ كم ولا ظل في الطريق", -0.4)],
        "shuhada": [("Standing where the Battle of Uhud was fought", "الوقوف حيث دارت غزوة أحد", 0.8),
                    ("So hot at noon, come early", "حار جدًا وقت الظهر، تعالوا مبكرًا", -0.3)],
    }
    for sid, s in SITE.items():
        big = PEAK[sid] / 4000
        survey[sid] = {
            "responses_30d": round(60 * big ** 0.5 + 10), "satisfaction": round(3.6 + s["satisfaction_base"] / 100, 1),
            "nps": round(s["satisfaction_base"] - 40), "source": "Demo (QR survey at Wi-Fi zones, proposed)",
            "top_reasons": [{"en": a, "ja": b, "share": round(x, 2)} for (a, b), x in zip(reasons, (0.55, 0.2, 0.15, 0.1))],
            "origin_share": [{"en": a, "ja": b, "share": x} for (a, b), x in zip(origins, (0.26, 0.19, 0.13, 0.15, 0.17, 0.1))],
        }
        feed = []
        for k, (en, ar, sen) in enumerate(posts_en.get(sid, [(f"Visited {s['short']} today with our group", f"زرنا {s['short_ar']} اليوم مع مجموعتنا", 0.6)])):
            feed.append({"id": f"{sid}-{k}", "kind": "photo" if k == 0 else "comment", "handle": f"@visitor{rnd.randint(100, 999)}",
                         "hours_ago": rnd.randint(1, 20), "sentiment": sen, "en": en, "ja": ar, "likes": rnd.randint(5, 900),
                         "comments": rnd.randint(0, 60), "thumb": {"motif": "mountain" if sid in ("uhud", "jabal-ayr") else "mosque", "hue": rnd.randint(20, 220)}})
        posts = round(30 * big ** 0.6 + 2)
        social[sid] = {"posts_24h": posts, "images_24h": round(posts * 0.6), "comments_24h": round(posts * 2.4),
                       "avg_sentiment": round(sum(p["sentiment"] for p in feed) / len(feed), 2), "feed": feed}
        rating = round(min(4.9, 4.0 + s["satisfaction_base"] / 110), 1)
        reviews[sid] = {"rating": rating, "count": round(4000 * big ** 0.7 + 50), "rating_30d_ago": round(rating - 0.05, 1),
                        "new_30d": round(120 * big ** 0.6 + 5), "distribution_pct": [62, 20, 9, 4, 5],
                        "snippets": [{"stars": 5, "en": "Well organised, clean and calm", "ja": "منظم ونظيف وهادئ", "days_ago": 3},
                                     {"stars": 3, "en": "Hard to find parking for coaches", "ja": "صعوبة إيجاد مواقف للحافلات", "days_ago": 9}],
                        "source": "Demo (Google reviews collection pending)"}
    return {"demo": True, "note": "DEMO hotels, search interest, survey, social posts and reviews for layout; real feeds pending (Apify Google reviews and social collection).",
            "generated_at": now_local().isoformat(timespec="seconds"), "start": dates[0].isoformat(), "days": n,
            "hotels": hotels, "rsi": rsi, "survey": survey, "social": social, "reviews": reviews}


def build_nodes():
    nodes = []
    for s in SITES["sites"]:
        nodes.append({"id": s["id"], "name": s["short"], "name_ja": s["short_ar"], "role": s["name"], "role_ja": s["name_ar"],
                      "prefecture": "madinah", "lat": s["lat"], "lon": s["lon"], "priority": True, "measure": "people",
                      "colour": CLUSTER_COLOUR.get(s["cluster"], "#199e70"),
                      "label_dir": {"haram": "right", "quba": "bottom", "uhud": "top", "shuhada": "left", "qiblatain": "left",
                                    "safiya": "left", "biography-museum": "left", "gharas-well": "bottom", "faqir-well": "right",
                                    "al-khandaq": "top", "al-hayy": "left", "jabal-ayr": "right"}.get(s["id"], "right")})
    for o in SITES["origins"]:
        if o["id"] in ("airport", "rail-station"):
            nodes.append({"id": o["id"], "name": o["label"], "name_ja": o["label_ar"], "prefecture": "madinah-hub",
                          "lat": o["lat"], "lon": o["lon"], "priority": False})
    return {"generated_at": now_local().isoformat(timespec="seconds"),
            "note": "Madinah historic sites (MRDA list) as DHDE nodes, coloured by cluster.",
            "prefectures": [{"id": "madinah", "name": "Madinah", "name_ja": "المدينة المنورة", "bounds": [[24.36, 39.53], [24.56, 39.72]]}],
            "nodes": nodes}


def main():
    routes = build_routes()
    write("routes.json", {"generated_at": now_local().isoformat(timespec="seconds"),
                          "source": "OSRM demo server (driving, OpenStreetMap); Haramain line from OpenStreetMap",
                          "note": "Corridors between the Haram, the historic sites and the arrival hubs.", "routes": routes})
    live, dates = build_live(routes)
    write("live_demo.json", live)
    write("market_voice_demo.json", build_market(dates))
    write("nodes.json", build_nodes())


if __name__ == "__main__":
    main()
