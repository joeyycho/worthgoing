import type { ServerEnv } from '../env.js';
import {
  serpapiGet,
  type SerpapiSearchParams,
  type SerpapiSearchResponse,
} from '../serpapi/client.js';
import { statsFromAmounts, tryAmountToKrw } from '../flights/money.js';
import { defaultRoomCount, resolveHotelCityCode } from './cityCodes.js';
import type { AccommodationQuoteResult, AccommodationSearchRequest } from './types.js';

/**
 * SerpApi Google Hotels → AccommodationQuoteResult.
 *
 * Official:
 * - https://serpapi.com/google-hotels-api
 * - https://serpapi.com/google-hotels-properties
 *
 * ---------------------------------------------------------------------------
 * PRICE SEMANTICS (Step 4 — stay total vs nightly)
 * ---------------------------------------------------------------------------
 * SerpApi documents:
 *   - `total_rate` → "Total rate for the entire trip"
 *   - `rate_per_night` → "Rate per night"
 *   - `extracted_after_taxes_fees` → including taxes and fees
 *   - `extracted_before_taxes_fees` → before taxes and fees
 *   - `extracted_lowest` → lowest amount for that object
 *
 * Docs/examples distinguish stay total from nightly clearly enough to emit
 * `totalStayKrw` when a finite extracted amount is present. Prefer after-tax
 * when both after-tax and before-tax exist. Never treat nightly as a stay
 * total; never multiply a stay total by nights; never invent a tax %.
 *
 * Rooms: Google Hotels has no documented `rooms` query param. We pass
 * `adults=travelers` and keep `defaultRoomCount` for quote metadata only —
 * do not multiply Google's stay total by local room count.
 *
 * Ignore `ads[]` (sponsored / ambiguous nightly vs total).
 */

export type StayPriceSource =
  | 'total_after_tax'
  | 'total_lowest'
  | 'total_before_tax'
  | 'nightly_lowest'
  | 'nightly_before_tax'
  | 'none';

export interface StayPriceExtraction {
  amount: number | null;
  source: StayPriceSource;
}

interface RateBlock {
  extracted_lowest?: unknown;
  extracted_before_taxes_fees?: unknown;
  extracted_after_taxes_fees?: unknown;
  lowest?: unknown;
  before_taxes_fees?: unknown;
  after_taxes_fees?: unknown;
}

export interface SerpapiHotelProperty {
  name?: string;
  type?: string;
  total_rate?: RateBlock;
  rate_per_night?: RateBlock;
  /** Sponsored flag when present — still allowed if in properties[] */
  sponsored?: boolean;
}

export interface SerpapiGoogleHotelsResponse extends SerpapiSearchResponse {
  properties?: SerpapiHotelProperty[];
  ads?: unknown[];
}

function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Extract a stay-total amount in the response currency (not yet KRW).
 *
 * Priority (critical — do not reorder without updating tests + step-4 doc):
 * 1. total_rate.extracted_after_taxes_fees (explicit after-tax stay total)
 * 2. total_rate.extracted_lowest (documented stay total)
 * 3. total_rate.extracted_before_taxes_fees (before-tax stay total only)
 * 4. rate_per_night.extracted_lowest × nights
 * 5. rate_per_night.extracted_before_taxes_fees × nights
 * 6. else null
 *
 * Never multiplies a total_rate by nights. Never treats nightly as total.
 */
export function extractStayTotalKrw(
  property: SerpapiHotelProperty,
  nights: number,
): StayPriceExtraction {
  const safeNights = Math.max(1, nights);
  const total = property.total_rate;
  const nightly = property.rate_per_night;

  if (total && isValidAmount(total.extracted_after_taxes_fees)) {
    return { amount: total.extracted_after_taxes_fees, source: 'total_after_tax' };
  }
  if (total && isValidAmount(total.extracted_lowest)) {
    return { amount: total.extracted_lowest, source: 'total_lowest' };
  }
  if (total && isValidAmount(total.extracted_before_taxes_fees)) {
    return { amount: total.extracted_before_taxes_fees, source: 'total_before_tax' };
  }

  if (nightly && isValidAmount(nightly.extracted_lowest)) {
    return {
      amount: nightly.extracted_lowest * safeNights,
      source: 'nightly_lowest',
    };
  }
  if (nightly && isValidAmount(nightly.extracted_before_taxes_fees)) {
    return {
      amount: nightly.extracted_before_taxes_fees * safeNights,
      source: 'nightly_before_tax',
    };
  }

  return { amount: null, source: 'none' };
}

function priceQualification(source: StayPriceSource, nights: number): string | null {
  switch (source) {
    case 'total_after_tax':
      return '세금·수수료 포함 총액';
    case 'total_lowest':
      return '총액(최저가)';
    case 'total_before_tax':
      return '세금·수수료 미포함 가능(총액)';
    case 'nightly_lowest':
      return `1박×${nights}박`;
    case 'nightly_before_tax':
      return `1박×${nights}박 · 세금·수수료 미포함 가능`;
    default:
      return null;
  }
}

function nightsBetween(checkInDate: string, checkOutDate: string): number | null {
  const start = Date.parse(`${checkInDate}T00:00:00Z`);
  const end = Date.parse(`${checkOutDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const diff = Math.round((end - start) / 86_400_000);
  return diff >= 1 ? diff : null;
}

function addDaysUtc(isoDate: string, days: number): string {
  const start = new Date(`${isoDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
}

/**
 * Reuse Amadeus-style stay date resolution with checkout-after-checkin +
 * nights derived from the dated window when both dates are present.
 */
export function resolveStayDates(query: AccommodationSearchRequest): {
  checkInDate: string;
  checkOutDate: string;
  flexible: boolean;
  nights: number;
} {
  const requestedNights = Math.max(1, query.nights);

  if (query.checkInDate && query.checkOutDate) {
    const computed = nightsBetween(query.checkInDate, query.checkOutDate);
    if (computed != null) {
      return {
        checkInDate: query.checkInDate,
        checkOutDate: query.checkOutDate,
        flexible: false,
        nights: computed,
      };
    }
    // checkout <= checkin or unparseable → force checkout after checkin
    return {
      checkInDate: query.checkInDate,
      checkOutDate: addDaysUtc(query.checkInDate, requestedNights),
      flexible: false,
      nights: requestedNights,
    };
  }

  if (query.checkInDate && !query.checkOutDate) {
    return {
      checkInDate: query.checkInDate,
      checkOutDate: addDaysUtc(query.checkInDate, requestedNights),
      flexible: false,
      nights: requestedNights,
    };
  }

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 30);
  const checkInDate = start.toISOString().slice(0, 10);
  return {
    checkInDate,
    checkOutDate: addDaysUtc(checkInDate, requestedNights),
    flexible: true,
    nights: requestedNights,
  };
}

/** Build Google Hotels `q` from city + country (not IATA alone). */
export function buildHotelsQuery(query: AccommodationSearchRequest): string {
  const city = query.city.trim();
  const country = query.country.trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || 'hotel';
}

export function buildSerpapiHotelsParams(
  env: ServerEnv,
  query: AccommodationSearchRequest,
  dates: { checkInDate: string; checkOutDate: string },
): SerpapiSearchParams {
  const adults = Math.min(9, Math.max(1, query.travelers));
  return {
    engine: 'google_hotels',
    q: buildHotelsQuery(query),
    check_in_date: dates.checkInDate,
    check_out_date: dates.checkOutDate,
    adults,
    currency: env.serpapiCurrency,
    gl: env.serpapiGl,
    hl: env.serpapiHl,
    // Lowest price — fits budget min selection
    sort_by: 3,
  };
}

function emptyQuote(
  query: AccommodationSearchRequest,
  opts: {
    nights: number;
    rooms: number;
    flexible: boolean;
    checkInDate: string;
    checkOutDate: string;
    cityCode: string | null;
    searchedAt: string;
    summaryExtra?: string;
  },
): AccommodationQuoteResult {
  const qualify = opts.summaryExtra ? ` · ${opts.summaryExtra}` : '';
  return {
    totalStayKrw: null,
    perPersonStayKrw: null,
    currency: 'KRW',
    propertyName: '',
    summary: opts.flexible
      ? `${opts.nights}박 · ${query.travelers}명 · 유연 일정 참고가 (${opts.checkInDate}~${opts.checkOutDate}) · 요금 없음${qualify}`
      : `${opts.nights}박 · ${query.travelers}명 · 검색 시점 (${opts.checkInDate}~${opts.checkOutDate}) · 요금 없음${qualify}`,
    bookingUrl: '',
    isMock: false,
    priceMode: opts.flexible ? 'indicative' : 'live',
    searchedAt: opts.searchedAt,
    nights: opts.nights,
    rooms: opts.rooms,
    travelers: query.travelers,
    stats: { min: null, max: null, avg: null, offerCount: 0, currency: 'KRW' },
    provider: 'serpapi',
    destinationId: query.destinationId,
    city: query.city,
    country: query.country,
    cityCode: opts.cityCode,
  };
}

/**
 * Search Google Hotels via shared SerpApi client.
 * Empty / unpriced inventories return serpapi + null totals (no throw).
 * HTTP/timeout/API errors throw SerpapiApiError for service → Mock.
 */
export async function searchSerpapiAccommodations(
  env: ServerEnv,
  query: AccommodationSearchRequest,
): Promise<AccommodationQuoteResult> {
  const rooms = query.rooms ?? defaultRoomCount(query.travelers);
  const cityCode = resolveHotelCityCode(query);
  const { checkInDate, checkOutDate, flexible, nights } = resolveStayDates(query);
  const searchedAt = new Date().toISOString();
  const adults = Math.min(9, Math.max(1, query.travelers));

  const params = buildSerpapiHotelsParams(env, query, { checkInDate, checkOutDate });
  const response = (await serpapiGet(
    env,
    params,
    env.serpapiTimeoutMs,
  )) as SerpapiGoogleHotelsResponse;

  // properties[] only — ignore ads[] (sponsored; ambiguous nightly vs total)
  const properties = Array.isArray(response.properties) ? response.properties : [];

  const amountsKrw: number[] = [];
  let bestName = '';
  let bestSource: StayPriceSource = 'none';
  let bestAmount = Number.POSITIVE_INFINITY;
  const currency = env.serpapiCurrency || 'KRW';

  for (const property of properties) {
    const extracted = extractStayTotalKrw(property, nights);
    if (extracted.amount == null || extracted.source === 'none') continue;

    const converted = tryAmountToKrw(extracted.amount, currency, env);
    if (converted.amountKrw == null) continue;

    amountsKrw.push(converted.amountKrw);
    if (converted.amountKrw < bestAmount) {
      bestAmount = converted.amountKrw;
      bestSource = extracted.source;
      // Property name of the cheapest priced row only — never invent
      bestName =
        typeof property.name === 'string' && property.name.trim() ? property.name.trim() : '';
    }
  }

  if (amountsKrw.length === 0) {
    return emptyQuote(query, {
      nights,
      rooms,
      flexible,
      checkInDate,
      checkOutDate,
      cityCode,
      searchedAt,
      summaryExtra: `객실 메타 ${rooms}실 · Google adults=${adults}`,
    });
  }

  const stats = statsFromAmounts(amountsKrw, 'KRW');
  const totalStayKrw = stats.min;
  const perPersonStayKrw =
    totalStayKrw == null ? null : Math.round(totalStayKrw / Math.max(1, query.travelers));
  const qualify = priceQualification(bestSource, nights);
  const roomsNote = `객실 메타 ${rooms}실 · Google Hotels는 adults=${adults}만 전달(rooms 미전송)`;

  const summaryParts = [
    bestName || '숙소',
    `${nights}박`,
    `${query.travelers}명`,
    flexible
      ? `유연 일정 참고가 (${checkInDate}~${checkOutDate})`
      : `검색 시점 (${checkInDate}~${checkOutDate})`,
    qualify,
    roomsNote,
  ].filter(Boolean);

  return {
    totalStayKrw,
    perPersonStayKrw,
    currency: 'KRW',
    propertyName: bestName,
    summary: summaryParts.join(' · '),
    bookingUrl: '',
    isMock: false,
    priceMode: flexible ? 'indicative' : 'live',
    searchedAt,
    nights,
    rooms,
    travelers: query.travelers,
    stats,
    provider: 'serpapi',
    destinationId: query.destinationId,
    city: query.city,
    country: query.country,
    cityCode,
  };
}
