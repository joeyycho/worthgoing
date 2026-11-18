import { isApiConfigured } from '../services/api/tripApiClient';
import type {
  AccommodationProvider,
  AccommodationQuote,
  AccommodationQuoteQuery,
} from '../types/providers';
import { normalizeAccommodationQuote } from './normalizeQuote';

interface ApiAccommodationResponse {
  quote: AccommodationQuote;
  persisted?: boolean;
}

interface ApiBatchResponse {
  results: Array<AccommodationQuote & { destinationId?: string }>;
}

/**
 * Calls the stage-7 server accommodation API. Secrets stay on the server.
 */
export class ApiAccommodationProvider implements AccommodationProvider {
  async searchAccommodations(query: AccommodationQuoteQuery): Promise<AccommodationQuote> {
    if (!isApiConfigured()) {
      throw new Error('VITE_API_BASE_URL is not set');
    }

    const base = import.meta.env.VITE_API_BASE_URL!.replace(/\/$/, '');
    const response = await fetch(`${base}/api/accommodations/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Accommodation API ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as ApiAccommodationResponse;
    return normalizeAccommodationQuote(json.quote);
  }

  async searchBatch(
    query: Omit<AccommodationQuoteQuery, 'city' | 'country' | 'destinationId' | 'cityCode' | 'airportCode'>,
    destinations: Array<{
      id: string;
      city: string;
      country: string;
      cityCode?: string;
      airportCode?: string;
    }>,
  ): Promise<Map<string, AccommodationQuote>> {
    if (!isApiConfigured()) {
      throw new Error('VITE_API_BASE_URL is not set');
    }

    const base = import.meta.env.VITE_API_BASE_URL!.replace(/\/$/, '');
    const response = await fetch(`${base}/api/accommodations/search-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        travelers: query.travelers,
        nights: query.nights,
        rooms: query.rooms,
        checkInDate: query.checkInDate,
        checkOutDate: query.checkOutDate,
        destinations,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Accommodation batch API ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as ApiBatchResponse;
    const map = new Map<string, AccommodationQuote>();
    for (const row of json.results) {
      if (row.destinationId) {
        map.set(row.destinationId, normalizeAccommodationQuote(row));
      }
    }
    return map;
  }
}
