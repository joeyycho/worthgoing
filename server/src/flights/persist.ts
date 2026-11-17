import type { SupabaseClient } from '@supabase/supabase-js';
import type { FlightQuoteResult, FlightSearchRequest } from './types.js';

/**
 * Best-effort persist into stage-5 flight_searches / flight_offers.
 * Never invents a successful write when Supabase is unavailable.
 */
export async function persistFlightSearch(
  supabase: SupabaseClient | null,
  query: FlightSearchRequest,
  quote: FlightQuoteResult,
  userId: string | null,
): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  try {
    const { data: search, error: searchError } = await supabase
      .from('flight_searches')
      .insert({
        user_id: userId,
        origin_airports: query.originAirports,
        destination_airport: query.destinationAirport,
        travelers: query.travelers,
        trip_length_days: query.tripLengthDays,
        departure_date: query.departureDate || null,
        return_date: query.returnDate || null,
        provider: quote.provider,
      })
      .select('id')
      .single();

    if (searchError || !search) {
      console.warn('flight_searches insert skipped', searchError?.message);
      return false;
    }

    const { error: offerError } = await supabase.from('flight_offers').insert({
      search_id: search.id,
      carrier: quote.carrier,
      total_fare_krw: quote.totalFareKrw,
      summary: quote.summary,
      booking_url: quote.bookingUrl,
      is_mock: quote.isMock,
      raw: {
        priceMode: quote.priceMode,
        searchedAt: quote.searchedAt,
        stats: quote.stats,
        baggageNotes: quote.baggageNotes,
        roundTrip: quote.roundTrip,
        destinationId: quote.destinationId,
      },
    });

    if (offerError) {
      console.warn('flight_offers insert skipped', offerError.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('persistFlightSearch failed', error);
    return false;
  }
}
