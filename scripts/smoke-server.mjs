#!/usr/bin/env node
/**
 * Lightweight health + provider smoke against a running galmanhae-server.
 * Usage: node scripts/smoke-server.mjs [baseUrl]
 * Does not claim live Amadeus/Supabase connectivity.
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

async function main() {
  const healthRes = await fetch(`${base}/health`);
  const health = await healthRes.json();
  console.log('health', healthRes.status, health);

  if (!healthRes.ok) {
    process.exit(1);
  }

  const flightRes = await fetch(`${base}/api/flights/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originAirports: ['ICN'],
      destinationAirport: 'KIX',
      destinationId: 'osaka',
      travelers: 1,
      tripLengthDays: 3,
      departureDate: '',
      returnDate: '',
    }),
  });
  const flight = await flightRes.json();
  console.log('flight', flightRes.status, {
    isMock: flight.quote?.isMock,
    priceMode: flight.quote?.priceMode,
    persisted: flight.persisted,
  });

  const stayRes = await fetch(`${base}/api/accommodations/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: '오사카',
      country: '일본',
      cityCode: 'OSA',
      airportCode: 'KIX',
      destinationId: 'osaka',
      travelers: 1,
      nights: 2,
      checkInDate: '',
      checkOutDate: '',
    }),
  });
  const stay = await stayRes.json();
  console.log('stay', stayRes.status, {
    isMock: stay.quote?.isMock,
    priceMode: stay.quote?.priceMode,
    persisted: stay.persisted,
  });

  if (!flightRes.ok || !stayRes.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
