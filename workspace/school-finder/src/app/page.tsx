'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useRef } from 'react';
import SchoolDetail from '@/components/SchoolDetail';
import SearchBar from '@/components/SearchBar';
import type { OverlayType, FilterCondition } from '@/components/NeighbourhoodOverlay';
import { type MarkerData, type Filters, type EthnicityFilter, type FilterRanges, M, ETHNICITY_MARKER_FIELDS } from '@/lib/marker-fields';

const SchoolMap = dynamic(() => import('@/components/SchoolMap'), { ssr: false });
const ControlPanel = dynamic(() => import('@/components/ControlPanel'), { ssr: false });

export interface School {
  urn: number;
  name: string;
  postcode: string;
  lat: number;
  lng: number;
  school_type: string;
  type_group: string;
  phase: string;
  gender: string;
  religious_character: string;
  admissions_policy: string;
  number_of_pupils: number | null;
  low_age: number | null;
  high_age: number | null;
  la_name: string;
  website: string;
  ofsted_rating: number | null;
  ofsted_date: string | null;
  attainment8: number | null;
  progress8: number | null;
  eng_maths_5plus_pct: number | null;
  fsm_pct: number | null;
  eal_pct: number | null;
  quality_of_education: number | null;
  behaviour_attitudes: number | null;
  personal_development: number | null;
  leadership_management: number | null;
  white_british_pct?: number | null;
  irish_pct?: number | null;
  traveller_irish_pct?: number | null;
  gypsy_roma_pct?: number | null;
  other_white_pct?: number | null;
  indian_pct?: number | null;
  pakistani_pct?: number | null;
  bangladeshi_pct?: number | null;
  other_asian_pct?: number | null;
  caribbean_pct?: number | null;
  african_pct?: number | null;
  other_black_pct?: number | null;
  chinese_pct?: number | null;
  mixed_white_black_caribbean_pct?: number | null;
  mixed_white_black_african_pct?: number | null;
  mixed_white_asian_pct?: number | null;
  other_mixed_pct?: number | null;
  other_ethnic_pct?: number | null;
  unclassified_pct?: number | null;
  total_places_offered?: number | null;
  total_applications?: number | null;
  first_pref_applications?: number | null;
  first_pref_offers?: number | null;
  pct_first_pref_offered?: number | null;
}

export interface FlyToTarget {
  lat: number;
  lng: number;
  zoom: number;
  _ts?: number;
}

const PHASE_MAP: Record<string, string> = {
  P: 'Primary',
  S: 'Secondary',
  N: 'Nursery',
  '6': '16 plus',
  A: 'All-through',
  MS: 'Middle deemed secondary',
  MP: 'Middle deemed primary',
  X: 'Not applicable',
};

const HOME_KEY = 'schoolfinder-home';
const SAVED_KEY = 'schoolfinder-saved-searches';
const MAX_SAVED = 20;

export interface SavedSearch {
  id: string;
  name: string;
  date: string;
  showSchools: boolean;
  filters: Filters;
  overlayType: OverlayType;
  filterConditions: FilterCondition[];
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
}

function generateSearchName(
  filters: Filters,
  overlayType: OverlayType,
  filterConditions: FilterCondition[],
  showSchools: boolean,
): string {
  const parts: string[] = [];

  // School filters
  if (filters.phase !== 'All') parts.push(filters.phase);
  if (filters.ofsted.length > 0) {
    const labels: Record<number, string> = { 1: 'Outstanding', 2: 'Good', 3: 'RI', 4: 'Inadequate' };
    parts.push(filters.ofsted.map(o => labels[o] || '').filter(Boolean).join('/'));
  }
  if (filters.religion.length > 0) {
    const rLabels: Record<number, string> = { 1: 'Secular', 2: 'CofE', 3: 'Catholic', 4: 'Christian', 5: 'Muslim', 6: 'Jewish', 7: 'Sikh', 8: 'Hindu', 9: 'Other' };
    parts.push(filters.religion.map(r => rLabels[r] || '').filter(Boolean).join('/'));
  }
  if (filters.fsmMin !== null) parts.push(`FSM >${filters.fsmMin}%`);
  if (filters.fsmMax !== null) parts.push(`FSM <${filters.fsmMax}%`);
  if (filters.ethnicities.length > 0) {
    for (const ef of filters.ethnicities) {
      const field = ETHNICITY_MARKER_FIELDS.find(f => f.key === ef.fieldIndex);
      const label = field?.label || 'Ethnicity';
      if (ef.maxPct !== undefined) {
        parts.push(`${label} <${ef.maxPct}%`);
      } else {
        parts.push(`${label} >${ef.minPct}%`);
      }
    }
  }

  // Area filter conditions
  for (const cond of filterConditions) {
    parts.push(`${cond.metric} ${cond.operator}${cond.value}`);
  }

  if (!showSchools && overlayType !== 'off') parts.push(`Area: ${overlayType}`);

  if (parts.length === 0) return 'All Schools';
  // Truncate to keep it short
  const name = parts.slice(0, 4).join(', ');
  return parts.length > 4 ? name + '…' : name;
}

function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveSavedSearches(searches: SavedSearch[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(searches.slice(0, MAX_SAVED)));
  } catch {}
}

function loadHome(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(HOME_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function Home() {
  const [allMarkers, setAllMarkers] = useState<MarkerData[]>([]);
  const [filteredMarkers, setFilteredMarkers] = useState<MarkerData[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ phase: 'All', ofsted: [], fsmMin: null, fsmMax: null, ethnicities: [], religion: [] });
  const [filterRanges, setFilterRanges] = useState<FilterRanges | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [showSchools, setShowSchools] = useState(true);
  const [overlayType, setOverlayType] = useState<OverlayType>('deprivation');
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(11);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  // Load home from localStorage on mount
  useEffect(() => {
    const saved = loadHome();
    if (saved) {
      setHomeLocation(saved);
      setFlyTo({ lat: saved.lat, lng: saved.lng, zoom: 14, _ts: Date.now() });
    }
    // Load saved searches
    setSavedSearches(loadSavedSearches());
  }, []);

  // Load all markers once
  useEffect(() => {
    fetch('/schools-markers.json')
      .then(res => res.json())
      .then((data: MarkerData[]) => {
        setAllMarkers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load markers:', err);
        setLoading(false);
      });
    // Load filter ranges
    fetch('/filter-ranges.json')
      .then(res => res.json())
      .then((data: FilterRanges) => setFilterRanges(data))
      .catch(err => console.error('Failed to load filter ranges:', err));
  }, []);

  // Apply filters
  useEffect(() => {
    let result = allMarkers;
    if (filters.phase !== 'All') {
      if (filters.phase === 'Primary') {
        result = result.filter(m => m[4] === 'P' || m[4] === 'MP');
      } else if (filters.phase === 'Secondary') {
        result = result.filter(m => m[4] === 'S' || m[4] === 'MS' || m[4] === 'A');
      } else {
        const code = Object.entries(PHASE_MAP).find(([, v]) => v === filters.phase)?.[0];
        if (code) result = result.filter(m => m[4] === code);
      }
    }
    if (filters.ofsted.length > 0) {
      result = result.filter(m => filters.ofsted.includes(m[5]));
    }
    // FSM filter (marker[6] is fsm × 10)
    if (filters.fsmMin !== null) {
      const minVal = filters.fsmMin * 10;
      result = result.filter(m => m[M.FSM] > 0 && m[M.FSM] >= minVal);
    }
    if (filters.fsmMax !== null) {
      const maxVal = filters.fsmMax * 10;
      result = result.filter(m => m[M.FSM] > 0 && m[M.FSM] <= maxVal);
    }
    // Ethnicity filter (marker[fieldIndex] is pct × 10)
    if (filters.ethnicities.length > 0) {
      result = result.filter(m =>
        filters.ethnicities.every(ef => {
          const val = m[ef.fieldIndex] as number;
          if (val <= 0) return false;
          const pct = val / 10;
          if (ef.minPct > 0 && pct < ef.minPct) return false;
          if (ef.maxPct !== undefined && pct > ef.maxPct) return false;
          return true;
        })
      );
    }
    // Religion filter (marker[M.REL])
    if (filters.religion.length > 0) {
      result = result.filter(m => filters.religion.includes(m[M.REL]));
    }
    setFilteredMarkers(result);
  }, [allMarkers, filters]);

  const [detailsCache, setDetailsCache] = useState<Record<string, School> | null>(null);

  const handleSelectSchool = useCallback(async (urn: number) => {
    if (urn === 0) { setSelectedSchool(null); return; }
    try {
      let cache = detailsCache;
      if (!cache) {
        const res = await fetch('/schools-details.json');
        cache = await res.json();
        setDetailsCache(cache);
      }
      const school = cache![String(urn)];
      if (school) setSelectedSchool(school);
    } catch (err) {
      console.error('Failed to fetch school details:', err);
    }
  }, [detailsCache]);

  // ─── Saved Searches ───
  const handleSaveSearch = useCallback(() => {
    const center = mapCenter || { lat: 51.505, lng: -0.09 };
    const search: SavedSearch = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: generateSearchName(filters, overlayType, filterConditions, showSchools),
      date: new Date().toISOString(),
      showSchools,
      filters: { ...filters, ethnicities: filters.ethnicities.map(e => ({ ...e })) },
      overlayType,
      filterConditions: filterConditions.map(c => ({ ...c })),
      mapCenter: center,
      mapZoom,
    };
    const updated = [search, ...savedSearches].slice(0, MAX_SAVED);
    setSavedSearches(updated);
    saveSavedSearches(updated);
    return search;
  }, [filters, overlayType, filterConditions, showSchools, mapCenter, mapZoom, savedSearches]);

  const handleLoadSearch = useCallback((search: SavedSearch) => {
    setShowSchools(search.showSchools);
    setFilters(search.filters);
    setOverlayType(search.overlayType);
    setFilterConditions(search.filterConditions);
    setFlyTo({ lat: search.mapCenter.lat, lng: search.mapCenter.lng, zoom: search.mapZoom, _ts: Date.now() });
  }, []);

  const handleDeleteSearch = useCallback((id: string) => {
    const updated = savedSearches.filter(s => s.id !== id);
    setSavedSearches(updated);
    saveSavedSearches(updated);
  }, [savedSearches]);

  const handleRenameSearch = useCallback((id: string, newName: string) => {
    const updated = savedSearches.map(s => s.id === id ? { ...s, name: newName } : s);
    setSavedSearches(updated);
    saveSavedSearches(updated);
  }, [savedSearches]);

  const handleSetHome = useCallback(() => {
    const saveHome = (loc: { lat: number; lng: number }) => {
      setHomeLocation(loc);
      setFlyTo({ lat: loc.lat, lng: loc.lng, zoom: 14, _ts: Date.now() });
      try { localStorage.setItem(HOME_KEY, JSON.stringify(loc)); } catch {}
    };

    // Try GPS first, fall back to map center
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => saveHome({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { if (mapCenter) saveHome(mapCenter); },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else if (mapCenter) {
      saveHome(mapCenter);
    }
  }, [mapCenter]);

  const handleClearHome = useCallback(() => {
    setHomeLocation(null);
    try { localStorage.removeItem(HOME_KEY); } catch {}
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-1.5 flex items-center gap-3 z-[1000] relative">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold text-gray-800 hidden sm:block tracking-tight">SchoolFinder</h1>
        </div>

        <SearchBar
          markers={allMarkers}
          onLocationSearch={(lat, lng, zoom) => setFlyTo({ lat, lng, zoom, _ts: Date.now() })}
          onSelectSchool={(urn) => {
            const marker = allMarkers.find(m => m[0] === urn);
            if (marker) setFlyTo({ lat: marker[2], lng: marker[3], zoom: 15, _ts: Date.now() });
            handleSelectSchool(urn);
          }}
        />

        <div className="text-[11px] text-gray-400 hidden md:block tabular-nums">
          {loading ? 'Loading...' : `${filteredMarkers.length.toLocaleString()} schools`}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 relative">
        <SchoolMap
          markers={filteredMarkers}
          onSelectSchool={handleSelectSchool}
          selectedUrn={selectedSchool?.urn || null}
          flyTo={flyTo}
          showSchools={showSchools}
          overlayType={overlayType}
          filterConditions={filterConditions}
          homeLocation={homeLocation}
          onMapMove={(center, zoom) => { setMapCenter(center); setMapZoom(zoom); }}
        />

        <ControlPanel
          showSchools={showSchools}
          onToggleSchools={() => setShowSchools(s => !s)}
          filters={filters}
          onFiltersChange={setFilters}
          schoolCount={filteredMarkers.length}
          allMarkers={allMarkers}
          filterRanges={filterRanges}
          overlayType={overlayType}
          onOverlayChange={setOverlayType}
          filterConditions={filterConditions}
          onFilterConditionsChange={setFilterConditions}
          homeLocation={homeLocation}
          onSetHome={handleSetHome}
          onClearHome={handleClearHome}
          savedSearches={savedSearches}
          onSaveSearch={handleSaveSearch}
          onLoadSearch={handleLoadSearch}
          onDeleteSearch={handleDeleteSearch}
          onRenameSearch={handleRenameSearch}
        />

        {selectedSchool && (
          <SchoolDetail
            school={selectedSchool}
            onClose={() => setSelectedSchool(null)}
          />
        )}
      </div>
    </div>
  );
}
