/**
 * Airport / destination id → IATA city code for Hotel List by-city.
 * Keep in sync with server/src/accommodations/cityCodes.ts keys for Japan + catalog.
 */
export const HOTEL_CITY_CODE: Record<string, string> = {
  KIX: 'OSA',
  OSA: 'OSA',
  osaka: 'OSA',
  NRT: 'TYO',
  HND: 'TYO',
  TYO: 'TYO',
  tokyo: 'TYO',
  FUK: 'FUK',
  fukuoka: 'FUK',
  BKK: 'BKK',
  bangkok: 'BKK',
  DAD: 'DAD',
  danang: 'DAD',
  TPE: 'TPE',
  taipei: 'TPE',
  CDG: 'PAR',
  PAR: 'PAR',
  paris: 'PAR',
  CJU: 'CJU',
  jeju: 'CJU',
  SIN: 'SIN',
  singapore: 'SIN',
};

export function resolveHotelCityCode(destination: {
  id: string;
  airportCode: string;
}): string | undefined {
  return HOTEL_CITY_CODE[destination.airportCode] ?? HOTEL_CITY_CODE[destination.id];
}
