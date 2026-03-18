#!/usr/bin/env python3
"""
Build the schools SQLite database from raw CSV data sources.
Joins: GIAS (basics) + Ofsted (ratings) + KS4 (GCSE results) + Pupil characteristics (demographics) + Admissions
"""

import csv
import json
import math
import os
import sqlite3
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
RAW_DIR = os.path.join(DATA_DIR, 'raw')
DB_PATH = os.path.join(DATA_DIR, 'schools.db')
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')

# ── Easting/Northing to Lat/Lng (OSGB36 → WGS84 approximate) ──
def osgb36_to_wgs84(easting, northing):
    """Convert OS National Grid (OSGB36) to WGS84 lat/lng. Approximate Helmert transform."""
    E = float(easting)
    N = float(northing)
    a = 6377563.396
    b = 6356256.909
    F0 = 0.9996012717
    lat0 = math.radians(49)
    lon0 = math.radians(-2)
    N0 = -100000
    E0 = 400000

    e2 = 1 - (b*b)/(a*a)
    n_ = (a-b)/(a+b)
    n2 = n_*n_
    n3 = n2*n_

    lat = lat0
    M = 0
    while True:
        lat = (N - N0 - M)/(a*F0) + lat
        Ma = (1 + n_ + (5/4)*n2 + (5/4)*n3) * (lat - lat0)
        Mb = (3*n_ + 3*n2 + (21/8)*n3) * math.sin(lat - lat0) * math.cos(lat + lat0)
        Mc = ((15/8)*n2 + (15/8)*n3) * math.sin(2*(lat - lat0)) * math.cos(2*(lat + lat0))
        Md = (35/24)*n3 * math.sin(3*(lat - lat0)) * math.cos(3*(lat + lat0))
        M = b * F0 * (Ma - Mb + Mc - Md)
        if abs(N - N0 - M) < 0.00001:
            break

    cosLat = math.cos(lat)
    sinLat = math.sin(lat)
    nu = a*F0/math.sqrt(1 - e2*sinLat*sinLat)
    rho = a*F0*(1 - e2)/((1 - e2*sinLat*sinLat)**1.5)
    eta2 = nu/rho - 1
    tanLat = math.tan(lat)

    VII = tanLat/(2*rho*nu)
    VIII = tanLat/(24*rho*nu**3)*(5 + 3*tanLat**2 + eta2 - 9*tanLat**2*eta2)
    IX = tanLat/(720*rho*nu**5)*(61 + 90*tanLat**2 + 45*tanLat**4)
    X = 1/(cosLat*nu)
    XI = 1/(cosLat*6*nu**3)*(nu/rho + 2*tanLat**2)
    XII = 1/(cosLat*120*nu**5)*(5 + 28*tanLat**2 + 24*tanLat**4)
    XIIA = 1/(cosLat*5040*nu**7)*(61 + 662*tanLat**2 + 1320*tanLat**4 + 720*tanLat**6)

    dE = E - E0
    lat = lat - VII*dE**2 + VIII*dE**4 - IX*dE**6
    lon = lon0 + X*dE - XI*dE**3 + XII*dE**5 - XIIA*dE**7

    lat_deg = math.degrees(lat)
    lon_deg = math.degrees(lon)
    return lat_deg, lon_deg


def parse_float(val):
    if val is None:
        return None
    val = str(val).strip()
    if val in ('', 'NULL', 'null', 'z', 'c', 'x', 'ne', 'supp', 'SUPP', 'NE', 'NA', 'N/A', '.', '-'):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_int(val):
    f = parse_float(val)
    if f is None:
        return None
    return int(f)


def load_gias():
    """Load GIAS data: basic school info with location."""
    print("Loading GIAS data...")
    path = os.path.join(RAW_DIR, 'gias_all.csv')
    schools = {}
    with open(path, encoding='latin-1') as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get('EstablishmentStatus (name)', '').strip()
            if status != 'Open':
                continue
            urn = row.get('URN', '').strip()
            if not urn:
                continue
            easting = row.get('Easting', '').strip()
            northing = row.get('Northing', '').strip()
            lat, lng = None, None
            if easting and northing and easting != '0' and northing != '0':
                try:
                    lat, lng = osgb36_to_wgs84(easting, northing)
                except:
                    pass
            phase = row.get('PhaseOfEducation (name)', '').strip()
            school_type = row.get('TypeOfEstablishment (name)', '').strip()
            type_group = row.get('EstablishmentTypeGroup (name)', '').strip()
            schools[urn] = {
                'urn': int(urn),
                'name': row.get('EstablishmentName', '').strip(),
                'address': ', '.join(filter(None, [
                    row.get('Street', '').strip(),
                    row.get('Locality', '').strip(),
                    row.get('Town', '').strip(),
                    row.get('County (name)', '').strip(),
                ])),
                'postcode': row.get('Postcode', '').strip(),
                'lat': lat,
                'lng': lng,
                'school_type': school_type,
                'type_group': type_group,
                'phase': phase,
                'gender': row.get('Gender (name)', '').strip(),
                'religious_character': row.get('ReligiousCharacter (name)', '').strip(),
                'admissions_policy': row.get('AdmissionsPolicy (name)', '').strip(),
                'number_of_pupils': parse_int(row.get('NumberOfPupils')),
                'school_capacity': parse_int(row.get('SchoolCapacity')),
                'low_age': parse_int(row.get('StatutoryLowAge')),
                'high_age': parse_int(row.get('StatutoryHighAge')),
                'la_name': row.get('LA (name)', '').strip(),
                'sixth_form': row.get('OfficialSixthForm (name)', '').strip(),
                'website': row.get('SchoolWebsite', '').strip(),
            }
    print(f"  Loaded {len(schools)} open schools from GIAS")
    return schools


def _parse_ungraded_outcome(outcome):
    """Map ungraded inspection outcome text to a numeric Ofsted rating."""
    if not outcome:
        return None
    outcome_lower = outcome.lower()
    if 'outstanding' in outcome_lower:
        return 1
    if 'good' in outcome_lower:
        return 2
    if 'requires improvement' in outcome_lower:
        return 3
    if 'inadequate' in outcome_lower:
        return 4
    # "Standards maintained", "Improved significantly", "Some aspects not as strong" — can't map
    return None


def load_ofsted():
    """Load Ofsted inspection data, including ungraded inspection outcomes."""
    print("Loading Ofsted data...")
    path = os.path.join(RAW_DIR, 'ofsted_latest.csv')
    ofsted = {}
    graded_count = 0
    ungraded_count = 0

    with open(path, encoding='latin-1') as f:
        next(f)
        next(f)
        reader = csv.DictReader(f)
        for row in reader:
            urn = row.get('URN', '').strip()
            if not urn:
                continue

            # 1. Try OEIF graded inspection (most authoritative)
            overall = row.get('Latest OEIF overall effectiveness', '').strip()
            if overall in ('', 'NULL', 'null'):
                overall = None
            else:
                try:
                    overall = int(overall)
                except:
                    overall = None

            inspection_date = row.get('Inspection start date of latest OEIF graded inspection', '').strip()
            if inspection_date in ('', 'NULL'):
                inspection_date = None

            quality_of_education = parse_int(row.get('Latest OEIF quality of education'))
            behaviour_attitudes = parse_int(row.get('Latest OEIF behaviour and attitudes'))
            personal_development = parse_int(row.get('Latest OEIF personal development'))
            leadership_management = parse_int(row.get('Latest OEIF effectiveness of leadership and management'))
            early_years = parse_int(row.get('Latest OEIF early years provision (where applicable)'))
            sixth_form_ofsted = parse_int(row.get('Latest OEIF sixth form provision (where applicable)'))

            if overall is not None:
                graded_count += 1
            else:
                # 2. Fall back to ungraded inspection outcome
                ungraded_outcome = row.get('Ungraded inspection overall outcome', '').strip()
                if ungraded_outcome and ungraded_outcome != 'NULL':
                    mapped = _parse_ungraded_outcome(ungraded_outcome)
                    if mapped is not None:
                        overall = mapped
                        ungraded_date = row.get('Date of latest ungraded inspection', '').strip()
                        if ungraded_date and ungraded_date != 'NULL':
                            inspection_date = ungraded_date
                        ungraded_count += 1

            ofsted[urn] = {
                'ofsted_rating': overall,
                'ofsted_date': inspection_date,
                'quality_of_education': quality_of_education,
                'behaviour_attitudes': behaviour_attitudes,
                'personal_development': personal_development,
                'leadership_management': leadership_management,
                'early_years': early_years,
                'sixth_form_ofsted': sixth_form_ofsted,
            }

    print(f"  Loaded {len(ofsted)} Ofsted records ({graded_count} graded, {ungraded_count} from ungraded inspections)")
    return ofsted


def load_ks4():
    """Load KS4 (GCSE) school-level performance data."""
    print("Loading KS4 (GCSE) data...")
    path = os.path.join(RAW_DIR, 'ks4_schools.csv')
    ks4 = {}
    with open(path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            urn = row.get('school_urn', '').strip()
            if not urn:
                continue
            breakdown = row.get('breakdown', '').strip()
            topic = row.get('breakdown_topic', '').strip()
            if topic not in ('Total', ''):
                continue
            if breakdown not in ('Total', ''):
                continue
            att8 = parse_float(row.get('attainment8_average'))
            prog8 = parse_float(row.get('progress8_average'))
            eng_maths_pct = parse_float(row.get('engmath_95_percent'))
            if urn not in ks4 or att8 is not None:
                ks4[urn] = {
                    'attainment8': att8,
                    'progress8': prog8,
                    'eng_maths_5plus_pct': eng_maths_pct,
                }
    print(f"  Loaded {len(ks4)} KS4 school records")
    return ks4


# Ethnicity column mappings: CSV column name → short label + JSON key
ETHNICITY_COLS = [
    ('% of pupils classified as white British ethnic origin', 'white_british_pct', 'White British'),
    ('% of pupils classified as Irish ethnic origin', 'irish_pct', 'Irish'),
    ('% of pupils classified as traveller of Irish heritage ethnic origin', 'traveller_irish_pct', 'Traveller Irish'),
    ('% of pupils classified as Gypsy/Roma ethnic origin', 'gypsy_roma_pct', 'Gypsy/Roma'),
    ('% of pupils classified as any other white background ethnic origin', 'other_white_pct', 'Other White'),
    ('% of pupils classified as Indian ethnic origin', 'indian_pct', 'Indian'),
    ('% of pupils classified as Pakistani ethnic origin', 'pakistani_pct', 'Pakistani'),
    ('% of pupils classified as Bangladeshi ethnic origin', 'bangladeshi_pct', 'Bangladeshi'),
    ('% of pupils classified as any other Asian background ethnic origin', 'other_asian_pct', 'Other Asian'),
    ('% of pupils classified as Caribbean ethnic origin', 'caribbean_pct', 'Caribbean'),
    ('% of pupils classified as African ethnic origin', 'african_pct', 'African'),
    ('% of pupils classified as any other black background ethnic origin', 'other_black_pct', 'Other Black'),
    ('% of pupils classified as Chinese ethnic origin', 'chinese_pct', 'Chinese'),
    ('% of pupils classified as white and black Caribbean ethnic origin', 'mixed_white_black_caribbean_pct', 'Mixed White/Black Caribbean'),
    ('% of pupils classified as white and black African ethnic origin', 'mixed_white_black_african_pct', 'Mixed White/Black African'),
    ('% of pupils classified as white and Asian ethnic origin', 'mixed_white_asian_pct', 'Mixed White/Asian'),
    ('% of pupils classified as any other mixed background ethnic origin', 'other_mixed_pct', 'Other Mixed'),
    ('% of pupils classified as any other ethnic group ethnic origin', 'other_ethnic_pct', 'Other Ethnic'),
    ('% of pupils unclassified', 'unclassified_pct', 'Unclassified'),
]


def load_pupil_characteristics():
    """Load pupil demographics (ethnicity, FSM, EAL) with granular ethnicity."""
    print("Loading pupil characteristics...")
    path = os.path.join(RAW_DIR, 'pupils_chars.csv')
    demographics = {}
    with open(path, encoding='latin-1') as f:
        reader = csv.DictReader(f)
        for row in reader:
            urn = row.get('urn', '').strip()
            if not urn:
                continue
            geo_level = row.get('geographic_level', '').strip()
            if geo_level != 'School':
                continue
            d = {
                'fsm_pct': parse_float(row.get('% of pupils known to be eligible for free school meals')),
                'eal_pct': parse_float(row.get('% of pupils whose first language is known or believed to be other than English')),
            }
            # Extract all granular ethnicity columns
            for csv_col, json_key, label in ETHNICITY_COLS:
                d[json_key] = parse_float(row.get(csv_col))
            demographics[urn] = d
    print(f"  Loaded {len(demographics)} pupil characteristic records")
    return demographics


def load_admissions():
    """Load school admissions data (applications, offers, competitiveness)."""
    print("Loading admissions data...")
    path = os.path.join(RAW_DIR, 'admissions_school.csv')
    admissions = {}
    if not os.path.exists(path):
        print("  admissions_school.csv not found, skipping")
        return admissions
    with open(path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('time_period', '').strip() != '202425':
                continue
            if row.get('geographic_level', '').strip() != 'School':
                continue
            urn = row.get('school_urn', '').strip()
            if not urn:
                continue
            total_places = parse_int(row.get('total_number_places_offered'))
            total_apps = parse_int(row.get('times_put_as_any_preferred_school'))
            first_pref_apps = parse_int(row.get('times_put_as_1st_preference'))
            first_pref_offers = parse_int(row.get('number_1st_preference_offers'))
            preferred_offers = parse_int(row.get('number_preferred_offers'))
            pct_1st_pref = parse_float(row.get('proportion_1stprefs_v_totaloffers'))
            # Build admissions record; if multiple entries (entry_year), keep the one with most data
            entry_year = row.get('entry_year', '').strip()
            if urn in admissions:
                # Prefer the entry that has the most applications (usually the main entry point)
                existing_apps = admissions[urn].get('total_applications') or 0
                if (total_apps or 0) <= existing_apps:
                    continue
            admissions[urn] = {
                'total_places_offered': total_places,
                'total_applications': total_apps,
                'first_pref_applications': first_pref_apps,
                'first_pref_offers': first_pref_offers,
                'preferred_offers': preferred_offers,
                'pct_first_pref_offered': pct_1st_pref,
                'entry_year': entry_year,
            }
    print(f"  Loaded {len(admissions)} admissions records")
    return admissions


RELIGION_MAP = {
    '': 0,
    'Does not apply': 0,
    'None': 1,
    'Inter- / non- denominational': 1,
    'Anglican': 2,
    'Anglican/Christian': 2,
    'Anglican/Church of England': 2,
    'Anglican/Evangelical': 2,
    'Church of England': 2,
    'Church of England/Christian': 2,
    'Church of England/Evangelical': 2,
    'Church of England/Free Church': 2,
    'Church of England/Methodist': 2,
    'Church of England/Methodist/United Reform Church/Baptist': 2,
    'Church of England/Roman Catholic': 2,
    'Church of England/United Reformed Church': 2,
    'Methodist/Church of England': 2,
    'Catholic': 3,
    'Roman Catholic': 3,
    'Roman Catholic/Anglican': 3,
    'Roman Catholic/Church of England': 3,
    'Christian': 4,
    'Christian Science': 4,
    'Christian/Evangelical': 4,
    'Christian/Methodist': 4,
    'Christian/non-denominational': 4,
    'Congregational Church': 4,
    'Free Church': 4,
    'Greek Orthodox': 4,
    'Methodist': 4,
    'Moravian': 4,
    'Plymouth Brethren Christian Church': 4,
    'Protestant': 4,
    'Protestant/Evangelical': 4,
    'Reformed Baptist': 4,
    'Seventh Day Adventist': 4,
    'United Reformed Church': 4,
    'Islam': 5,
    'Muslim': 5,
    'Sunni Deobandi': 5,
    'Charadi Jewish': 6,
    'Jewish': 6,
    'Orthodox Jewish': 6,
    'Sikh': 7,
    'Hindu': 8,
    'Buddhist': 9,
    'Multi-faith': 9,
    'Quaker': 9,
}


def religion_code(raw):
    """Map raw religious character string to a numeric code 0-9."""
    return RELIGION_MAP.get(raw.strip(), 0)


def percentile(values, pct):
    """Compute percentile from a sorted list of values (0-100 scale for pct)."""
    if not values:
        return 0
    values = sorted(values)
    k = (pct / 100.0) * (len(values) - 1)
    f = int(k)
    c = f + 1
    if c >= len(values):
        return values[f]
    d = k - f
    return values[f] + d * (values[c] - values[f])


def build_database(schools, ofsted, ks4, demographics, admissions):
    """Build the SQLite database and export JSON files."""
    print(f"\nBuilding database at {DB_PATH}...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''CREATE TABLE schools (
        urn INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        postcode TEXT,
        lat REAL,
        lng REAL,
        school_type TEXT,
        type_group TEXT,
        phase TEXT,
        gender TEXT,
        religious_character TEXT,
        admissions_policy TEXT,
        number_of_pupils INTEGER,
        school_capacity INTEGER,
        low_age INTEGER,
        high_age INTEGER,
        la_name TEXT,
        sixth_form TEXT,
        website TEXT,
        ofsted_rating INTEGER,
        ofsted_date TEXT,
        quality_of_education INTEGER,
        behaviour_attitudes INTEGER,
        personal_development INTEGER,
        leadership_management INTEGER,
        early_years_ofsted INTEGER,
        sixth_form_ofsted INTEGER,
        attainment8 REAL,
        progress8 REAL,
        eng_maths_5plus_pct REAL,
        fsm_pct REAL,
        eal_pct REAL
    )''')

    c.execute('CREATE INDEX idx_schools_lat ON schools(lat)')
    c.execute('CREATE INDEX idx_schools_lng ON schools(lng)')
    c.execute('CREATE INDEX idx_schools_phase ON schools(phase)')
    c.execute('CREATE INDEX idx_schools_ofsted ON schools(ofsted_rating)')

    inserted = 0
    skipped_no_location = 0

    # We'll collect details for JSON export
    markers_list = []
    details_dict = {}

    PHASE_CODE_MAP = {
        'Primary': 'P',
        'Secondary': 'S',
        'Nursery': 'N',
        '16 plus': '6',
        'All-through': 'A',
        'Middle deemed secondary': 'MS',
        'Middle deemed primary': 'MP',
        'Not applicable': 'X',
    }

    for urn_str, school in schools.items():
        if school['lat'] is None or school['lng'] is None:
            skipped_no_location += 1
            continue

        o = ofsted.get(urn_str, {})
        k = ks4.get(urn_str, {})
        d = demographics.get(urn_str, {})
        a = admissions.get(urn_str, {})

        c.execute('''INSERT INTO schools VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?
        )''', (
            school['urn'], school['name'], school['address'], school['postcode'],
            school['lat'], school['lng'], school['school_type'], school['type_group'],
            school['phase'], school['gender'], school['religious_character'],
            school['admissions_policy'], school['number_of_pupils'],
            school['school_capacity'], school['low_age'], school['high_age'],
            school['la_name'], school['sixth_form'], school['website'],
            o.get('ofsted_rating'), o.get('ofsted_date'),
            o.get('quality_of_education'), o.get('behaviour_attitudes'),
            o.get('personal_development'), o.get('leadership_management'),
            o.get('early_years'), o.get('sixth_form_ofsted'),
            k.get('attainment8'), k.get('progress8'), k.get('eng_maths_5plus_pct'),
            d.get('fsm_pct'), d.get('eal_pct'),
        ))

        # Build marker: [urn, name, lat, lng, phase_code, ofsted_rating]
        phase_code = PHASE_CODE_MAP.get(school['phase'], 'X')
        ofsted_rating = o.get('ofsted_rating') or 0
        # fsm + key ethnicity as pct*10 integers for compact filtering
        def _pv(v):
            if v is None: return 0
            return round(v * 10)
        _d = demographics.get(urn_str, {})
        _fsm = _pv(_d.get('fsm_pct'))
        _eth = [
            _pv(_d.get('white_british_pct')),
            _pv(_d.get('chinese_pct')),
            _pv(_d.get('indian_pct')),
            _pv(_d.get('pakistani_pct')),
            _pv(_d.get('bangladeshi_pct')),
            _pv(_d.get('african_pct')),
            _pv(_d.get('caribbean_pct')),
            _pv(_d.get('other_asian_pct')),
            _pv(_d.get('other_white_pct')),
            _pv(_d.get('irish_pct')),
        ]
        _rel = religion_code(school.get('religious_character', ''))
        markers_list.append([
            school['urn'], school['name'],
            round(school['lat'], 6), round(school['lng'], 6),
            phase_code, ofsted_rating,
            _fsm, *_eth, _rel
        ])

        # Build detail object
        detail = {
            'urn': school['urn'],
            'name': school['name'],
            'postcode': school['postcode'],
            'lat': school['lat'],
            'lng': school['lng'],
            'school_type': school['school_type'],
            'type_group': school['type_group'],
            'phase': school['phase'],
            'gender': school['gender'],
            'religious_character': school['religious_character'],
            'admissions_policy': school['admissions_policy'],
            'number_of_pupils': school['number_of_pupils'],
            'low_age': school['low_age'],
            'high_age': school['high_age'],
            'la_name': school['la_name'],
            'website': school['website'],
            'ofsted_rating': o.get('ofsted_rating'),
            'ofsted_date': o.get('ofsted_date'),
            'quality_of_education': o.get('quality_of_education'),
            'behaviour_attitudes': o.get('behaviour_attitudes'),
            'personal_development': o.get('personal_development'),
            'leadership_management': o.get('leadership_management'),
            'attainment8': k.get('attainment8'),
            'progress8': k.get('progress8'),
            'eng_maths_5plus_pct': k.get('eng_maths_5plus_pct'),
            'fsm_pct': d.get('fsm_pct'),
            'eal_pct': d.get('eal_pct'),
        }

        # Add all granular ethnicity
        for csv_col, json_key, label in ETHNICITY_COLS:
            detail[json_key] = d.get(json_key)

        # Add admissions data
        if a:
            detail['total_places_offered'] = a.get('total_places_offered')
            detail['total_applications'] = a.get('total_applications')
            detail['first_pref_applications'] = a.get('first_pref_applications')
            detail['first_pref_offers'] = a.get('first_pref_offers')
            detail['pct_first_pref_offered'] = a.get('pct_first_pref_offered')

        details_dict[str(school['urn'])] = detail
        inserted += 1

    conn.commit()

    # Stats
    c.execute('SELECT COUNT(*) FROM schools')
    total = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM schools WHERE ofsted_rating IS NOT NULL')
    with_ofsted = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM schools WHERE attainment8 IS NOT NULL')
    with_ks4 = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM schools WHERE fsm_pct IS NOT NULL')
    with_demo = c.fetchone()[0]

    print(f"\n✅ Database built successfully!")
    print(f"  Total schools: {total}")
    print(f"  Skipped (no location): {skipped_no_location}")
    print(f"  With Ofsted ratings: {with_ofsted}")
    print(f"  With KS4 (GCSE) data: {with_ks4}")
    print(f"  With demographics: {with_demo}")
    print(f"  With admissions data: {len(admissions)}")
    conn.close()

    # Export JSON
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    markers_path = os.path.join(PUBLIC_DIR, 'schools-markers.json')
    with open(markers_path, 'w') as f:
        json.dump(markers_list, f, separators=(',', ':'))
    print(f"  Markers JSON: {os.path.getsize(markers_path) / 1024 / 1024:.1f} MB ({len(markers_list)} schools)")

    # Compute filter ranges (p5 and p99) for percentage-based fields
    # Marker indices: FSM=6, WBI=7, CHI=8, IND=9, PAK=10, BAN=11, AFR=12, CAR=13, OAS=14, OWH=15, IRI=16
    # Values are stored as pct*10 integers, so divide by 10 for actual %
    range_fields = {
        'fsm': 6,
        'wbi': 7, 'chi': 8, 'ind': 9, 'pak': 10, 'ban': 11,
        'afr': 12, 'car': 13, 'oas': 14, 'owh': 15, 'iri': 16,
    }
    filter_ranges = {}
    for field_name, idx in range_fields.items():
        vals = [m[idx] / 10.0 for m in markers_list if m[idx] > 0]
        if vals:
            p5 = round(percentile(vals, 5), 1)
            p99 = round(percentile(vals, 99), 1)
            filter_ranges[field_name] = {'p5': p5, 'p99': p99}
        else:
            filter_ranges[field_name] = {'p5': 0, 'p99': 100}
    ranges_path = os.path.join(PUBLIC_DIR, 'filter-ranges.json')
    with open(ranges_path, 'w') as f:
        json.dump(filter_ranges, f, separators=(',', ':'))
    print(f"  Filter ranges JSON: {os.path.getsize(ranges_path)} bytes")

    details_path = os.path.join(PUBLIC_DIR, 'schools-details.json')
    with open(details_path, 'w') as f:
        json.dump(details_dict, f, separators=(',', ':'))
    print(f"  Details JSON: {os.path.getsize(details_path) / 1024 / 1024:.1f} MB")


if __name__ == '__main__':
    schools = load_gias()
    ofsted = load_ofsted()
    ks4 = load_ks4()
    demographics = load_pupil_characteristics()
    admissions = load_admissions()
    build_database(schools, ofsted, ks4, demographics, admissions)
