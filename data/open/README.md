# Madinah open data

Published Saudi open data on Madinah visitors, kept as downloaded in `raw/` and cleaned into `clean/` by `scripts/build_open_data.py`. Findings are in [`docs/open-data-eda.md`](../../docs/open-data-eda.md).

```bash
pip install pandas openpyxl hijridate matplotlib
python scripts/build_open_data.py   # raw/ -> clean/
python scripts/eda_open_data.py     # clean/ -> docs/open-data-eda/
```

Hijri months are converted with the Umm al-Qura calendar (`hijridate`); each monthly row keeps its Hijri year and month and gets its Gregorian start date and length in days.

## Sources (`raw/`)

| Folder | Publisher | Where |
|---|---|---|
| `Madinah Region Development Authority/` | MRDA | [open.data.gov.sa](https://open.data.gov.sa): visitors to Quba, Qiblatayn and the Miqat; city bus and BRT passengers; MRDA projects |
| `Ministry of Hajj and Umrah/` | Ministry of Hajj and Umrah | [haj.gov.sa open data](https://haj.gov.sa/en/Open-Data) and open.data.gov.sa: Rawdah and Umrah permits, Umrah visas, entries and exits, Nusuk users, length of stay |
| `Authority for the Two Holy Mosques/` | General Authority for the Care of the Two Holy Mosques | open.data.gov.sa: doors, carpets, wayfinding, Itikaf and exhibitions at the Prophet's Mosque, 1446 |
| `Pilgrims Experience Program/` | Pilgrims Experience Program | open.data.gov.sa: Umrah performers by month, port of entry and visa type, 1447 |
| `Ministry of Tourism/` | Ministry of Tourism | [Tourism in numbers](https://mt.gov.sa/tourism-in-numbers): Madinah tourist flow 2024–2025 (sheet S1) |
| `GASTAT/Tourism establishments/` | GASTAT (Ministry of Tourism data) | [stats.gov.sa](https://stats.gov.sa/en/106): quarterly tourism establishments statistics, 2020–Q2 2026 |
| `TAV/` | TAV Airports | [ir.tav.aero](https://ir.tav.aero) monthly traffic: Prince Mohammad bin Abdulaziz Airport passengers and flights, compiled into one CSV |

## Known issues (handled in the build)

- Ramadan 1445 daily Rawdah file: the Hijri date column says 1443; the Gregorian date is used.
- Dhu al-Hijjah 1445 Umrah entries appear in two files (75,193 and 38,836); the earlier file is kept.
- Ramadan 1447 Umrah entries and Dhu al-Hijjah 1447 monthly Rawdah permits were published before the month ended; both are dropped.
- Rawdah prayer permits (1443–1444) and visit permits (1445 on) are different permits and are kept apart (`kind`).
- City bus: the network grew from 6 to 15 routes in May 2025; `routes` is kept with each month.
