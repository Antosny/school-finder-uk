#!/usr/bin/env python3
"""
Rebuild neighbourhood tiles and LAD data with granular ethnicity.
Uses cached LSOA boundaries and ethnicity data (already downloaded).
Adds all 19 ethnic categories to LSOA tiles and LAD.
"""
import json, csv, os
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, 'data', 'raw')
PUB = os.path.join(BASE, 'public', 'neighbourhood')
TILES = os.path.join(PUB, 'tiles')

# Short keys for granular ethnicity (keep tile sizes down)
ETH_KEYS = {
    'white_british': 'wbi',
    'white_irish': 'wir',
    'white_gypsy': 'wgy',
    'white_roma': 'wro',
    'white_other': 'wot',
    'asian_indian': 'ind',
    'asian_pakistani': 'pak',
    'asian_bangladeshi': 'ban',
    'asian_chinese': 'chi',
    'asian_other': 'oas',
    'black_caribbean': 'bca',
    'black_african': 'baf',
    'black_other': 'bot',
    'mixed_wbc': 'mwc',
    'mixed_wba': 'mwa',
    'mixed_wa': 'mwas',
    'mixed_other': 'mot',
    'other_arab': 'ara',
    'other_other': 'oet',
}

def compute_granular_pcts(eth_data):
    """Compute all 19 granular ethnicity percentages."""
    total = eth_data.get('total', 0)
    if total == 0:
        return {}
    result = {}
    for long_key, short_key in ETH_KEYS.items():
        count = eth_data.get(long_key, 0)
        pct = round(count / total * 100, 1)
        if pct > 0:  # Only include non-zero to save space
            result[short_key] = pct
    return result

# ─── 1. Load IMD data ───
print("Loading IMD data...")
lsoa_to_lad = {}
lad_names = {}
lad_lsoas = defaultdict(list)
imd_lsoa = {}

with open(os.path.join(RAW, 'imd2025_file7.csv')) as f:
    reader = csv.DictReader(f)
    for row in reader:
        lsoa = row['LSOA code (2021)']
        lad_code = row['Local Authority District code (2024)']
        lad_name = row['Local Authority District name (2024)']
        lsoa_to_lad[lsoa] = lad_code
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

# ─── 2. Load cached ethnicity ───
print("Loading cached ethnicity data...")
with open(os.path.join(RAW, 'ethnicity_lsoa_cache.json')) as f:
    lsoa_ethnicity = json.load(f)
print(f"  {len(lsoa_ethnicity)} LSOAs with ethnicity")

# ─── 3. Update LSOA tile files with granular ethnicity ───
print("\nUpdating LSOA tiles with granular ethnicity...")
updated_tiles = 0
updated_lsoas = 0

for tile_file in sorted(os.listdir(TILES)):
    if not tile_file.endswith('.json'):
        continue
    tile_path = os.path.join(TILES, tile_file)
    with open(tile_path) as f:
        tile_data = json.load(f)

    changed = False
    for feat in tile_data.get('features', []):
        lsoa_code = feat['properties'].get('c')
        if lsoa_code and lsoa_code in lsoa_ethnicity:
            # Remove old broad keys if present
            for old_key in ['wb', 'wo', 'as', 'bl', 'mx', 'ot']:
                feat['properties'].pop(old_key, None)
            # Add granular keys
            eth_pcts = compute_granular_pcts(lsoa_ethnicity[lsoa_code])
            feat['properties'].update(eth_pcts)
            changed = True
            updated_lsoas += 1

    if changed:
        with open(tile_path, 'w') as f:
            json.dump(tile_data, f, separators=(',', ':'))
        updated_tiles += 1

print(f"  Updated {updated_lsoas} LSOAs across {updated_tiles} tiles")

# ─── 4. Compute LAD ethnicity averages (granular) ───
print("\nComputing LAD granular ethnicity averages...")
lad_eth_totals = defaultdict(lambda: defaultdict(int))

for lsoa_code, eth_data in lsoa_ethnicity.items():
    lad = lsoa_to_lad.get(lsoa_code)
    if lad:
        for key, val in eth_data.items():
            lad_eth_totals[lad][key] += val

# ─── 5. Rebuild LAD GeoJSON ───
print("Rebuilding LAD GeoJSON...")
lad_path = os.path.join(PUB, 'lad.json')
with open(lad_path) as f:
    lad_geojson = json.load(f)

for feat in lad_geojson['features']:
    code = feat['properties']['c']
    # Remove old broad keys
    for old_key in ['wb', 'wo', 'as', 'bl', 'mx', 'ot']:
        feat['properties'].pop(old_key, None)
    # Add granular keys
    if code in lad_eth_totals:
        eth_pcts = compute_granular_pcts(lad_eth_totals[code])
        feat['properties'].update(eth_pcts)

with open(lad_path, 'w') as f:
    json.dump(lad_geojson, f, separators=(',', ':'))

lad_size = os.path.getsize(lad_path)
print(f"  Written LAD GeoJSON ({lad_size // 1024} KB)")

# ─── 6. Report tile sizes ───
total = sum(os.path.getsize(os.path.join(TILES, f)) for f in os.listdir(TILES) if f.endswith('.json'))
print(f"  Total tile size: {total / 1024 / 1024:.1f} MB")

print("\n✅ Done! Granular ethnicity (19 categories) in tiles + LAD")
