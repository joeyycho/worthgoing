/**
 * Saved / shared price provenance helpers.
 *
 * Classify only from real `isMock` / `priceMode` fields. Never invent provenance
 * for legacy snapshots, never treat missing as mock, and never label LIVE when
 * the fields are incomplete or contradictory.
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
