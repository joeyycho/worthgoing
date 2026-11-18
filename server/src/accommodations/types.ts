export type AccommodationPriceMode = 'live' | 'indicative' | 'mock';

export interface AccommodationSearchRequest {
  city: string;
  country: string;
  /** IATA city code for Amadeus Hotel List by-city (e.g. PAR, BKK, OSA) */
  cityCode?: string;
  /** Airport / catalog hint used to resolve cityCode when omitted */
  airportCode?: string;
  destinationId?: string;
  travelers: number;
  nights: number;
  /** Optional; defaults to ceil(travelers / 2) */
  rooms?: number;
  checkInDate: string;
  checkOutDate: string;
}

export interface DestinationStayTarget {
  id: string;
  city: string;
  country: string;
  cityCode?: string;
  airportCode?: string;
}

export interface AccommodationOfferStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  offerCount: number;
  currency: string;
}

export interface AccommodationQuoteResult {
  totalStayKrw: number | null;
  /** totalStayKrw / travelers when total is known */
  perPersonStayKrw: number | null;
  currency: string;
  propertyName: string;
  summary: string;
  /**
   * Verified external booking URL only. Empty when Amadeus Search does not expose
   * a public bookable deep link (Hotel Booking API is out of scope).
   */
  bookingUrl: string;
  isMock: boolean;
  priceMode: AccommodationPriceMode;
  searchedAt: string;
  nights: number;
  rooms: number;
  travelers: number;
  stats: AccommodationOfferStats;
  provider: 'amadeus' | 'mock';
  destinationId?: string;
  city: string;
  country: string;
  cityCode: string | null;
}

export interface BatchAccommodationSearchRequest {
  travelers: number;
  nights: number;
  rooms?: number;
  checkInDate: string;
  checkOutDate: string;
  destinations: DestinationStayTarget[];
}

export interface BatchAccommodationSearchResponse {
  searchedAt: string;
  dateMode: 'dated' | 'flexible';
  travelers: number;
  nights: number;
  rooms: number;
  provider: 'amadeus' | 'mock';
  results: AccommodationQuoteResult[];
  persisted: boolean;
}
