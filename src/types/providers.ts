import type { AirportCode } from './travelSearch';

export type FlightPriceMode = 'live' | 'indicative' | 'mock';

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
  provider: 'amadeus' | 'mock';
}

export interface FlightProvider {
  searchFlights(query: FlightQuoteQuery): Promise<FlightQuote>;
}

export interface AccommodationQuoteQuery {
  city: string;
  country: string;
  travelers: number;
  nights: number;
  checkInDate: string;
  checkOutDate: string;
  /** Internal catalog id (not a live hotel-API field) */
  destinationId?: string;
}

export interface AccommodationQuote {
  /** null means mock price unavailable — must not be shown as confirmed */
  totalStayKrw: number | null;
  propertyName: string;
  summary: string;
  bookingUrl: string;
  isMock: true;
}

export interface AccommodationProvider {
  searchAccommodations(query: AccommodationQuoteQuery): Promise<AccommodationQuote>;
}
