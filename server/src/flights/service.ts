import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerEnv } from '../env.js';
import { TtlCache } from './cache.js';
import { searchMockFlights } from './mockProvider.js';
import { persistFlightSearch } from './persist.js';
import { searchSerpapiFlights } from './serpapiProvider.js';
import type {
  BatchFlightSearchRequest,
  BatchFlightSearchResponse,
  FlightQuoteResult,
  FlightSearchRequest,
} from './types.js';

/** Active search path only — Duffel/Amadeus modules remain in tree but are not selected. */
export type ActiveFlightProvider = 'serpapi' | 'mock';

export function resolveActiveFlightProvider(env: ServerEnv): ActiveFlightProvider {
  if (env.serpapiConfigured) return 'serpapi';
  return 'mock';
}

export class FlightSearchService {
  private readonly cache: TtlCache<FlightQuoteResult>;

  constructor(
    private readonly env: ServerEnv,
    private readonly supabase: SupabaseClient | null,
  ) {
    this.cache = new TtlCache<FlightQuoteResult>(env.flightCacheTtlMs);
  }

  private cacheKey(query: FlightSearchRequest): string {
    return [
      query.originAirports.join(','),
      query.destinationAirport,
      query.destinationId ?? '',
      query.travelers,
      query.tripLengthDays,
      query.departureDate || 'flex',
      query.returnDate || 'flex',
      resolveActiveFlightProvider(this.env),
    ].join('|');
  }

  async searchOne(
    query: FlightSearchRequest,
    userId: string | null,
  ): Promise<{ quote: FlightQuoteResult; persisted: boolean }> {
    const key = this.cacheKey(query);
    const cached = this.cache.get(key);
    if (cached) {
      return { quote: cached, persisted: false };
    }

    const active = resolveActiveFlightProvider(this.env);
    let quote: FlightQuoteResult;

    if (active === 'serpapi') {
      try {
        quote = await searchSerpapiFlights(this.env, query);
      } catch (error) {
        console.warn('SerpApi flight search failed; using MOCK', error);
        quote = searchMockFlights(query);
        quote.summary = `${quote.summary} · SerpApi 실패 폴백`;
      }
    } else {
      quote = searchMockFlights(query);
    }

    this.cache.set(key, quote);
    const persisted = await persistFlightSearch(this.supabase, query, quote, userId);
    return { quote, persisted };
  }

  async searchBatch(
    body: BatchFlightSearchRequest,
    userId: string | null,
  ): Promise<BatchFlightSearchResponse> {
    const dateMode =
      body.departureDate || body.returnDate ? ('dated' as const) : ('flexible' as const);
    const searchedAt = new Date().toISOString();

    const pairs = await Promise.all(
      body.destinations.map(async (destination) =>
        this.searchOne(
          {
            originAirports: body.originAirports,
            destinationAirport: destination.airportCode,
            destinationId: destination.id,
            travelers: body.travelers,
            tripLengthDays: body.tripLengthDays,
            departureDate: body.departureDate,
            returnDate: body.returnDate,
          },
          userId,
        ),
      ),
    );

    const results = pairs.map((pair) => pair.quote);

    results.sort((a, b) => {
      if (a.totalFareKrw == null && b.totalFareKrw == null) return 0;
      if (a.totalFareKrw == null) return 1;
      if (b.totalFareKrw == null) return -1;
      return a.totalFareKrw - b.totalFareKrw;
    });

    const provider: ActiveFlightProvider = results.some((item) => item.provider === 'serpapi')
      ? 'serpapi'
      : 'mock';

    return {
      searchedAt,
      dateMode,
      travelers: body.travelers,
      roundTrip: true,
      provider,
      results,
      persisted: pairs.some((pair) => pair.persisted),
    };
  }
}
