"""
build_open_data.py - clean the Saudi open data on Madinah visitors into tidy CSVs.

Reads data/open/raw/ (files as downloaded from open.data.gov.sa, haj.gov.sa, stats.gov.sa
and TAV; see data/open/README.md) and writes data/open/clean/:

  site_visitors_monthly.csv  Quba, Qiblatayn and Dhul Hulaifah (Miqat) visitors per Hijri month
  rawdah_monthly.csv         Rawdah permits per Hijri month: prayer permits (1443-1444) and visit
                             permits (1445-1447); the two kinds are not comparable
  rawdah_daily.csv           Rawdah permits per day: 1444 (Muharram-Ramadan), Ramadan 1445 and
                             1446, and all of 1447
  haram_operations_monthly.csv  Prophet's Mosque doors open, carpeted places and wayfinding, 1446
  bus_monthly.csv            Madinah city bus passengers and routes, 2025
  umrah_entries_monthly.csv  foreign Umrah-visa pilgrims entering the Kingdom (all ports)
  hotels_monthly.csv         occupancy, average daily rate (SAR) and length of stay (nights),
                             Madinah region, hotels and serviced apartments
  airport_monthly.csv        Prince Mohammad bin Abdulaziz Airport passengers and flights

Every Hijri month gets its Gregorian start date and length (Umm al-Qura calendar), so the series
can sit on one time axis.
Run: python scripts/build_open_data.py   (needs pandas, openpyxl, hijridate)
"""
import glob
import os
import re

import openpyxl
import pandas as pd
from hijridate import Gregorian, Hijri

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "open", "raw")
CLEAN = os.path.join(ROOT, "data", "open", "clean")
os.makedirs(CLEAN, exist_ok=True)

MOHU = "Ministry of Hajj and Umrah"
MDA = "Madinah Region Development Authority"
GAH = "Authority for the Two Holy Mosques"


def norm(s):
    """Arabic text folded for matching: no hamza forms, taa marbuta or alif maqsura, no spaces."""
    s = str(s).strip()
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"), ("ة", "ه"), (" ", "")):
        s = s.replace(a, b)
    return s


# Hijri month names as they appear across the files (Arabic spellings vary file to file).
HIJRI_MONTHS = [
    ("محرم", "muharram"), ("صفر", "safar"), ("ربيع(ال)?اول", "rabi.*awwal"), ("ربيع(ال)?(اخر|ثاني)", "rabi.*(akhir|thani)"),
    ("جمادي?(ال)?اولي?", "jumad.*(ula|awwal)"), ("جمادي?(ال)?(اخره?|ثاني)", "jumad.*(akhir|thani)"),
    ("رجب", "rajab"), ("شعبان", "sha.?ban"), ("رمضان", "ramadan"), ("شوال", "shaw+al"),
    ("ذوالقعده|ذيالقعده", "dhu.*qa"), ("ذوالحجه|ذيالحجه", "dhu.*hij"),
]
GREG_MONTHS = ["يناير", "فبراير", "مارس", "ابريل", "مايو", "يونيو", "يوليو", "اغسطس", "سبتمبر", "اكتوبر", "نوفمبر", "ديسمبر"]


def hijri_month(name):
    n = norm(name)
    for i, (ar, en) in enumerate(HIJRI_MONTHS, 1):
        if re.fullmatch(ar, n) or re.search(en, n.lower()):
            return i
    raise ValueError("unknown Hijri month: %r" % name)


def greg_month(name):
    return GREG_MONTHS.index(norm(name)) + 1


def hijri_span(y, m):
    """Gregorian start date and length in days of Hijri month m of year y."""
    start = Hijri(y, m, 1).to_gregorian()
    end = Hijri(y + (m == 12), m % 12 + 1, 1).to_gregorian()
    return pd.Timestamp(start), (end - start).days


def num(s):
    s = str(s).replace(",", "").replace("٬", "").strip()
    return float(s) if s not in ("", "nan") else None


def read_csv(path):
    for enc in ("utf-8-sig", "cp1256"):
        try:
            return pd.read_csv(path, encoding=enc, sep=None, engine="python", dtype=str, header=None)
        except UnicodeDecodeError:
            pass
    raise ValueError(path)


def add_hijri_dates(df):
    spans = [hijri_span(y, m) for y, m in zip(df.hijri_year, df.hijri_month)]
    df.insert(2, "month_start", [s for s, _ in spans])
    df.insert(3, "days", [d for _, d in spans])
    return df


def write(df, name):
    df.to_csv(os.path.join(CLEAN, name), index=False, encoding="utf-8")
    print("wrote %-30s %5d rows" % (name, len(df)))


def site_visitors():
    files = {"quba": "Numbers of visitors to Quba Mosque CSV.csv",
             "qiblatain": "Numbers of visitors to Al Qiblatayn Mosque CSV.csv",
             "miqat": "Numbers of visitors to Mosque DhulHulaifah Miqat.csv"}
    rows = []
    for site, f in files.items():
        year = None
        for r in read_csv(os.path.join(RAW, MDA, f)).itertuples(index=False):
            first, month, value = str(r[0]), str(r[1]), r[2]
            if re.fullmatch(r"1[34]\d\d", first.strip()):
                year = int(first)
            if "اجمال" in norm(first) or month in ("nan", "الشهر") or year is None:
                continue  # totals and headers
            rows.append({"site": site, "hijri_year": year, "hijri_month": hijri_month(month), "visitors": num(value)})
    df = add_hijri_dates(pd.DataFrame(rows)[["hijri_year", "hijri_month", "site", "visitors"]])
    df["visitors_per_day"] = (df.visitors / df.days).round()
    write(df.sort_values(["site", "month_start"]), "site_visitors_monthly.csv")


def rawdah_monthly():
    """Prayer permits 1443-1444 (by gender), visit permits 1445 (gender), 1446 (user type), 1447 (gender)."""
    parts = []
    d = read_csv(os.path.join(RAW, MOHU, "Number of prayer permits in AlRawdah AlSharifa csv.csv")).iloc[1:]
    parts.append(pd.DataFrame({"hijri_year": d[0].astype(int), "hijri_month": d[1].map(hijri_month), "kind": "prayer", "permits": d[3].map(num)}))
    for f in ("AR-Number-of-permits-for-visiting-the-Noble-Rawdah-in-1445-by-gender.csv", "Rawdah permits for 1446 by month and type.csv"):
        d = read_csv(os.path.join(RAW, MOHU, f)).iloc[1:]
        parts.append(pd.DataFrame({"hijri_year": d[0].astype(int), "hijri_month": d[1].map(hijri_month), "kind": "visit", "permits": d[3].map(num)}))
    d = read_csv(os.path.join(RAW, MOHU, "Rawdah Permits by Month and Gender 1447 CSV.csv")).iloc[1:]
    parts.append(pd.DataFrame({"hijri_year": d[0].astype(int), "hijri_month": d[1].map(hijri_month), "kind": "visit", "permits": d[2].map(num) + d[3].map(num)}))
    df = pd.concat(parts).groupby(["hijri_year", "hijri_month", "kind"], as_index=False).permits.sum()
    # Dhu al-Hijjah 1447 holds 355,558 permits, a third of its days in the daily file: published early
    df = df[~((df.hijri_year == 1447) & (df.hijri_month == 12))]
    df = add_hijri_dates(df)
    df["permits_per_day"] = (df.permits / df.days).round()
    write(df.sort_values("month_start"), "rawdah_monthly.csv")


def rawdah_daily():
    parts = []
    # 1444: Nusuk permits per day by type and gender; Rawdah = men's and women's Rawdah permits
    d = read_csv(os.path.join(RAW, MOHU, "Number of permits from the NSK application 1444 according to the day, gender and type of permit.csv")).iloc[1:]
    d = d[d[1].str.contains("روضة")]
    d = d.assign(date=[pd.Timestamp(Hijri(*map(int, s.split("/"))).to_gregorian()) for s in d[3]], permits=d[0].map(num))
    parts.append(d.groupby("date", as_index=False).permits.sum().assign(period="1444"))
    # Ramadan 1445 (its Hijri column wrongly says 1443; the Gregorian date is right)
    d = read_csv(os.path.join(RAW, MOHU, "AR-Number-of-permits-for-visiting-the-Noble-Rawdah-in-Ramadan-for-the-year-1445.csv")).iloc[1:]
    parts.append(pd.DataFrame({"date": pd.to_datetime(d[1], format="%d/%m/%Y"), "permits": d[3].map(num), "period": "Ramadan 1445"}))
    d = read_csv(os.path.join(RAW, MOHU, "Rawdah permits by day in Ramadan 1446.csv")).iloc[1:]
    parts.append(pd.DataFrame({"date": pd.to_datetime(d[1], format="%d/%m/%y"), "permits": d[3].map(num), "period": "Ramadan 1446"}))
    d = read_csv(os.path.join(RAW, MOHU, "Daily Rawdah Permits 1447 AH CSV.csv")).iloc[1:]
    parts.append(pd.DataFrame({"date": [pd.Timestamp(Hijri(*map(int, s.split("/"))).to_gregorian()) for s in d[1]],
                               "permits": d[3].map(num), "period": "1447"}))
    df = pd.concat(parts).sort_values("date")
    dup = df.date.duplicated(keep=False)
    if dup.any():
        raise ValueError("overlapping days: %s" % df[dup].date.tolist())
    df["hijri"] = [Gregorian(t.year, t.month, t.day).to_hijri().isoformat() for t in df.date]
    df["weekday"] = df.date.dt.day_name()
    write(df[["date", "hijri", "weekday", "permits", "period"]], "rawdah_daily.csv")


def haram_operations():
    rows = []
    labels = {"الابوابالمفتوحه": "doors_open", "فرشها": "places_carpeted", "الارشادالمكاني": "wayfinding_helped"}
    for f in ("Door Statistics in Madinah for 1446  AH.csv", "Carpet Statistics in Madinah for 1446  AH.csv",
              "Spatial Guidance Statistics AlMadinah for 1446.csv"):
        d = read_csv(os.path.join(RAW, GAH, f))
        months = [hijri_month(m) for m in d.iloc[0, 2:] if str(m) != "nan"]
        seen = {}
        for r in d.iloc[1:].itertuples(index=False):
            key = next((v for k, v in labels.items() if k in norm(r[1])), None)
            if not key:
                continue
            # wayfinding has two rows (Arabic speakers, other languages): add them up
            for m, v in zip(months, r[2:2 + len(months)]):
                seen[(m, key)] = seen.get((m, key), 0) + (num(v) or 0)
        rows += [{"hijri_year": 1446, "hijri_month": m, "measure": k, "daily_average": v} for (m, k), v in seen.items()]
    df = pd.DataFrame(rows).pivot_table(index=["hijri_year", "hijri_month"], columns="measure", values="daily_average").reset_index()
    df.columns.name = None
    write(add_hijri_dates(df), "haram_operations_monthly.csv")


def bus():
    d = read_csv(os.path.join(RAW, MDA, "Monthly number of Madinah bus passenger.csv"))
    total = d[d[0].astype(str).str.contains("الاجمالي")].iloc[0]
    rows = []
    for m in range(12):
        col = 2 + 2 * m
        routes = d.iloc[2:-1, col - 1].map(num).notna().sum()
        rows.append({"month": pd.Timestamp(2025, m + 1, 1), "passengers": num(total[col]), "routes": int(routes)})
    write(pd.DataFrame(rows), "bus_monthly.csv")


def umrah_entries():
    parts = []
    d = read_csv(os.path.join(RAW, MOHU, "AR-Number-of-foreign-Umrah-performers-from-1440-to-1445-AH-by-entry-point-land-air-sea.csv")).iloc[1:]
    parts.append(pd.DataFrame({"hijri_year": d[0].astype(int), "hijri_month": d[1].map(hijri_month), "entries": d[3].map(num), "file": "1440-1445"}))
    d = read_csv(os.path.join(RAW, MOHU, "Number of Umrah performers entering with month.csv")).iloc[1:]
    parts.append(pd.DataFrame({"hijri_year": d[0].astype(int), "hijri_month": d[1].map(hijri_month), "entries": d[2].map(num), "file": "1446"}))
    d = read_csv(os.path.join(RAW, MOHU, "EN-Number-of-Umrah-Entrants-in-1447-AH-by-Month.csv")).iloc[1:]
    parts.append(pd.DataFrame({"hijri_year": d[0].astype(int), "hijri_month": d[1].map(hijri_month), "entries": d[2].map(num), "file": "1447"}))
    df = pd.concat(parts).groupby(["hijri_year", "hijri_month", "file"], as_index=False).entries.sum()
    # Dhu al-Hijjah 1445 is in two files (75,193 and 38,836): keep the earlier file.
    df = df.sort_values("file").drop_duplicates(["hijri_year", "hijri_month"], keep="first")
    df = add_hijri_dates(df)
    # Ramadan 1447 was published before the month ended
    df = df[~((df.hijri_year == 1447) & (df.hijri_month >= 9))]
    write(df.sort_values("month_start"), "umrah_entries_monthly.csv")


# 2023-2024 files say "معدل إشغال الغرف", later ones "معدل الإشغال"
HOTEL_MEASURES = {"معدلالاشغال": "occupancy", "معدلاشغال": "occupancy", "متوسطالسعراليومي": "adr_sar", "متوسطمدهالاقامه": "stay_nights"}
FACILITY = {"الفنادق": "hotels", "الشققالمخدومه": "apartments"}


def hotels():
    """Region-level monthly tables from each quarterly GASTAT tourism-establishments workbook."""
    rows = []
    for path in sorted(glob.glob(os.path.join(RAW, "GASTAT", "Tourism establishments", "*.xlsx"))):
        year = int(re.search(r"20\d\d", os.path.basename(path)).group())
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            cells = [[c for c in row] for row in ws.iter_rows(values_only=True)]
            title = next((norm(c) for row in cells for c in row if isinstance(c, str) and len(c) > 25), "")
            measure = next((v for k, v in HOTEL_MEASURES.items() if title.startswith(k)), None)
            facility = next((v for k, v in FACILITY.items() if k in title), None)
            if not (measure and facility and "المناطقالاداريه" in title and "والشهر" in title) or "التغير" in title:
                continue
            header = next((row for row in cells if sum(norm(c) in GREG_MONTHS for c in row if isinstance(c, str)) >= 1), None)
            madinah = next((row for row in cells if any(isinstance(c, str) and "المدينهالمنور" in norm(c) for c in row)), None)
            if not header or not madinah:
                continue
            for c, h in enumerate(header):
                if isinstance(h, str) and norm(h) in GREG_MONTHS and isinstance(madinah[c], (int, float)):
                    rows.append({"month": pd.Timestamp(year, greg_month(h), 1), "facility": facility,
                                 "measure": measure, "value": float(madinah[c]), "file": os.path.basename(path)})
    df = pd.DataFrame(rows)
    df = df.sort_values("file").drop_duplicates(["month", "facility", "measure"], keep="last")
    wide = df.pivot_table(index=["month", "facility"], columns="measure", values="value").reset_index()
    wide.columns.name = None
    wide = wide.round({"occupancy": 4, "adr_sar": 2, "stay_nights": 2})
    write(wide.sort_values(["facility", "month"]), "hotels_monthly.csv")


def airport():
    d = pd.read_csv(os.path.join(RAW, "TAV", "airport_madinah_monthly.csv"))
    d["month"] = pd.to_datetime(d.month + "-01")
    write(d, "airport_monthly.csv")


if __name__ == "__main__":
    site_visitors()
    rawdah_monthly()
    rawdah_daily()
    haram_operations()
    bus()
    umrah_entries()
    hotels()
    airport()
