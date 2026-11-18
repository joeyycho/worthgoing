import type { ServerEnv } from '../env.js';
import { amadeusGet } from '../amadeus/client.js';
import { statsFromAmounts, toKrw } from '../flights/money.js';
import { adultsPerRoom, defaultRoomCount, resolveHotelCityCode } from './cityCodes.js';
import type { AccommodationQuoteResult, AccommodationSearchRequest } from './types.js';

interface HotelListResponse {
  data?: Array<{
    hotelId?: string;
    name?: string;
    iataCode?: string;
  }>;
}

interface HotelOffersResponse {
  data?: Array<{
    hotel?: { hotelId?: string; name?: string; cityCode?: string };
    available?: boolean;
    offers?: Array<{
      id?: string;
      checkInDate?: string;
      checkOutDate?: string;
      price?: { currency?: string; total?: string; base?: string };
      room?: { typeEstimated?: { category?: string }; description?: { text?: string } };
    }>;
  }>;
}

function resolveStayDates(query: AccommodationSearchRequest): {
  checkInDate: string;
  checkOutDate: string;
  flexible: boolean;
  nights: number;
} {
  const nights = Math.max(1, query.nights);
  if (query.checkInDate && query.checkOutDate) {
    return {
      checkInDate: query.checkInDate,
      checkOutDate: query.checkOutDate,
      flexible: false,
      nights,
    };
  }
  if (query.checkInDate && !query.checkOutDate) {
    const start = new Date(`${query.checkInDate}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + nights);
    return {
      checkInDate: query.checkInDate,
      checkOutDate: end.toISOString().slice(0, 10),
      flexible: false,
      nights,
    };
  }

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 30);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + nights);
  return {
    checkInDate: start.toISOString().slice(0, 10),
    checkOutDate: end.toISOString().slice(0, 10),
    flexible: true,
    nights,
  };
}

/**
 * Official Amadeus Hotel List + Hotel Search v3 (same OAuth keys as flights).
 * - GET /v1/reference-data/locations/hotels/by-city?cityCode=
 * - GET /v3/shopping/hotel-offers?hotelIds=&adults=&checkInDate=&checkOutDate=&roomQuantity=
 * Docs: https://github.com/amadeus4dev/developer-guides/blob/master/docs/resources/hotels.md
 */
export async function searchAmadeusAccommodations(
  env: ServerEnv,
  query: AccommodationSearchRequest,
): Promise<AccommodationQuoteResult> {
  const cityCode = resolveHotelCityCode(query);
  if (!cityCode) {
    throw new Error('Cannot resolve IATA cityCode for Hotel List by-city');
  }

  const rooms = query.rooms ?? defaultRoomCount(query.travelers);
  const adults = adultsPerRoom(query.travelers, rooms);
  const { checkInDate, checkOutDate, flexible, nights } = resolveStayDates(query);
  const searchedAt = new Date().toISOString();
  const timeout = env.accommodationTimeoutMs;

  const listPath =
    `/v1/reference-data/locations/hotels/by-city?cityCode=${encodeURIComponent(cityCode)}` +
    `&hotelSource=ALL`;
  const list = await amadeusGet<HotelListResponse>(env, listPath, timeout);
  const hotelIds = (list.data ?? [])
    .map((row) => row.hotelId)
    .filter((id): id is string => Boolean(id))
    .slice(0, Math.max(1, env.accommodationHotelIdLimit));

  if (hotelIds.length === 0) {
    throw new Error(`No hotels returned for cityCode=${cityCode}`);
  }

  const offersPath =
    `/v3/shopping/hotel-offers?hotelIds=${encodeURIComponent(hotelIds.join(','))}` +
    `&adults=${adults}` +
    `&checkInDate=${encodeURIComponent(checkInDate)}` +
    `&checkOutDate=${encodeURIComponent(checkOutDate)}` +
    `&roomQuantity=${rooms}` +
    `&currency=KRW`;

  const offers = await amadeusGet<HotelOffersResponse>(env, offersPath, timeout);
  const amountsKrw: number[] = [];
  let bestName = 'Amadeus Hotel';
  let offerCurrency = 'KRW';

  for (const hotelBlock of offers.data ?? []) {
    if (!hotelBlock.available || !hotelBlock.offers?.length) continue;
    for (const offer of hotelBlock.offers) {
      const total = Number(offer.price?.total ?? offer.price?.base);
      const currency = offer.price?.currency ?? 'EUR';
      if (!Number.isFinite(total)) continue;
      offerCurrency = currency;
      try {
        amountsKrw.push(toKrw(total, currency, env));
      } catch {
        continue;
      }
    }
    if (hotelBlock.hotel?.name && amountsKrw.length > 0 && bestName === 'Amadeus Hotel') {
      bestName = hotelBlock.hotel.name;
    }
  }

  // Prefer the hotel attached to the cheapest offer
  let cheapest = Number.POSITIVE_INFINITY;
  for (const hotelBlock of offers.data ?? []) {
    for (const offer of hotelBlock.offers ?? []) {
      const total = Number(offer.price?.total ?? offer.price?.base);
      const currency = offer.price?.currency ?? 'EUR';
      if (!Number.isFinite(total)) continue;
      try {
        const krw = toKrw(total, currency, env);
        if (krw < cheapest && hotelBlock.hotel?.name) {
          cheapest = krw;
          bestName = hotelBlock.hotel.name;
        }
      } catch {
        /* skip */
      }
    }
  }

  const stats = statsFromAmounts(amountsKrw, 'KRW');
  const totalStayKrw = stats.min;
  const perPersonStayKrw =
    totalStayKrw == null ? null : Math.round(totalStayKrw / Math.max(1, query.travelers));
  const priceMode = flexible ? 'indicative' : 'live';

  return {
    totalStayKrw,
    perPersonStayKrw,
    currency: 'KRW',
    propertyName: bestName,
    summary: flexible
      ? `${nights}박 · ${query.travelers}명 · ${rooms}실 · 유연 일정 참고가 (${checkInDate}~${checkOutDate})`
      : `${nights}박 · ${query.travelers}명 · ${rooms}실 · 검색 시점 시세 (${checkInDate}~${checkOutDate})`,
    // Hotel Search v3 does not return a public consumer booking URL; Hotel Booking is out of scope.
    bookingUrl: '',
    isMock: false,
    priceMode,
    searchedAt,
    nights,
    rooms,
    travelers: query.travelers,
    stats: {
      ...stats,
      currency: offerCurrency === 'KRW' ? 'KRW' : `KRW(from ${offerCurrency})`,
    },
    provider: 'amadeus',
    destinationId: query.destinationId,
    city: query.city,
    country: query.country,
    cityCode,
  };
}
