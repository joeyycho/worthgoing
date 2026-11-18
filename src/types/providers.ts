import type { AirportCode } from './travelSearch';

export type FlightPriceMode = 'live' | 'indicative' | 'mock';
export type AccommodationPriceMode = 'live' | 'indicative' | 'mock';

/** Match server flight providers; adapters coerce unexpected values without crashing. */
export type FlightQuoteProvider = 'serpapi' | 'duffel' | 'amadeus' | 'mock';
/** Match server stay providers; adapters coerce unexpected values without crashing. */
export type AccommodationQuoteProvider = 'serpapi' | 'amadeus' | 'mock';

export interface FlightQuoteQuery {
  originAirports: AirportCode[];
  destinationAirport: string;
  travelers: number;
  tripLengthDays: number;
  departureDate: string;
  returnDate: string;
  /** Internal catalog id (not a live GDS field) */
  destinationId?: string;
}

export interface FlightOfferStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  offerCount: number;
  currency: string;
}

export interface FlightQuote {
  /** null means price unavailable — must not be shown as confirmed */
  totalFareKrw: number | null;
  carrier: string;
  summary: string;
  bookingUrl: string;
  isMock: boolean;
  priceMode: FlightPriceMode;
  searchedAt: string;
  roundTrip: boolean;
  baggageNotes: string | null;
  stats: FlightOfferStats;
  provider: FlightQuoteProvider;
}

export interface FlightProvider {
  searchFlights(query: FlightQuoteQuery): Promise<FlightQuote>;
}

export interface AccommodationQuoteQuery {
  city: string;
  country: string;
  travelers: number;
  nights: number;
  rooms?: number;
  checkInDate: string;
  checkOutDate: string;
  cityCode?: string;
  airportCode?: string;
  /** Internal catalog id (not a live hotel-API field) */
  destinationId?: string;
}

export interface AccommodationOfferStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  offerCount: number;
  currency: string;
}

export interface AccommodationQuote {
  /** Total lodging for the stay (all rooms) — null means unavailable */
  totalStayKrw: number | null;
  /** totalStayKrw / travelers when total is known */
  perPersonStayKrw: number | null;
  propertyName: string;
  summary: string;
  /**
   * Verified external booking URL only. Empty when no public bookable deep link exists.
   */
  bookingUrl: string;
  isMock: boolean;
  priceMode: AccommodationPriceMode;
  searchedAt: string;
  nights: number;
  rooms: number;
  travelers: number;
  stats: AccommodationOfferStats;
  provider: AccommodationQuoteProvider;
}

export interface AccommodationProvider {
  searchAccommodations(query: AccommodationQuoteQuery): Promise<AccommodationQuote>;
}
