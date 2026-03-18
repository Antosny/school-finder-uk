'use client';

import type { School } from '@/app/page';

interface SchoolDetailProps {
  school: School;
  onClose: () => void;
}

const OFSTED_GRADES: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'Outstanding', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  2: { label: 'Good', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  3: { label: 'Requires Improvement', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  4: { label: 'Inadequate', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

function OfstedBadge({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-gray-400">Not rated</span>;
  const grade = OFSTED_GRADES[rating];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${grade.bg} ${grade.color}`}>
      {grade.label}
    </span>
  );
}

function OfstedDetailRow({ label, value }: { label: string; value: number | null }) {
  if (!value) return null;
  const grade = OFSTED_GRADES[value];
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-xs font-medium ${grade?.color || 'text-gray-500'}`}>{grade?.label || 'N/A'}</span>
    </div>
  );
}

function StatBar({ label, value, max, suffix = '' }: { label: string; value: number | null; max: number; suffix?: string }) {
  if (value === null || value === undefined) return null;
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{typeof value === 'number' ? value.toFixed(1) : value}{suffix}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Color palette for granular ethnicity (19 distinct colors)
const ETHNICITY_COLORS = [
  'bg-sky-400',      // White British
  'bg-sky-300',      // Irish
  'bg-sky-200',      // Traveller Irish
  'bg-cyan-300',     // Gypsy/Roma
  'bg-sky-500',      // Other White
  'bg-orange-400',   // Indian
  'bg-orange-300',   // Pakistani
  'bg-orange-500',   // Bangladeshi
  'bg-amber-400',    // Other Asian
  'bg-purple-400',   // Caribbean
  'bg-purple-500',   // African
  'bg-purple-300',   // Other Black
  'bg-red-400',      // Chinese
  'bg-emerald-400',  // Mixed W/B Caribbean
  'bg-emerald-300',  // Mixed W/B African
  'bg-emerald-500',  // Mixed W/Asian
  'bg-teal-400',     // Other Mixed
  'bg-gray-400',     // Other Ethnic
  'bg-gray-300',     // Unclassified
];

type EthnicityEntry = {
  key: string;
  label: string;
  value: number;
  color: string;
};

function getEthnicityData(school: School): EthnicityEntry[] {
  const entries: { key: string; label: string; value: number | null | undefined; color: string }[] = [
    { key: 'white_british_pct', label: 'White British', value: school.white_british_pct, color: ETHNICITY_COLORS[0] },
    { key: 'irish_pct', label: 'Irish', value: school.irish_pct, color: ETHNICITY_COLORS[1] },
    { key: 'traveller_irish_pct', label: 'Traveller Irish', value: school.traveller_irish_pct, color: ETHNICITY_COLORS[2] },
    { key: 'gypsy_roma_pct', label: 'Gypsy/Roma', value: school.gypsy_roma_pct, color: ETHNICITY_COLORS[3] },
    { key: 'other_white_pct', label: 'Other White', value: school.other_white_pct, color: ETHNICITY_COLORS[4] },
    { key: 'indian_pct', label: 'Indian', value: school.indian_pct, color: ETHNICITY_COLORS[5] },
    { key: 'pakistani_pct', label: 'Pakistani', value: school.pakistani_pct, color: ETHNICITY_COLORS[6] },
    { key: 'bangladeshi_pct', label: 'Bangladeshi', value: school.bangladeshi_pct, color: ETHNICITY_COLORS[7] },
    { key: 'other_asian_pct', label: 'Other Asian', value: school.other_asian_pct, color: ETHNICITY_COLORS[8] },
    { key: 'caribbean_pct', label: 'Caribbean', value: school.caribbean_pct, color: ETHNICITY_COLORS[9] },
    { key: 'african_pct', label: 'African', value: school.african_pct, color: ETHNICITY_COLORS[10] },
    { key: 'other_black_pct', label: 'Other Black', value: school.other_black_pct, color: ETHNICITY_COLORS[11] },
    { key: 'chinese_pct', label: 'Chinese', value: school.chinese_pct, color: ETHNICITY_COLORS[12] },
    { key: 'mixed_white_black_caribbean_pct', label: 'Mixed W/B Caribbean', value: school.mixed_white_black_caribbean_pct, color: ETHNICITY_COLORS[13] },
    { key: 'mixed_white_black_african_pct', label: 'Mixed W/B African', value: school.mixed_white_black_african_pct, color: ETHNICITY_COLORS[14] },
    { key: 'mixed_white_asian_pct', label: 'Mixed W/Asian', value: school.mixed_white_asian_pct, color: ETHNICITY_COLORS[15] },
    { key: 'other_mixed_pct', label: 'Other Mixed', value: school.other_mixed_pct, color: ETHNICITY_COLORS[16] },
    { key: 'other_ethnic_pct', label: 'Other Ethnic', value: school.other_ethnic_pct, color: ETHNICITY_COLORS[17] },
    { key: 'unclassified_pct', label: 'Unclassified', value: school.unclassified_pct, color: ETHNICITY_COLORS[18] },
  ];

  return entries
    .filter(d => d.value !== null && d.value !== undefined && d.value > 0)
    .map(d => ({ ...d, value: d.value as number }))
    .sort((a, b) => b.value - a.value);
}

function EthnicityChart({ school }: { school: School }) {
  const data = getEthnicityData(school);
  if (data.length === 0) return null;

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex w-full rounded-full overflow-hidden h-3 mb-3">
        {data.map((d, i) => (
          <div
            key={i}
            className={`${d.color} transition-all`}
            style={{ width: `${d.value}%` }}
            title={`${d.label}: ${d.value.toFixed(1)}%`}
          />
        ))}
      </div>
      {/* List with bars */}
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${d.color}`} />
            <span className="text-[11px] text-gray-700 flex-1 min-w-0 truncate">{d.label}</span>
            <span className="text-[11px] font-medium text-gray-900 tabular-nums">{d.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdmissionsInfo({ school }: { school: School }) {
  const hasData = school.total_places_offered || school.total_applications;
  if (!hasData) return null;

  const oversubscribed = school.total_applications && school.total_places_offered
    ? school.total_applications > school.total_places_offered
    : false;
  const ratio = school.total_applications && school.total_places_offered
    ? (school.total_applications / school.total_places_offered).toFixed(1)
    : null;

  return (
    <div>
      <div className="space-y-1.5">
        {school.total_places_offered && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Places offered</span>
            <span className="font-medium text-gray-900">{school.total_places_offered}</span>
          </div>
        )}
        {school.total_applications && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Total applications</span>
            <span className="font-medium text-gray-900">{school.total_applications}</span>
          </div>
        )}
        {school.first_pref_applications && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">1st preference applications</span>
            <span className="font-medium text-gray-900">{school.first_pref_applications}</span>
          </div>
        )}
        {school.first_pref_offers != null && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">1st preference offers</span>
            <span className="font-medium text-gray-900">{school.first_pref_offers}</span>
          </div>
        )}
        {ratio && (
          <div className="flex justify-between text-xs pt-1 border-t border-gray-100">
            <span className="text-gray-600">Application ratio</span>
            <span className={`font-semibold ${oversubscribed ? 'text-red-600' : 'text-emerald-600'}`}>
              {ratio}× {oversubscribed ? '(oversubscribed)' : '(undersubscribed)'}
            </span>
          </div>
        )}
        {school.pct_first_pref_offered != null && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Got 1st preference</span>
            <span className="font-medium text-gray-900">{(school.pct_first_pref_offered * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-400 mt-2 italic">Source: DfE Admissions 2024/25</p>
    </div>
  );
}

export default function SchoolDetail({ school, onClose }: SchoolDetailProps) {
  return (
    <div className="absolute top-0 right-0 h-full w-96 max-w-full bg-white/95 backdrop-blur-md shadow-lg z-[800] overflow-y-auto border-l border-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <button
          onClick={onClose}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50/50 active:bg-gray-100/50 transition-colors min-h-[44px]"
        >
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-800 leading-tight truncate tracking-tight">{school.name}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{school.postcode} · {school.la_name}</p>
          </div>
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Key Info */}
        <div className="grid grid-cols-2 gap-2">
          <InfoChip label="Phase" value={school.phase} />
          <InfoChip label="Type" value={school.school_type?.replace(/ school$/i, '') || 'N/A'} />
          <InfoChip label="Age Range" value={school.low_age && school.high_age ? `${school.low_age}–${school.high_age}` : 'N/A'} />
          <InfoChip label="Pupils" value={school.number_of_pupils?.toLocaleString() || 'N/A'} />
          <InfoChip label="Gender" value={school.gender || 'N/A'} />
          <InfoChip label="Religion" value={school.religious_character || 'None'} />
        </div>

        {/* Ofsted */}
        <Section title="Ofsted Inspection">
          <div className="flex items-center gap-2 mb-2">
            <OfstedBadge rating={school.ofsted_rating} />
            {school.ofsted_date && (
              <span className="text-[10px] text-gray-400">{school.ofsted_date}</span>
            )}
          </div>
          {school.ofsted_rating && (
            <div className="border border-gray-100 rounded-lg p-2 space-y-0.5">
              <OfstedDetailRow label="Quality of Education" value={school.quality_of_education} />
              <OfstedDetailRow label="Behaviour & Attitudes" value={school.behaviour_attitudes} />
              <OfstedDetailRow label="Personal Development" value={school.personal_development} />
              <OfstedDetailRow label="Leadership & Management" value={school.leadership_management} />
            </div>
          )}
        </Section>

        {/* Admissions & Demand */}
        <Section title="Admissions (2024/25)">
          <AdmissionsInfo school={school} />
          {!school.total_places_offered && !school.total_applications && (
            <p className="text-xs text-gray-400 italic">No admissions data available</p>
          )}
        </Section>

        {/* Exam Results */}
        {(school.attainment8 || school.eng_maths_5plus_pct) && (
          <Section title="GCSE Results (2024/25)">
            <StatBar label="Attainment 8" value={school.attainment8} max={90} />
            <StatBar label="English & Maths 5+" value={school.eng_maths_5plus_pct} max={100} suffix="%" />
            {school.progress8 !== null && school.progress8 !== undefined && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-600">Progress 8</span>
                <span className={`font-medium ${school.progress8 >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {school.progress8 > 0 ? '+' : ''}{school.progress8.toFixed(2)}
                </span>
              </div>
            )}
          </Section>
        )}

        {/* Demographics */}
        {school.fsm_pct !== null && school.fsm_pct !== undefined && (
          <Section title="Student Background">
            <StatBar label="Free School Meals" value={school.fsm_pct} max={100} suffix="%" />
            <StatBar label="English as Additional Language" value={school.eal_pct ?? null} max={100} suffix="%" />
          </Section>
        )}

        {/* Ethnicity */}
        {school.white_british_pct != null && (
          <Section title="Ethnicity Breakdown">
            <EthnicityChart school={school} />
          </Section>
        )}

        {/* Links */}
        <div className="flex gap-2 pt-2 pb-4">
          {school.website && (
            <a
              href={school.website.startsWith('http') ? school.website : `https://${school.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center px-3 py-1.5 bg-indigo-500 text-white rounded-full text-[12px] font-medium hover:bg-indigo-600 active:scale-95 transition-all"
            >
              Website
            </a>
          )}
          <a
            href={`https://reports.ofsted.gov.uk/provider/${school.urn}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center px-3 py-1.5 bg-gray-50 text-gray-600 rounded-full text-[12px] font-medium hover:bg-gray-100 active:scale-95 transition-all"
          >
            Ofsted Report
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] text-gray-400 uppercase">{label}</div>
      <div className="text-xs font-medium text-gray-900 truncate">{value}</div>
    </div>
  );
}
