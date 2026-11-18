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
 *
 * ---------------------------------------------------------------------------
 * PRICE SEMANTICS (Step 3 — party round-trip fare)
 * ---------------------------------------------------------------------------
 * SerpApi documents option `price` as "ticket price in the selected currency"
 * but does **not** unambiguously prove:
 *   (a) first-response outbound `price` is full round-trip vs outbound-only
 *   (b) second-response return `price` is full RT for the pair vs return-leg only
 *   (c) whether we may add outbound+inbound prices
 *   (d) whether `price` is per-adult or party-total when adults=N
 *
 * Docs/fixtures available in-repo and on SerpApi pages are insufficient for
 * (a)–(d). Live adults=1 vs adults=2 comparison on the same route is still
 * required. Until that evidence is recorded:
 *   → `totalFareKrw` is **null by policy** (do not invent RT or party totals).
 *   → Do not mark Step 3 "complete with live prices".
 *
 * `SERPAPI_PARTY_RT_FARE_VERIFIED` gates the party helper. Keep false until
 * live comparison is documented in docs/serpapi-step-3.md.
 */

/** Flip only after live adults=1 vs 2 + RT price evidence is documented. */
export const SERPAPI_PARTY_RT_FARE_VERIFIED = false;

/**
 * Verified party-price rule once live A/B is done.
 * `'party_total'` — displayed price already covers all adults.
 * `'per_adult'` — multiply by adults.
 * `null` — unverified; helper must return null (current Step 3 policy).
 */
export type SerpapiPartyPriceRule = 'party_total' | 'per_adult' | null;

export const SERPAPI_PARTY_PRICE_RULE: SerpapiPartyPriceRule = SERPAPI_PARTY_RT_FARE_VERIFIED
  ? null // placeholder: set to 'party_total' | 'per_adult' when verified
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
 * 2) Among those, prefer finite numeric price (ascending)
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
    const priceA = Number.isFinite(a.price) ? (a.price as number) : Number.POSITIVE_INFINITY;
    const priceB = Number.isFinite(b.price) ? (b.price as number) : Number.POSITIVE_INFINITY;
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
 * Pick the cheapest return option (finite price) for summary pairing.
 * Price is NOT used for totalFareKrw unless party RT semantics are verified.
 */
export function pickReturnOption(
  options: SerpapiFlightOption[],
): SerpapiFlightOption | null {
  if (options.length === 0) return null;
  const ranked = [...options].sort((a, b) => {
    const priceA = Number.isFinite(a.price) ? (a.price as number) : Number.POSITIVE_INFINITY;
    const priceB = Number.isFinite(b.price) ? (b.price as number) : Number.POSITIVE_INFINITY;
    if (priceA !== priceB) return priceA - priceB;
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
 * Convert a SerpApi displayed `price` into party-total KRW.
 *
 * When `SERPAPI_PARTY_RT_FARE_VERIFIED` is false (current policy), always
 * returns null — do not multiply/divide by guesswork.
 *
 * When verified:
 * - `party_total` → tryAmountToKrw(displayed)
 * - `per_adult` → tryAmountToKrw(displayed * adults)
 */
export function toPartyTotalFareKrw(options: {
  displayedPrice: number;
  adults: number;
  currency: string;
  env: ServerEnv;
  verified?: boolean;
  rule?: SerpapiPartyPriceRule;
}): number | null {
  const verified = options.verified ?? SERPAPI_PARTY_RT_FARE_VERIFIED;
  const rule = options.rule ?? SERPAPI_PARTY_PRICE_RULE;
  if (!verified || rule == null) {
    return null;
  }
  if (!Number.isFinite(options.displayedPrice)) {
    return null;
  }
  const adults = Math.min(9, Math.max(1, options.adults));
  const amount =
    rule === 'per_adult' ? options.displayedPrice * adults : options.displayedPrice;
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
  fareNullReason: string;
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

  bits.push(options.fareNullReason);
  return bits.join(' · ');
}

/**
 * Resolve party RT KRW from a candidate displayed price under the verified rule.
 * Always null while SERPAPI_PARTY_RT_FARE_VERIFIED is false.
 */
function resolveFareKrw(
  env: ServerEnv,
  displayedPrice: number | null,
  adults: number,
): { totalFareKrw: number | null; currency: string; reason: string } {
  const currency = env.serpapiCurrency || 'KRW';
  if (displayedPrice == null || !Number.isFinite(displayedPrice)) {
    return {
      totalFareKrw: null,
      currency,
      reason: '표시가 없음 (KRW 미표시)',
    };
  }
  const party = toPartyTotalFareKrw({
    displayedPrice,
    adults,
    currency,
    env,
  });
  if (party == null) {
    return {
      totalFareKrw: null,
      currency,
      reason:
        '왕복·인원 요금 의미 미검증으로 KRW 미표시 (live adults=1 vs 2 비교 필요)',
    };
  }
  return {
    totalFareKrw: party,
    currency: 'KRW',
    reason: '검색 시점 시세',
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

  // Candidate displayed price for future verified mapping only.
  // Prefer return-leg option price when return confirmed (Google shows pair total there
  // in typical UX) — but we still refuse to publish totalFareKrw until verified.
  const candidatePrice =
    returnConfirmed && inbound && Number.isFinite(inbound.price)
      ? (inbound.price as number)
      : outbound && Number.isFinite(outbound.price)
        ? (outbound.price as number)
        : null;

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
    fareNullReason: fare.reason,
  });

  return {
    // Party RT fare remains null until SERPAPI_PARTY_RT_FARE_VERIFIED + rule are set.
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
      // Publish min/max/avg only when party RT fare semantics are verified.
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
