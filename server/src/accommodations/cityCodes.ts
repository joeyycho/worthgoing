/**
 * Map catalog / airport hints → IATA city codes for Amadeus Hotel List
 * GET /v1/reference-data/locations/hotels/by-city?cityCode=...
 */
const BY_KEY: Record<string, string> = {
  osaka: 'OSA',
  kix: 'OSA',
  osa: 'OSA',
  bangkok: 'BKK',
  bkk: 'BKK',
  danang: 'DAD',
  dad: 'DAD',
  taipei: 'TPE',
  tpe: 'TPE',
  paris: 'PAR',
  cdg: 'PAR',
  par: 'PAR',
  jeju: 'CJU',
  cju: 'CJU',
  singapore: 'SIN',
  sin: 'SIN',
};

export function resolveHotelCityCode(input: {
  cityCode?: string;
  airportCode?: string;
  destinationId?: string;
}): string | null {
  const direct = input.cityCode?.trim().toUpperCase();
  if (direct && /^[A-Z]{3}$/.test(direct)) {
    return direct;
  }
  for (const key of [input.airportCode, input.destinationId]) {
    if (!key) continue;
    const mapped = BY_KEY[key.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  return null;
}

export function defaultRoomCount(travelers: number): number {
  return Math.max(1, Math.ceil(travelers / 2));
}

export function adultsPerRoom(travelers: number, rooms: number): number {
  return Math.min(9, Math.max(1, Math.ceil(travelers / Math.max(1, rooms))));
}
