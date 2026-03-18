#!/usr/bin/env python3
"""
Build neighbourhood data for SchoolFinder UK.
Downloads LSOA boundaries (super generalised) from ONS ArcGIS,
merges with IMD 2025 deprivation data, and outputs tiled JSON files
for efficient map overlay rendering.

Output:
  public/neighbourhood/index.json        - LA bounding boxes + LSOA counts
  public/neighbourhood/tiles/{la_code}.json - per-LA LSOA boundaries + data
"""

import csv
import json
import math
import os
import sys
import time
import urllib.request
import urllib.parse
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(BASE_DIR, 'data', 'raw')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public', 'neighbourhood')
TILES_DIR = os.path.join(PUBLIC_DIR, 'tiles')

ARCGIS_URL = (
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
    "Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BSC_V4/"
    "FeatureServer/0/query"
)

IMD_FILE = os.path.join(RAW_DIR, 'imd2025_file7.csv')
BATCH_SIZE = 2000  # ArcGIS max per request

def download_lsoa_boundaries():
    """Download all LSOA boundaries from ArcGIS Feature Server in batches."""
    all_features = []
    offset = 0
    
    print("Downloading LSOA boundaries from ONS ArcGIS...")
    while True:
        params = urllib.parse.urlencode({
            'where': '1=1',
            'outFields': 'LSOA21CD,LSOA21NM',
            'outSR': '4326',
            'resultOffset': offset,
            'resultRecordCount': BATCH_SIZE,
            'f': 'geojson',
        })
        url = f"{ARCGIS_URL}?{params}"
        
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'SchoolFinderUK/1.0'})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.loads(resp.read().decode())
                break
            except Exception as e:
                if attempt == 2:
                    raise
                print(f"  Retry {attempt+1} for offset {offset}: {e}")
                time.sleep(2)
        
        features = data.get('features', [])
        if not features:
            break
            
        all_features.extend(features)
        offset += len(features)
        print(f"  Downloaded {offset} LSOAs...")
        
        # Small delay to be nice to the API
        time.sleep(0.3)
    
    print(f"  Total: {len(all_features)} LSOA boundaries downloaded")
    return all_features


def load_imd_data():
    """Load IMD 2025 data from CSV, keyed by LSOA code."""
    print(f"Loading IMD data from {IMD_FILE}...")
    imd = {}
    with open(IMD_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row['LSOA code (2021)']
            try:
                imd[code] = {
                    'la_code': row['Local Authority District code (2024)'],
                    'la_name': row['Local Authority District name (2024)'],
                    'imd_score': round(float(row['Index of Multiple Deprivation (IMD) Score']), 1),
                    'imd_rank': int(row['Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)']),
                    'imd_decile': int(row['Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)']),
                    'income_score': round(float(row['Income Score (rate)']), 3),
                    'income_decile': int(row['Income Decile (where 1 is most deprived 10% of LSOAs)']),
                    'education_decile': int(row['Education, Skills and Training Decile (where 1 is most deprived 10% of LSOAs)']),
                    'health_decile': int(row['Health Deprivation and Disability Decile (where 1 is most deprived 10% of LSOAs)']),
                    'crime_decile': int(row['Crime Decile (where 1 is most deprived 10% of LSOAs)']),
                    'housing_decile': int(row['Barriers to Housing and Services Decile (where 1 is most deprived 10% of LSOAs)']),
                    'environment_decile': int(row['Living Environment Decile (where 1 is most deprived 10% of LSOAs)']),
                    'population': int(row['Total population: mid 2022']),
                }
            except (ValueError, KeyError) as e:
                pass  # Skip rows with missing data
    
    print(f"  Loaded {len(imd)} LSOA deprivation records")
    return imd


def round_coord(c, precision=5):
    """Round coordinate to reduce JSON size. 5 decimals ≈ 1m accuracy."""
    return round(c, precision)


def simplify_geometry(geometry):
    """Round coordinates to save space."""
    geom_type = geometry['type']
    if geom_type == 'Polygon':
        coords = geometry['coordinates']
        return {
            'type': 'Polygon',
            'coordinates': [
                [[round_coord(c[0]), round_coord(c[1])] for c in ring]
                for ring in coords
            ]
        }
    elif geom_type == 'MultiPolygon':
        coords = geometry['coordinates']
        return {
            'type': 'MultiPolygon',
            'coordinates': [
                [
                    [[round_coord(c[0]), round_coord(c[1])] for c in ring]
                    for ring in polygon
                ]
                for polygon in coords
            ]
        }
    return geometry


def compute_bbox(features):
    """Compute bounding box for a list of GeoJSON features."""
    min_lng = 180
    max_lng = -180
    min_lat = 90
    max_lat = -90
    
    for f in features:
        geom = f['geometry']
        coords_list = []
        if geom['type'] == 'Polygon':
            coords_list = [geom['coordinates'][0]]  # outer ring
        elif geom['type'] == 'MultiPolygon':
            coords_list = [poly[0] for poly in geom['coordinates']]
        
        for ring in coords_list:
            for c in ring:
                min_lng = min(min_lng, c[0])
                max_lng = max(max_lng, c[0])
                min_lat = min(min_lat, c[1])
                max_lat = max(max_lat, c[1])
    
    return [round(min_lng, 4), round(min_lat, 4), round(max_lng, 4), round(max_lat, 4)]


def build_tiles(features, imd_data):
    """
    Group features by Local Authority and output tile files.
    Each tile contains compact LSOA records for efficient rendering.
    """
    os.makedirs(TILES_DIR, exist_ok=True)
    
    # Group by LA
    la_groups = defaultdict(list)
    matched = 0
    unmatched = 0
    
    for f in features:
        lsoa_code = f['properties']['LSOA21CD']
        
        # Only include England LSOAs (start with E)
        if not lsoa_code.startswith('E'):
            continue
            
        imd = imd_data.get(lsoa_code)
        if not imd:
            unmatched += 1
            continue
        
        matched += 1
        la_code = imd['la_code']
        
        # Build compact feature
        compact = {
            'c': lsoa_code,           # LSOA code
            'n': f['properties']['LSOA21NM'],  # LSOA name
            'g': simplify_geometry(f['geometry']),  # geometry
            'd': imd['imd_decile'],    # IMD decile (1-10)
            's': imd['imd_score'],     # IMD score
            'r': imd['imd_rank'],      # IMD rank
            'id': imd['income_decile'],
            'ed': imd['education_decile'],
            'hd': imd['health_decile'],
            'cd': imd['crime_decile'],
            'bd': imd['housing_decile'],
            'ld': imd['environment_decile'],
            'p': imd['population'],
        }
        la_groups[la_code].append(compact)
    
    print(f"  Matched: {matched}, Unmatched: {unmatched}")
    
    # Write tile files and build index
    index = {}
    total_size = 0
    
    for la_code, lsoas in la_groups.items():
        # Get LA name from first LSOA
        la_name = imd_data.get(lsoas[0]['c'], {}).get('la_name', la_code)
        
        # Build GeoJSON FeatureCollection for this LA
        tile_features = []
        for lsoa in lsoas:
            tile_features.append({
                'type': 'Feature',
                'properties': {
                    'c': lsoa['c'],
                    'n': lsoa['n'],
                    'd': lsoa['d'],
                    's': lsoa['s'],
                    'r': lsoa['r'],
                    'id': lsoa['id'],
                    'ed': lsoa['ed'],
                    'hd': lsoa['hd'],
                    'cd': lsoa['cd'],
                    'bd': lsoa['bd'],
                    'ld': lsoa['ld'],
                    'p': lsoa['p'],
                },
                'geometry': lsoa['g'],
            })
        
        tile = {
            'type': 'FeatureCollection',
            'features': tile_features,
        }
        
        tile_path = os.path.join(TILES_DIR, f'{la_code}.json')
        tile_json = json.dumps(tile, separators=(',', ':'))
        with open(tile_path, 'w') as f:
            f.write(tile_json)
        
        file_size = len(tile_json)
        total_size += file_size
        
        # Compute bbox from features
        bbox = compute_bbox(tile_features)
        
        index[la_code] = {
            'name': la_name,
            'count': len(lsoas),
            'bbox': bbox,
            'size': file_size,
        }
    
    print(f"  Written {len(la_groups)} LA tile files")
    print(f"  Total tile size: {total_size / 1024 / 1024:.1f} MB")
    
    # Write index file
    index_path = os.path.join(PUBLIC_DIR, 'index.json')
    with open(index_path, 'w') as f:
        json.dump(index, separators=(',', ':'), fp=f)
    
    print(f"  Written index.json ({os.path.getsize(index_path) / 1024:.0f} KB)")
    
    return index


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    
    # Step 1: Load IMD data
    imd_data = load_imd_data()
    
    # Step 2: Download or load cached LSOA boundaries
    cache_file = os.path.join(RAW_DIR, 'lsoa_boundaries_bsc.json')
    
    if os.path.exists(cache_file):
        print(f"Loading cached boundaries from {cache_file}...")
        with open(cache_file, 'r') as f:
            features = json.load(f)
        print(f"  Loaded {len(features)} features from cache")
    else:
        features = download_lsoa_boundaries()
        # Cache for future runs
        print(f"Caching boundaries to {cache_file}...")
        with open(cache_file, 'w') as f:
            json.dump(features, f)
        print(f"  Cached ({os.path.getsize(cache_file) / 1024 / 1024:.1f} MB)")
    
    # Step 3: Build tiles
    print("\nBuilding tiles...")
    index = build_tiles(features, imd_data)
    
    print(f"\n✅ Done! {len(index)} LA tiles ready in {TILES_DIR}")


if __name__ == '__main__':
    main()
