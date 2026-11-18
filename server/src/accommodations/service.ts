import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerEnv } from '../env.js';
import { TtlCache } from '../flights/cache.js';
import { defaultRoomCount } from './cityCodes.js';
import { searchMockAccommodations } from './mockProvider.js';
import { persistAccommodationSearch } from './persist.js';
import { searchSerpapiAccommodations } from './serpapiProvider.js';
import type {
  AccommodationQuoteResult,
  AccommodationSearchRequest,
  BatchAccommodationSearchRequest,
  BatchAccommodationSearchResponse,
} from './types.js';

/** Active search path only — Amadeus modules remain in tree but are not selected. */
export type ActiveAccommodationProvider = 'serpapi' | 'mock';

/** SerpApi → Mock. Duffel/Amadeus stay out of the normal search path. */
export function resolveActiveAccommodationProvider(
  env: ServerEnv,
): ActiveAccommodationProvider {
  if (env.serpapiConfigured) return 'serpapi';
  return 'mock';
}

export class AccommodationSearchService {
  private readonly cache: TtlCache<AccommodationQuoteResult>;

  constructor(
    private readonly env: ServerEnv,
    private readonly supabase: SupabaseClient | null,
  ) {
    this.cache = new TtlCache<AccommodationQuoteResult>(env.accommodationCacheTtlMs);
  }

  private cacheKey(query: AccommodationSearchRequest): string {
    const rooms = query.rooms ?? defaultRoomCount(query.travelers);
    return [
      query.city,
      query.country,
      query.cityCode ?? '',
      query.airportCode ?? '',
      query.destinationId ?? '',
      query.travelers,
      query.nights,
      rooms,
      query.checkInDate || 'flex',
      query.checkOutDate || 'flex',
      resolveActiveAccommodationProvider(this.env),
    ].join('|');
  }

  async searchOne(
    query: AccommodationSearchRequest,
    userId: string | null,
  ): Promise<{ quote: AccommodationQuoteResult; persisted: boolean }> {
    const key = this.cacheKey(query);
    const cached = this.cache.get(key);
    if (cached) {
      return { quote: cached, persisted: false };
    }

    const active = resolveActiveAccommodationProvider(this.env);
    let quote: AccommodationQuoteResult;

    if (active === 'serpapi') {
      try {
        quote = await searchSerpapiAccommodations(this.env, query);
      } catch (error) {
        console.warn('SerpApi hotel search failed; using MOCK', error);
        quote = searchMockAccommodations(query);
        quote.summary = `${quote.summary} · SerpApi 실패 폴백`;
      }
    } else {
      quote = searchMockAccommodations(query);
    }

    this.cache.set(key, quote);
    const persisted = await persistAccommodationSearch(this.supabase, query, quote, userId);
    return { quote, persisted };
  }

  async searchBatch(
    body: BatchAccommodationSearchRequest,
    userId: string | null,
  ): Promise<BatchAccommodationSearchResponse> {
    const dateMode =
      body.checkInDate || body.checkOutDate ? ('dated' as const) : ('flexible' as const);
    const searchedAt = new Date().toISOString();
    const rooms = body.rooms ?? defaultRoomCount(body.travelers);

    const pairs = await Promise.all(
      body.destinations.map(async (destination) =>
        this.searchOne(
          {
            city: destination.city,
            country: destination.country,
            cityCode: destination.cityCode,
            airportCode: destination.airportCode,
            destinationId: destination.id,
            travelers: body.travelers,
            nights: body.nights,
            rooms,
            checkInDate: body.checkInDate,
            checkOutDate: body.checkOutDate,
          },
          userId,
        ),
      ),
    );

    const results = pairs.map((pair) => pair.quote);
    results.sort((a, b) => {
      if (a.totalStayKrw == null && b.totalStayKrw == null) return 0;
      if (a.totalStayKrw == null) return 1;
      if (b.totalStayKrw == null) return -1;
      return a.totalStayKrw - b.totalStayKrw;
    });

    const provider: ActiveAccommodationProvider = results.some(
      (item) => item.provider === 'serpapi',
    )
      ? 'serpapi'
      : 'mock';

    return {
      searchedAt,
      dateMode,
      travelers: body.travelers,
      nights: body.nights,
      rooms,
      provider,
      results,
      persisted: pairs.some((pair) => pair.persisted),
    };
  }
}
