# Data Sources & Download Instructions

## Raw Data Files (in `data/raw/`)

### 1. GIAS — School Basic Information
- **File**: `gias_all.csv`
- **Source**: DfE "Get Information about Schools"
- **Download**: https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata20260130.csv
- **Size**: ~62 MB
- **Updated**: Monthly

### 2. Ofsted — Inspection Ratings
- **File**: `ofsted_latest.csv`
- **Source**: Ofsted Monthly Management Information
- **Download**: https://assets.publishing.service.gov.uk/media/{id}/Management_information_-_state-funded_schools_-_latest_inspections_as_at_28_Feb_2026.csv
- **Size**: ~16 MB
- **Updated**: Monthly
- **Note**: Check https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes for latest URL

### 3. KS4 — GCSE School-Level Results
- **File**: `ks4_schools.csv` (extracted from ZIP as `202425_performance_tables_schools_revised.csv`)
- **Source**: DfE Explore Education Statistics — KS4 Performance 2024/25
- **Download**: Full ZIP from https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance/2024-25
- **Size**: ~35 MB (CSV), ~228 MB (full ZIP)
- **Updated**: Annually (revised release ~Feb)

### 4. Pupil Characteristics — Demographics
- **File**: `pupils_chars.csv`
- **Source**: DfE School Census — Schools, pupils and their characteristics 2024/25
- **Download**: https://content.explore-education-statistics.service.gov.uk/api/releases/63491b17-2037-4533-b719-d3656aaf6ed5/files/3dc88c32-da52-4aff-b6d0-0126de016844
- **Size**: ~23 MB
- **Updated**: Annually

## Building the Database

```bash
python3 scripts/build-db.py
```

This joins all CSVs on URN (school unique reference number) and creates `data/schools.db`.

## Generated Files (in `public/`)

- `schools-markers.json` — Compact marker data for the map (1.7 MB)
- `schools-details.json` — Full school details for the API (19 MB)

## Data Notes

- GIAS uses OSGB36 Easting/Northing → converted to WGS84 lat/lng by the pipeline
- Ofsted CSV has 2 header lines before column names (line 3)
- GIAS encoded as Latin-1, Ofsted as Latin-1, KS4 as UTF-8-sig, Pupil chars as Latin-1
- Schools with no Easting/Northing are skipped (~664 schools)
- Only "Open" schools from GIAS are included
