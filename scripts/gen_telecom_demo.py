"""Generate public/data/telecom_demo.json: ILLUSTRATIVE telecom-style aggregates.

Nothing here is an observation. The file has the shape we asked STC for
(visitors per site and hour, time on site, origin-destination trips, length
of stay, spend) so the dashboard can be built and reviewed before real data
arrives; the real feed replaces it with "demo": false.

Shapes follow the request in the STC deck:
  - every figure is an aggregate of >= 25 devices (k-anonymity), so small
    cells are suppressed (null) rather than shown
  - hourly arrays start 00:00 local (Asia/Riyadh) on `start`, index = day*24+hour

Run: python scripts/gen_telecom_demo.py [--start 2026-10-03]
Deterministic (fixed seed), so diffs stay readable.
"""
import argparse
import datetime as dt
import json
import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "telecom_demo.json")
PRAYER = os.path.join(ROOT, "public", "data", "prayer_times.json")

K_MIN = 25  # suppress any cell below this many devices

# id: (typical daily devices, open-air?, base dwell minutes, attraction for a second visit)
SITES = {
    "haram": (310000, False, 95, 1.0),
    "quba": (52000, False, 40, 0.9),
    "shuhada": (21000, True, 28, 0.7),
    "uhud": (6500, True, 45, 0.45),
    "qiblatain": (11000, False, 25, 0.6),
    "al-khandaq": (5200, True, 22, 0.4),
    "biography-museum": (3400, False, 55, 0.5),
    "safiya": (2600, False, 38, 0.35),
    "faqir-well": (900, True, 14, 0.2),
    "gharas-well": (800, True, 14, 0.2),
    "al-hayy": (1500, False, 30, 0.25),
    "jabal-ayr": (260, True, 30, 0.1),
}

GROUPS = [
    # id, label, label_ar, share of visitors, mean length of stay (days)
    ("gcc", "GCC", "دول الخليج", 0.12, 2.6),
    ("south-asia", "South Asia", "جنوب آسيا", 0.24, 5.2),
    ("southeast-asia", "Southeast Asia", "جنوب شرق آسيا", 0.18, 4.8),
    ("mena", "Middle East and North Africa", "الشرق الأوسط وشمال أفريقيا", 0.14, 4.1),
    ("turkey-central-asia", "Turkey and Central Asia", "تركيا وآسيا الوسطى", 0.08, 4.4),
    ("europe-americas", "Europe and the Americas", "أوروبا والأمريكتان", 0.06, 3.6),
    ("africa", "Sub-Saharan Africa", "أفريقيا جنوب الصحراء", 0.06, 5.6),
    ("domestic", "Saudi domestic", "زوار محليون", 0.12, 1.9),
]

SEGMENTS = [
    # id, label, label_ar, share, sites per visit-day, dwell multiplier, spend SAR/day
    ("haram-only", "Haram only", "الحرم فقط", 0.46, 1.0, 1.0, 140),
    ("quba-add", "Haram + Quba", "الحرم + قباء", 0.27, 2.0, 1.0, 185),
    ("circuit", "Historic circuit (3+ sites)", "جولة تاريخية (٣ مواقع فأكثر)", 0.17, 3.6, 0.9, 260),
    ("explorer", "Explorer (museums, Uhud, wells)", "مستكشف (متاحف، أحد، آبار)", 0.10, 4.6, 1.2, 330),
]

# Spend split per site (share of on-site card spend)
SPEND_CATS = [("food", "Food and cafés", "مطاعم ومقاهٍ"), ("retail", "Retail and souvenirs", "تسوق وهدايا"),
              ("transport", "Transport and parking", "نقل ومواقف"), ("services", "Services", "خدمات")]


def prayer_hours(date_str, prayers):
    """Prayer times as fractional hours for that date (fallback: typical October times)."""
    d = prayers.get(date_str) if prayers else None
    if not d:
        d = {"fajr": "05:00", "dhuhr": "11:55", "asr": "15:20", "maghrib": "17:55", "isha": "19:25"}

    def h(s):
        a, b = s.split(":")[:2]
        return int(a) + int(b[:2]) / 60

    return {k: h(d[k]) for k in ("fajr", "dhuhr", "asr", "maghrib", "isha")}


def hourly_profile(site, open_air, hour, ph, weekday, rnd):
    """Relative presence at a site for one hour: prayer surges, heat dip, night quiet."""
    v = 0.04
    for name, t in ph.items():
        w = 1.25 if name in ("maghrib", "isha") else 1.0
        if site == "haram":
            w *= 1.4
        # presence builds before prayer and lingers ~45 min after
        v += w * math.exp(-((hour + 0.5 - (t + 0.4)) ** 2) / (2 * 0.75 ** 2))
    if 7 <= hour <= 11:
        v += 0.55 if site != "haram" else 0.25  # morning ziyarah tours
    if 15 <= hour <= 17:
        v += 0.25
    if open_air and 11 <= hour <= 15:
        v *= 0.45  # midday heat at open-air sites
    if hour < 4:
        v *= 0.35 if site == "haram" else 0.05
    if site == "quba" and weekday == 5:  # Saturday visit to Quba
        v *= 1.35
    if weekday == 4:  # Friday
        v *= 1.25 if site == "haram" else 0.85
    return max(0.0, v * (0.92 + 0.16 * rnd.random()))


def suppress(n):
    n = int(round(n))
    return n if n >= K_MIN else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2026-10-03")
    args = ap.parse_args()
    rnd = random.Random(20261006)
    start = dt.date.fromisoformat(args.start)
    prayers = {}
    if os.path.exists(PRAYER):
        with open(PRAYER, encoding="utf-8") as f:
            prayers = json.load(f).get("days", {})

    days = []
    for d in range(7):
        date = start + dt.timedelta(days=d)
        days.append({"date": date.isoformat(), "dow": date.strftime("%a"), "weekend": date.weekday() in (4, 5),
                     "prayers": {k: f"{int(v):02d}:{int(round((v % 1) * 60)) % 60:02d}"
                                 for k, v in prayer_hours(date.isoformat(), prayers).items()}})

    sites = {}
    for sid, (daily, open_air, dwell, attract) in SITES.items():
        hourly, day_totals = [], []
        for d, day in enumerate(days):
            date = start + dt.timedelta(days=d)
            ph = prayer_hours(day["date"], prayers)
            prof = [hourly_profile(sid, open_air, h, ph, date.weekday(), rnd) for h in range(24)]
            total = sum(prof)
            day_scale = daily * (1.08 if day["weekend"] else 1.0) * (0.95 + 0.1 * rnd.random())
            day_totals.append(round(day_scale))
            hourly += [suppress(p / total * day_scale * 1.6) for p in prof]  # presence (devices on site in the hour)
        # dwell histogram (minutes), log-normal around the base dwell
        bins = [10, 20, 30, 45, 60, 90, 120, 180]
        sigma = 0.55
        mu = math.log(dwell)
        cdf = lambda x: 0.5 * (1 + math.erf((math.log(x) - mu) / (sigma * math.sqrt(2))))
        hist, prev = [], 0.0
        for b in bins:
            c = cdf(b)
            hist.append({"upto_min": b, "share": round(c - prev, 3)})
            prev = c
        hist.append({"upto_min": None, "share": round(1 - prev, 3)})
        mix = []
        for gid, _, _, share, _ in GROUPS:
            s = share * (0.8 + 0.4 * rnd.random())
            if sid in ("biography-museum", "safiya") and gid == "domestic":
                s *= 1.8
            mix.append([gid, s])
        tot = sum(s for _, s in mix)
        spend_per_visitor = {"haram": 95, "quba": 42, "shuhada": 30, "uhud": 22, "qiblatain": 18, "al-khandaq": 15,
                             "biography-museum": 48, "safiya": 36, "al-hayy": 40}.get(sid, 8)
        day_spend = daily * spend_per_visitor * (0.9 + 0.2 * rnd.random())
        cat_w = [0.46, 0.30, 0.16, 0.08] if sid != "haram" else [0.38, 0.44, 0.10, 0.08]
        sites[sid] = {
            "daily_devices": day_totals,
            "hourly": hourly,
            "dwell": {"median_min": round(math.exp(mu)), "p25_min": round(math.exp(mu - 0.674 * sigma)),
                      "p75_min": round(math.exp(mu + 0.674 * sigma)), "hist": hist},
            "nationality_mix": [{"group": g, "share": round(s / tot, 3)} for g, s in mix],
            "visitor_type": {"international": round(0.86 - 0.1 * rnd.random(), 2)},
            "second_site_share": round(min(0.85, attract * (0.35 + 0.1 * rnd.random())), 2),
            "spend_sar_day": {c: round(day_spend * w) for (c, _, _), w in zip(SPEND_CATS, cat_w)},
            "spend_sar_hourly_share": [round(x, 4) for x in _norm([v or 0 for v in hourly[:24]])],
        }

    # Origin-destination trips per day between sites (gravity model on daily volume and distance)
    # site coordinates from sites.json (OpenStreetMap where found), so distances match the map
    with open(os.path.join(ROOT, "public", "data", "sites.json"), encoding="utf-8") as f:
        coords = {x["id"]: (x["lat"], x["lon"]) for x in json.load(f)["sites"]}

    def km(a, b):
        (la1, lo1), (la2, lo2) = coords[a], coords[b]
        x = (lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2)) * 111.3
        y = (la2 - la1) * 111.3
        return math.hypot(x, y)

    od = []
    ids = list(SITES)
    for a in ids:
        for b in ids:
            if a == b:
                continue
            va, vb = SITES[a][0], SITES[b][0]
            trips = 0.0009 * (va ** 0.85) * (vb ** 0.55) * SITES[b][3] / (0.8 + km(a, b)) ** 1.1
            if a in ("faqir-well", "gharas-well") and b in ("faqir-well", "gharas-well", "quba"):
                trips *= 3
            if {a, b} == {"shuhada", "uhud"}:
                trips *= 2.5
            if {a, b} == {"safiya", "biography-museum"}:
                trips *= 3
            t = suppress(trips * (0.85 + 0.3 * rnd.random()))
            if t:
                od.append({"from": a, "to": b, "trips_day": t, "km": round(km(a, b), 2)})

    # Synthetic user-place sample (what an opt-in panel or STC-side processing would produce)
    users = []
    seg_pick = []
    for s in SEGMENTS:
        seg_pick += [s] * int(s[3] * 100)
    route_bank = {
        "haram-only": [["haram"]],
        "quba-add": [["haram", "quba"], ["quba", "haram"]],
        "circuit": [["haram", "quba", "qiblatain"], ["haram", "shuhada", "uhud", "qiblatain"], ["haram", "quba", "faqir-well", "gharas-well"]],
        "explorer": [["haram", "biography-museum", "safiya", "quba"], ["haram", "shuhada", "uhud", "al-khandaq", "qiblatain"],
                     ["quba", "gharas-well", "faqir-well", "safiya", "biography-museum"], ["haram", "jabal-ayr", "quba"]],
    }
    for i in range(80):
        seg = rnd.choice(seg_pick)
        route = rnd.choice(route_bank[seg[0]])
        grp = rnd.choices([g[0] for g in GROUPS], weights=[g[3] for g in GROUPS])[0]
        visits = []
        for k, sid in enumerate(route):
            visits.append({"site": sid, "order": k + 1,
                           "dwell_min": max(8, round(SITES[sid][2] * seg[5] * (0.6 + 0.8 * rnd.random()))),
                           "spend_sar": round(rnd.random() * 2 * (60 if sid == "haram" else 25))})
        users.append({"id": f"U{i + 1:02d}", "segment": seg[0], "group": grp,
                      "stay_days": round(max(1, rnd.gauss(dict((g[0], g[4]) for g in GROUPS)[grp], 1.2)), 1),
                      "visits": visits})

    # Wi-Fi zones (proposed; where waiting and dwell are longest in the demo)
    wifi = [
        {"id": "wifi-quba-n", "site": "quba", "label": "Quba north plaza", "lat": 24.4401, "lon": 39.6170},
        {"id": "wifi-quba-park", "site": "quba", "label": "Quba walkway (Quba Avenue)", "lat": 24.4440, "lon": 39.6150},
        {"id": "wifi-shuhada-park", "site": "shuhada", "label": "Sayyid al-Shuhada car park", "lat": 24.4880, "lon": 39.6050},
        {"id": "wifi-shuhada-sq", "site": "shuhada", "label": "Shuhada square shade area", "lat": 24.4862, "lon": 39.6028},
        {"id": "wifi-qiblatain", "site": "qiblatain", "label": "Qiblatain forecourt", "lat": 24.4690, "lon": 39.5812},
        {"id": "wifi-museum", "site": "biography-museum", "label": "Museum queue area", "lat": 24.4593, "lon": 39.6070},
    ]

    out = {
        "demo": True,
        "status": "illustrative",
        "note": "ILLUSTRATIVE ONLY. Simulated telecom-style aggregates in the shape requested from STC (visitors per site and hour, time on site, origin-destination, length of stay, card spend). Not observations; do not quote. Cells under 25 devices are suppressed (null), as the real request requires.",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "timezone": "Asia/Riyadh",
        "start": start.isoformat(),
        "hours": 168,
        "k_min": K_MIN,
        "days": days,
        "sites": sites,
        "od": od,
        "groups": [{"id": g[0], "label": g[1], "label_ar": g[2], "share": g[3], "stay_days": g[4]} for g in GROUPS],
        "segments": [{"id": s[0], "label": s[1], "label_ar": s[2], "share": s[3], "sites_per_day": s[4],
                      "dwell_mult": s[5], "spend_sar_day": s[6]} for s in SEGMENTS],
        "spend_categories": [{"id": c[0], "label": c[1], "label_ar": c[2]} for c in SPEND_CATS],
        "users": users,
        "wifi_zones": wifi,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB), {len(od)} OD pairs, {len(users)} sample users")


def _norm(xs):
    s = sum(xs) or 1
    return [x / s for x in xs]


if __name__ == "__main__":
    main()
