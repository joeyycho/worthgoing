import type {
  AccommodationQuote,
  AccommodationQuoteProvider,
  FlightQuote,
  FlightQuoteProvider,
} from '../types/providers';

const FLIGHT_PROVIDERS = new Set<FlightQuoteProvider>([
  'serpapi',
  'duffel',
  'amadeus',
  'mock',
]);

const STAY_PROVIDERS = new Set<AccommodationQuoteProvider>([
  'serpapi',
  'amadeus',
  'mock',
]);

/** Reject NaN / Inf / negative before UI or local snapshot use. */
export function sanitizeDisplayKrw(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
}

export function coerceFlightProvider(
  raw: unknown,
  isMock = false,
): FlightQuoteProvider {
  if (typeof raw === 'string' && FLIGHT_PROVIDERS.has(raw as FlightQuoteProvider)) {
    return raw as FlightQuoteProvider;
  }
  // Unexpected provider must not crash UI.
  return isMock ? 'mock' : 'serpapi';
}

export function coerceStayProvider(
  raw: unknown,
  isMock = false,
): AccommodationQuoteProvider {
  if (typeof raw === 'string' && STAY_PROVIDERS.has(raw as AccommodationQuoteProvider)) {
    return raw as AccommodationQuoteProvider;
  }
  return isMock ? 'mock' : 'serpapi';
}

export function normalizeFlightQuote(raw: FlightQuote): FlightQuote {
  const isMock = Boolean(raw.isMock);
  const totalFareKrw = sanitizeDisplayKrw(raw.totalFareKrw);
  const stats = raw.stats ?? {
    min: null,
    max: null,
    avg: null,
    offerCount: 0,
    currency: 'KRW',
  };
  return {
    ...raw,
    totalFareKrw,
    bookingUrl: typeof raw.bookingUrl === 'string' ? raw.bookingUrl : '',
    isMock,
    priceMode: raw.priceMode === 'indicative' || raw.priceMode === 'mock' ? raw.priceMode : 'live',
    provider: coerceFlightProvider(raw.provider, isMock),
    stats: {
      ...stats,
      min: sanitizeDisplayKrw(stats.min),
      max: sanitizeDisplayKrw(stats.max),
      avg: sanitizeDisplayKrw(stats.avg),
      offerCount: Number.isFinite(stats.offerCount) ? Math.max(0, stats.offerCount) : 0,
      currency: typeof stats.currency === 'string' ? stats.currency : 'KRW',
    },
  };
}

export function normalizeAccommodationQuote(raw: AccommodationQuote): AccommodationQuote {
  const isMock = Boolean(raw.isMock);
  const totalStayKrw = sanitizeDisplayKrw(raw.totalStayKrw);
  const perPersonStayKrw =
    totalStayKrw == null ? null : sanitizeDisplayKrw(raw.perPersonStayKrw);
  const stats = raw.stats ?? {
    min: null,
    max: null,
    avg: null,
    offerCount: 0,
    currency: 'KRW',
  };
  return {
    ...raw,
    totalStayKrw,
    perPersonStayKrw,
    bookingUrl: typeof raw.bookingUrl === 'string' ? raw.bookingUrl : '',
    isMock,
    priceMode: raw.priceMode === 'indicative' || raw.priceMode === 'mock' ? raw.priceMode : 'live',
    provider: coerceStayProvider(raw.provider, isMock),
    stats: {
      ...stats,
      min: sanitizeDisplayKrw(stats.min),
      max: sanitizeDisplayKrw(stats.max),
      avg: sanitizeDisplayKrw(stats.avg),
      offerCount: Number.isFinite(stats.offerCount) ? Math.max(0, stats.offerCount) : 0,
      currency: typeof stats.currency === 'string' ? stats.currency : 'KRW',
    },
  };
}
