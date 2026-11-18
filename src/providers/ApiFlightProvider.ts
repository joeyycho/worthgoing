import { isApiConfigured } from '../services/api/tripApiClient';
import type { FlightProvider, FlightQuote, FlightQuoteQuery } from '../types/providers';
import { normalizeFlightQuote } from './normalizeQuote';

interface ApiFlightResponse {
  quote: FlightQuote;
  persisted?: boolean;
}

interface ApiBatchResponse {
  results: Array<FlightQuote & { destinationId?: string; destinationAirport: string }>;
}

/**
 * Calls the stage-6 server flight API. Secrets stay on the server.
 */
export class ApiFlightProvider implements FlightProvider {
  async searchFlights(query: FlightQuoteQuery): Promise<FlightQuote> {
    if (!isApiConfigured()) {
      throw new Error('VITE_API_BASE_URL is not set');
    }

    const base = import.meta.env.VITE_API_BASE_URL!.replace(/\/$/, '');
    const response = await fetch(`${base}/api/flights/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Flight API ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as ApiFlightResponse;
    return normalizeFlightQuote(json.quote);
  }

  async searchBatch(
    query: Omit<FlightQuoteQuery, 'destinationAirport' | 'destinationId'>,
    destinations: Array<{ id: string; airportCode: string }>,
  ): Promise<Map<string, FlightQuote>> {
    if (!isApiConfigured()) {
      throw new Error('VITE_API_BASE_URL is not set');
    }

    const base = import.meta.env.VITE_API_BASE_URL!.replace(/\/$/, '');
    const response = await fetch(`${base}/api/flights/search-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originAirports: query.originAirports,
        travelers: query.travelers,
        tripLengthDays: query.tripLengthDays,
        departureDate: query.departureDate,
        returnDate: query.returnDate,
        destinations,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Flight batch API ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as ApiBatchResponse;
    const map = new Map<string, FlightQuote>();
    for (const row of json.results) {
      if (row.destinationId) {
        map.set(row.destinationId, normalizeFlightQuote(row));
      }
    }
    return map;
  }
}
