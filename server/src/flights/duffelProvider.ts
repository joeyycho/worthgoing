import type { ServerEnv } from '../env.js';
import { duffelPost } from '../duffel/client.js';
import { statsFromAmounts, tryAmountToKrw } from './money.js';
import type { FlightQuoteResult, FlightSearchRequest } from './types.js';

/**
 * Duffel Flights search → FlightQuoteResult.
 * Official: POST /air/offer_requests
 * https://duffel.com/docs/guides/getting-started-with-flights
 * https://duffel.com/docs/api/offer-requests
 */

interface DuffelOffer {
  total_amount?: string;
  total_currency?: string;
  owner?: { name?: string; iata_code?: string };
  slices?: Array<{
    segments?: Array<{
      operating_carrier?: { name?: string; iata_code?: string };
      marketing_carrier?: { name?: string; iata_code?: string };
      passengers?: Array<{
        baggages?: Array<{ type?: string; quantity?: number }>;
      }>;
    }>;
  }>;
}

interface OfferRequestResponse {
  data?: {
    offers?: DuffelOffer[];
  };
}

export function resolveRoundTripDates(query: FlightSearchRequest): {
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

export function buildOfferRequestBody(query: FlightSearchRequest): {
  data: {
    slices: Array<{ origin: string; destination: string; departure_date: string }>;
    passengers: Array<{ type: 'adult' }>;
    cabin_class: 'economy';
  };
  flexible: boolean;
  departureDate: string;
  returnDate: string;
} {
  const origin = query.originAirports[0] ?? 'ICN';
  const destination = query.destinationAirport;
  const travelers = Math.min(9, Math.max(1, query.travelers));
  const { departureDate, returnDate, flexible } = resolveRoundTripDates(query);

  return {
    data: {
      slices: [
        { origin, destination, departure_date: departureDate },
        { origin: destination, destination: origin, departure_date: returnDate },
      ],
      passengers: Array.from({ length: travelers }, () => ({ type: 'adult' as const })),
      cabin_class: 'economy',
    },
    flexible,
    departureDate,
    returnDate,
  };
}

function extractCarrier(offer: DuffelOffer): string {
  const segment = offer.slices?.[0]?.segments?.[0];
  return (
    segment?.operating_carrier?.name ??
    segment?.operating_carrier?.iata_code ??
    segment?.marketing_carrier?.name ??
    segment?.marketing_carrier?.iata_code ??
    offer.owner?.name ??
    offer.owner?.iata_code ??
    'Duffel'
  );
}

/** Only when Duffel includes baggages on the offer — never invent quantities. */
export function extractBaggageNotes(offer: DuffelOffer): string | null {
  const bags =
    offer.slices
      ?.flatMap((slice) => slice.segments ?? [])
      .flatMap((segment) => segment.passengers ?? [])
      .flatMap((passenger) => passenger.baggages ?? []) ?? [];

  const checked = bags.find((bag) => bag.type === 'checked' && bag.quantity != null);
  if (checked?.quantity != null) {
    return `포함 수하물(체크인) ${checked.quantity}개 (Duffel 제공값)`;
  }
  const carry = bags.find((bag) => bag.type === 'carry_on' && bag.quantity != null);
  if (carry?.quantity != null) {
    return `기내 수하물 ${carry.quantity}개 (Duffel 제공값)`;
  }
  return null;
}

export async function searchDuffelFlights(
  env: ServerEnv,
  query: FlightSearchRequest,
): Promise<FlightQuoteResult> {
  const origin = query.originAirports[0] ?? 'ICN';
  const destination = query.destinationAirport;
  const travelers = Math.min(9, Math.max(1, query.travelers));
  const searchedAt = new Date().toISOString();
  const { data: body, flexible, departureDate, returnDate } = buildOfferRequestBody(query);

  const response = await duffelPost<OfferRequestResponse>(
    env,
    '/air/offer_requests?return_offers=true',
    { data: body },
    env.duffelTimeoutMs,
  );

  const offers = response.data?.offers ?? [];
  const krwAmounts: number[] = [];
  let nativeCurrency: string | null = null;
  let convertible = false;

  for (const offer of offers) {
    const total = Number(offer.total_amount);
    const currency = offer.total_currency ?? 'EUR';
    if (!Number.isFinite(total)) continue;
    nativeCurrency = currency;
    const converted = tryAmountToKrw(total, currency, env);
    if (converted.amountKrw != null) {
      krwAmounts.push(converted.amountKrw);
      convertible = true;
    }
  }

  const bestOffer = offers[0];
  const carrier = bestOffer ? extractCarrier(bestOffer) : 'Duffel';
  const baggageNotes = bestOffer ? extractBaggageNotes(bestOffer) : null;
  const priceMode = flexible ? 'indicative' : 'live';

  if (convertible) {
    const stats = statsFromAmounts(krwAmounts, 'KRW');
    return {
      totalFareKrw: stats.min,
      currency: 'KRW',
      carrier,
      summary: flexible
        ? `${origin} → ${destination} 왕복 · ${travelers}명 · 유연 일정 예상가 (${departureDate}~${returnDate})`
        : `${origin} → ${destination} 왕복 · ${travelers}명 · 검색 시점 시세 (${departureDate}~${returnDate})`,
      bookingUrl: '',
      isMock: false,
      priceMode,
      searchedAt,
      roundTrip: true,
      baggageNotes,
      stats,
      provider: 'duffel',
      destinationId: query.destinationId,
      destinationAirport: destination,
    };
  }

  // Unsupported / missing convertible currency — do not invent KRW.
  return {
    totalFareKrw: null,
    currency: nativeCurrency ?? 'UNKNOWN',
    carrier,
    summary: flexible
      ? `${origin} → ${destination} 왕복 · ${travelers}명 · 유연 일정 (통화 미지원으로 KRW 미표시)`
      : `${origin} → ${destination} 왕복 · ${travelers}명 · 검색 완료 (통화 미지원으로 KRW 미표시)`,
    bookingUrl: '',
    isMock: false,
    priceMode,
    searchedAt,
    roundTrip: true,
    baggageNotes,
    stats: {
      min: null,
      max: null,
      avg: null,
      offerCount: offers.length,
      currency: nativeCurrency ?? 'UNKNOWN',
    },
    provider: 'duffel',
    destinationId: query.destinationId,
    destinationAirport: destination,
  };
}
