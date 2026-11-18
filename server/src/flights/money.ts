import type { ServerEnv } from '../env.js';

/**
 * Reject NaN / Inf / negative before KRW totals reach UI or persist.
 * Zero is allowed (free / promo edge); unsupported amounts become null.
 */
export function sanitizeKrwAmount(amount: unknown): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return Math.round(amount);
}

/** Convert known Amadeus amounts to KRW for UI totals. Display estimate only when FX env is used. */
export function toKrw(amount: number, currency: string, env: ServerEnv): number {
  const safe = sanitizeKrwAmount(amount);
  if (safe == null) {
    throw new Error(`Invalid amount for KRW conversion: ${String(amount)}`);
  }
  const upper = currency.toUpperCase();
  if (upper === 'KRW') {
    return safe;
  }
  if (upper === 'EUR') {
    return Math.round(safe * env.amadeusKrwPerEur);
  }
  if (upper === 'USD') {
    // Rough display factor vs EUR setting; document as estimate-only.
    return Math.round(safe * env.amadeusKrwPerEur * 0.92);
  }
  // Unknown currency: refuse silent fake precision
  throw new Error(`Unsupported Amadeus currency for KRW conversion: ${currency}`);
}

/**
 * Safe display conversion: only KRW passthrough and EUR via documented FX env.
 * Do not invent FX for other currencies (no false KRW totals).
 * Invalid / unsupported → null (never NaN / Inf / negative).
 */
export function tryAmountToKrw(
  amount: number,
  currency: string,
  env: ServerEnv,
): { amountKrw: number; currency: 'KRW' } | { amountKrw: null; currency: string } {
  const upper = currency.toUpperCase();
  const safe = sanitizeKrwAmount(amount);
  if (safe == null) {
    return { amountKrw: null, currency: upper };
  }
  if (upper === 'KRW') {
    return { amountKrw: safe, currency: 'KRW' };
  }
  if (upper === 'EUR') {
    const converted = sanitizeKrwAmount(safe * env.amadeusKrwPerEur);
    if (converted == null) {
      return { amountKrw: null, currency: upper };
    }
    return { amountKrw: converted, currency: 'KRW' };
  }
  return { amountKrw: null, currency: upper };
}

export function statsFromAmounts(amounts: number[], currency: string) {
  const cleaned = amounts
    .map((value) => sanitizeKrwAmount(value))
    .filter((value): value is number => value != null);
  if (cleaned.length === 0) {
    return { min: null, max: null, avg: null, offerCount: 0, currency };
  }
  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const avg = Math.round(cleaned.reduce((a, b) => a + b, 0) / cleaned.length);
  return { min, max, avg, offerCount: cleaned.length, currency };
}
