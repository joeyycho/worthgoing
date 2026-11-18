import type { ServerEnv } from '../env.js';
import {
  serpapiGet,
  type SerpapiSearchParams,
  type SerpapiSearchResponse,
} from '../serpapi/client.js';
import { resolveRoundTripDates } from './duffelProvider.js';
import { tryAmountToKrw } from './money.js';
import type { FlightQuoteResult, FlightSearchRequest } from './types.js';

/**
 * SerpApi Google Flights → FlightQuoteResult.
 *
 * Official:
 * - https://serpapi.com/google-flights-api
 * - https://serpapi.com/google-flights-results
 * - https://serpapi.com/blog/how-to-scrape-google-flights/
 *
 * Round-trip flow (required):
 * 1) Initial GET engine=google_flights type=1 → parse best_flights + other_flights
 * 2) Pick one outbound with departure_token (deterministic rule below)
 * 3) Second GET with departure_token → parse return options
 * 4) Preserve outbound↔inbound in summary only when step 3 succeeds
 * 5) Fare: selected return option `price` only (same object as its booking_token)
 *
 * ---------------------------------------------------------------------------
 * PRICE SEMANTICS — verification vs observed unlock
 * ---------------------------------------------------------------------------
 * SerpApi docs do **not** fully prove party vs per-adult or tax inclusion.
 *
 * Live observation (docs/serpapi-adults-fare-verify.md, Gate C context):
 *   ICN→KIX 2027-02-10..14; adults 1 vs 2 exact 2×; token return `price` = RT combo;
 *   taxes 미확인; other O&D / traveler types unverified.
 *
 * `SERPAPI_PARTY_RT_FARE_VERIFIED` stays **false** — not a full-criteria claim.
 * Limited product unlock uses `SERPAPI_OBSERVED_PARTY_RT_POLICY` instead:
 *   `'token_return_party_total'` → passthrough of token-confirmed return `price`
 *   with `adults=travelers` already applied by SerpApi (never sum legs, never × adults).
 */

/**
 * Full verification flag. Keep false until broader O&D / tax / docs acceptance.
 * Do **not** flip true solely from one-route adults 1 vs 2 observation.
 */
export const SERPAPI_PARTY_RT_FARE_VERIFIED = false;

/**
 * Limited observed-rule unlock (intentional, scoped — not “fully verified”).
 * `'token_return_party_total'` — selected return option price is RT party passthrough.
 * `null` — keep totalFareKrw null regardless of displayed prices.
 */
export type SerpapiObservedPartyRtPolicy = 'token_return_party_total' | null;

export const SERPAPI_OBSERVED_PARTY_RT_POLICY: SerpapiObservedPartyRtPolicy =
  'token_return_party_total';

/**
 * Full-verification party-price rule (only when SERPAPI_PARTY_RT_FARE_VERIFIED).
 * `'party_total'` — displayed price already covers all adults.
 * `'per_adult'` — multiply by adults.
 * `null` — not fully verified (current state).
 */
export type SerpapiPartyPriceRule = 'party_total' | 'per_adult' | null;

export const SERPAPI_PARTY_PRICE_RULE: SerpapiPartyPriceRule = SERPAPI_PARTY_RT_FARE_VERIFIED
  ? 'party_total'
  : null;

interface SerpapiAirportTime {
  name?: string;
  id?: string;
  time?: string;
}

interface SerpapiFlightLeg {
  departure_airport?: SerpapiAirportTime;
  arrival_airport?: SerpapiAirportTime;
  duration?: number;
  airline?: string;
  flight_number?: string;
  extensions?: string[];
}

interface SerpapiFlightOption {
  flights?: SerpapiFlightLeg[];
  total_duration?: number;
  price?: number;
  type?: string;
  departure_token?: string;
  booking_token?: string;
  extensions?: string[];
  airline_logo?: string;
}

export interface SerpapiGoogleFlightsResponse extends SerpapiSearchResponse {
  best_flights?: SerpapiFlightOption[];
  other_flights?: SerpapiFlightOption[];
  price_insights?: { lowest_price?: number };
}

function isUsableDisplayedPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0;
}

export function collectFlightOptions(
  response: SerpapiGoogleFlightsResponse,
): SerpapiFlightOption[] {
  const best = Array.isArray(response.best_flights) ? response.best_flights : [];
  const other = Array.isArray(response.other_flights) ? response.other_flights : [];
  return [...best, ...other];
}

/**
 * Deterministic outbound pick for departure_token confirm:
 * 1) Prefer options that have a non-empty departure_token
 * 2) Among those, prefer finite non-negative price (ascending)
 * 3) Tie-break: lower total_duration, then earlier first-leg departure time, then first in list
 * If no token exists, return null (cannot confirm return).
 */
export function pickOutboundOption(
  options: SerpapiFlightOption[],
): SerpapiFlightOption | null {
  const withToken = options.filter(
    (option) => typeof option.departure_token === 'string' && option.departure_token.trim(),
  );
  if (withToken.length === 0) return null;

  const ranked = [...withToken].sort((a, b) => {
    const priceA = isUsableDisplayedPrice(a.price) ? a.price : Number.POSITIVE_INFINITY;
    const priceB = isUsableDisplayedPrice(b.price) ? b.price : Number.POSITIVE_INFINITY;
    if (priceA !== priceB) return priceA - priceB;

    const durA = Number.isFinite(a.total_duration)
      ? (a.total_duration as number)
      : Number.POSITIVE_INFINITY;
    const durB = Number.isFinite(b.total_duration)
      ? (b.total_duration as number)
      : Number.POSITIVE_INFINITY;
    if (durA !== durB) return durA - durB;

    const timeA = a.flights?.[0]?.departure_airport?.time ?? '';
    const timeB = b.flights?.[0]?.departure_airport?.time ?? '';
    if (timeA !== timeB) return timeA < timeB ? -1 : 1;

    return 0;
  });

  return ranked[0] ?? null;
}

/**
 * Pick the cheapest return option for pairing.
 * Prefer a non-empty booking_token on ties so `price` stays bound to the same
 * bookable option (never attach another flight's price).
 * Outbound first-response price is never used as RT fare.
 */
export function pickReturnOption(
  options: SerpapiFlightOption[],
): SerpapiFlightOption | null {
  if (options.length === 0) return null;
  const ranked = [...options].sort((a, b) => {
    const priceA = isUsableDisplayedPrice(a.price) ? a.price : Number.POSITIVE_INFINITY;
    const priceB = isUsableDisplayedPrice(b.price) ? b.price : Number.POSITIVE_INFINITY;
    if (priceA !== priceB) return priceA - priceB;

    const bookA =
      typeof a.booking_token === 'string' && a.booking_token.trim().length > 0 ? 0 : 1;
    const bookB =
      typeof b.booking_token === 'string' && b.booking_token.trim().length > 0 ? 0 : 1;
    if (bookA !== bookB) return bookA - bookB;

    const durA = Number.isFinite(a.total_duration)
      ? (a.total_duration as number)
      : Number.POSITIVE_INFINITY;
    const durB = Number.isFinite(b.total_duration)
      ? (b.total_duration as number)
      : Number.POSITIVE_INFINITY;
    return durA - durB;
  });
  return ranked[0] ?? null;
}

/**
 * RT combo price from the **same** selected return option that carries
 * `booking_token` (when present). Never outbound price; never sum legs.
 */
export function selectedReturnComboPrice(
  returnOption: SerpapiFlightOption | null,
): number | null {
  if (!returnOption) return null;
  return isUsableDisplayedPrice(returnOption.price) ? returnOption.price : null;
}

/**
 * Convert a SerpApi displayed `price` into party-total KRW.
 *
 * Unlock paths (intentional, distinct):
 * 1) Full verification: `SERPAPI_PARTY_RT_FARE_VERIFIED` + `SERPAPI_PARTY_PRICE_RULE`
 * 2) Observed scoped unlock: `SERPAPI_OBSERVED_PARTY_RT_POLICY === 'token_return_party_total'`
 *    → party_total passthrough only (never × adults)
 *
 * Always: sanitize via tryAmountToKrw (neg / NaN / Inf / non-KRW unsupported → null).
 */
export function toPartyTotalFareKrw(options: {
  displayedPrice: number;
  adults: number;
  currency: string;
  env: ServerEnv;
  verified?: boolean;
  rule?: SerpapiPartyPriceRule;
  observedPolicy?: SerpapiObservedPartyRtPolicy;
}): number | null {
  const verified =
    options.verified !== undefined ? options.verified : SERPAPI_PARTY_RT_FARE_VERIFIED;
  const rule = options.rule !== undefined ? options.rule : SERPAPI_PARTY_PRICE_RULE;
  const observed =
    options.observedPolicy !== undefined
      ? options.observedPolicy
      : SERPAPI_OBSERVED_PARTY_RT_POLICY;

  if (!isUsableDisplayedPrice(options.displayedPrice)) {
    return null;
  }

  let amount: number | null = null;

  if (verified && rule != null) {
    const adults = Math.min(9, Math.max(1, options.adults));
    amount = rule === 'per_adult' ? options.displayedPrice * adults : options.displayedPrice;
  } else if (observed === 'token_return_party_total') {
    // Observed party_total passthrough for token-confirmed RT — do not × adults.
    amount = options.displayedPrice;
  } else {
    return null;
  }

  const converted = tryAmountToKrw(amount, options.currency, options.env);
  return converted.amountKrw;
}

export function buildSerpapiFlightsParams(
  env: ServerEnv,
  query: FlightSearchRequest,
  extras: { departure_token?: string } = {},
): SerpapiSearchParams {
  const origin = query.originAirports[0] ?? 'ICN';
  const travelers = Math.min(9, Math.max(1, query.travelers));
  const { departureDate, returnDate } = resolveRoundTripDates(query);

  const params: SerpapiSearchParams = {
    engine: 'google_flights',
    departure_id: origin,
    arrival_id: query.destinationAirport,
    outbound_date: departureDate,
    return_date: returnDate,
    type: 1,
    adults: travelers,
    travel_class: 1,
    currency: env.serpapiCurrency,
    gl: env.serpapiGl,
    hl: env.serpapiHl,
  };

  if (extras.departure_token) {
    params.departure_token = extras.departure_token;
  }

  return params;
}

function firstLeg(option: SerpapiFlightOption | null | undefined): SerpapiFlightLeg | null {
  return option?.flights?.[0] ?? null;
}

function extractCarrier(option: SerpapiFlightOption | null): string {
  const airline = firstLeg(option)?.airline?.trim();
  return airline && airline.length > 0 ? airline : 'SerpApi';
}

/** Only when SerpApi extensions clearly mention baggage — never invent. */
export function extractBaggageNotes(
  outbound: SerpapiFlightOption | null,
  inbound: SerpapiFlightOption | null,
): string | null {
  const blobs = [
    ...(outbound?.extensions ?? []),
    ...(outbound?.flights?.flatMap((leg) => leg.extensions ?? []) ?? []),
    ...(inbound?.extensions ?? []),
    ...(inbound?.flights?.flatMap((leg) => leg.extensions ?? []) ?? []),
  ]
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .join(' · ');

  if (!blobs) return null;

  // Require an affirmative inclusion signal — "for a fee" alone is not included baggage.
  const lower = blobs.toLowerCase();
  const mentionsBag =
    /bag|baggage|수하물|수화물|checked|carry[- ]?on|기내/.test(lower);
  const included =
    /included|free checked|free carry|무료|포함/.test(lower) &&
    !/for a fee|유료|추가 요금/.test(lower);

  if (mentionsBag && included) {
    return `수하물 안내: ${blobs.slice(0, 160)} (SerpApi extensions)`;
  }
  return null;
}

function formatLegSnippet(option: SerpapiFlightOption | null): string | null {
  if (!option) return null;
  const leg = firstLeg(option);
  if (!leg) return null;
  const parts: string[] = [];
  if (leg.airline?.trim()) parts.push(leg.airline.trim());
  if (leg.flight_number?.trim()) parts.push(leg.flight_number.trim());
  const dep = leg.departure_airport?.time?.trim();
  const arr = leg.arrival_airport?.time?.trim();
  if (dep && arr) {
    parts.push(`${dep}→${arr}`);
  } else if (dep) {
    parts.push(dep);
  }
  if (Number.isFinite(option.total_duration)) {
    parts.push(`${option.total_duration}분`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function buildSummary(options: {
  origin: string;
  destination: string;
  travelers: number;
  flexible: boolean;
  departureDate: string;
  returnDate: string;
  outbound: SerpapiFlightOption | null;
  inbound: SerpapiFlightOption | null;
  returnConfirmed: boolean;
  fareNote: string;
}): string {
  const bits: string[] = [
    `${options.origin} → ${options.destination} 왕복`,
    `${options.travelers}명`,
  ];

  if (options.flexible) {
    bits.push(`유연 일정 예상 (${options.departureDate}~${options.returnDate})`);
  } else {
    bits.push(`${options.departureDate}~${options.returnDate}`);
  }

  const outSnippet = formatLegSnippet(options.outbound);
  if (outSnippet) {
    bits.push(`가는편 ${outSnippet}`);
  }

  if (options.returnConfirmed) {
    const inSnippet = formatLegSnippet(options.inbound);
    if (inSnippet) {
      bits.push(`오는편 ${inSnippet}`);
    } else {
      bits.push('오는편 확인됨');
    }
  } else {
    bits.push('오는편 미확인');
  }

  bits.push(options.fareNote);
  return bits.join(' · ');
}

/**
 * Resolve party RT KRW from token-confirmed return combo price.
 * Uses observed scoped unlock and/or full verification — never outbound-only price.
 */
function resolveFareKrw(
  env: ServerEnv,
  displayedPrice: number | null,
  adults: number,
): { totalFareKrw: number | null; currency: string; reason: string } {
  const currency = env.serpapiCurrency || 'KRW';
  if (displayedPrice == null || !isUsableDisplayedPrice(displayedPrice)) {
    return {
      totalFareKrw: null,
      currency,
      reason: '왕복 콤보 표시가 없음 (확인불가)',
    };
  }
  const party = toPartyTotalFareKrw({
    displayedPrice,
    adults,
    currency,
    env,
  });
  if (party == null) {
    const observedOff = SERPAPI_OBSERVED_PARTY_RT_POLICY == null && !SERPAPI_PARTY_RT_FARE_VERIFIED;
    return {
      totalFareKrw: null,
      currency,
      reason: observedOff
        ? '왕복·인원 요금 정책 미활성으로 KRW 미표시'
        : '표시가 변환 실패 (비KRW·무효 금액)',
    };
  }
  return {
    totalFareKrw: party,
    currency: 'KRW',
    reason:
      '예상 왕복 항공료 · 검색 당시 표시 가격 (예약 단계 변동·세금 확인 · 관측 범위 한정)',
  };
}

export async function searchSerpapiFlights(
  env: ServerEnv,
  query: FlightSearchRequest,
): Promise<FlightQuoteResult> {
  const origin = query.originAirports[0] ?? 'ICN';
  const destination = query.destinationAirport;
  const travelers = Math.min(9, Math.max(1, query.travelers));
  const searchedAt = new Date().toISOString();
  const { departureDate, returnDate, flexible } = resolveRoundTripDates(query);
  const priceMode = flexible ? 'indicative' : 'live';

  const initialParams = buildSerpapiFlightsParams(env, query);
  const initial = (await serpapiGet(
    env,
    initialParams,
    env.serpapiTimeoutMs,
  )) as SerpapiGoogleFlightsResponse;

  const outboundOptions = collectFlightOptions(initial);
  const outbound = pickOutboundOption(outboundOptions);

  let inbound: SerpapiFlightOption | null = null;
  let returnConfirmed = false;
  let returnOptions: SerpapiFlightOption[] = [];

  if (outbound?.departure_token) {
    const returnResponse = (await serpapiGet(
      env,
      buildSerpapiFlightsParams(env, query, {
        departure_token: outbound.departure_token,
      }),
      env.serpapiTimeoutMs,
    )) as SerpapiGoogleFlightsResponse;
    returnOptions = collectFlightOptions(returnResponse);
    inbound = pickReturnOption(returnOptions);
    returnConfirmed = returnOptions.length > 0;
  }

  // ONLY the selected return option's price (= same object as its booking_token).
  // Never first-response outbound price. Never outbound+return sum.
  const candidatePrice =
    returnConfirmed && inbound ? selectedReturnComboPrice(inbound) : null;

  const fare = resolveFareKrw(env, candidatePrice, travelers);

  const carrier = extractCarrier(outbound ?? outboundOptions[0] ?? null);
  const baggageNotes = extractBaggageNotes(outbound, inbound);
  const offerCount = outboundOptions.length;

  const summary = buildSummary({
    origin,
    destination,
    travelers,
    flexible,
    departureDate,
    returnDate,
    outbound: outbound ?? outboundOptions[0] ?? null,
    inbound,
    returnConfirmed,
    fareNote: fare.reason,
  });

  return {
    totalFareKrw: fare.totalFareKrw,
    currency: fare.currency,
    carrier,
    summary,
    bookingUrl: '',
    isMock: false,
    priceMode,
    searchedAt,
    roundTrip: true,
    baggageNotes,
    stats: {
      min: fare.totalFareKrw,
      max: fare.totalFareKrw,
      avg: fare.totalFareKrw,
      offerCount,
      currency: fare.currency,
    },
    provider: 'serpapi',
    destinationId: query.destinationId,
    destinationAirport: destination,
  };
}
