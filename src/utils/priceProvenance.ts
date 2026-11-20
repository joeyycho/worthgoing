/**
 * Price provenance helpers for saved/shared trips and live search results.
 *
 * Classify only from real `isMock` / `priceMode` fields. Never invent provenance
 * for legacy snapshots, never treat missing as mock, and never label LIVE when
 * the fields are incomplete or contradictory. Search-form CTA must not claim
 * LIVE or MOCK before results exist.
 */

export type PriceProvenanceKind = 'live' | 'indicative' | 'mock' | 'unknown';

/** Shared-trip banner / share-message aggregate (flight + stay). */
export type SharedProvenanceSummary =
  | 'live'
  | 'mock'
  | 'mixed'
  | 'indicative'
  | 'unknown';

export const PRICE_PROVENANCE_LABEL: Record<PriceProvenanceKind, string> = {
  live: '실시간 검색',
  indicative: '예상 가격',
  mock: '예시 가격',
  unknown: '출처 확인 불가',
};

/** Post-search result chips / detail headings (GAL-32). Reuses the same classifier. */
export const SEARCH_RESULT_PROVENANCE_LABEL: Record<PriceProvenanceKind, string> = {
  live: '실시간 검색 결과',
  indicative: '예상 가격',
  mock: '예시 가격',
  unknown: '가격 출처 확인 불가',
};

/** Optional results-list banner — only when at least one quote is mock. */
export const SEARCH_RESULTS_PARTIAL_MOCK_BANNER = '일부 가격은 예시 데이터입니다.';

/** Pre-search CTA — must not claim LIVE or MOCK. */
export const SEARCH_FORM_CTA_LABEL = '여행지 검색하기';

export const SEARCH_FORM_CTA_HELPER =
  '예산과 일정에 맞는 여행지를 찾아 드려요.';

export const SEARCH_LOADING_TITLE = '추천을 준비하고 있어요';

export const SEARCH_LOADING_HELPER =
  '항공·숙소 가격을 불러오는 중이에요.';

/** Phrases banned on the pre-search form (CTA + helpers). */
export const SEARCH_FORM_BANNED_PHRASES = [
  'MOCK 검색 시작',
  'MOCK 데이터로 검색',
  '실시간 가격 확정',
  '예약 가능한 가격 검색',
  'MOCK 예시',
  '실시간 검색이 아닙니다',
] as const;

export const SHARED_PROVENANCE_PHRASE: Record<SharedProvenanceSummary, string> = {
  live: '저장 당시 실시간 검색 결과',
  mock: '예시 가격이 포함된 공유 결과',
  mixed: '실시간 검색 및 예시 가격 포함',
  indicative: '일부 가격은 예상 가격입니다',
  unknown: '일부 가격의 출처를 확인할 수 없습니다',
};

/** Quote-like shape; legacy JSON may omit provenance fields. */
export interface ProvenanceQuoteFields {
  isMock?: boolean;
  priceMode?: string | null;
  /** Amount is unrelated to provenance classification. */
  totalFareKrw?: number | null;
  totalStayKrw?: number | null;
}

function hasPriceMode(value: unknown): value is 'live' | 'indicative' | 'mock' {
  return value === 'live' || value === 'indicative' || value === 'mock';
}

/**
 * Classify one flight or stay quote.
 * - live only when isMock===false AND priceMode==='live'
 * - isMock===true → mock (even if priceMode says live)
 * - priceMode==='mock' → mock (even if isMock===false)
 * - missing / incomplete / other contradiction → unknown (never invent live/mock)
 */
export function classifyQuoteProvenance(
  quote: ProvenanceQuoteFields | null | undefined,
): PriceProvenanceKind {
  if (quote == null || typeof quote !== 'object') {
    return 'unknown';
  }

  const hasIsMock = typeof quote.isMock === 'boolean';
  const mode = quote.priceMode;
  const knownMode = hasPriceMode(mode);

  if (!hasIsMock && !knownMode) {
    return 'unknown';
  }

  // Explicit mock wins — never label live when isMock is true.
  if (hasIsMock && quote.isMock === true) {
    return 'mock';
  }

  // priceMode=mock with isMock false (or missing) — contradictory / mock, not live.
  if (mode === 'mock') {
    return 'mock';
  }

  if (mode === 'indicative') {
    return 'indicative';
  }

  // Confirmed live only when both signals agree.
  if (hasIsMock && quote.isMock === false && mode === 'live') {
    return 'live';
  }

  // Partial fields (e.g. isMock false without priceMode, or priceMode live without isMock).
  return 'unknown';
}

/**
 * Saved-trip row summary. Flight and stay are always labeled separately when
 * present; both unknown → single "가격 출처 확인 불가".
 */
export function formatSavedTripProvenanceSummary(
  flight: ProvenanceQuoteFields | null | undefined,
  lodging: ProvenanceQuoteFields | null | undefined,
): string {
  const flightKind = classifyQuoteProvenance(flight);
  const stayKind = classifyQuoteProvenance(lodging);

  if (flightKind === 'unknown' && stayKind === 'unknown') {
    return '가격 출처 확인 불가';
  }

  const parts: string[] = [];
  if (flight != null) {
    parts.push(`항공권 ${PRICE_PROVENANCE_LABEL[flightKind]}`);
  }
  if (lodging != null) {
    parts.push(`숙박 ${PRICE_PROVENANCE_LABEL[stayKind]}`);
  }

  return parts.length > 0 ? parts.join(' · ') : '가격 출처 확인 불가';
}

/**
 * Aggregate flight+stay for shared banner / share copy.
 * Whole trip is "live" only when BOTH are confirmed live.
 */
export function classifySharedTripProvenance(
  flight: ProvenanceQuoteFields | null | undefined,
  lodging: ProvenanceQuoteFields | null | undefined,
): SharedProvenanceSummary {
  const flightKind = classifyQuoteProvenance(flight);
  const stayKind = classifyQuoteProvenance(lodging);

  if (flightKind === 'unknown' || stayKind === 'unknown') {
    return 'unknown';
  }

  if (flightKind === 'live' && stayKind === 'live') {
    return 'live';
  }

  if (
    (flightKind === 'live' && stayKind === 'mock') ||
    (flightKind === 'mock' && stayKind === 'live')
  ) {
    return 'mixed';
  }

  if (flightKind === 'indicative' || stayKind === 'indicative') {
    return 'indicative';
  }

  if (flightKind === 'mock' && stayKind === 'mock') {
    return 'mock';
  }

  return 'unknown';
}

export function formatSharedTripProvenancePhrase(
  flight: ProvenanceQuoteFields | null | undefined,
  lodging: ProvenanceQuoteFields | null | undefined,
): string {
  return SHARED_PROVENANCE_PHRASE[classifySharedTripProvenance(flight, lodging)];
}

/** Short share-message headline reflecting actual provenance (no blanket MOCK). */
export function formatShareMessageHeadline(
  flight: ProvenanceQuoteFields | null | undefined,
  lodging: ProvenanceQuoteFields | null | undefined,
): string {
  switch (classifySharedTripProvenance(flight, lodging)) {
    case 'live':
      return '갈만해 여행 결과 공유 · 저장 당시 실시간 검색';
    case 'mock':
      return '갈만해 여행 결과 공유 · 예시 가격 포함';
    case 'mixed':
      return '갈만해 여행 결과 공유 · 실시간·예시 가격 포함';
    case 'indicative':
      return '갈만해 여행 결과 공유 · 일부 예상 가격';
    default:
      return '갈만해 여행 결과 공유 · 가격 출처 확인 필요';
  }
}

/** Flight/stay chip for live search results — always separate labels. */
export function formatSearchQuoteProvenanceChip(
  quote: ProvenanceQuoteFields | null | undefined,
  channel: 'flight' | 'stay',
): string {
  const kind = classifyQuoteProvenance(quote);
  const prefix = channel === 'flight' ? '항공' : '숙소';
  return `${prefix} ${SEARCH_RESULT_PROVENANCE_LABEL[kind]}`;
}

/** Compact detail section marker, e.g. `(실시간 검색 결과)`. */
export function formatSearchQuoteProvenanceParen(
  quote: ProvenanceQuoteFields | null | undefined,
): string {
  return `(${SEARCH_RESULT_PROVENANCE_LABEL[classifyQuoteProvenance(quote)]})`;
}

export function quoteIsMockProvenance(
  quote: ProvenanceQuoteFields | null | undefined,
): boolean {
  return classifyQuoteProvenance(quote) === 'mock';
}

/** True when any recommendation has mock flight or stay provenance. */
export function recommendationsIncludeMockPrice(
  items: Array<{
    flight?: ProvenanceQuoteFields | null;
    lodging?: ProvenanceQuoteFields | null;
  }>,
): boolean {
  return items.some(
    (item) => quoteIsMockProvenance(item.flight) || quoteIsMockProvenance(item.lodging),
  );
}

/**
 * Pre-search copy must never claim LIVE or MOCK.
 * Returns the first banned substring found, or null when clean.
 */
export function findBannedPreSearchPhrase(...parts: string[]): string | null {
  const haystack = parts.join('\n');
  for (const banned of SEARCH_FORM_BANNED_PHRASES) {
    if (haystack.includes(banned)) {
      return banned;
    }
  }
  if (/\bMOCK\b/i.test(haystack)) {
    return 'MOCK';
  }
  if (haystack.includes('실시간 검색') || haystack.includes('실시간 가격')) {
    return '실시간';
  }
  return null;
}
