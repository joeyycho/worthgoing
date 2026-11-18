export type FlightPriceMode = 'live' | 'indicative' | 'mock';

export interface FlightSearchRequest {
  originAirports: string[];
  destinationAirport: string;
  destinationId?: string;
  travelers: number;
  tripLengthDays: number;
  departureDate: string;
  returnDate: string;
}

export interface DestinationFlightTarget {
  id: string;
  airportCode: string;
}

export interface FlightOfferStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  offerCount: number;
  currency: string;
}

export interface FlightQuoteResult {
  totalFareKrw: number | null;
  currency: string;
  carrier: string;
  summary: string;
  bookingUrl: string;
  isMock: boolean;
  priceMode: FlightPriceMode;
  searchedAt: string;
  roundTrip: boolean;
  baggageNotes: string | null;
  stats: FlightOfferStats;
  provider: 'duffel' | 'amadeus' | 'mock';
  destinationId?: string;
  destinationAirport: string;
}

export interface BatchFlightSearchRequest {
  originAirports: string[];
  travelers: number;
  tripLengthDays: number;
  departureDate: string;
  returnDate: string;
  destinations: DestinationFlightTarget[];
}

export interface BatchFlightSearchResponse {
  searchedAt: string;
  dateMode: 'dated' | 'flexible';
  travelers: number;
  roundTrip: boolean;
  provider: 'duffel' | 'amadeus' | 'mock';
  results: FlightQuoteResult[];
  persisted: boolean;
}
