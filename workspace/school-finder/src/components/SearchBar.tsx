'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MarkerData } from '@/lib/marker-fields';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance: number;
}

interface SearchBarProps {
  markers: MarkerData[];
  onLocationSearch: (lat: number, lng: number, zoom: number) => void;
  onSelectSchool: (urn: number) => void;
}

type Suggestion =
  | { kind: 'place'; label: string; lat: number; lng: number; zoom: number }
  | { kind: 'school'; urn: number; name: string; postcode: string };

export default function SearchBar({ markers, onLocationSearch, onSelectSchool }: SearchBarProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchNominatim = useCallback(async (query: string): Promise<Suggestion[]> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=5&q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'SchoolFinderUK/1.0' } }
      );
      const data: NominatimResult[] = await res.json();
      return data.map(r => {
        // Determine zoom based on type
        let zoom = 14;
        if (r.type === 'postcode' || r.class === 'place' && r.type === 'postcode') zoom = 15;
        else if (['city', 'town', 'borough', 'county', 'administrative'].includes(r.type)) zoom = 12;
        else if (['suburb', 'neighbourhood', 'village', 'hamlet'].includes(r.type)) zoom = 14;

        // Shorten display name
        const parts = r.display_name.split(',').map(s => s.trim());
        const label = parts.slice(0, 3).join(', ');

        return {
          kind: 'place' as const,
          label,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          zoom,
        };
      });
    } catch {
      return [];
    }
  }, []);

  const searchSchools = useCallback((query: string): Suggestion[] => {
    const q = query.toLowerCase();
    const matches: Suggestion[] = [];
    for (const m of markers) {
      if (matches.length >= 5) break;
      if (m[1].toLowerCase().includes(q)) {
        matches.push({
          kind: 'school',
          urn: m[0],
          name: m[1],
          postcode: '', // We don't have postcode in markers, but name is enough
        });
      }
    }
    return matches;
  }, [markers]);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    setLoading(true);

    // Search schools locally (instant) + places via Nominatim (async)
    const schoolResults = searchSchools(query);
    const placeResults = await searchNominatim(query);

    // Places first (area search is the primary use case), then schools
    const combined: Suggestion[] = [];
    if (placeResults.length > 0) combined.push(...placeResults.slice(0, 4));
    if (schoolResults.length > 0) combined.push(...schoolResults.slice(0, 3));

    setSuggestions(combined);
    setOpen(combined.length > 0);
    setSelectedIdx(-1);
    setLoading(false);
  }, [searchSchools, searchNominatim]);

  const handleInputChange = (val: string) => {
    setInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 400);
  };

  const handleSelect = (suggestion: Suggestion) => {
    if (suggestion.kind === 'place') {
      onLocationSearch(suggestion.lat, suggestion.lng, suggestion.zoom);
      setInput(suggestion.label);
    } else {
      onSelectSchool(suggestion.urn);
      setInput(suggestion.name);
    }
    setOpen(false);
    setSuggestions([]);
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    // If there's a selected suggestion, use it
    if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
      handleSelect(suggestions[selectedIdx]);
      return;
    }

    // Otherwise, geocode directly
    setLoading(true);
    const placeResults = await searchNominatim(input.trim());
    if (placeResults.length > 0) {
      handleSelect(placeResults[0]);
    } else {
      // Fall back to school name search - find first match and fly to it
      const schoolResults = searchSchools(input.trim());
      if (schoolResults.length > 0) {
        handleSelect(schoolResults[0]);
      }
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="flex-1 max-w-md relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Search area or school..."
        className="w-full pl-9 pr-8 py-1 bg-gray-50 rounded-full text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:bg-white transition-all border border-transparent focus:border-indigo-200"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}
      {!loading && input && (
        <button
          onClick={() => { setInput(''); setSuggestions([]); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 z-[2000] overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => {
            // Show section header when switching between place and school results
            const prevKind = i > 0 ? suggestions[i - 1].kind : null;
            const showPlaceHeader = s.kind === 'place' && i === 0;
            const showSchoolHeader = s.kind === 'school' && prevKind !== 'school';

            return (
              <div key={i}>
                {showPlaceHeader && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Locations</div>
                )}
                {showSchoolHeader && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-t border-gray-100">Schools</div>
                )}
                <button
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                    i === selectedIdx ? 'bg-indigo-50/60' : 'hover:bg-gray-50/50'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(s)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  {s.kind === 'place' ? (
                    <>
                      <span className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </span>
                      <span className="text-[13px] text-gray-700 truncate">{s.label}</span>
                    </>
                  ) : (
                    <>
                      <span className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </span>
                      <span className="text-[13px] text-gray-700 truncate">{s.name}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
