'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Filters, EthnicityFilter, FilterRanges, MarkerData } from '@/lib/marker-fields';
import { ETHNICITY_MARKER_FIELDS, M, RELIGION_LABELS } from '@/lib/marker-fields';
import type { SavedSearch } from '@/app/page';
import {
  type OverlayType,
  type FilterCondition,
  ETHNICITY_OPTIONS,
  AGE_OPTIONS,
  IMD_TITLES,
  FILTER_METRICS,
  isEthnicityOverlay,
  isAgeOverlay,
  ETH_P5,
  ETH_P95,
  AGE_P5,
  AGE_P99,
} from './NeighbourhoodOverlay';

// ─── SwipeFilterBar ───
// Single bar: red (left/min) → green (right/max)
// Drag from left edge rightward → "greater than X" (op: '>')
// Drag from right edge leftward → "less than X" (op: '<')
// When at rest (no filter), thumb is hidden

interface SwipeBarProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  value: number | null;       // null = no filter active
  direction: '>' | '<' | null; // null = no filter
  onChange: (value: number | null, direction: '>' | '<' | null) => void;
}

function SwipeFilterBar({ label, min, max, step = 0.5, unit = '%', value, direction, onChange }: SwipeBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dirRef = useRef<'>' | '<' | null>(direction);
  const [localVal, setLocalVal] = useState<number | null>(value);
  const [localDir, setLocalDir] = useState<'>' | '<' | null>(direction);
  const [isDragging, setIsDragging] = useState(false);

  // Sync external changes
  useEffect(() => {
    if (!draggingRef.current) {
      setLocalVal(value);
      setLocalDir(direction);
      dirRef.current = direction;
    }
  }, [value, direction]);

  const range = max - min;

  const getPctFromX = useCallback((clientX: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }, []);

  const valFromPct = useCallback((pct: number) => {
    const raw = min + pct * range;
    // Round to step
    return Math.round(raw / step) * step;
  }, [min, range, step]);

  const handleStart = useCallback((clientX: number) => {
    const pct = getPctFromX(clientX);
    // Determine direction: left half → '>' (greater than), right half → '<' (less than)
    // Or if already active, allow re-grab near thumb
    if (localDir && localVal !== null) {
      const thumbPct = (localVal - min) / range;
      if (Math.abs(pct - thumbPct) < 0.12) {
        // Re-grab existing thumb
        draggingRef.current = true;
        setIsDragging(true);
        return;
      }
    }
    const dir = pct < 0.5 ? '>' : '<';
    dirRef.current = dir;
    const v = valFromPct(pct);
    setLocalDir(dir);
    setLocalVal(v);
    draggingRef.current = true;
    setIsDragging(true);
  }, [getPctFromX, localDir, localVal, min, range, valFromPct]);

  const handleMove = useCallback((clientX: number) => {
    if (!draggingRef.current) return;
    const pct = getPctFromX(clientX);
    const v = valFromPct(pct);
    setLocalVal(v);
  }, [getPctFromX, valFromPct]);

  const handleEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    const dir = dirRef.current;
    // If thumb is at the extreme, clear the filter
    if (localVal !== null) {
      if ((dir === '>' && localVal <= min) || (dir === '<' && localVal >= max)) {
        setLocalVal(null);
        setLocalDir(null);
        dirRef.current = null;
        onChange(null, null);
        return;
      }
    }
    onChange(localVal, dir);
  }, [localVal, min, max, onChange]);

  // Touch events
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    handleStart(e.touches[0].clientX);
  }, [handleStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    handleMove(e.touches[0].clientX);
  }, [handleMove]);

  const onTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Mouse events
  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleMove, handleEnd]);

  const isActive = localVal !== null && localDir !== null;
  const thumbPct = isActive ? ((localVal! - min) / range) * 100 : 0;

  // Determine active/faded regions
  // '>' means "greater than X": left of thumb is faded (filtered out), right is active
  // '<' means "less than X": right of thumb is faded (filtered out), left is active
  const activeLeft = isActive && localDir === '<' ? 0 : isActive ? thumbPct : 0;
  const activeRight = isActive && localDir === '>' ? 100 : isActive ? thumbPct : 100;

  const displayVal = localVal !== null ? (step >= 1 ? Math.round(localVal) : (Math.round(localVal * 10) / 10)) : null;

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-gray-500 font-medium">{label}</span>
        {isActive && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold text-indigo-600 tabular-nums">
              {localDir === '>' ? `> ${displayVal}${unit}` : `< ${displayVal}${unit}`}
            </span>
            <button
              onClick={() => {
                setLocalVal(null);
                setLocalDir(null);
                dirRef.current = null;
                onChange(null, null);
              }}
              className="w-3.5 h-3.5 flex items-center justify-center text-gray-300 hover:text-red-400"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div
        ref={barRef}
        className="relative h-9 flex items-center cursor-pointer select-none touch-none"
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Full gradient bar: red → yellow → green */}
        <div
          className="absolute inset-x-0 h-3 rounded-full overflow-hidden"
          style={{
            background: 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)',
            opacity: 0.25,
          }}
        />
        {/* Active (bright) region */}
        {isActive && (
          <div
            className="absolute h-3 rounded-full overflow-hidden"
            style={{
              left: `${activeLeft}%`,
              width: `${activeRight - activeLeft}%`,
              background: 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)',
              backgroundSize: `${100 / ((activeRight - activeLeft) / 100)}% 100%`,
              backgroundPosition: `${-activeLeft / ((activeRight - activeLeft) / 100) * 100}% 0`,
              opacity: 0.8,
            }}
          />
        )}
        {/* Thumb */}
        {isActive && (
          <div
            className="absolute w-5 h-5 bg-white border-2 border-indigo-500 rounded-full shadow-lg pointer-events-none z-10 transition-none"
            style={{ left: `calc(${thumbPct}% - 10px)` }}
          />
        )}
        {/* Min/Max labels at edges */}
        <div className="absolute inset-x-0 -bottom-0.5 flex justify-between pointer-events-none">
          <span className="text-[8px] text-gray-300 tabular-nums">{step >= 1 ? Math.round(min) : min}</span>
          <span className="text-[8px] text-gray-300 tabular-nums">{step >= 1 ? Math.round(max) : max}</span>
        </div>
      </div>
    </div>
  );
}

// ─── MultiSelect Dropdown ───

interface MultiSelectProps {
  label: string;
  options: { value: string | number; label: string; emoji?: string; count?: number }[];
  selected: (string | number)[];
  onChange: (selected: (string | number)[]) => void;
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (val: string | number) => {
    if (selected.includes(val)) {
      onChange(selected.filter(s => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const displayText = selected.length === 0
    ? `${label}`
    : `${label} (${selected.length})`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
          selected.length > 0
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <span className="truncate">{displayText}</span>
        <svg className={`w-3 h-3 ml-1 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-left transition-colors ${
                selected.includes(opt.value)
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'hover:bg-gray-50 text-gray-600'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                selected.includes(opt.value)
                  ? 'bg-indigo-500 border-indigo-500'
                  : 'border-gray-300'
              }`}>
                {selected.includes(opt.value) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              {opt.emoji && <span className="text-[12px] w-4 text-center">{opt.emoji}</span>}
              <span className="flex-1 truncate">{opt.label}</span>
              {opt.count !== undefined && (
                <span className="text-[9px] text-gray-400 tabular-nums">{opt.count.toLocaleString()}</span>
              )}
            </button>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full px-2.5 py-1.5 text-[10px] text-red-400 hover:text-red-500 font-medium border-t border-gray-100 text-center"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Props ───

interface Props {
  // Schools
  showSchools: boolean;
  onToggleSchools: () => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  schoolCount: number;
  allMarkers: MarkerData[];
  filterRanges: FilterRanges | null;
  // Neighbourhood
  overlayType: OverlayType;
  onOverlayChange: (t: OverlayType) => void;
  filterConditions: FilterCondition[];
  onFilterConditionsChange: (c: FilterCondition[]) => void;
  // Home
  homeLocation: { lat: number; lng: number } | null;
  onSetHome: () => void;
  onClearHome: () => void;
  // Saved Searches
  savedSearches: SavedSearch[];
  onSaveSearch: () => SavedSearch;
  onLoadSearch: (search: SavedSearch) => void;
  onDeleteSearch: (id: string) => void;
  onRenameSearch: (id: string, name: string) => void;
}

const PHASE_OPTIONS = [
  { value: 'Primary', label: 'Primary' },
  { value: 'Secondary', label: 'Secondary' },
  { value: 'Nursery', label: 'Nursery' },
  { value: '16 plus', label: '16 Plus' },
  { value: 'All-through', label: 'All-through' },
];

const OFSTED_OPTIONS = [
  { value: 1, label: 'Outstanding', color: 'bg-emerald-500' },
  { value: 2, label: 'Good', color: 'bg-blue-500' },
  { value: 3, label: 'Requires Improvement', color: 'bg-amber-500' },
  { value: 4, label: 'Inadequate', color: 'bg-red-500' },
];

const IMD_OPTIONS: { value: OverlayType; label: string; icon: string }[] = [
  { value: 'deprivation', label: 'Deprivation', icon: '📊' },
  { value: 'income', label: 'Income', icon: '💰' },
  { value: 'education', label: 'Education', icon: '🎓' },
  { value: 'crime', label: 'Crime', icon: '🔒' },
  { value: 'health', label: 'Health', icon: '🏥' },
  { value: 'housing', label: 'Housing', icon: '🏠' },
  { value: 'environment', label: 'Environment', icon: '🌳' },
];

const GROUPS = ['Deprivation', 'Ethnicity', 'Age'] as const;

// ─── Saved Search Panel ───
function SavedSearchPanel({
  searches, onLoad, onDelete, onRename, onSave, hasFilters,
}: {
  searches: SavedSearch[];
  onLoad: (s: SavedSearch) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onSave: () => SavedSearch;
  hasFilters: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);

  const startEdit = (s: SavedSearch) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const getSummary = (s: SavedSearch): string => {
    const parts: string[] = [];
    if (s.showSchools) parts.push('Schools ON');
    if (s.overlayType !== 'off') parts.push(`Overlay: ${s.overlayType}`);
    if (s.filterConditions.length > 0) parts.push(`${s.filterConditions.length} area filter${s.filterConditions.length > 1 ? 's' : ''}`);
    return parts.join(' · ') || 'No filters';
  };

  return (
    <div className="bg-white/93 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 overflow-hidden w-72 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100">
        <span className="text-[12px] font-semibold text-gray-600">Saved Searches</span>
        <span className="text-[10px] text-gray-400">{searches.length}/20</span>
      </div>

      {/* Save current button */}
      {hasFilters && (
        <div className="px-3 py-2 border-b border-gray-50">
          <button
            onClick={() => onSave()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-400 text-white hover:bg-amber-500 active:scale-95 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Save current search
          </button>
        </div>
      )}

      {/* List */}
      {searches.length === 0 ? (
        <div className="px-3 py-6 text-center text-[11px] text-gray-400">
          <p className="mb-1">No saved searches yet</p>
          <p className="text-[10px] text-gray-300">Apply some filters, then tap 💾</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {searches.map(s => (
            <div
              key={s.id}
              className="relative overflow-hidden"
              onTouchStart={(e) => { setTouchStartX(e.touches[0].clientX); }}
              onTouchEnd={(e) => {
                if (touchStartX !== null) {
                  const diff = touchStartX - e.changedTouches[0].clientX;
                  if (diff > 60) setSwipedId(swipedId === s.id ? null : s.id);
                  else if (diff < -60) setSwipedId(null);
                  setTouchStartX(null);
                }
              }}
            >
              <div
                className={`flex items-start gap-2 px-3 py-2 transition-transform ${swipedId === s.id ? '-translate-x-16' : ''}`}
              >
                {/* Main content - tap to load */}
                <button
                  onClick={() => {
                    if (editingId) return;
                    onLoad(s);
                  }}
                  className="flex-1 text-left min-w-0 active:bg-gray-50 rounded transition-colors"
                >
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                      className="w-full text-[12px] font-medium text-gray-800 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="text-[12px] font-medium text-gray-800 truncate">{s.name}</div>
                  )}
                  <div className="text-[9px] text-gray-400 mt-0.5">{getSummary(s)}</div>
                </button>

                {/* Date + actions */}
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-[9px] text-gray-300 tabular-nums">{formatDate(s.date)}</span>
                  <div className="flex gap-1">
                    {/* Rename button */}
                    <button
                      onClick={() => startEdit(s)}
                      className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-indigo-400 rounded"
                      title="Rename"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => {
                        if (confirmDeleteId === s.id) {
                          onDelete(s.id);
                          setConfirmDeleteId(null);
                        } else {
                          setConfirmDeleteId(s.id);
                          setTimeout(() => setConfirmDeleteId(null), 3000);
                        }
                      }}
                      className={`w-5 h-5 flex items-center justify-center rounded ${
                        confirmDeleteId === s.id
                          ? 'text-red-500 bg-red-50'
                          : 'text-gray-300 hover:text-red-400'
                      }`}
                      title={confirmDeleteId === s.id ? 'Tap again to confirm' : 'Delete'}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Swipe-to-reveal delete (mobile) */}
              {swipedId === s.id && (
                <button
                  onClick={() => { onDelete(s.id); setSwipedId(null); }}
                  className="absolute right-0 top-0 bottom-0 w-16 bg-red-500 text-white flex items-center justify-center text-[10px] font-medium"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Tab = 'schools' | 'neighbourhood' | 'saved' | null;

export default function ControlPanel({
  showSchools, onToggleSchools, filters, onFiltersChange, schoolCount,
  allMarkers, filterRanges,
  overlayType, onOverlayChange, filterConditions, onFilterConditionsChange,
  homeLocation, onSetHome, onClearHome,
  savedSearches, onSaveSearch, onLoadSearch, onDeleteSearch, onRenameSearch,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(null);
  const [ethOpen, setEthOpen] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);

  const toggleTab = (tab: Tab) => setActiveTab(prev => prev === tab ? null : tab);

  const overlayActive = overlayType !== 'off';
  const isEth = isEthnicityOverlay(overlayType);
  const isAge = isAgeOverlay(overlayType);
  const lastOverlayRef = useState<OverlayType>('deprivation');

  const toggleOverlay = () => {
    if (overlayActive) {
      lastOverlayRef[1](overlayType);
      onOverlayChange('off');
    } else {
      onOverlayChange(lastOverlayRef[0]);
    }
  };

  const toggleOfsted = (rating: number) => {
    const current = filters.ofsted;
    const next = current.includes(rating)
      ? current.filter(r => r !== rating)
      : [...current, rating];
    onFiltersChange({ ...filters, ofsted: next });
  };

  // Count schools per religion from allMarkers
  const religionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const m of allMarkers) {
      const rel = m[M.REL] ?? 0;
      counts[rel] = (counts[rel] || 0) + 1;
    }
    return counts;
  }, [allMarkers]);

  // ─── School filter swipe bar state ───
  // FSM: single swipe bar
  const [fsmSwipeVal, setFsmSwipeVal] = useState<number | null>(null);
  const [fsmSwipeDir, setFsmSwipeDir] = useState<'>' | '<' | null>(null);

  // Ethnicity: per-ethnicity swipe bar
  const [ethSwipeVals, setEthSwipeVals] = useState<Record<number, { val: number | null; dir: '>' | '<' | null }>>({});

  const handleFsmSwipe = useCallback((val: number | null, dir: '>' | '<' | null) => {
    setFsmSwipeVal(val);
    setFsmSwipeDir(dir);
    if (val === null || dir === null) {
      onFiltersChange({ ...filters, fsmMin: null, fsmMax: null });
    } else if (dir === '>') {
      onFiltersChange({ ...filters, fsmMin: val, fsmMax: null });
    } else {
      onFiltersChange({ ...filters, fsmMin: null, fsmMax: val });
    }
  }, [filters, onFiltersChange]);

  const handleEthSwipe = useCallback((fieldIndex: number, val: number | null, dir: '>' | '<' | null) => {
    setEthSwipeVals(prev => ({ ...prev, [fieldIndex]: { val, dir } }));
    // Update filters.ethnicities
    const existing = filters.ethnicities.filter(ef => ef.fieldIndex !== fieldIndex);
    if (val !== null && dir !== null) {
      if (dir === '>') {
        existing.push({ fieldIndex, minPct: val });
      } else {
        existing.push({ fieldIndex, minPct: 0, maxPct: val });
      }
    }
    onFiltersChange({ ...filters, ethnicities: existing });
  }, [filters, onFiltersChange]);

  // ─── Neighbourhood area filter swipe bar state ───
  const [areaSwipeVals, setAreaSwipeVals] = useState<Record<number, { val: number | null; dir: '>' | '<' | null }>>({});

  const handleAreaSwipe = useCallback((idx: number, val: number | null, dir: '>' | '<' | null) => {
    setAreaSwipeVals(prev => ({ ...prev, [idx]: { val, dir } }));
    const next = [...filterConditions];
    if (val !== null && dir !== null) {
      next[idx] = { ...next[idx], operator: dir, value: val };
      onFilterConditionsChange(next);
    }
  }, [filterConditions, onFilterConditionsChange]);

  const addAreaCondition = useCallback(() => {
    onFilterConditionsChange([...filterConditions, { metric: 'deprivation', operator: '>', value: 5 }]);
    setAreaSwipeVals(prev => ({ ...prev, [filterConditions.length]: { val: 5, dir: '>' } }));
  }, [filterConditions, onFilterConditionsChange]);

  const removeAreaCondition = useCallback((idx: number) => {
    onFilterConditionsChange(filterConditions.filter((_, i) => i !== idx));
    setAreaSwipeVals(prev => {
      const next: Record<number, { val: number | null; dir: '>' | '<' | null }> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
  }, [filterConditions, onFilterConditionsChange]);

  const updateAreaMetric = useCallback((idx: number, metric: string) => {
    const next = [...filterConditions];
    next[idx] = { ...next[idx], metric };
    onFilterConditionsChange(next);
  }, [filterConditions, onFilterConditionsChange]);

  // Get range for a metric
  const getRange = (key: string): { p5: number; p99: number } => {
    // School filter ranges
    if (filterRanges && filterRanges[key]) return filterRanges[key];
    // Neighbourhood ethnicity
    if (ETH_P5[key] !== undefined) return { p5: ETH_P5[key], p99: ETH_P95[key] };
    // Neighbourhood age
    if (AGE_P5[key] !== undefined) return { p5: AGE_P5[key], p99: AGE_P99[key] };
    // Deprivation domains: decile 1-10
    if (['deprivation', 'income', 'education', 'crime', 'health', 'housing', 'environment'].includes(key)) {
      return { p5: 1, p99: 10 };
    }
    return { p5: 0, p99: 100 };
  };

  const fsmRange = getRange('fsm');

  const schoolFilterActive = filters.phase !== 'All' || filters.ofsted.length > 0 || fsmSwipeVal !== null || filters.ethnicities.length > 0 || filters.religion.length > 0;
  const areaFilterActive = filterConditions.length > 0;

  // Religion options for MultiSelect
  const religionOptions = useMemo(() =>
    RELIGION_LABELS.filter(r => (religionCounts[r.code] || 0) > 0 || r.code <= 1).map(r => ({
      value: r.code,
      label: r.label,
      emoji: r.emoji,
      count: religionCounts[r.code] || 0,
    })),
    [religionCounts]
  );

  // Phase handling: convert between 'All'/multi-select model
  const phaseSelected = filters.phase === 'All' ? [] : [filters.phase];

  return (
    <div className="absolute top-2 left-2 z-[800] flex flex-col gap-1.5" style={{ maxWidth: 'calc(100vw - 60px)' }}>
      {/* Tab buttons row */}
      <div className="flex gap-1.5">
        <button
          onClick={() => toggleTab('schools')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium shadow-sm transition-all active:scale-95 ${
            activeTab === 'schools'
              ? 'bg-indigo-500 text-white'
              : showSchools
                ? 'bg-white/90 backdrop-blur text-gray-700 hover:bg-white'
                : 'bg-gray-400/80 backdrop-blur text-white'
          }`}
        >
          🏫 Schools
          {schoolFilterActive && (
            <span className="w-4 h-4 bg-amber-400 text-white rounded-full text-[9px] flex items-center justify-center font-bold">!</span>
          )}
        </button>

        <button
          onClick={() => toggleTab('neighbourhood')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium shadow-sm transition-all active:scale-95 ${
            activeTab === 'neighbourhood'
              ? 'bg-indigo-500 text-white'
              : overlayActive
                ? 'bg-white/90 backdrop-blur text-gray-700 hover:bg-white'
                : 'bg-gray-400/80 backdrop-blur text-white'
          }`}
        >
          🏘️ Area
          {areaFilterActive && (
            <span className="w-4 h-4 bg-amber-400 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
              {filterConditions.length}
            </span>
          )}
        </button>

        {/* Home button */}
        <button
          onClick={() => {
            if (homeLocation) {
              if (window.confirm('Clear home location?')) onClearHome();
            } else {
              onSetHome();
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium shadow-sm transition-all active:scale-95 ${
            homeLocation
              ? 'bg-emerald-500/90 backdrop-blur text-white'
              : 'bg-white/90 backdrop-blur text-gray-600 hover:bg-white border border-gray-200'
          }`}
          title={homeLocation ? 'Tap to clear home location' : 'Set current location as home'}
        >
          {homeLocation ? '🏠 Home ✓' : '📍 Set Home'}
        </button>

        {/* Saved searches button */}
        <button
          onClick={() => toggleTab('saved')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium shadow-sm transition-all active:scale-95 ${
            activeTab === 'saved'
              ? 'bg-indigo-500 text-white'
              : 'bg-white/90 backdrop-blur text-gray-600 hover:bg-white border border-gray-200'
          }`}
        >
          📋
          {savedSearches.length > 0 && (
            <span className="w-4 h-4 bg-indigo-400 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
              {savedSearches.length}
            </span>
          )}
        </button>
      </div>

      {/* Save current search - floating button (visible when any filter active) */}
      {(schoolFilterActive || areaFilterActive) && activeTab !== 'saved' && (
        <button
          onClick={() => {
            const s = onSaveSearch();
            setActiveTab('saved');
          }}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-amber-400/90 backdrop-blur text-white shadow-sm transition-all active:scale-95 hover:bg-amber-500"
        >
          💾 Save Search
        </button>
      )}

      {/* Schools panel */}
      {activeTab === 'schools' && (
        <div className="bg-white/93 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 overflow-hidden w-72 max-h-[80vh] overflow-y-auto">
          {/* Toggle */}
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100">
            <span className="text-[12px] font-semibold text-gray-600">Show Schools</span>
            <button
              onClick={onToggleSchools}
              className={`relative w-10 h-5 rounded-full transition-colors ${showSchools ? 'bg-indigo-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showSchools ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* School count */}
          <div className="px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-50">
            {schoolCount.toLocaleString()} schools loaded
          </div>

          {/* Phase — MultiSelect dropdown */}
          <div className="px-3 pt-2 pb-1.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Phase</div>
            <MultiSelect
              label="School Phase"
              options={PHASE_OPTIONS.map(p => ({ value: p.value, label: p.label }))}
              selected={phaseSelected}
              onChange={(sel) => {
                if (sel.length === 0) {
                  onFiltersChange({ ...filters, phase: 'All' });
                } else {
                  // Take the last selected value
                  onFiltersChange({ ...filters, phase: sel[sel.length - 1] as string });
                }
              }}
            />
          </div>

          {/* Ofsted */}
          <div className="px-3 pt-1 pb-2">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ofsted</div>
            <div className="space-y-0.5">
              {OFSTED_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleOfsted(opt.value)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    filters.ofsted.includes(opt.value) ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${opt.color}`} />
                  <span>{opt.label}</span>
                  {filters.ofsted.includes(opt.value) && (
                    <svg className="w-3 h-3 ml-auto text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Religion — MultiSelect dropdown */}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Religion</div>
            <MultiSelect
              label="Religion"
              options={religionOptions}
              selected={filters.religion}
              onChange={(sel) => onFiltersChange({ ...filters, religion: sel as number[] })}
            />
          </div>

          {/* FSM — Swipe bar */}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Free School Meals</div>
            <SwipeFilterBar
              label="FSM %"
              min={fsmRange.p5}
              max={fsmRange.p99}
              step={1}
              value={fsmSwipeVal}
              direction={fsmSwipeDir}
              onChange={handleFsmSwipe}
            />
          </div>

          {/* Ethnicity — swipe bars */}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ethnicity</div>
            {filters.ethnicities.map((ef, idx) => {
              const field = ETHNICITY_MARKER_FIELDS.find(f => f.key === ef.fieldIndex);
              const range = getRange(field?.short || 'chi');
              const swipe = ethSwipeVals[ef.fieldIndex] || { val: ef.minPct, dir: '>' as const };
              return (
                <div key={idx} className="mb-2 bg-gray-50/80 rounded-lg p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <select
                      value={ef.fieldIndex}
                      onChange={(e) => {
                        const next = [...filters.ethnicities];
                        next[idx] = { ...next[idx], fieldIndex: Number(e.target.value) };
                        onFiltersChange({ ...filters, ethnicities: next });
                      }}
                      className="flex-1 text-[11px] bg-white border border-gray-200 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    >
                      {ETHNICITY_MARKER_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const next = filters.ethnicities.filter((_, i) => i !== idx);
                        onFiltersChange({ ...filters, ethnicities: next });
                        setEthSwipeVals(prev => {
                          const n = { ...prev };
                          delete n[ef.fieldIndex];
                          return n;
                        });
                      }}
                      className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <SwipeFilterBar
                    label={field?.label || 'Ethnicity'}
                    min={range.p5}
                    max={range.p99}
                    step={0.5}
                    value={swipe.val}
                    direction={swipe.dir}
                    onChange={(val, dir) => handleEthSwipe(ef.fieldIndex, val, dir)}
                  />
                </div>
              );
            })}
            <button
              onClick={() => {
                onFiltersChange({
                  ...filters,
                  ethnicities: [...filters.ethnicities, { fieldIndex: M.CHI, minPct: 5 }],
                });
                setEthSwipeVals(prev => ({ ...prev, [M.CHI]: { val: 5, dir: '>' } }));
              }}
              className="w-full py-1 text-[10px] font-medium text-indigo-500 hover:bg-indigo-50/50 rounded-lg border border-dashed border-indigo-200 transition-colors flex items-center justify-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add ethnicity filter
            </button>
          </div>

          {/* Clear all */}
          {schoolFilterActive && (
            <div className="px-3 py-1.5 border-t border-gray-100">
              <button
                onClick={() => {
                  onFiltersChange({ phase: 'All', ofsted: [], fsmMin: null, fsmMax: null, ethnicities: [], religion: [] });
                  setFsmSwipeVal(null);
                  setFsmSwipeDir(null);
                  setEthSwipeVals({});
                }}
                className="text-[10px] text-red-400 hover:text-red-500 font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Neighbourhood panel */}
      {activeTab === 'neighbourhood' && (
        <div className="bg-white/93 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 overflow-hidden w-72 max-h-[80vh] overflow-y-auto">
          {/* Toggle */}
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100">
            <span className="text-[12px] font-semibold text-gray-600">Show Overlay</span>
            <button
              onClick={toggleOverlay}
              className={`relative w-10 h-5 rounded-full transition-colors ${overlayActive ? 'bg-indigo-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${overlayActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Layer picker */}
          <div className="max-h-[50vh] overflow-y-auto">
            {/* IMD */}
            <div className="px-3 pt-2 pb-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Deprivation</div>
              {IMD_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => onOverlayChange(opt.value)}
                  className={`w-full text-left px-2 py-1 text-[12px] flex items-center gap-2 rounded-md transition-colors ${
                    overlayType === opt.value ? 'bg-indigo-50 text-indigo-600 font-medium' : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  <span className="w-4 text-center text-[11px]">{opt.icon}</span>
                  <span>{opt.label}</span>
                  {overlayType === opt.value && <svg className="w-3 h-3 ml-auto text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </button>
              ))}
            </div>

            {/* Ethnicity */}
            <div className="border-t border-gray-100 px-3 pt-1.5 pb-1">
              <button
                onClick={() => setEthOpen(!ethOpen)}
                className={`w-full text-left px-2 py-1 text-[12px] flex items-center gap-2 rounded-md transition-colors ${
                  isEth ? 'bg-indigo-50 text-indigo-600 font-medium' : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <span className="w-4 text-center text-[11px]">👥</span>
                <span>Ethnicity</span>
                <svg className={`w-3 h-3 ml-auto text-gray-400 transition-transform ${ethOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {ethOpen && (
                <div className="max-h-40 overflow-y-auto ml-2">
                  {ETHNICITY_OPTIONS.map(({ key, label }) => (
                    <button key={key}
                      onClick={() => onOverlayChange(key)}
                      className={`w-full text-left pl-6 pr-2 py-0.5 text-[11px] flex items-center gap-1 rounded transition-colors ${
                        overlayType === key ? 'bg-indigo-50 text-indigo-600 font-medium' : 'hover:bg-gray-50 text-gray-500'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      {overlayType === key && <svg className="w-3 h-3 ml-auto text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Age */}
            <div className="border-t border-gray-100 px-3 pt-1.5 pb-1">
              <button
                onClick={() => setAgeOpen(!ageOpen)}
                className={`w-full text-left px-2 py-1 text-[12px] flex items-center gap-2 rounded-md transition-colors ${
                  isAge ? 'bg-indigo-50 text-indigo-600 font-medium' : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <span className="w-4 text-center text-[11px]">🎂</span>
                <span>Age</span>
                <svg className={`w-3 h-3 ml-auto text-gray-400 transition-transform ${ageOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {ageOpen && (
                <div className="max-h-40 overflow-y-auto ml-2">
                  {AGE_OPTIONS.map(({ key, label }) => (
                    <button key={key}
                      onClick={() => onOverlayChange(key)}
                      className={`w-full text-left pl-6 pr-2 py-0.5 text-[11px] flex items-center gap-1 rounded transition-colors ${
                        overlayType === key ? 'bg-indigo-50 text-indigo-600 font-medium' : 'hover:bg-gray-50 text-gray-500'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      {overlayType === key && <svg className="w-3 h-3 ml-auto text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Combined area filter — with swipe bars */}
            <div className="border-t border-gray-100 px-3 pt-2 pb-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Area Filter</div>
                {areaFilterActive && (
                  <button
                    onClick={() => {
                      setAreaSwipeVals({});
                      onFilterConditionsChange([]);
                    }}
                    className="text-[10px] text-red-400 hover:text-red-500 font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>

              {filterConditions.map((cond, idx) => {
                const metricInfo = FILTER_METRICS.find(m => m.key === cond.metric);
                const range = getRange(cond.metric);
                const isDecile = metricInfo?.unit === 'decile';
                const swipe = areaSwipeVals[idx] || { val: cond.value, dir: cond.operator as '>' | '<' };

                return (
                  <div key={idx} className="bg-gray-50/80 rounded-lg p-2 mb-1.5">
                    {idx > 0 && <div className="text-[9px] font-semibold text-amber-500 uppercase text-center mb-1">AND</div>}
                    <div className="flex items-center gap-1 mb-1">
                      <select
                        value={cond.metric}
                        onChange={(e) => updateAreaMetric(idx, e.target.value)}
                        className="flex-1 text-[11px] bg-white border border-gray-200 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      >
                        {GROUPS.map(group => (
                          <optgroup key={group} label={group}>
                            {FILTER_METRICS.filter(m => m.group === group).map(m => (
                              <option key={m.key} value={m.key}>{m.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <button onClick={() => removeAreaCondition(idx)} className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 rounded" title="Remove">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <SwipeFilterBar
                      label={metricInfo?.label || cond.metric}
                      min={isDecile ? 1 : range.p5}
                      max={isDecile ? 10 : range.p99}
                      step={isDecile ? 1 : 0.5}
                      unit={isDecile ? '' : '%'}
                      value={swipe.val}
                      direction={swipe.dir}
                      onChange={(val, dir) => handleAreaSwipe(idx, val, dir)}
                    />
                  </div>
                );
              })}

              <button
                onClick={addAreaCondition}
                className="w-full py-1 text-[10px] font-medium text-indigo-500 hover:bg-indigo-50/50 rounded-lg border border-dashed border-indigo-200 transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add condition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved searches panel */}
      {activeTab === 'saved' && (
        <SavedSearchPanel
          searches={savedSearches}
          onLoad={(s) => { onLoadSearch(s); setActiveTab(null); }}
          onDelete={onDeleteSearch}
          onRename={onRenameSearch}
          onSave={onSaveSearch}
          hasFilters={schoolFilterActive || areaFilterActive}
        />
      )}
    </div>
  );
}
