// Compact marker: [urn, name, lat, lng, phase_code, ofsted_rating, fsm*10, wbi*10, chi*10, ind*10, pak*10, ban*10, afr*10, car*10, oas*10, owh*10, iri*10, rel_code]
export type MarkerData = [number, string, number, number, string, number, number, number, number, number, number, number, number, number, number, number, number, number];

// Index constants for marker fields
export const M = {
  URN: 0, NAME: 1, LAT: 2, LNG: 3, PHASE: 4, OFSTED: 5,
  FSM: 6, WBI: 7, CHI: 8, IND: 9, PAK: 10, BAN: 11, AFR: 12, CAR: 13, OAS: 14, OWH: 15, IRI: 16,
  REL: 17,
} as const;

export const ETHNICITY_MARKER_FIELDS: { key: number; label: string; short: string }[] = [
  { key: M.WBI, label: 'White British', short: 'wbi' },
  { key: M.CHI, label: 'Chinese', short: 'chi' },
  { key: M.IND, label: 'Indian', short: 'ind' },
  { key: M.PAK, label: 'Pakistani', short: 'pak' },
  { key: M.BAN, label: 'Bangladeshi', short: 'ban' },
  { key: M.AFR, label: 'African', short: 'afr' },
  { key: M.CAR, label: 'Caribbean', short: 'car' },
  { key: M.OAS, label: 'Other Asian', short: 'oas' },
  { key: M.OWH, label: 'Other White', short: 'owh' },
  { key: M.IRI, label: 'Irish', short: 'iri' },
];

// Religion codes matching build-db.py
export const RELIGION_LABELS: { code: number; label: string; emoji: string }[] = [
  { code: 0, label: 'Unknown', emoji: '❓' },
  { code: 1, label: 'Secular', emoji: '🏫' },
  { code: 2, label: 'Church of England', emoji: '⛪' },
  { code: 3, label: 'Roman Catholic', emoji: '✝️' },
  { code: 4, label: 'Other Christian', emoji: '🕊️' },
  { code: 5, label: 'Muslim', emoji: '☪️' },
  { code: 6, label: 'Jewish', emoji: '✡️' },
  { code: 7, label: 'Sikh', emoji: '🪯' },
  { code: 8, label: 'Hindu', emoji: '🕉️' },
  { code: 9, label: 'Other', emoji: '🙏' },
];

export interface EthnicityFilter {
  fieldIndex: number;   // index into MarkerData
  minPct: number;       // minimum percentage (e.g. 5 means 5%)
  maxPct?: number;      // maximum percentage (e.g. 20 means 20%), undefined = no upper bound
}

// Range data for slider filters (loaded from filter-ranges.json)
export interface FilterRanges {
  [key: string]: { p5: number; p99: number };
}

export interface Filters {
  phase: string;
  ofsted: number[];
  fsmMin: number | null;
  fsmMax: number | null;
  ethnicities: EthnicityFilter[];
  religion: number[];
}
