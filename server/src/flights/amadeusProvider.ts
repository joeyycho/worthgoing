import type { ServerEnv } from '../env.js';
import { amadeusGet } from '../amadeus/client.js';
import { statsFromAmounts, toKrw } from './money.js';
import type { FlightQuoteResult, FlightSearchRequest } from './types.js';

interface FlightOffersResponse {
  data?: Array<{
    price?: { total?: string; currency?: string; grandTotal?: string };
    validatingAirlineCodes?: string[];
    itineraries?: Array<{ segments?: Array<{ carrierCode?: string }> }>;
    travelerPricings?: Array<{
      fareDetailsBySegment?: Array<{
        includedCheckedBags?: { quantity?: number; weight?: number; weightUnit?: string };
      }>;
    }>;
  }>;
}

interface FlightDatesResponse {
  data?: Array<{
    departureDate?: string;
    returnDate?: string;
    price?: { total?: string; currency?: string };
  }>;
  meta?: { currency?: string };
}

function isFlexible(query: FlightSearchRequest): boolean {
  return !query.departureDate && !query.returnDate;
}

function resolveRoundTripDates(query: FlightSearchRequest): {
  departureDate: string;
  returnDate: string;
  flexible: boolean;
} {
  if (query.departureDate && query.returnDate) {
    return {
      departureDate: query.departureDate,
      returnDate: query.returnDate,
      flexible: false,
    };
  }
  if (query.departureDate && !query.returnDate) {
    const start = new Date(`${query.departureDate}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + Math.max(1, query.tripLengthDays - 1));
    return {
      departureDate: query.departureDate,
      returnDate: end.toISOString().slice(0, 10),
      flexible: false,
    };
  }

  // Flexible: pick an indicative window ~30 days out for Flight Offers confirmation path.
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 30);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(1, query.tripLengthDays - 1));
  return {
    departureDate: start.toISOString().slice(0, 10),
    returnDate: end.toISOString().slice(0, 10),
    flexible: true,
  };
}

function extractBaggageNotes(offer: NonNullable<FlightOffersResponse['data']>[number]): string | null {
  const bags = offer.travelerPricings?.[0]?.fareDetailsBySegment
    ?.map((segment) => segment.includedCheckedBags)
    .filter(Boolean);
  if (!bags || bags.length === 0) {
    return null;
  }
  const first = bags[0];
  if (first?.quantity != null) {
    return `포함 수하물(체크인) 약 ${first.quantity}개 (API 제공값)`;
  }
  if (first?.weight != null) {
    return `포함 수하물(체크인) 약 ${first.weight}${first.weightUnit ?? 'KG'} (API 제공값)`;
  }
  return null;
}

export async function searchAmadeusFlights(
  env: ServerEnv,
  query: FlightSearchRequest,
): Promise<FlightQuoteResult> {
  const origin = query.originAirports[0] ?? 'ICN';
  const destination = query.destinationAirport;
  const travelers = Math.min(9, Math.max(1, query.travelers));
  const searchedAt = new Date().toISOString();
  const { departureDate, returnDate, flexible } = resolveRoundTripDates(query);

  // Flexible dates: official Flight Cheapest Date Search for indicative prices.
  // GET /v1/shopping/flight-dates
  if (flexible || isFlexible(query)) {
    const duration = Math.max(1, query.tripLengthDays);
    const path =
      `/v1/shopping/flight-dates?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&duration=${duration}`;

    try {
      const dates = await amadeusGet<FlightDatesResponse>(env, path);
      const rows = dates.data ?? [];
      const currency = rows[0]?.price?.currency ?? dates.meta?.currency ?? 'EUR';
      const amountsKrw: number[] = [];
      for (const row of rows) {
        const total = Number(row.price?.total);
        if (!Number.isFinite(total)) continue;
        amountsKrw.push(toKrw(total * travelers, row.price?.currency ?? currency, env));
      }
      const stats = statsFromAmounts(amountsKrw, 'KRW');
      const best = stats.min;

      return {
        totalFareKrw: best,
        currency: 'KRW',
        carrier: 'Amadeus (indicative)',
        summary: `${origin} → ${destination} 왕복 · ${travelers}명 · 유연 일정 예상가 (Flight Dates)`,
        bookingUrl: `https://example.com/amadeus-indicative?o=${origin}&d=${destination}`,
        isMock: false,
        priceMode: 'indicative',
        searchedAt,
        roundTrip: true,
        baggageNotes: null,
        stats,
        provider: 'amadeus',
        destinationId: query.destinationId,
        destinationAirport: destination,
      };
    } catch {
      // Fall through to dated Flight Offers Search with indicative synthetic dates.
    }
  }

  // Dated (or fallback) round-trip: official Flight Offers Search v2 GET
  // GET /v2/shopping/flight-offers
  const offersPath =
    `/v2/shopping/flight-offers?originLocationCode=${encodeURIComponent(origin)}` +
    `&destinationLocationCode=${encodeURIComponent(destination)}` +
    `&departureDate=${encodeURIComponent(departureDate)}` +
    `&returnDate=${encodeURIComponent(returnDate)}` +
    `&adults=${travelers}` +
    `&currencyCode=KRW` +
    `&max=20`;

  const offers = await amadeusGet<FlightOffersResponse>(env, offersPath);
  const data = offers.data ?? [];
  const amountsKrw: number[] = [];
  let bestCarrier = 'Amadeus';
  let baggageNotes: string | null = null;
  let offerCurrency = 'KRW';

  for (const offer of data) {
    const total = Number(offer.price?.grandTotal ?? offer.price?.total);
    const currency = offer.price?.currency ?? 'EUR';
    if (!Number.isFinite(total)) continue;
    offerCurrency = currency;
    try {
      amountsKrw.push(toKrw(total, currency, env));
    } catch {
      continue;
    }
  }

  if (data[0]) {
    bestCarrier =
      data[0].validatingAirlineCodes?.[0] ??
      data[0].itineraries?.[0]?.segments?.[0]?.carrierCode ??
      'Amadeus';
    baggageNotes = extractBaggageNotes(data[0]);
  }

  const stats = statsFromAmounts(amountsKrw, 'KRW');
  const priceMode = flexible ? 'indicative' : 'live';

  return {
    totalFareKrw: stats.min,
    currency: 'KRW',
    carrier: bestCarrier,
    summary: flexible
      ? `${origin} → ${destination} 왕복 · ${travelers}명 · 참고용 예상가 (${departureDate}~${returnDate})`
      : `${origin} → ${destination} 왕복 · ${travelers}명 · 검색 시점 시세 (${departureDate}~${returnDate})`,
    bookingUrl: `https://example.com/amadeus-offers?o=${origin}&d=${destination}&out=${departureDate}&in=${returnDate}`,
    isMock: false,
    priceMode,
    searchedAt,
    roundTrip: true,
    baggageNotes,
    stats: { ...stats, currency: offerCurrency === 'KRW' ? 'KRW' : `KRW(from ${offerCurrency})` },
    provider: 'amadeus',
    destinationId: query.destinationId,
    destinationAirport: destination,
  };
}
