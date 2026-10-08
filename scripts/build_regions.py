"""
build_regions.py - the pilot locations shown alongside Madinah, with their key places.

From the STA call notes (Oct 2026), where a pilot could start:
  - Madinah: replicate the dashboard with MDA; its data or demo data to build correlations
  - AlUla and the Red Sea: test beds for nudging, since visitors arrive mostly by air
  - Jeddah or Makkah: the effect of trains and promotions on travel
Places are geocoded with OpenStreetMap Nominatim (one request a second); a place it can't
find keeps the approximate coordinate given here, flagged approx.

Output: public/data/regions.json
Run: python scripts/build_regions.py
"""
import json
import os
import time

import requests

from common import CACHE, OUT, write_out

UA = {"User-Agent": "dhde-madinah-dashboard/1.0 (regions build)"}

REGIONS = [
    {
        "id": "madinah", "name": "Madinah", "name_ar": "المدينة المنورة", "center": [24.467, 39.611], "zoom": 13,
        "arrival": "Air (MED), Haramain railway, road", "arrival_ar": "جوًا (مطار المدينة)، قطار الحرمين، برًا",
        "use_case": "Replicate the dashboard with MDA and access its data, or demo data, to build correlations",
        "use_case_ar": "تكرار اللوحة مع هيئة تطوير المدينة والوصول إلى بياناتها أو بيانات تجريبية لبناء الارتباطات",
        "status": "live", "places": [],
    },
    {
        "id": "alula", "name": "AlUla", "name_ar": "العلا", "center": [26.62, 37.93], "zoom": 11,
        "arrival": "Mostly by air (AlUla International Airport, ULH)", "arrival_ar": "غالبًا جوًا (مطار العلا الدولي)",
        "use_case": "Test bed for nudging: visitors arrive mostly by air, so arrivals are known in advance",
        "use_case_ar": "بيئة اختبار للتوجيه: يصل الزوار غالبًا جوًا، فتُعرف أعداد الوصول مسبقًا",
        "status": "candidate",
        "places": [
            ("Hegra (Al-Hijr), UNESCO site", "الحجر (مدائن صالح)", "Hegra AlUla", [26.792, 37.952], "heritage"),
            ("AlUla Old Town", "البلدة القديمة بالعلا", "AlUla Old Town", [26.6195, 37.918], "heritage"),
            ("Elephant Rock (Jabal AlFil)", "جبل الفيل", "Elephant Rock AlUla", [26.6955, 37.9645], "nature"),
            ("Maraya", "مرايا", "Maraya AlUla", [26.6237, 37.8615], "venue"),
            ("AlUla International Airport", "مطار العلا الدولي", "AlUla International Airport", [26.4833, 38.1167], "airport"),
        ],
    },
    {
        "id": "redsea", "name": "Red Sea", "name_ar": "البحر الأحمر", "center": [25.6, 37.1], "zoom": 9,
        "arrival": "Mostly by air (Red Sea International Airport, RSI)", "arrival_ar": "غالبًا جوًا (مطار البحر الأحمر الدولي)",
        "use_case": "Test bed for nudging: fly-in visitors, resort capacity and island transfers",
        "use_case_ar": "بيئة اختبار للتوجيه: زوار يصلون جوًا، وسعة المنتجعات والتنقل إلى الجزر",
        "status": "candidate",
        "places": [
            ("Red Sea International Airport", "مطار البحر الأحمر الدولي", "Red Sea International Airport", [25.73, 37.07], "airport"),
            ("Shura Island", "جزيرة شورى", "Shura Island Red Sea", [25.49, 36.95], "resort"),
            ("Six Senses Southern Dunes", "سيكس سنسز الكثبان الجنوبية", "Six Senses Southern Dunes", [25.62, 37.35], "resort"),
            ("Ummahat Islands", "جزر أمهات", "Ummahat Island", [25.27, 36.82], "resort"),
        ],
    },
    {
        "id": "jeddah", "name": "Jeddah", "name_ar": "جدة", "center": [21.54, 39.17], "zoom": 11,
        "arrival": "Air (KAIA), Haramain railway, sea, road", "arrival_ar": "جوًا (مطار الملك عبدالعزيز)، قطار الحرمين، بحرًا، برًا",
        "use_case": "Study the effect of trains and promotions on travel (Haramain to Makkah and Madinah)",
        "use_case_ar": "دراسة أثر القطارات والعروض على التنقل (قطار الحرمين إلى مكة والمدينة)",
        "status": "candidate",
        "places": [
            ("Al-Balad (Historic Jeddah)", "جدة التاريخية (البلد)", "Al Balad Jeddah", [21.4858, 39.1868], "heritage"),
            ("Jeddah Corniche", "كورنيش جدة", "Jeddah Corniche", [21.6015, 39.1088], "leisure"),
            ("King Abdulaziz International Airport", "مطار الملك عبدالعزيز الدولي", "King Abdulaziz International Airport", [21.6796, 39.1565], "airport"),
            ("Haramain station, Jeddah Sulaymaniyah", "محطة قطار الحرمين بجدة (السليمانية)", "Haramain High Speed Railway Jeddah station Sulaymaniyah", [21.5095, 39.2264], "rail"),
            ("Haramain station, Jeddah Airport", "محطة قطار الحرمين بمطار جدة", "Haramain railway King Abdulaziz Airport station", [21.6765, 39.1515], "rail"),
        ],
    },
    {
        "id": "makkah", "name": "Makkah", "name_ar": "مكة المكرمة", "center": [21.42, 39.85], "zoom": 12,
        "arrival": "Haramain railway, road (via Jeddah airport)", "arrival_ar": "قطار الحرمين، برًا (عبر مطار جدة)",
        "use_case": "Study the effect of trains and promotions on travel; link pilgrims to the Madinah leg",
        "use_case_ar": "دراسة أثر القطارات والعروض على التنقل؛ وربط المعتمرين برحلة المدينة",
        "status": "candidate",
        "places": [
            ("Masjid al-Haram", "المسجد الحرام", "Masjid al-Haram", [21.4225, 39.8262], "mosque"),
            ("Haramain station, Makkah (Al-Rusaifah)", "محطة قطار الحرمين بمكة (الرصيفة)", "Haramain High Speed Railway Makkah station", [21.4006, 39.7978], "rail"),
            ("Jabal al-Nour (Cave of Hira)", "جبل النور (غار حراء)", "Jabal al-Nour", [21.4575, 39.8611], "heritage"),
            ("Mina", "منى", "Mina Makkah", [21.4133, 39.8933], "heritage"),
            ("Mount Arafat", "جبل عرفات", "Mount Arafat", [21.3549, 39.9841], "heritage"),
        ],
    },
]


def geocode(q, fallback):
    cache = os.path.join(CACHE, "nominatim.json")
    c = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) else {}
    if q in c:
        return c[q]
    try:
        r = requests.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "json", "limit": 1, "countrycodes": "sa"}, headers=UA, timeout=30)
        j = r.json()
        res = {"lat": float(j[0]["lat"]), "lon": float(j[0]["lon"]), "src": "osm"} if j else None
    except Exception as e:
        print("geocode failed", q, e)
        res = None
    time.sleep(1.1)
    if res and abs(res["lat"] - fallback[0]) < 0.6 and abs(res["lon"] - fallback[1]) < 0.6:
        c[q] = res
    else:
        c[q] = {"lat": fallback[0], "lon": fallback[1], "src": "approx"}
    json.dump(c, open(cache, "w", encoding="utf-8"), ensure_ascii=False)
    return c[q]


def main():
    out = []
    for r in REGIONS:
        places = []
        for en, ar, q, fb, kind in r["places"]:
            g = geocode(q, fb)
            places.append({"name": en, "name_ar": ar, "lat": round(g["lat"], 5), "lon": round(g["lon"], 5), "kind": kind, "approx": g["src"] != "osm"})
            print(r["id"], en, g["src"])
        out.append({**{k: v for k, v in r.items() if k != "places"}, "places": places})
    write_out("regions.json", {"regions": out}, "STA call notes (pilot locations); OpenStreetMap Nominatim (place coordinates)",
              "Pilot locations and their key places. Madinah is live in the dashboard; the others are candidates with no data yet.", status="real")


if __name__ == "__main__":
    main()
