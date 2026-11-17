export type AirportCode = 'ICN' | 'GMP' | 'PUS' | 'CJU' | 'TAE' | 'KWJ';

export interface AirportOption {
  code: AirportCode;
  city: string;
  name: string;
}

export interface TravelSearchFormState {
  budgetPerPerson: number;
  travelers: number;
  originCountry: 'KR';
  departureAirports: AirportCode[];
  tripLengthDays: number;
  departureDate: string;
  returnDate: string;
}

export type AppTabId = 'search' | 'saved' | 'mypage';
