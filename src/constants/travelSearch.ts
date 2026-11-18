import type { AirportOption, TravelSearchFormState } from '../types/travelSearch';

export const BUDGET_MIN = 100_000;
export const BUDGET_MAX = 1_500_000;
export const BUDGET_STEP = 10_000;
export const BUDGET_DEFAULT = 500_000;

export const TRAVELERS_MIN = 1;
export const TRAVELERS_MAX = 10;

export const TRIP_LENGTH_MIN = 1;
export const TRIP_LENGTH_MAX = 30;
export const TRIP_LENGTH_DEFAULT = 4;

export const DEPARTURE_AIRPORTS: AirportOption[] = [
  { code: 'ICN', city: '인천', name: '인천국제공항' },
  { code: 'GMP', city: '김포', name: '김포국제공항' },
  { code: 'PUS', city: '부산', name: '김해국제공항' },
  { code: 'CJU', city: '제주', name: '제주국제공항' },
  { code: 'TAE', city: '대구', name: '대구국제공항' },
  { code: 'KWJ', city: '광주', name: '광주공항' },
];

export const INITIAL_TRAVEL_SEARCH: TravelSearchFormState = {
  budgetPerPerson: BUDGET_DEFAULT,
  travelers: 1,
  originCountry: 'KR',
  departureAirports: ['ICN'],
  tripLengthDays: TRIP_LENGTH_DEFAULT,
  departureDate: '',
  returnDate: '',
};

/** Format KRW for UI. Invalid amounts must not reach here as “0원”. */
export function formatKrw(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('ko-KR').format(Math.round(amount));
}
