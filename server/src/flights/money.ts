import type { ServerEnv } from '../env.js';

/** Convert Amadeus amounts to KRW for UI totals. Display estimate only when FX env is used. */
export function toKrw(amount: number, currency: string, env: ServerEnv): number {
  const upper = currency.toUpperCase();
  if (upper === 'KRW') {
    return Math.round(amount);
  }
  if (upper === 'EUR') {
    return Math.round(amount * env.amadeusKrwPerEur);
  }
  if (upper === 'USD') {
    // Rough display factor vs EUR setting; document as estimate-only.
    return Math.round(amount * env.amadeusKrwPerEur * 0.92);
  }
  // Unknown currency: refuse silent fake precision
  throw new Error(`Unsupported Amadeus currency for KRW conversion: ${currency}`);
}

export function statsFromAmounts(amounts: number[], currency: string) {
  if (amounts.length === 0) {
    return { min: null, max: null, avg: null, offerCount: 0, currency };
  }
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  return { min, max, avg, offerCount: amounts.length, currency };
}
