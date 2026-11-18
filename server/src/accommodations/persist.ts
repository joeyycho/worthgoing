import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeKrwAmount } from '../flights/money.js';
import type { AccommodationQuoteResult, AccommodationSearchRequest } from './types.js';

/**
 * Best-effort persist into stage-5 accommodation_searches / accommodation_offers.
 * Never invents a successful write when Supabase is unavailable.
 * `provider` is text — 'serpapi' | 'amadeus' | 'mock' fit without migration.
 * Null stay totals are allowed; invalid amounts stored as null (never NaN).
 */
export async function persistAccommodationSearch(
  supabase: SupabaseClient | null,
  query: AccommodationSearchRequest,
  quote: AccommodationQuoteResult,
  userId: string | null,
): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  try {
    const { data: search, error: searchError } = await supabase
      .from('accommodation_searches')
      .insert({
        user_id: userId,
        city: query.city,
        country: query.country,
        destination_id: query.destinationId ?? null,
        travelers: query.travelers,
        nights: quote.nights,
        check_in_date: query.checkInDate || null,
        check_out_date: query.checkOutDate || null,
        provider: quote.provider,
      })
      .select('id')
      .single();

    if (searchError || !search) {
      console.warn('accommodation_searches insert skipped', searchError?.message);
      return false;
    }

    const { error: offerError } = await supabase.from('accommodation_offers').insert({
      search_id: search.id,
      property_name: quote.propertyName,
      total_stay_krw: sanitizeKrwAmount(quote.totalStayKrw),
      summary: quote.summary,
      booking_url: quote.bookingUrl || '',
      is_mock: quote.isMock,
      raw: {
        priceMode: quote.priceMode,
        searchedAt: quote.searchedAt,
        stats: quote.stats,
        perPersonStayKrw: sanitizeKrwAmount(quote.perPersonStayKrw),
        rooms: quote.rooms,
        cityCode: quote.cityCode,
      },
    });

    if (offerError) {
      console.warn('accommodation_offers insert skipped', offerError.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('persistAccommodationSearch failed', error);
    return false;
  }
}
