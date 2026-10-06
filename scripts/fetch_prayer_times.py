"""
fetch_prayer_times.py - Madinah prayer times (Umm al-Qura method) for six months.

Source: Aladhan API (https://aladhan.com/prayer-times-api), method 4 = Umm al-Qura.
Output: public/data/prayer_times.json {method, days:{"YYYY-MM-DD":{fajr,sunrise,dhuhr,asr,maghrib,isha}}}
Run: python scripts/fetch_prayer_times.py [YYYY-MM] (start month, default the current month)
"""
import datetime as dt
import sys
import time

import requests

from common import UA, write_out

KEYS = {"Fajr": "fajr", "Sunrise": "sunrise", "Dhuhr": "dhuhr", "Asr": "asr", "Maghrib": "maghrib", "Isha": "isha"}


def month_iter(start, n):
    y, m = start
    for _ in range(n):
        yield y, m
        m += 1
        if m > 12:
            y, m = y + 1, 1


def main():
    if len(sys.argv) > 1:
        y, m = map(int, sys.argv[1].split("-"))
    else:
        today = dt.date.today()
        y, m = today.year, today.month
    days = {}
    for yy, mm in month_iter((y, m), 6):
        url = f"https://api.aladhan.com/v1/calendarByCity/{yy}/{mm}?city=Medina&country=Saudi%20Arabia&method=4"
        for attempt in range(5):
            try:
                r = requests.get(url, headers=UA, timeout=30)
                r.raise_for_status()
                break
            except Exception as e:
                print("retry", yy, mm, e)
                time.sleep(5 * (attempt + 1))
        else:
            raise RuntimeError(f"Aladhan failed for {yy}-{mm}")
        for d in r.json()["data"]:
            g = d["date"]["gregorian"]["date"]  # DD-MM-YYYY
            iso = f"{g[6:10]}-{g[3:5]}-{g[0:2]}"
            days[iso] = {v: d["timings"][k].split(" ")[0] for k, v in KEYS.items()}
        time.sleep(1)
    write_out(
        "prayer_times.json",
        {"method": "Umm al-Qura (Aladhan method 4)", "days": days},
        "Aladhan API, calendarByCity Medina, Saudi Arabia",
        f"{len(days)} days from {min(days)} to {max(days)}; local time (Asia/Riyadh).",
    )


if __name__ == "__main__":
    main()
