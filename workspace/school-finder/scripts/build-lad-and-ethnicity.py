#!/usr/bin/env python3
"""
Build LAD boundaries + LSOA ethnicity data for the neighbourhood overlay.

1. Downloads LAD (super-generalised BSC) boundaries from ONS ArcGIS
2. Computes average IMD deciles per LAD
3. Downloads Census 2021 ethnicity at LSOA level from NOMIS
4. Outputs:
   - public/neighbourhood/lad.json (LAD boundaries + average stats)
   - Updates LSOA tile files with ethnicity data
"""
import json, csv, os, sys, time
from urllib.request import urlopen, Request
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, 'data', 'raw')
PUB = os.path.join(BASE, 'public', 'neighbourhood')
TILES = os.path.join(PUB, 'tiles')

# ─── 1. Load IMD data and compute LAD averages ───
print("Loading IMD data...")
imd_lsoa = {}  # lsoa_code -> {d, id, ed, hd, cd, bd, ld, s, r, p}
lad_lsoas = defaultdict(list)  # lad_code -> [lsoa rows]
lad_names = {}

with open(os.path.join(RAW, 'imd2025_file7.csv')) as f:
    reader = csv.DictReader(f)
    for row in reader:
        lsoa = row['LSOA code (2021)']
        lad_code = row['Local Authority District code (2024)']
        lad_name = row['Local Authority District name (2024)']
        lad_names[lad_code] = lad_name
        
        rec = {
            'd': int(row['Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)']),
            's': float(row['Index of Multiple Deprivation (IMD) Score']),
            'r': int(row['Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)']),
            'id': int(row['Income Decile (where 1 is most deprived 10% of LSOAs)']),
            'ed': int(row['Education, Skills and Training Decile (where 1 is most deprived 10% of LSOAs)']),
            'hd': int(row['Health Deprivation and Disability Decile (where 1 is most deprived 10% of LSOAs)']),
            'cd': int(row['Crime Decile (where 1 is most deprived 10% of LSOAs)']),
            'bd': int(row['Barriers to Housing and Services Decile (where 1 is most deprived 10% of LSOAs)']),
            'ld': int(row['Living Environment Decile (where 1 is most deprived 10% of LSOAs)']),
            'p': int(row['Total population: mid 2022']),
        }
        imd_lsoa[lsoa] = rec
        lad_lsoas[lad_code].append(rec)

print(f"  {len(imd_lsoa)} LSOAs, {len(lad_lsoas)} LADs")

# Compute LAD averages
lad_stats = {}
for lad_code, lsoas in lad_lsoas.items():
    n = len(lsoas)
    total_pop = sum(r['p'] for r in lsoas)
    lad_stats[lad_code] = {
        'n': lad_name,
        'count': n,
        'pop': total_pop,
        'd': round(sum(r['d'] for r in lsoas) / n, 1),
        'id': round(sum(r['id'] for r in lsoas) / n, 1),
        'ed': round(sum(r['ed'] for r in lsoas) / n, 1),
        'hd': round(sum(r['hd'] for r in lsoas) / n, 1),
        'cd': round(sum(r['cd'] for r in lsoas) / n, 1),
        'bd': round(sum(r['bd'] for r in lsoas) / n, 1),
        'ld': round(sum(r['ld'] for r in lsoas) / n, 1),
    }
    lad_stats[lad_code]['n'] = lad_names[lad_code]

print(f"  Computed averages for {len(lad_stats)} LADs")

# ─── 2. Download LAD boundaries ───
print("\nDownloading LAD boundaries (BSC 2023)...")
LAD_URL = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_December_2023_Boundaries_UK_BSC/FeatureServer/0/query"

lad_features = []
offset = 0
batch = 500

while True:
    url = f"{LAD_URL}?where=LAD23CD+LIKE+%27E%25%27&outFields=LAD23CD,LAD23NM&returnGeometry=true&outSR=4326&f=json&resultRecordCount={batch}&resultOffset={offset}"
    req = Request(url, headers={'User-Agent': 'SchoolFinderUK/1.0'})
    data = json.loads(urlopen(req).read())
    features = data.get('features', [])
    if not features:
        break
    lad_features.extend(features)
    offset += len(features)
    print(f"  Downloaded {offset} LAD boundaries...")
    if len(features) < batch:
        break

print(f"  Total: {len(lad_features)} LAD boundaries")

# Build LAD GeoJSON
lad_geojson = {
    "type": "FeatureCollection",
    "features": []
}

matched = 0
for feat in lad_features:
    attrs = feat['attributes']
    code = attrs['LAD23CD']
    
    # Match to IMD stats
    stats = lad_stats.get(code)
    if not stats:
        continue
    matched += 1
    
    # Convert ArcGIS rings to GeoJSON
    rings = feat['geometry']['rings']
    if len(rings) == 1:
        geom = {"type": "Polygon", "coordinates": rings}
    else:
        geom = {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
    
    props = {
        'c': code,
        'n': stats['n'],
        'count': stats['count'],
        'pop': stats['pop'],
        'd': stats['d'],
        'id': stats['id'],
        'ed': stats['ed'],
        'hd': stats['hd'],
        'cd': stats['cd'],
        'bd': stats['bd'],
        'ld': stats['ld'],
    }
    
    lad_geojson['features'].append({
        "type": "Feature",
        "properties": props,
        "geometry": geom,
    })

print(f"  Matched {matched} LADs with IMD stats")

# ─── 3. Download LSOA-level ethnicity from NOMIS ───
print("\nDownloading Census 2021 ethnicity (LSOA level) from NOMIS...")
# We need all England LSOAs. NOMIS supports TYPE298 for LSOA 2021.
# But bulk downloads need pagination or geography ranges.
# Strategy: download by LAD to keep chunks manageable.

ETH_CATEGORIES = {
    'Total: All usual residents': 'total',
    'White: English, Welsh, Scottish, Northern Irish or British': 'white_british',
    'White: Irish': 'white_irish',
    'White: Gypsy or Irish Traveller': 'white_gypsy',
    'White: Roma': 'white_roma',
    'White: Other White': 'white_other',
    'Mixed or Multiple ethnic groups: White and Black Caribbean': 'mixed_wbc',
    'Mixed or Multiple ethnic groups: White and Black African': 'mixed_wba',
    'Mixed or Multiple ethnic groups: White and Asian': 'mixed_wa',
    'Mixed or Multiple ethnic groups: Other Mixed or Multiple ethnic groups': 'mixed_other',
    'Asian, Asian British or Asian Welsh: Indian': 'asian_indian',
    'Asian, Asian British or Asian Welsh: Pakistani': 'asian_pakistani',
    'Asian, Asian British or Asian Welsh: Bangladeshi': 'asian_bangladeshi',
    'Asian, Asian British or Asian Welsh: Chinese': 'asian_chinese',
    'Asian, Asian British or Asian Welsh: Other Asian': 'asian_other',
    'Black, Black British, Black Welsh, Caribbean or African: Caribbean': 'black_caribbean',
    'Black, Black British, Black Welsh, Caribbean or African: African': 'black_african',
    'Black, Black British, Black Welsh, Caribbean or African: Other Black': 'black_other',
    'Other ethnic group: Arab': 'other_arab',
    'Other ethnic group: Any other ethnic group': 'other_other',
}

# Download in batches of ~5000 LSOAs using geography ranges
lsoa_ethnicity = {}  # lsoa_code -> {total, white_british, asian_indian, ...}

# Get sorted list of all England LSOA codes
all_lsoa_codes = sorted(imd_lsoa.keys())
print(f"  Need ethnicity for {len(all_lsoa_codes)} LSOAs")

# NOMIS API supports up to 25000 rows per request
# With 21 categories per LSOA, ~1190 LSOAs per batch to stay under 25000
BATCH_SIZE = 1000
eth_cache_path = os.path.join(RAW, 'ethnicity_lsoa_cache.json')

if os.path.exists(eth_cache_path):
    print(f"  Loading cached ethnicity data from {eth_cache_path}...")
    with open(eth_cache_path) as f:
        lsoa_ethnicity = json.load(f)
    print(f"  Loaded {len(lsoa_ethnicity)} LSOAs from cache")
else:
    for i in range(0, len(all_lsoa_codes), BATCH_SIZE):
        batch_codes = all_lsoa_codes[i:i + BATCH_SIZE]
        geo_param = ','.join(batch_codes)
        url = f"https://www.nomisweb.co.uk/api/v01/dataset/NM_2041_1.data.csv?date=latest&geography={geo_param}&c2021_eth_20=0...19&measures=20100&select=geography_code,c2021_eth_20_name,obs_value"
        
        for attempt in range(3):
            try:
                req = Request(url, headers={'User-Agent': 'SchoolFinderUK/1.0'})
                resp = urlopen(req, timeout=60)
                text = resp.read().decode('utf-8')
                break
            except Exception as e:
                if attempt < 2:
                    print(f"    Retry {attempt+1} for batch {i//BATCH_SIZE}...")
                    time.sleep(2)
                else:
                    print(f"    Failed batch {i//BATCH_SIZE}: {e}")
                    text = ""
        
        if text:
            reader = csv.DictReader(text.strip().split('\n'))
            for row in reader:
                code = row['GEOGRAPHY_CODE']
                cat_name = row['C2021_ETH_20_NAME']
                value = int(row['OBS_VALUE'])
                short = ETH_CATEGORIES.get(cat_name)
                if short:
                    if code not in lsoa_ethnicity:
                        lsoa_ethnicity[code] = {}
                    lsoa_ethnicity[code][short] = value
        
        done = min(i + BATCH_SIZE, len(all_lsoa_codes))
        if (done // BATCH_SIZE) % 5 == 0 or done == len(all_lsoa_codes):
            print(f"  Downloaded ethnicity for {done}/{len(all_lsoa_codes)} LSOAs...")
    
    # Cache the result
    with open(eth_cache_path, 'w') as f:
        json.dump(lsoa_ethnicity, f)
    print(f"  Cached {len(lsoa_ethnicity)} LSOAs to {eth_cache_path}")

# Compute percentages for each LSOA
def compute_eth_pcts(eth_data):
    """Compute grouped ethnicity percentages from raw counts."""
    total = eth_data.get('total', 0)
    if total == 0:
        return {'wb': 0, 'wo': 0, 'as': 0, 'bl': 0, 'mx': 0, 'ot': 0}
    
    white_british = eth_data.get('white_british', 0)
    white_other = sum(eth_data.get(k, 0) for k in ['white_irish', 'white_gypsy', 'white_roma', 'white_other'])
    asian = sum(eth_data.get(k, 0) for k in ['asian_indian', 'asian_pakistani', 'asian_bangladeshi', 'asian_chinese', 'asian_other'])
    black = sum(eth_data.get(k, 0) for k in ['black_caribbean', 'black_african', 'black_other'])
    mixed = sum(eth_data.get(k, 0) for k in ['mixed_wbc', 'mixed_wba', 'mixed_wa', 'mixed_other'])
    other = sum(eth_data.get(k, 0) for k in ['other_arab', 'other_other'])
    
    return {
        'wb': round(white_british / total * 100, 1),  # White British %
        'wo': round(white_other / total * 100, 1),     # Other White %
        'as': round(asian / total * 100, 1),            # Asian %
        'bl': round(black / total * 100, 1),            # Black %
        'mx': round(mixed / total * 100, 1),            # Mixed %
        'ot': round(other / total * 100, 1),            # Other %
    }

# ─── 4. Update LSOA tile files with ethnicity ───
print("\nUpdating LSOA tile files with ethnicity...")
updated_tiles = 0
updated_lsoas = 0

for tile_file in os.listdir(TILES):
    if not tile_file.endswith('.json'):
        continue
    tile_path = os.path.join(TILES, tile_file)
    with open(tile_path) as f:
        tile_data = json.load(f)
    
    changed = False
    for feat in tile_data.get('features', []):
        lsoa_code = feat['properties'].get('c')
        if lsoa_code and lsoa_code in lsoa_ethnicity:
            eth_pcts = compute_eth_pcts(lsoa_ethnicity[lsoa_code])
            feat['properties'].update(eth_pcts)
            changed = True
            updated_lsoas += 1
    
    if changed:
        with open(tile_path, 'w') as f:
            json.dump(tile_data, f, separators=(',', ':'))
        updated_tiles += 1

print(f"  Updated {updated_lsoas} LSOAs across {updated_tiles} tile files")

# ─── 5. Add ethnicity averages to LAD GeoJSON ───
print("\nComputing LAD ethnicity averages...")
lad_eth = defaultdict(lambda: defaultdict(int))

for lsoa_code, eth_data in lsoa_ethnicity.items():
    # Find this LSOA's LAD via the IMD data
    # We need a reverse lookup - build from the original CSV
    pass

# Re-read IMD to get LSOA -> LAD mapping
lsoa_to_lad = {}
with open(os.path.join(RAW, 'imd2025_file7.csv')) as f:
    reader = csv.DictReader(f)
    for row in reader:
        lsoa_to_lad[row['LSOA code (2021)']] = row['Local Authority District code (2024)']

for lsoa_code, eth_data in lsoa_ethnicity.items():
    lad = lsoa_to_lad.get(lsoa_code)
    if lad:
        for key, val in eth_data.items():
            lad_eth[lad][key] += val

for feat in lad_geojson['features']:
    code = feat['properties']['c']
    if code in lad_eth:
        eth_pcts = compute_eth_pcts(lad_eth[code])
        feat['properties'].update(eth_pcts)

# ─── 6. Write LAD GeoJSON ───
os.makedirs(PUB, exist_ok=True)
lad_path = os.path.join(PUB, 'lad.json')
with open(lad_path, 'w') as f:
    json.dump(lad_geojson, f, separators=(',', ':'))
lad_size = os.path.getsize(lad_path)
print(f"\nWritten {lad_path} ({lad_size // 1024} KB)")

# Recompute total tile sizes
total = sum(os.path.getsize(os.path.join(TILES, f)) for f in os.listdir(TILES) if f.endswith('.json'))
print(f"Updated tile total: {total / 1024 / 1024:.1f} MB")

print(f"\n✅ Done! LAD boundaries + ethnicity integrated")
