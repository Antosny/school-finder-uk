# 🏫 SchoolFinder UK

A free, modern UK school finder web app combining school data with neighbourhood info. Find and compare 27,000+ schools across England on an interactive map.

**Live:** [schoolfinder-uk.fly.dev](https://schoolfinder-uk.fly.dev/)

![SchoolFinder UK](https://img.shields.io/badge/schools-27%2C000%2B-indigo) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- 🗺️ **Interactive Map** — 27,000+ schools on a Leaflet/OpenStreetMap map with CARTO basemap
- 🎨 **Ofsted Color-Coded** — Green (Outstanding), Blue (Good), Amber (Requires Improvement), Red (Inadequate)
- 🔍 **Search** — Postcode/area geocoding via Nominatim + school name suggestions
- 📊 **School Details** — Ofsted breakdown (4 sub-ratings), GCSE results, demographics (19 ethnicity categories), admissions competitiveness
- 🎯 **Filters** — Filter by phase (Primary/Secondary) and Ofsted rating
- 📍 **GPS Location** — "Locate me" with blue pulsing dot
- 📱 **Mobile Friendly** — Responsive design with mobile back button

## Data Sources

All data is free UK government data:

| Dataset | Source | Records |
|---------|--------|---------|
| School info & locations | [GIAS](https://get-information-schools.service.gov.uk/) | 27,173 |
| Ofsted ratings | [Ofsted](https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes) | 17,386 rated |
| GCSE results (KS4) | [DfE Performance Tables](https://www.find-school-performance-data.service.gov.uk/) | 5,755 |
| Pupil demographics | [DfE School Census](https://explore-education-statistics.service.gov.uk/) | 24,479 |
| Admissions | [DfE Admissions](https://explore-education-statistics.service.gov.uk/) | 18,988 |

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS v3, Leaflet
- **Data Pipeline:** Python (build-db.py) → SQLite → Static JSON
- **Hosting:** Static export served via nginx on [Fly.io](https://fly.io) (London region)
- **Map Tiles:** CARTO Light via OpenStreetMap

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.8+

### 1. Download Data

Download the raw CSV files into `data/raw/`:

- `gias_all.csv` — from [GIAS download](https://get-information-schools.service.gov.uk/Downloads)
- `ofsted_latest.csv` — from [Ofsted MI](https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes)
- `ks4_schools.csv` — from [DfE KS4 data](https://www.find-school-performance-data.service.gov.uk/download-data)
- `pupils_chars.csv` — from [Explore Education Statistics](https://explore-education-statistics.service.gov.uk/)
- `admissions_school.csv` — from [Explore Education Statistics](https://explore-education-statistics.service.gov.uk/)

### 2. Build Data

```bash
python3 scripts/build-db.py
```

This generates `public/schools-markers.json` (1.7 MB) and `public/schools-details.json` (~31 MB).

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Build for Production

```bash
npm run build
```

Static output goes to `out/`.

## Architecture

```
school-finder/
├── data/raw/           # Raw government CSVs (gitignored)
├── public/
│   ├── schools-markers.json   # Compact: [urn, name, lat, lng, phase, ofsted]
│   └── schools-details.json   # Full details keyed by URN
├── scripts/
│   └── build-db.py     # Data pipeline: CSV → SQLite → JSON
├── src/
│   ├── app/
│   │   ├── page.tsx    # Main page with state management
│   │   ├── layout.tsx  # Root layout
│   │   └── globals.css
│   └── components/
│       ├── SchoolMap.tsx    # Leaflet map with markers
│       ├── SchoolDetail.tsx # School info sidebar
│       ├── SearchBar.tsx    # Search with geocoding + suggestions
│       └── FilterPanel.tsx  # Phase & Ofsted filters
└── next.config.ts      # Static export config
```

## License

MIT
