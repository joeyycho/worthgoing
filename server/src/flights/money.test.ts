import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ServerEnv } from '../env.js';
import {
  sanitizeKrwAmount,
  statsFromAmounts,
  toKrw,
  tryAmountToKrw,
} from './money.js';

function baseEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    port: 8787,
    corsOrigins: '*',
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseConfigured: false,
    amadeusConfigured: false,
    amadeusClientId: null,
    amadeusClientSecret: null,
    amadeusHostname: 'test.api.amadeus.com',
    amadeusKrwPerEur: 1500,
    duffelConfigured: false,
    duffelAccessToken: null,
    duffelBaseUrl: 'https://api.duffel.com',
    duffelApiVersion: 'v2',
    duffelTimeoutMs: 5000,
    serpapiConfigured: false,
    serpapiApiKey: null,
    serpapiBaseUrl: 'https://serpapi.com',
    serpapiTimeoutMs: 5000,
    serpapiGl: 'kr',
    serpapiHl: 'ko',
    serpapiCurrency: 'KRW',
    flightCacheTtlMs: 60_000,
    flightRateLimitPerMinute: 60,
    accommodationCacheTtlMs: 60_000,
    accommodationRateLimitPerMinute: 60,
    ...overrides,
  } as ServerEnv;
}

describe('money sanitize + KRW conversion', () => {
  it('sanitizeKrwAmount rejects NaN / Inf / negative', () => {
    assert.equal(sanitizeKrwAmount(Number.NaN), null);
    assert.equal(sanitizeKrwAmount(Number.POSITIVE_INFINITY), null);
    assert.equal(sanitizeKrwAmount(-1), null);
    assert.equal(sanitizeKrwAmount('100' as unknown as number), null);
    assert.equal(sanitizeKrwAmount(0), 0);
    assert.equal(sanitizeKrwAmount(1234.6), 1235);
  });

  it('tryAmountToKrw: KRW passthrough + EUR via env FX only', () => {
    const env = baseEnv({ amadeusKrwPerEur: 1400 });
    assert.deepEqual(tryAmountToKrw(10_000, 'KRW', env), {
      amountKrw: 10_000,
      currency: 'KRW',
    });
    assert.deepEqual(tryAmountToKrw(10, 'EUR', env), {
      amountKrw: 14_000,
      currency: 'KRW',
    });
  });

  it('tryAmountToKrw: unsupported currency → null (no invented FX)', () => {
    const env = baseEnv();
    assert.deepEqual(tryAmountToKrw(1000, 'JPY', env), {
      amountKrw: null,
      currency: 'JPY',
    });
    assert.deepEqual(tryAmountToKrw(1000, 'USD', env), {
      amountKrw: null,
      currency: 'USD',
    });
  });

  it('tryAmountToKrw: invalid amounts → null', () => {
    const env = baseEnv();
    assert.equal(tryAmountToKrw(Number.NaN, 'KRW', env).amountKrw, null);
    assert.equal(tryAmountToKrw(-5, 'KRW', env).amountKrw, null);
    assert.equal(tryAmountToKrw(Number.POSITIVE_INFINITY, 'EUR', env).amountKrw, null);
  });

  it('toKrw still supports USD estimate path but rejects invalid', () => {
    const env = baseEnv({ amadeusKrwPerEur: 1000 });
    assert.equal(toKrw(10, 'USD', env), Math.round(10 * 1000 * 0.92));
    assert.throws(() => toKrw(Number.NaN, 'KRW', env));
    assert.throws(() => toKrw(10, 'JPY', env));
  });

  it('statsFromAmounts drops invalid values', () => {
    const stats = statsFromAmounts([100, Number.NaN, -3, 200], 'KRW');
    assert.equal(stats.offerCount, 2);
    assert.equal(stats.min, 100);
    assert.equal(stats.max, 200);
    assert.equal(stats.avg, 150);
  });
});
