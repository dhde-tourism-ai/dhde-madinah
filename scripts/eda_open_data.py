"""
eda_open_data.py - exploratory look at the cleaned Madinah open data (data/open/clean/).

Writes charts to docs/open-data-eda/ and prints the numbers quoted in docs/open-data-eda.md.
Run after build_open_data.py:  python scripts/eda_open_data.py   (needs pandas, matplotlib, hijridate)
"""
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from hijridate import Gregorian, Hijri

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLEAN = os.path.join(ROOT, "data", "open", "clean")
FIG = os.path.join(ROOT, "docs", "open-data-eda")
os.makedirs(FIG, exist_ok=True)

SITE_NAME = {"quba": "Quba Mosque", "miqat": "Dhul Hulaifah (Miqat)", "qiblatain": "Qiblatayn Mosque"}
COLOR = {"quba": "#0ca3a3", "miqat": "#c99a3b", "qiblatain": "#d03b3b", "hotels": "#0ca3a3", "apartments": "#c99a3b"}
plt.rcParams.update({"figure.dpi": 110, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.alpha": 0.3, "font.size": 9})


def load(name, *dates):
    return pd.read_csv(os.path.join(CLEAN, name), parse_dates=list(dates))


def save(fig, name, rect=(0, 0, 1, 1)):
    fig.tight_layout(rect=rect)
    fig.savefig(os.path.join(FIG, name))
    plt.close(fig)
    print("chart", name)


def ramadans(start, end):
    """(start, end) dates of each Ramadan between two dates, for shading."""
    out = []
    for y in range(Gregorian(start.year, 1, 1).to_hijri().year, Gregorian(end.year, 12, 31).to_hijri().year + 1):
        a = pd.Timestamp(Hijri(y, 9, 1).to_gregorian())
        b = pd.Timestamp(Hijri(y, 10, 1).to_gregorian())
        if b >= start and a <= end:
            out.append((a, b))
    return out


def shade_ramadan(ax, start, end):
    for i, (a, b) in enumerate(ramadans(start, end)):
        ax.axvspan(a, b, color="#888", alpha=0.15, lw=0, label="Ramadan" if i == 0 else None)


def per_hijri_month(df, value):
    """A Gregorian monthly series (value per month) spread over days, averaged per Hijri month."""
    days = []
    for r in df.itertuples():
        n = r.month.days_in_month
        days += [(r.month + pd.Timedelta(days=i), getattr(r, value)) for i in range(n)]
    d = pd.DataFrame(days, columns=["date", value])
    h = [Gregorian(t.year, t.month, t.day).to_hijri() for t in d.date]
    d["hijri_year"], d["hijri_month"] = [x.year for x in h], [x.month for x in h]
    return d.groupby(["hijri_year", "hijri_month"], as_index=False)[value].mean()


def sites():
    s = load("site_visitors_monthly.csv", "month_start")
    fig, ax = plt.subplots(figsize=(9, 3.6))
    shade_ramadan(ax, s.month_start.min(), s.month_start.max() + pd.Timedelta(days=30))
    for site, g in s.groupby("site"):
        ax.plot(g.month_start, g.visitors_per_day / 1000, marker="o", ms=3, color=COLOR[site], label=SITE_NAME[site])
    ax.set_ylabel("visitors per day (thousands)")
    ax.set_title("Visitors per day at three Madinah sites, by Hijri month (MRDA open data)")
    ax.legend(frameon=False, ncol=4)
    save(fig, "sites_monthly.png")

    # same Hijri month, year on year
    fig, axes = plt.subplots(1, 3, figsize=(10, 3), sharey=False)
    for ax, (site, g) in zip(axes, s.groupby("site")):
        w = g.pivot(index="hijri_month", columns="hijri_year", values="visitors_per_day") / 1000
        w.plot(ax=ax, marker="o", ms=3)
        ax.set_title(SITE_NAME[site])
        ax.set_xlabel("Hijri month (9 = Ramadan, 12 = Dhu al-Hijjah)")
        ax.set_xticks(range(1, 13))
        ax.legend(frameon=False, title=None)
    axes[0].set_ylabel("visitors per day (thousands)")
    save(fig, "sites_by_hijri_month.png")

    yearly = s.groupby(["site", "hijri_year"]).visitors.sum().unstack()
    print("\nSite visitors per Hijri year (millions):\n", (yearly / 1e6).round(2))
    print("Growth year on year (%):\n", (yearly.pct_change(axis=1) * 100).round(1))
    peak = s.loc[s.groupby(["site", "hijri_year"]).visitors_per_day.idxmax(), ["site", "hijri_year", "hijri_month", "visitors_per_day"]]
    print("Busiest Hijri month per site and year:\n", peak.to_string(index=False))
    return s


def rawdah():
    d = load("rawdah_daily.csv", "date")
    m = load("rawdah_monthly.csv", "month_start")
    fig, axes = plt.subplots(2, 1, figsize=(9, 5.2))
    for ax, period in zip(axes, ["1444", "1447"]):
        g = d[d.period == period]
        shade_ramadan(ax, g.date.min(), g.date.max())
        ax.plot(g.date, g.permits / 1000, lw=0.8, color="#0ca3a3")
        ax.plot(g.date, g.permits.rolling(7, center=True).mean() / 1000, lw=1.6, color="#333", label="7-day average")
        ax.set_title("Rawdah permits per day, %s AH" % period)
        ax.set_ylabel("permits (thousands)")
        ax.legend(frameon=False, loc="lower left")
    save(fig, "rawdah_daily.png")

    order = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    wk = d[d.period.isin(["1444", "1447"])].copy()
    wk["rel"] = wk.permits / wk.groupby("period").permits.transform("mean")
    rel = wk.groupby(["period", "weekday"]).rel.mean().unstack(0).loc[order]
    fig, ax = plt.subplots(figsize=(6, 3))
    rel.plot.bar(ax=ax, rot=0)
    ax.axhline(1, color="#333", lw=0.8)
    ax.set_ylabel("permits vs the year's average")
    ax.set_title("Rawdah permits by day of the week")
    ax.legend(frameon=False, title="Hijri year")
    save(fig, "rawdah_weekday.png")

    fig, ax = plt.subplots(figsize=(9, 3.2))
    shade_ramadan(ax, m.month_start.min(), m.month_start.max())
    for kind, g in m.groupby("kind"):
        ax.plot(g.month_start, g.permits_per_day / 1000, marker="o", ms=3, label="%s permits" % kind)
    ax.set_ylabel("permits per day (thousands)")
    ax.set_title("Rawdah permits per Hijri month: prayer permits (1443-1444) and visit permits (1445-1447)")
    ax.legend(frameon=False)
    save(fig, "rawdah_monthly.png")

    s = d.groupby("period").permits.describe()[["count", "mean", "50%", "max"]].round()
    print("\nRawdah daily permits:\n", s)
    top = d[d.period == "1447"].permits
    print("1447 days at or above 54,000 permits: %d of %d" % ((top >= 54000).sum(), len(top)))
    print("Weekday pattern (vs year average):\n", rel.round(3))
    # monthly file vs sum of the daily file, 1447
    d47 = d[d.period == "1447"].copy()
    h = [Gregorian(t.year, t.month, t.day).to_hijri() for t in d47.date]
    d47["hijri_month"] = [x.month for x in h]
    cmp = d47.groupby("hijri_month").agg(daily_sum=("permits", "sum"), days=("permits", "size"))
    cmp["monthly_file"] = m[(m.hijri_year == 1447)].set_index("hijri_month").permits
    cmp["gap_%"] = ((cmp.monthly_file / cmp.daily_sum - 1) * 100).round(1)
    print("1447 monthly file vs sum of daily file:\n", cmp)


def hotels():
    h = load("hotels_monthly.csv", "month")
    fig, axes = plt.subplots(1, 3, figsize=(11, 3.4))
    for ax, col, label in zip(axes, ["occupancy", "adr_sar", "stay_nights"], ["occupancy", "average daily rate (SAR)", "length of stay (nights)"]):
        shade_ramadan(ax, h.month.min(), h.month.max() + pd.Timedelta(days=30))
        for fac, g in h.groupby("facility"):
            ax.plot(g.month, g[col] * (100 if col == "occupancy" else 1), marker="o", ms=2.5, color=COLOR[fac], label=fac)
        ax.set_title(label + (" (%)" if col == "occupancy" else ""))
        ax.tick_params(axis="x", labelrotation=45)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, frameon=False, ncol=3, loc="lower center")
    fig.suptitle("Madinah region hotels and serviced apartments (GASTAT, monthly)")
    save(fig, "hotels.png", rect=(0, 0.07, 1, 1))
    hh = h[h.facility == "hotels"].set_index("month")
    print("\nHotels: occupancy by year (mean %):\n", (hh.occupancy.groupby(hh.index.year).mean() * 100).round(1))
    print("Hotels: highest and lowest occupancy months:\n", hh.occupancy.sort_values().iloc[[0, 1, -2, -1]])


def demand_signals(s):
    """Do the city-wide monthly series move with the site counts? Compared per Hijri month."""
    a = load("airport_monthly.csv", "month")
    h = load("hotels_monthly.csv", "month")
    u = load("umrah_entries_monthly.csv", "month_start")
    hot = h[h.facility == "hotels"].rename(columns={"occupancy": "hotel_occupancy"})[["month", "hotel_occupancy"]]
    a["airport_per_day"] = a.passengers / a.month.dt.days_in_month
    x = s.pivot_table(index=["hijri_year", "hijri_month"], columns="site", values="visitors_per_day").reset_index()
    x = x.merge(per_hijri_month(a, "airport_per_day"), how="left").merge(per_hijri_month(hot, "hotel_occupancy"), how="left")
    u["umrah_entries_per_day"] = u.entries / u.days
    x = x.merge(u[["hijri_year", "hijri_month", "umrah_entries_per_day"]], how="left")
    cols = ["quba", "miqat", "qiblatain", "airport_per_day", "hotel_occupancy", "umrah_entries_per_day"]
    corr = x[cols].corr(min_periods=12).round(2)
    print("\nCorrelation per Hijri month (1445-1447):\n", corr)
    print("Months with all series:", x[cols].dropna().shape[0])

    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    im = ax.imshow(corr, vmin=-1, vmax=1, cmap="RdBu_r")
    labels = ["Quba", "Miqat", "Qiblatayn", "Airport", "Hotel occ.", "Umrah entries"]
    ax.set_xticks(range(len(cols)), labels, rotation=45, ha="right")
    ax.set_yticks(range(len(cols)), labels)
    ax.grid(False)
    for i in range(len(cols)):
        for j in range(len(cols)):
            if pd.notna(corr.iloc[i, j]):
                ax.text(j, i, "%.2f" % corr.iloc[i, j], ha="center", va="center", fontsize=8)
    fig.colorbar(im, ax=ax, shrink=0.8)
    ax.set_title("Correlation per Hijri month, 1445-1447")
    save(fig, "correlation.png")

    fig, ax = plt.subplots(figsize=(9, 3.4))
    start = pd.Timestamp("2023-01-01")
    shade_ramadan(ax, start, pd.Timestamp("2026-09-30"))
    ax.plot(a.month, a.passengers / a.passengers.mean(), label="Madinah airport passengers", color="#333")
    uu = u[u.month_start >= start]
    ax.plot(uu.month_start, uu.umrah_entries_per_day / uu.umrah_entries_per_day.mean(), label="Umrah-visa entries (Kingdom)", color="#c99a3b")
    q = s[s.site == "quba"]
    ax.plot(q.month_start, q.visitors_per_day / q.visitors_per_day.mean(), label="Quba visitors", color="#0ca3a3")
    ax.axhline(1, color="#999", lw=0.6)
    ax.set_ylabel("vs own average")
    ax.set_title("City-wide demand signals against Quba visitors")
    ax.legend(frameon=False, fontsize=8)
    save(fig, "demand_signals.png")


def bus():
    b = load("bus_monthly.csv", "month")
    fig, ax = plt.subplots(figsize=(6, 3))
    ax.bar(b.month, b.passengers / 1000, width=20, color=["#c99a3b" if r < 10 else "#0ca3a3" for r in b.routes])
    ax.set_ylabel("passengers (thousands)")
    ax.set_title("Madinah city bus passengers, 2025 (gold: 6 routes, teal: 15 routes)")
    save(fig, "bus.png")
    print("\nBus 2025 total: %d; Dec vs Jan: x%.2f" % (b.passengers.sum(), b.passengers.iloc[-1] / b.passengers.iloc[0]))


def covered_days(df, start="month_start", days="days"):
    """Every date inside each Hijri month of a monthly series."""
    return pd.Series([d + pd.Timedelta(days=i) for d, n in zip(df[start], df[days]) for i in range(n)])


def coverage():
    """Which Gregorian months each series covers, on one axis."""
    site = load("site_visitors_monthly.csv", "month_start")
    series = [
        ("Quba visitors", covered_days(site[site.site == "quba"])),
        ("Miqat visitors", covered_days(site[site.site == "miqat"])),
        ("Qiblatayn visitors", covered_days(site[site.site == "qiblatain"])),
        ("Rawdah permits (daily)", load("rawdah_daily.csv", "date").date),
        ("Rawdah permits (monthly)", covered_days(load("rawdah_monthly.csv", "month_start"))),
        ("Prophet's Mosque operations", covered_days(load("haram_operations_monthly.csv", "month_start"))),
        ("Hotels", load("hotels_monthly.csv", "month").month),
        ("Airport", load("airport_monthly.csv", "month").month),
        ("Umrah-visa entries", covered_days(load("umrah_entries_monthly.csv", "month_start"))),
        ("City bus", load("bus_monthly.csv", "month").month),
    ]
    fig, ax = plt.subplots(figsize=(9, 3.4))
    for i, (name, dates) in enumerate(series):
        months = pd.to_datetime(dates).dt.to_period("M").unique()
        ax.scatter([m.to_timestamp() for m in months], [i] * len(months), marker="s", s=10, color="#0ca3a3")
    ax.set_yticks(range(len(series)), [n for n, _ in series])
    ax.invert_yaxis()
    ax.set_xlim(pd.Timestamp("2018-06-01"), pd.Timestamp("2026-12-31"))
    ax.set_title("Coverage: months with data in each series")
    save(fig, "coverage.png")


if __name__ == "__main__":
    coverage()
    s = sites()
    rawdah()
    hotels()
    demand_signals(s)
    bus()
