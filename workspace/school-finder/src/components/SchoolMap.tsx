'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MarkerData } from '@/lib/marker-fields';
import type { FlyToTarget } from '@/app/page';
import useNeighbourhoodOverlay, {
  type OverlayType,
  type FilterCondition,
  CHOROPLETH_COLORS,
  IMD_TITLES,
  LSOA_ZOOM_THRESHOLD,
  isEthnicityOverlay,
  isAgeOverlay,
  getEthnicityLabel,
  getAgeLabel,
  getPctFloor,
  getPctCeil,
} from './NeighbourhoodOverlay';

interface SchoolMapProps {
  markers: MarkerData[];
  onSelectSchool: (urn: number) => void;
  selectedUrn: number | null;
  flyTo?: FlyToTarget | null;
  showSchools: boolean;
  overlayType: OverlayType;
  filterConditions: FilterCondition[];
  homeLocation: { lat: number; lng: number } | null;
  onMapMove?: (center: { lat: number; lng: number }, zoom: number) => void;
}

const OFSTED_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#059669', 2: '#2563eb', 3: '#d97706', 4: '#dc2626',
};
const OFSTED_LABELS: Record<number, string> = {
  0: 'Not rated', 1: 'Outstanding', 2: 'Good', 3: 'Requires Improvement', 4: 'Inadequate',
};
const PHASE_LABELS: Record<string, string> = {
  P: 'Primary', S: 'Secondary', N: 'Nursery', '6': '16 plus', A: 'All-through', MS: 'Secondary', MP: 'Primary', X: 'Other',
};

function createMarkerIcon(ofstedRating: number, isSelected: boolean): L.DivIcon {
  const color = OFSTED_COLORS[ofstedRating] || OFSTED_COLORS[0];
  const size = isSelected ? 20 : 14;
  const border = isSelected ? '3px solid #312e81' : '2px solid white';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const MARKER_LIMIT = 2000;

export default function SchoolMap({
  markers, onSelectSchool, selectedUrn, flyTo,
  showSchools, overlayType, filterConditions,
  homeLocation, onMapMove,
}: SchoolMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const visibleMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const allMarkersRef = useRef<MarkerData[]>([]);
  const selectedUrnRef = useRef<number | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tooManyMarkers, setTooManyMarkers] = useState(false);
  const [inBoundsCount, setInBoundsCount] = useState(0);
  const [locating, setLocating] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(13);

  allMarkersRef.current = markers;
  selectedUrnRef.current = selectedUrn;

  useNeighbourhoodOverlay({ map: mapRef.current, overlayType, mapReady, filterConditions });

  // ── Initialize map ──
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [51.509, -0.118], zoom: 13, zoomControl: false });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const updateVisibleMarkers = () => {
      const bounds = map.getBounds();
      const layer = markersLayerRef.current!;
      const current = allMarkersRef.current;
      const visible = visibleMarkersRef.current;
      const inBounds: MarkerData[] = [];
      for (const m of current) { if (bounds.contains([m[2], m[3]])) inBounds.push(m); }
      const count = inBounds.length;
      setInBoundsCount(count);
      if (count > MARKER_LIMIT) { setTooManyMarkers(true); layer.clearLayers(); visible.clear(); return; }
      setTooManyMarkers(false);
      const inUrns = new Set(inBounds.map(m => m[0]));
      for (const [urn, marker] of visible) { if (!inUrns.has(urn)) { layer.removeLayer(marker); visible.delete(urn); } }
      for (const m of inBounds) {
        const [urn, name, lat, lng, phaseCode, ofsted] = m;
        if (visible.has(urn)) {
          if (urn === selectedUrnRef.current) {
            const ex = visible.get(urn)!;
            ex.setIcon(createMarkerIcon(ofsted, true));
            ex.setZIndexOffset(1000);
          }
          continue;
        }
        const isSel = urn === selectedUrnRef.current;
        const marker = L.marker([lat, lng], { icon: createMarkerIcon(ofsted, isSel), zIndexOffset: isSel ? 1000 : 0 });
        marker.on('click', () => onSelectSchool(urn));
        marker.bindTooltip(`<div style="font-size:13px;line-height:1.4;"><strong>${name}</strong><br/><span style="color:#666;">${PHASE_LABELS[phaseCode] || 'School'} · ${OFSTED_LABELS[ofsted] || 'Not rated'}</span></div>`, { direction: 'top', offset: [0, -8] });
        layer.addLayer(marker);
        visible.set(urn, marker);
      }
    };

    map.on('click', () => { onSelectSchool(0); });
    map.on('moveend', () => {
      updateVisibleMarkers();
      const c = map.getCenter();
      onMapMove?.({ lat: c.lat, lng: c.lng }, map.getZoom());
    });
    map.on('zoomend', () => { updateVisibleMarkers(); setCurrentZoom(map.getZoom()); });
    setTimeout(() => {
      setMapReady(true);
      setCurrentZoom(map.getZoom());
      updateVisibleMarkers();
      const c = map.getCenter();
      onMapMove?.({ lat: c.lat, lng: c.lng }, map.getZoom());
    }, 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh markers on filter change ──
  useEffect(() => {
    if (!mapReady || !mapRef.current || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();
    visibleMarkersRef.current.clear();
    const map = mapRef.current;
    const bounds = map.getBounds();
    const inBounds: MarkerData[] = [];
    for (const m of markers) { if (bounds.contains([m[2], m[3]])) inBounds.push(m); }
    setInBoundsCount(inBounds.length);
    if (inBounds.length > MARKER_LIMIT) { setTooManyMarkers(true); return; }
    setTooManyMarkers(false);
    for (const m of inBounds) {
      const [urn, name, lat, lng, phaseCode, ofsted] = m;
      const isSel = urn === selectedUrn;
      const marker = L.marker([lat, lng], { icon: createMarkerIcon(ofsted, isSel), zIndexOffset: isSel ? 1000 : 0 });
      marker.on('click', () => onSelectSchool(urn));
      marker.bindTooltip(`<div style="font-size:13px;line-height:1.4;"><strong>${name}</strong><br/><span style="color:#666;">${PHASE_LABELS[phaseCode] || 'School'} · ${OFSTED_LABELS[ofsted] || 'Not rated'}</span></div>`, { direction: 'top', offset: [0, -8] });
      layer.addLayer(marker);
      visibleMarkersRef.current.set(urn, marker);
    }
  }, [markers, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update selected marker ──
  useEffect(() => {
    for (const [urn, marker] of visibleMarkersRef.current) {
      const m = markers.find(m => m[0] === urn);
      if (m) { marker.setIcon(createMarkerIcon(m[5], urn === selectedUrn)); marker.setZIndexOffset(urn === selectedUrn ? 1000 : 0); }
    }
  }, [selectedUrn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle school markers visibility ──
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    if (showSchools) {
      if (!mapRef.current.hasLayer(markersLayerRef.current)) markersLayerRef.current.addTo(mapRef.current);
    } else {
      if (mapRef.current.hasLayer(markersLayerRef.current)) mapRef.current.removeLayer(markersLayerRef.current);
    }
  }, [showSchools, mapReady]);

  // ── Home marker ──
  useEffect(() => {
    if (!mapRef.current) return;
    if (homeMarkerRef.current) {
      mapRef.current.removeLayer(homeMarkerRef.current);
      homeMarkerRef.current = null;
    }
    if (homeLocation) {
      homeMarkerRef.current = L.marker([homeLocation.lat, homeLocation.lng], {
        icon: L.divIcon({
          className: 'home-marker',
          html: '<div style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3));">🏠</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        zIndexOffset: 3000,
      }).addTo(mapRef.current).bindTooltip('Home', { direction: 'top', offset: [0, -14] });
    }
  }, [homeLocation, mapReady]);

  // ── Fly to ──
  useEffect(() => { if (flyTo && mapRef.current) mapRef.current.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 1.2 }); }, [flyTo]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;
        if (map) {
          map.setView([latitude, longitude], 14);
          if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
          userMarkerRef.current = L.marker([latitude, longitude], {
            icon: L.divIcon({ className: 'user-loc', html: '<div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.3),0 2px 8px rgba(0,0,0,0.3);"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            zIndexOffset: 2000,
          }).addTo(map).bindTooltip('You are here', { direction: 'top', offset: [0, -12] });
        }
        setLocating(false);
      },
      (err) => { setLocating(false); alert(err.code === err.PERMISSION_DENIED ? 'Location access denied.' : 'Unable to get location.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const overlayActive = overlayType !== 'off';
  const isEth = isEthnicityOverlay(overlayType);
  const isAge = isAgeOverlay(overlayType);
  const isPctOverlay = isEth || isAge;
  const isLowZoom = currentZoom < LSOA_ZOOM_THRESHOLD;

  const legendTitle = isEth
    ? getEthnicityLabel(overlayType)
    : isAge
    ? getAgeLabel(overlayType)
    : (IMD_TITLES[overlayType] || 'Deprivation');

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Locate me — top right below zoom */}
      <button onClick={handleLocateMe} disabled={locating}
        className="absolute top-[76px] right-3 z-[500] w-9 h-9 bg-white/80 backdrop-blur rounded-full shadow-sm border border-white/60 flex items-center justify-center hover:bg-white/95 active:scale-95 transition-all disabled:opacity-40"
        title="Find my location">
        {locating
          ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          : <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" /></svg>
        }
      </button>

      {/* Too many markers overlay */}
      {tooManyMarkers && showSchools && (
        <div className="absolute inset-0 z-[600] flex items-center justify-center pointer-events-none">
          <div className="bg-white/85 backdrop-blur-md rounded-2xl shadow-lg px-7 py-5 text-center pointer-events-auto max-w-[280px]">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-base font-semibold text-gray-800 mb-0.5">Zoom in to see schools</div>
            <div className="text-[13px] text-gray-400">{inBoundsCount.toLocaleString()} schools in this area</div>
            <button className="mt-3 px-4 py-1.5 bg-indigo-500 text-white text-[13px] font-medium rounded-full hover:bg-indigo-600 active:scale-95 transition-all shadow-sm" onClick={() => mapRef.current?.zoomIn(3)}>Zoom in</button>
          </div>
        </div>
      )}

      {/* Low-zoom hint */}
      {overlayActive && isLowZoom && !tooManyMarkers && filterConditions.length === 0 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] bg-white/80 backdrop-blur-md rounded-full px-3 py-1 text-[11px] text-gray-500 shadow-sm">
          Borough averages · zoom in for detail
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-5 left-3 bg-white/85 backdrop-blur-md rounded-xl shadow-sm px-3 py-2.5 z-[500] text-[11px]">
        {overlayActive ? (
          <>
            <div className="font-semibold text-gray-600 mb-1.5 text-[12px]">
              {legendTitle}
              {isLowZoom && filterConditions.length === 0 && <span className="font-normal text-gray-400 ml-1 text-[10px]">(avg)</span>}
            </div>
            <div className="flex items-center gap-px mb-1">
              {CHOROPLETH_COLORS.map((color, i) => (
                <div key={i} className="h-2 flex-1 first:rounded-l-sm last:rounded-r-sm" style={{ background: color, opacity: 0.85 }} />
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-gray-400">
              {isPctOverlay ? (
                <>
                  <span>{getPctFloor(overlayType) ? `${getPctFloor(overlayType)}%` : '0%'}</span>
                  <span>{getPctCeil(overlayType)}%+</span>
                </>
              ) : (
                <>
                  <span>Least deprived</span>
                  <span>Most deprived</span>
                </>
              )}
            </div>
            <div className="mt-2 pt-1.5 border-t border-gray-200/60">
              <div className="font-medium text-gray-500 mb-1">Ofsted</div>
              <div className="flex items-center gap-2 flex-wrap">
                {[1,2,3,4,0].map(key => (
                  <div key={key} className="flex items-center gap-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: OFSTED_COLORS[key] }} />
                    <span className="text-[9px] text-gray-400">{OFSTED_LABELS[key]}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="font-semibold text-gray-600 mb-1 text-[12px]">Ofsted Rating</div>
            {[1,2,3,4].map(key => (
              <div key={key} className="flex items-center gap-1.5 mb-px">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: OFSTED_COLORS[key] }} />
                <span className="text-gray-500">{OFSTED_LABELS[key]}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 mt-px">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: OFSTED_COLORS[0] }} />
              <span className="text-gray-500">Not rated</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
