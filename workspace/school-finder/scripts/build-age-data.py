#!/usr/bin/env python3
"""
Download Census 2021 age data (TS007A - five-year bands) from NOMIS
and add age percentages to LSOA tile files and LAD GeoJSON.

Neighbourhood-demographic age bands:
  a04   : 0–4   Babies & Toddlers
  a511  : 5–11  Children           (5-9 full + 2/5 of 10-14)
  a1217 : 12–17 Teenagers          (3/5 of 10-14 + 3/5 of 15-19)
  a1824 : 18–24 Young Adults       (2/5 of 15-19 + 20-24 full)
  a2534 : 25–34 Young Professionals (25-29 + 30-34)
  a3544 : 35–44 Young Families     (35-39 + 40-44)
  a4559 : 45–59 Middle Aged        (45-49 + 50-54 + 55-59)
  a6074 : 60–74 Pre-retirement     (60-64 + 65-69 + 70-74)
  a75p  : 75+   Elderly            (75-79 + 80-84 + 85+)

Census TS007A categories:
  1: 0-4, 2: 5-9, 3: 10-14, 4: 15-19, 5: 20-24,
  6: 25-29, 7: 30-34, 8: 35-39, 9: 40-44,
  10: 45-49, 11: 50-54, 12: 55-59, 13: 60-64,
  14: 65-69, 15: 70-74, 16: 75-79, 17: 80-84, 18: 85+
"""
import json, csv, os, sys, time
from urllib.request import urlopen, Request
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, 'data', 'raw')
PUB = os.path.join(BASE, 'public', 'neighbourhood')
TILES = os.path.join(PUB, 'tiles')

os.makedirs(RAW, exist_ok=True)

# New band definitions using weighted allocation
# Each band: list of (category, weight) tuples
BAND_DEF = {
    'a04':   [(1, 1.0)],
    'a511':  [(2, 1.0), (3, 2/5)],              # 5-9 full + 2/5 of 10-14 (years 10,11)
    'a1217': [(3, 3/5), (4, 3/5)],              # 3/5 of 10-14 (years 12,13,14) + 3/5 of 15-19 (years 15,16,17)
    'a1824': [(4, 2/5), (5, 1.0)],              # 2/5 of 15-19 (years 18,19) + 20-24 full
    'a2534': [(6, 1.0), (7, 1.0)],              # exact
    'a3544': [(8, 1.0), (9, 1.0)],              # exact
    'a4559': [(10, 1.0), (11, 1.0), (12, 1.0)], # exact
    'a6074': [(13, 1.0), (14, 1.0), (15, 1.0)], # exact
    'a75p':  [(16, 1.0), (17, 1.0), (18, 1.0)], # exact
}

BAND_KEYS = list(BAND_DEF.keys())

# Old band keys to remove from tiles
OLD_BAND_KEYS = ['a04', 'a59', 'a1014', 'a1519', 'a2024', 'a2544', 'a4564', 'a65p']

# ─── 1. Get all LSOA codes from tile files ───
print("Scanning tile files for LSOA codes...")
all_lsoa_codes = set()
for fname in os.listdir(TILES):
    if not fname.endswith('.json'):
        continue
    with open(os.path.join(TILES, fname)) as f:
        d = json.load(f)
    for feat in d.get('features', []):
        code = feat['properties'].get('c', '')
        if code:
            all_lsoa_codes.add(code)

all_lsoa_codes = sorted(all_lsoa_codes)
print(f"  Found {len(all_lsoa_codes)} LSOAs in tiles")

# ─── 2. Download age data from NOMIS ───
CACHE_PATH = os.path.join(RAW, 'age_lsoa_cache.json')
BATCH_SIZE = 800

if os.path.exists(CACHE_PATH):
    print(f"\nLoading cached age data from {CACHE_PATH}...")
    with open(CACHE_PATH) as f:
        lsoa_age = json.load(f)
    print(f"  Loaded {len(lsoa_age)} LSOAs from cache")
else:
    print(f"\nDownloading Census 2021 age data for {len(all_lsoa_codes)} LSOAs...")
    lsoa_age = {}
    
    for i in range(0, len(all_lsoa_codes), BATCH_SIZE):
        batch_codes = all_lsoa_codes[i:i + BATCH_SIZE]
        geo_param = ','.join(batch_codes)
        url = (
            f"https://www.nomisweb.co.uk/api/v01/dataset/NM_2020_1.data.csv"
            f"?date=latest&geography={geo_param}"
            f"&c2021_age_19=1...18&measures=20100"
            f"&select=geography_code,c2021_age_19,obs_value"
        )
        
        for attempt in range(3):
            try:
                req = Request(url, headers={'User-Agent': 'SchoolFinderUK/1.0'})
                resp = urlopen(req, timeout=120)
                text = resp.read().decode('utf-8')
                break
            except Exception as e:
                if attempt < 2:
                    print(f"    Retry {attempt+1} for batch {i//BATCH_SIZE}...")
                    time.sleep(3 * (attempt + 1))
                else:
                    print(f"    FAILED batch {i//BATCH_SIZE}: {e}")
                    text = ""
        
        if text:
            reader = csv.DictReader(text.strip().split('\n'))
            for row in reader:
                code = row['GEOGRAPHY_CODE']
                cat = int(row['C2021_AGE_19'])
                value = int(row['OBS_VALUE'])
                if code not in lsoa_age:
                    lsoa_age[code] = {}
                lsoa_age[code][str(cat)] = value
        
        done = min(i + BATCH_SIZE, len(all_lsoa_codes))
        if (done // BATCH_SIZE) % 5 == 0 or done == len(all_lsoa_codes):
            print(f"  Downloaded {done}/{len(all_lsoa_codes)} LSOAs...")
        
        time.sleep(0.2)
    
    with open(CACHE_PATH, 'w') as f:
        json.dump(lsoa_age, f)
    print(f"  Cached {len(lsoa_age)} LSOAs to {CACHE_PATH}")

# ─── 3. Compute age band percentages with weighted allocation ───
def compute_age_pcts(age_data):
    """Convert raw five-year counts to neighbourhood age band percentages."""
    total = sum(int(v) for v in age_data.values())
    if total == 0:
        return {band: 0.0 for band in BAND_KEYS}
    
    result = {}
    for band, components in BAND_DEF.items():
        band_count = 0.0
        for cat, weight in components:
            band_count += int(age_data.get(str(cat), 0)) * weight
        result[band] = round(band_count / total * 100, 1)
    
    return result

# ─── 4. Update LSOA tile files ───
print("\nUpdating LSOA tile files with new age bands...")
updated_tiles = 0
updated_lsoas = 0

for fname in os.listdir(TILES):
    if not fname.endswith('.json'):
        continue
    tile_path = os.path.join(TILES, fname)
    with open(tile_path) as f:
        tile_data = json.load(f)
    
    changed = False
    for feat in tile_data.get('features', []):
        props = feat['properties']
        code = props.get('c')
        
        # Remove old band keys
        for old_key in OLD_BAND_KEYS:
            if old_key in props:
                del props[old_key]
                changed = True
        
        if code and code in lsoa_age:
            pcts = compute_age_pcts(lsoa_age[code])
            props.update(pcts)
            changed = True
            updated_lsoas += 1
    
    if changed:
        with open(tile_path, 'w') as f:
            json.dump(tile_data, f, separators=(',', ':'))
        updated_tiles += 1

print(f"  Updated {updated_lsoas} LSOAs across {updated_tiles} tiles")

# ─── 5. Update LAD GeoJSON with age averages ───
print("\nComputing LAD age averages...")
lsoa_to_lad = {}
imd_path = os.path.join(RAW, 'imd2025_file7.csv')
if os.path.exists(imd_path):
    with open(imd_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            lsoa_to_lad[row['LSOA code (2021)']] = row['Local Authority District code (2024)']

# Accumulate per-LAD raw counts
lad_age = defaultdict(lambda: defaultdict(int))
for code, age_data in lsoa_age.items():
    lad = lsoa_to_lad.get(code)
    if not lad:
        continue
    for cat_str, count in age_data.items():
        lad_age[lad][cat_str] += int(count)

# Update LAD GeoJSON
lad_path = os.path.join(PUB, 'lad.json')
with open(lad_path) as f:
    lad_geojson = json.load(f)

lad_updated = 0
for feat in lad_geojson['features']:
    props = feat['properties']
    code = props['c']
    
    # Remove old band keys
    for old_key in OLD_BAND_KEYS:
        if old_key in props:
            del props[old_key]
    
    if code in lad_age:
        pcts = compute_age_pcts(lad_age[code])
        props.update(pcts)
        lad_updated += 1

with open(lad_path, 'w') as f:
    json.dump(lad_geojson, f, separators=(',', ':'))
print(f"  Updated {lad_updated} LADs")

# ─── 6. Compute percentile stats for frontend scaling ───
print("\nComputing age band percentiles for frontend...")
band_values = {band: [] for band in BAND_KEYS}

for code in lsoa_age:
    pcts = compute_age_pcts(lsoa_age[code])
    for band, val in pcts.items():
        band_values[band].append(val)

for band in band_values:
    band_values[band].sort()

print("\n  // Paste into NeighbourhoodOverlay.ts:")
print("  const AGE_P5: Record<string, number> = {")
for band, vals in band_values.items():
    if not vals:
        continue
    n = len(vals)
    p5 = vals[int(n * 0.05)]
    print(f"    '{band}': {p5},")
print("  };")

print("  const AGE_P99: Record<string, number> = {")
for band, vals in band_values.items():
    if not vals:
        continue
    n = len(vals)
    p99 = vals[int(n * 0.99)]
    print(f"    '{band}': {p99},")
print("  };")

# Also print full stats for reference
print("\n  Full stats:")
for band, vals in band_values.items():
    if not vals:
        continue
    n = len(vals)
    p5 = vals[int(n * 0.05)]
    p50 = vals[int(n * 0.5)]
    p95 = vals[int(n * 0.95)]
    p99 = vals[int(n * 0.99)]
    print(f"  {band}: p5={p5}, p50={p50}, p95={p95}, p99={p99}, min={vals[0]}, max={vals[-1]}")

print("\n✅ Done! Age data rebuilt with neighbourhood-demographic bands")
