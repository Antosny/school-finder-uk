'use client';

import { useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';

// ─── Ethnicity types ───

export type EthnicityKey =
  | 'wbi' | 'wir' | 'wro' | 'wot'
  | 'ind' | 'pak' | 'ban' | 'chi' | 'oas'
  | 'baf' | 'bca' | 'bot'
  | 'mwc' | 'mwa' | 'mwas' | 'mot'
  | 'ara' | 'oet';

export const ETHNICITY_OPTIONS: { key: EthnicityKey; label: string }[] = [
  { key: 'wbi', label: 'White British' },
  { key: 'wir', label: 'White Irish' },
  { key: 'wro', label: 'Roma' },
  { key: 'wot', label: 'Other White' },
  { key: 'ind', label: 'Indian' },
  { key: 'pak', label: 'Pakistani' },
  { key: 'ban', label: 'Bangladeshi' },
  { key: 'chi', label: 'Chinese' },
  { key: 'oas', label: 'Other Asian' },
  { key: 'baf', label: 'Black African' },
  { key: 'bca', label: 'Black Caribbean' },
  { key: 'bot', label: 'Other Black' },
  { key: 'mwc', label: 'Mixed White & Black Caribbean' },
  { key: 'mwa', label: 'Mixed White & Black African' },
  { key: 'mwas', label: 'Mixed White & Asian' },
  { key: 'mot', label: 'Other Mixed' },
  { key: 'ara', label: 'Arab' },
  { key: 'oet', label: 'Other Ethnic Group' },
];

const ETH_KEY_SET = new Set<string>(ETHNICITY_OPTIONS.map(o => o.key));

// ─── Age band types ───

export type AgeKey = 'a04' | 'a511' | 'a1217' | 'a1824' | 'a2534' | 'a3544' | 'a4559' | 'a6074' | 'a75p';

export const AGE_OPTIONS: { key: AgeKey; label: string }[] = [
  { key: 'a04',   label: '0–4 (Babies & Toddlers)' },
  { key: 'a511',  label: '5–11 (Children)' },
  { key: 'a1217', label: '12–17 (Teenagers)' },
  { key: 'a1824', label: '18–24 (Young Adults)' },
  { key: 'a2534', label: '25–34 (Young Professionals)' },
  { key: 'a3544', label: '35–44 (Young Families)' },
  { key: 'a4559', label: '45–59 (Middle Aged)' },
  { key: 'a6074', label: '60–74 (Pre-retirement)' },
  { key: 'a75p',  label: '75+ (Elderly)' },
];

const AGE_KEY_SET = new Set<string>(AGE_OPTIONS.map(o => o.key));

export type OverlayType = 'off' | 'deprivation' | 'income' | 'education' | 'crime' | 'health' | 'housing' | 'environment' | EthnicityKey | AgeKey;

export function isEthnicityOverlay(t: OverlayType): t is EthnicityKey {
  return ETH_KEY_SET.has(t);
}

export function isAgeOverlay(t: OverlayType): t is AgeKey {
  return AGE_KEY_SET.has(t);
}

export function getEthnicityLabel(key: EthnicityKey): string {
  return ETHNICITY_OPTIONS.find(o => o.key === key)?.label ?? key;
}

export function getAgeLabel(key: AgeKey): string {
  return AGE_OPTIONS.find(o => o.key === key)?.label ?? key;
}

// ─── Unified color scale (indigo gradient, 10 steps) ───

export const CHOROPLETH_COLORS = [
  '#1a7a3a', '#3a9a52', '#6ab878', '#a0d4a0', '#dceedd',
  '#f0d0c8', '#d89080', '#c06048', '#a83830', '#841a1a',
];

// Per-ethnicity p5 (floor) and p99 (ceiling)
const ETH_P5: Record<string, number> = {
  'wbi': 20.5, 'wir': 0.1, 'wro': 0, 'wot': 0.8,
  'ind': 0, 'pak': 0, 'ban': 0, 'chi': 0, 'oas': 0.1,
  'bca': 0, 'baf': 0, 'bot': 0, 'mwc': 0.1, 'mwa': 0,
  'mwas': 0.1, 'mot': 0.1, 'ara': 0, 'oet': 0.1,
};
const ETH_P95: Record<string, number> = {
  'wbi': 97.8, 'wir': 3.9, 'wro': 1.4, 'wot': 27.3,
  'ind': 34.8, 'pak': 42.4, 'ban': 18.9, 'chi': 5.9, 'oas': 11.2,
  'bca': 11.0, 'baf': 21.8, 'bot': 4.5, 'mwc': 4.1, 'mwa': 1.9,
  'mwas': 2.8, 'mot': 3.3, 'ara': 5.9, 'oet': 9.8,
};

// Per-age-band p5 (floor) and p99 (ceiling)
const AGE_P5: Record<string, number> = {
  'a04': 2.8, 'a511': 4.8, 'a1217': 4.3, 'a1824': 4.8,
  'a2534': 6.6, 'a3544': 8.5, 'a4559': 14.5, 'a6074': 7.0, 'a75p': 2.4,
};
const AGE_P99: Record<string, number> = {
  'a04': 10.7, 'a511': 14.2, 'a1217': 12.9, 'a1824': 33.9,
  'a2534': 33.5, 'a3544': 21.1, 'a4559': 27.0, 'a6074': 29.6, 'a75p': 22.4,
};

// Unified floor/ceiling lookup
function getPctFloor(key: string): number {
  return ETH_P5[key] ?? AGE_P5[key] ?? 0;
}
function getPctCeil(key: string): number {
  return ETH_P95[key] ?? AGE_P99[key] ?? 10;
}

function getPctColor(pct: number, overlayKey?: string): string {
  const floor = overlayKey ? getPctFloor(overlayKey) : 0;
  const ceil = overlayKey ? getPctCeil(overlayKey) : 10;
  if (pct <= floor) return CHOROPLETH_COLORS[0];
  if (ceil <= floor) return CHOROPLETH_COLORS[0];
  const ratio = Math.min((pct - floor) / (ceil - floor), 1);
  const idx = Math.min(9, Math.floor(ratio * 9.99));
  return CHOROPLETH_COLORS[idx];
}

// Decile color: decile 1 (most deprived) = darkest, decile 10 = lightest
function getDecileColor(decile: number): string {
  const d = Math.max(1, Math.min(10, Math.round(decile)));
  // invert: decile 1 → idx 9 (darkest), decile 10 → idx 0 (lightest)
  return CHOROPLETH_COLORS[10 - d];
}

export const IMD_TITLES: Record<string, string> = {
  deprivation: 'Overall Deprivation',
  income: 'Income Deprivation',
  education: 'Education',
  crime: 'Crime',
  health: 'Health',
  housing: 'Housing Barriers',
  environment: 'Living Environment',
};

// ─── Feature properties ───

export interface FeatureProps {
  c: string;
  n: string;
  d: number;
  s?: number;
  r?: number;
  id: number;
  ed: number;
  hd: number;
  cd: number;
  bd: number;
  ld: number;
  p?: number;
  count?: number;
  pop?: number;
  [key: string]: string | number | undefined;
}

function getDecileForType(props: FeatureProps, t: OverlayType): number {
  switch (t) {
    case 'deprivation': return props.d;
    case 'income': return props.id;
    case 'education': return props.ed;
    case 'crime': return props.cd;
    case 'health': return props.hd;
    case 'housing': return props.bd;
    case 'environment': return props.ld;
    default: return props.d;
  }
}

function getFeatureColor(props: FeatureProps, t: OverlayType): string {
  if (isEthnicityOverlay(t) || isAgeOverlay(t)) {
    return getPctColor((props[t] as number) ?? 0, t);
  }
  return getDecileColor(getDecileForType(props, t));
}

// ─── Popup builders ───

function buildEthBreakdown(props: FeatureProps, highlight?: EthnicityKey): string {
  const entries: { key: EthnicityKey; label: string; pct: number }[] = [];
  for (const { key, label } of ETHNICITY_OPTIONS) {
    const pct = (props[key] as number) ?? 0;
    if (pct <= 0) continue;
    entries.push({ key, label, pct });
  }
  entries.sort((a, b) => b.pct - a.pct);
  if (entries.length === 0) return '<div style="color:#999;">No data</div>';
  return entries.map(e => {
    const bold = e.key === highlight;
    return `<div style="display:flex;justify-content:space-between;gap:8px;${bold ? 'font-weight:600;color:#5b21b6;' : ''}"><span>${e.label}</span><span>${e.pct}%</span></div>`;
  }).join('');
}

function buildAgeBreakdown(props: FeatureProps, highlight?: AgeKey): string {
  const entries: { key: AgeKey; label: string; pct: number }[] = [];
  for (const { key, label } of AGE_OPTIONS) {
    const pct = (props[key] as number) ?? 0;
    entries.push({ key, label, pct });
  }
  if (entries.every(e => e.pct === 0)) return '<div style="color:#999;">No data</div>';
  return entries.map(e => {
    const bold = e.key === highlight;
    return `<div style="display:flex;justify-content:space-between;gap:8px;${bold ? 'font-weight:600;color:#5b21b6;' : ''}"><span>${e.label}</span><span>${e.pct}%</span></div>`;
  }).join('');
}

function buildFullPopup(props: FeatureProps, t: OverlayType, isLAD: boolean): string {
  const pop = isLAD ? (props.pop ?? 0) : (props.p ?? 0);
  const fmtD = (v: number) => isLAD ? `${Math.round(v * 10) / 10}` : `${Math.round(v)}`;

  const domains: { key: string; label: string; val: number }[] = [
    { key: 'deprivation', label: 'Deprivation', val: props.d },
    { key: 'income', label: 'Income', val: props.id },
    { key: 'education', label: 'Education', val: props.ed },
    { key: 'health', label: 'Health', val: props.hd },
    { key: 'crime', label: 'Crime', val: props.cd },
    { key: 'housing', label: 'Housing', val: props.bd },
    { key: 'environment', label: 'Environment', val: props.ld },
  ];

  const domainRows = domains.map(d => {
    const active = d.key === t;
    return `<div style="display:flex;align-items:center;gap:6px;padding:1px 0;${active ? 'font-weight:600;' : ''}">
      <div style="width:10px;height:10px;border-radius:2px;background:${getDecileColor(d.val)};flex-shrink:0;"></div>
      <span style="flex:1;font-size:11px;">${d.label}</span>
      <span style="font-size:11px;">${fmtD(d.val)}/10</span>
    </div>`;
  }).join('');

  const ethHighlight = isEthnicityOverlay(t) ? t : undefined;
  const ageHighlight = isAgeOverlay(t) ? t : undefined;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.5;min-width:210px;max-width:260px;max-height:420px;overflow-y:auto;">
      <div style="font-size:13px;font-weight:600;color:#1f2937;">${props.n}</div>
      <div style="color:#9ca3af;font-size:10px;margin-top:1px;">${props.c}${isLAD ? ` · ${props.count} LSOAs` : ''} · Pop ${pop.toLocaleString()}</div>
      ${!isLAD && props.s ? `<div style="font-size:10px;color:#9ca3af;">IMD ${props.s} · Rank ${(props.r ?? 0).toLocaleString()}/33,755</div>` : ''}
      <div style="border-top:1px solid #f3f4f6;margin:6px 0;"></div>
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Deprivation${isLAD ? ' (avg)' : ''}</div>
      ${domainRows}
      <div style="border-top:1px solid #f3f4f6;margin:6px 0;"></div>
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Age Distribution</div>
      <div style="font-size:11px;color:#374151;">
        ${buildAgeBreakdown(props, ageHighlight)}
      </div>
      <div style="border-top:1px solid #f3f4f6;margin:6px 0;"></div>
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Ethnicity</div>
      <div style="font-size:11px;color:#374151;">
        ${buildEthBreakdown(props, ethHighlight)}
      </div>
    </div>`;
}

// ─── Tooltip builder (hover) ───

function buildTooltip(props: FeatureProps, isLAD: boolean): string {
  const pop = isLAD ? (props.pop ?? 0) : (props.p ?? 0);
  const decile = Math.round(props.d);

  const eths: { label: string; pct: number }[] = [];
  for (const { key, label } of ETHNICITY_OPTIONS) {
    const pct = (props[key] as number) ?? 0;
    if (pct > 0) eths.push({ label, pct });
  }
  eths.sort((a, b) => b.pct - a.pct);
  const top3 = eths.slice(0, 3).map(e => `${e.label} ${e.pct}%`).join(' · ');

  // Top 2 age bands
  const ages: { label: string; pct: number }[] = [];
  for (const { key, label } of AGE_OPTIONS) {
    const pct = (props[key] as number) ?? 0;
    if (pct > 0) ages.push({ label, pct });
  }
  ages.sort((a, b) => b.pct - a.pct);
  const topAge = ages.slice(0, 2).map(a => `${a.label} ${a.pct}%`).join(' · ');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;line-height:1.4;max-width:220px;">
    <strong style="font-size:12px;">${props.n}</strong>
    <div style="margin-top:2px;display:flex;align-items:center;gap:4px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${getDecileColor(decile)};"></span>
      <span>IMD ${isLAD ? 'avg ' : ''}${isLAD ? (Math.round(props.d * 10) / 10) : decile}/10</span>
    </div>
    ${topAge ? `<div style="margin-top:2px;color:#6b7280;">Age: ${topAge}</div>` : ''}
    ${top3 ? `<div style="margin-top:2px;color:#6b7280;">${top3}</div>` : ''}
    <div style="color:#9ca3af;margin-top:1px;">Pop ${pop.toLocaleString()}</div>
  </div>`;
}

// ─── Constants ───

const LSOA_ZOOM = 12;
export { LSOA_ZOOM as LSOA_ZOOM_THRESHOLD, ETH_P5, ETH_P95, AGE_P5, AGE_P99, getPctFloor, getPctCeil };

// ─── Combined filter types ───

export interface FilterCondition {
  metric: string;  // property key or overlay type
  operator: '>' | '<' | '=' | '>=' | '<=';
  value: number;
}

// Map metric keys to feature property keys
function getMetricValue(props: FeatureProps, metric: string): number | undefined {
  // Deprivation domains map
  const decileMap: Record<string, string> = {
    'deprivation': 'd', 'income': 'id', 'education': 'ed',
    'health': 'hd', 'crime': 'cd', 'housing': 'bd', 'environment': 'ld',
  };
  if (decileMap[metric]) return props[decileMap[metric]] as number;
  // Direct property (ethnicity, age)
  return props[metric] as number;
}

function evaluateCondition(props: FeatureProps, cond: FilterCondition): boolean {
  const val = getMetricValue(props, cond.metric);
  if (val === undefined || val === null) return false;
  switch (cond.operator) {
    case '>':  return val > cond.value;
    case '<':  return val < cond.value;
    case '>=': return val >= cond.value;
    case '<=': return val <= cond.value;
    case '=':  return Math.abs(val - cond.value) < 0.05;
    default:   return false;
  }
}

function matchesFilter(props: FeatureProps, conditions: FilterCondition[]): boolean {
  if (conditions.length === 0) return true;
  return conditions.every(c => evaluateCondition(props, c));
}

// ─── All available metrics for the filter UI ───

export const FILTER_METRICS: { key: string; label: string; unit: string; group: string }[] = [
  { key: 'deprivation', label: 'Deprivation (overall)', unit: 'decile', group: 'Deprivation' },
  { key: 'income', label: 'Income', unit: 'decile', group: 'Deprivation' },
  { key: 'education', label: 'Education', unit: 'decile', group: 'Deprivation' },
  { key: 'health', label: 'Health', unit: 'decile', group: 'Deprivation' },
  { key: 'crime', label: 'Crime', unit: 'decile', group: 'Deprivation' },
  { key: 'housing', label: 'Housing Barriers', unit: 'decile', group: 'Deprivation' },
  { key: 'environment', label: 'Living Environment', unit: 'decile', group: 'Deprivation' },
  ...ETHNICITY_OPTIONS.map(o => ({ key: o.key, label: o.label, unit: '%', group: 'Ethnicity' })),
  ...AGE_OPTIONS.map(o => ({ key: o.key, label: o.label, unit: '%', group: 'Age' })),
];

// ─── LAD index type ───

interface LAIndex {
  [laCode: string]: {
    name: string;
    count: number;
    bbox: [number, number, number, number];
    size: number;
  };
}

// ─── Hook ───

interface Props {
  map: L.Map | null;
  overlayType: OverlayType;
  mapReady: boolean;
  filterConditions?: FilterCondition[];
  onAreaClick?: (html: string | null) => void;
}

export default function useNeighbourhoodOverlay({ map, overlayType, mapReady, filterConditions = [], onAreaClick }: Props) {
  const lsoaLayerRef = useRef<L.GeoJSON | null>(null);
  const ladLayerRef = useRef<L.GeoJSON | null>(null);
  const indexRef = useRef<LAIndex | null>(null);
  const ladDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const loadedTilesRef = useRef<Set<string>>(new Set());
  const tileDataRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const overlayTypeRef = useRef<OverlayType>(overlayType);
  const filterRef = useRef<FilterCondition[]>(filterConditions);
  const ladAddedRef = useRef(false);
  const activeLayerRef = useRef<'lsoa' | 'lad' | 'none'>('none');
  const openPopupIdRef = useRef<string | null>(null);
  const onAreaClickRef = useRef(onAreaClick);
  onAreaClickRef.current = onAreaClick;
  overlayTypeRef.current = overlayType;
  filterRef.current = filterConditions;

  const styleLSOA = useCallback((feature?: GeoJSON.Feature): L.PathOptions => {
    if (!feature?.properties) return {};
    const props = feature.properties as FeatureProps;
    const hasFilter = filterRef.current.length > 0;
    const passes = hasFilter ? matchesFilter(props, filterRef.current) : true;
    return {
      fillColor: getFeatureColor(props, overlayTypeRef.current),
      fillOpacity: passes ? 0.45 : 0.04,
      weight: passes ? 0.5 : 0.2,
      color: '#fff',
      opacity: passes ? 0.6 : 0.1,
    };
  }, []);

  const styleLAD = useCallback((feature?: GeoJSON.Feature): L.PathOptions => {
    if (!feature?.properties) return {};
    const props = feature.properties as FeatureProps;
    const hasFilter = filterRef.current.length > 0;
    const passes = hasFilter ? matchesFilter(props, filterRef.current) : true;
    return {
      fillColor: getFeatureColor(props, overlayTypeRef.current),
      fillOpacity: passes ? 0.5 : 0.04,
      weight: passes ? 1.5 : 0.3,
      color: '#fff',
      opacity: passes ? 0.8 : 0.1,
    };
  }, []);

  const onEachLSOA = useCallback((feature: GeoJSON.Feature, layer: L.Layer) => {
    if (!feature.properties) return;
    const props = feature.properties as FeatureProps;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) {
      (layer as L.Path).bindTooltip(buildTooltip(props, false), { sticky: true, direction: 'top', offset: [0, -10] });
    }
    layer.on('click', () => {
      (layer as L.Path).closeTooltip();
      const t = overlayTypeRef.current;
      const html = buildFullPopup(props, t, false);
      L.popup({ className: 'neighbourhood-popup', maxHeight: 450, closeButton: true, autoPan: true })
        .setLatLng((layer as L.Polygon).getBounds().getCenter())
        .setContent(html)
        .openOn(map!);
    });
  }, [map]);

  const onEachLAD = useCallback((feature: GeoJSON.Feature, layer: L.Layer) => {
    if (!feature.properties) return;
    const props = feature.properties as FeatureProps;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) {
      (layer as L.Path).bindTooltip(buildTooltip(props, true), { sticky: true, direction: 'top', offset: [0, -10] });
    }
    layer.on('click', () => {
      (layer as L.Path).closeTooltip();
      const t = overlayTypeRef.current;
      const p = feature.properties as FeatureProps;
      const html = buildFullPopup(p, t, true);
      L.popup({ className: 'neighbourhood-popup', maxHeight: 450, closeButton: true, autoPan: true })
        .setLatLng((layer as L.Polygon).getBounds().getCenter())
        .setContent(html)
        .openOn(map!);
    });
  }, [map]);

  useEffect(() => {
    fetch('/neighbourhood/index.json')
      .then(r => r.json())
      .then((d: LAIndex) => { indexRef.current = d; })
      .catch(e => console.error('Failed to load tile index:', e));

    fetch('/neighbourhood/lad.json')
      .then(r => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        ladDataRef.current = fc;
        if (ladLayerRef.current && !ladAddedRef.current) {
          ladLayerRef.current.addData(fc);
          ladAddedRef.current = true;
        }
      })
      .catch(e => console.error('Failed to load LAD data:', e));
  }, []);

  useEffect(() => {
    if (!map || !mapReady) return;

    const canvas1 = L.canvas({ padding: 0.5 });
    const canvas2 = L.canvas({ padding: 0.5 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lsoa = L.geoJSON(undefined, { style: styleLSOA, onEachFeature: onEachLSOA, ...(({ renderer: canvas1, interactive: true }) as any) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lad = L.geoJSON(undefined, { style: styleLAD, onEachFeature: onEachLAD, ...(({ renderer: canvas2, interactive: true }) as any) });

    lsoaLayerRef.current = lsoa;
    ladLayerRef.current = lad;

    if (ladDataRef.current && !ladAddedRef.current) {
      lad.addData(ladDataRef.current);
      ladAddedRef.current = true;
    }

    return () => {
      if (map.hasLayer(lsoa)) map.removeLayer(lsoa);
      if (map.hasLayer(lad)) map.removeLayer(lad);
      lsoaLayerRef.current = null;
      ladLayerRef.current = null;
      ladAddedRef.current = false;
    };
  }, [map, mapReady, styleLSOA, styleLAD, onEachLSOA, onEachLAD]);

  const loadVisibleTiles = useCallback(async () => {
    if (!map || !indexRef.current || !lsoaLayerRef.current) return;
    const hasFilter = filterRef.current.length > 0;
    if (overlayTypeRef.current === 'off') return;
    if (map.getZoom() < LSOA_ZOOM && !hasFilter) return;

    const bounds = map.getBounds();
    const idx = indexRef.current;
    const toLoad: string[] = [];

    for (const [la, info] of Object.entries(idx)) {
      const [mnLng, mnLat, mxLng, mxLat] = info.bbox;
      if (bounds.intersects(L.latLngBounds([mnLat, mnLng], [mxLat, mxLng]))) {
        if (!loadedTilesRef.current.has(la)) toLoad.push(la);
      }
    }

    if (toLoad.length === 0) return;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    for (let i = 0; i < toLoad.length; i += 6) {
      if (ctrl.signal.aborted) return;
      await Promise.all(toLoad.slice(i, i + 6).map(async la => {
        if (ctrl.signal.aborted) return;
        try {
          const res = await fetch(`/neighbourhood/tiles/${la}.json`, { signal: ctrl.signal });
          const d = await res.json() as GeoJSON.FeatureCollection;
          if (ctrl.signal.aborted) return;
          tileDataRef.current.set(la, d);
          loadedTilesRef.current.add(la);
          if (lsoaLayerRef.current && overlayTypeRef.current !== 'off') {
            lsoaLayerRef.current.addData(d);
          }
        } catch (e) {
          if (!(e instanceof DOMException && e.name === 'AbortError')) console.error(`tile ${la}:`, e);
        }
      }));
    }
  }, [map]);

  const updateVisibility = useCallback(() => {
    if (!map) return;
    const zoom = map.getZoom();
    const off = overlayTypeRef.current === 'off';
    const lsoa = lsoaLayerRef.current;
    const lad = ladLayerRef.current;

    if (off) {
      if (lsoa && map.hasLayer(lsoa)) map.removeLayer(lsoa);
      if (lad && map.hasLayer(lad)) map.removeLayer(lad);
      activeLayerRef.current = 'none';
      return;
    }

    const hasFilter = filterRef.current.length > 0;
    if (zoom >= LSOA_ZOOM || hasFilter) {
      // Show LSOA level when zoomed in OR when filter is active
      if (lad && map.hasLayer(lad)) map.removeLayer(lad);
      if (lsoa && !map.hasLayer(lsoa)) lsoa.addTo(map);
      if (lsoa) { lsoa.setStyle(styleLSOA); lsoa.bringToFront(); }
      activeLayerRef.current = 'lsoa';
      loadVisibleTiles();
    } else {
      if (lsoa && map.hasLayer(lsoa)) map.removeLayer(lsoa);
      if (lad && !map.hasLayer(lad) && ladAddedRef.current) lad.addTo(map);
      if (lad) { lad.setStyle(styleLAD); lad.bringToFront(); }
      activeLayerRef.current = 'lad';
    }
  }, [map, loadVisibleTiles, styleLSOA, styleLAD]);

  useEffect(() => {
    if (!map) return;
    if (lsoaLayerRef.current) lsoaLayerRef.current.setStyle(styleLSOA);
    if (ladLayerRef.current) ladLayerRef.current.setStyle(styleLAD);
    updateVisibility();
  }, [overlayType, map, updateVisibility, styleLSOA, styleLAD]);

  // Re-apply styles and layer visibility when filter conditions change
  useEffect(() => {
    if (!map) return;
    if (lsoaLayerRef.current) lsoaLayerRef.current.setStyle(styleLSOA);
    if (ladLayerRef.current) ladLayerRef.current.setStyle(styleLAD);
    updateVisibility();
  }, [filterConditions, map, styleLSOA, styleLAD, updateVisibility]);

  useEffect(() => {
    if (!map || !mapReady) return;
    const handler = () => updateVisibility();
    map.on('moveend', handler);
    map.on('zoomend', handler);
    const t1 = setTimeout(handler, 500);
    const t2 = setTimeout(handler, 2000);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, mapReady, updateVisibility]);
}
