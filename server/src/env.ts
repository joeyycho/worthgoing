import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Local/dev: load `server/.env` only when `NODE_ENV === 'development'`
 * and the file is present (Node 24 `process.loadEnvFile`).
 * - Never loads when `NODE_ENV === 'production'` (host-injected process env only).
 * - Never loads when `NODE_ENV` is unset or any other value — set
 *   `NODE_ENV=development` locally (e.g. `npm run dev` in server/).
 * - Existing `process.env` values always win over file values (Node semantics).
 * - No-op when the file is missing.
 */
function loadLocalEnvFileIfPresent(): void {
  if (process.env.NODE_ENV !== 'development') return;
  const envFilePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../.env',
  );
  if (!existsSync(envFilePath)) return;
  process.loadEnvFile(envFilePath);
}

loadLocalEnvFileIfPresent();

const PROD_CORS_REQUIRED =
  'CORS_ORIGIN is required when NODE_ENV=production. Set a comma-separated allowlist of absolute http(s) origins. Wildcard * is not allowed in production.';

const PROD_CORS_WILDCARD =
  'CORS_ORIGIN=* is not allowed when NODE_ENV=production. Use an explicit comma-separated allowlist of absolute http(s) origins.';

/**
 * Validate one CORS allowlist entry as an absolute http(s) origin.
 * Accepts optional trailing `/`; rejects path/query/hash, credentials, and `*` hosts.
 * Does not invent or inject Toss (or any) hostnames — callers must supply console-confirmed origins.
 */
export function normalizeCorsOriginEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed || trimmed === '*') {
    throw new Error(
      `Invalid CORS_ORIGIN entry ${JSON.stringify(entry)}: expected an absolute http(s) origin, not empty or *`,
    );
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid CORS_ORIGIN entry ${JSON.stringify(entry)}: not a valid absolute URL`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `Invalid CORS_ORIGIN entry ${JSON.stringify(entry)}: only http: and https: are allowed`,
    );
  }
  if (url.username || url.password) {
    throw new Error(
      `Invalid CORS_ORIGIN entry ${JSON.stringify(entry)}: credentials are not allowed`,
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      `Invalid CORS_ORIGIN entry ${JSON.stringify(entry)}: query/hash are not allowed`,
    );
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(
      `Invalid CORS_ORIGIN entry ${JSON.stringify(entry)}: path is not allowed (use origin only)`,
    );
  }
  if (url.hostname.includes('*')) {
    throw new Error(
      `Invalid CORS_ORIGIN entry ${JSON.stringify(entry)}: wildcard hostnames are not allowed`,
    );
  }
  return url.origin;
}

function parseCorsAllowlist(raw: string): string[] {
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(
      'CORS_ORIGIN allowlist is empty after parsing. Provide at least one absolute http(s) origin.',
    );
  }
  const seen = new Set<string>();
  const origins: string[] = [];
  for (const part of parts) {
    const origin = normalizeCorsOriginEntry(part);
    if (seen.has(origin)) continue;
    seen.add(origin);
    origins.push(origin);
  }
  return origins;
}

/**
 * Resolve CORS_ORIGIN for the current NODE_ENV.
 *
 * Production (`NODE_ENV=production`): fail-closed — require an explicit
 * comma-separated allowlist; reject missing, empty, `*`, and malformed entries.
 * Never silently wildcards or reflects; never invents Toss origins.
 *
 * Non-production: keep local workflow — unset/`*` → `*`; otherwise parse allowlist.
 */
export function resolveCorsOrigins(
  raw: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): '*' | string[] {
  const isProduction = nodeEnv === 'production';
  const trimmed = raw?.trim();

  if (isProduction) {
    if (!trimmed) {
      throw new Error(PROD_CORS_REQUIRED);
    }
    if (trimmed === '*') {
      throw new Error(PROD_CORS_WILDCARD);
    }
    return parseCorsAllowlist(trimmed);
  }

  if (!trimmed || trimmed === '*') {
    return '*';
  }
  return parseCorsAllowlist(trimmed);
}

/**
 * Map resolved CORS config to the `cors` package `origin` option.
 * `*` (non-production only) → reflect (`true`). Allowlist → string or string[].
 * Production never resolves to `*`, so production never uses reflect/wildcard.
 */
export function toCorsOriginOption(
  corsOrigins: '*' | readonly string[],
): true | string | string[] {
  if (corsOrigins === '*') return true;
  if (corsOrigins.length === 1) return corsOrigins[0]!;
  return [...corsOrigins];
}

export function loadServerEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

  const amadeusClientId = process.env.AMADEUS_CLIENT_ID;
  const amadeusClientSecret = process.env.AMADEUS_CLIENT_SECRET;
  const amadeusConfigured = Boolean(amadeusClientId && amadeusClientSecret);

  const duffelAccessToken = process.env.DUFFEL_ACCESS_TOKEN?.trim() || null;
  const duffelConfigured = Boolean(duffelAccessToken);

  const serpapiApiKey = process.env.SERPAPI_API_KEY?.trim() || null;
  const serpapiConfigured = Boolean(serpapiApiKey);

  /**
   * Comma-separated allowlist of absolute http(s) origins.
   * Production: required; `*` / missing / empty / malformed → startup error (fail-closed).
   * Non-production: unset or `*` allowed for local Vite workflow.
   * For Apps in Toss QR / live (SDK 3.10), register the mini-app origins from
   * https://developers-apps-in-toss.toss.im/guide/en/operation/toss
   * as shown in the console for this app — do not invent hostnames.
   */
  const corsOriginRaw = process.env.CORS_ORIGIN;
  const corsOrigins = resolveCorsOrigins(corsOriginRaw, process.env.NODE_ENV);

  return {
    port: Number(process.env.PORT ?? 8787),
    corsOrigin: corsOriginRaw ?? (corsOrigins === '*' ? '*' : corsOrigins.join(',')),
    corsOrigins,

    supabaseConfigured,
    supabaseUrl: supabaseConfigured ? required('SUPABASE_URL', supabaseUrl) : null,
    serviceRoleKey: supabaseConfigured
      ? required('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey)
      : null,

    /**
     * Official Amadeus OAuth body fields are `client_id` / `client_secret`
     * (API Key / API Secret from the Amadeus Self-Service dashboard).
     * https://github.com/amadeus4dev/developer-guides/blob/master/docs/quick-start.md
     */
    amadeusConfigured,
    amadeusClientId: amadeusConfigured
      ? required('AMADEUS_CLIENT_ID', amadeusClientId)
      : null,
    amadeusClientSecret: amadeusConfigured
      ? required('AMADEUS_CLIENT_SECRET', amadeusClientSecret)
      : null,
    /** test.api.amadeus.com (default) or api.amadeus.com */
    amadeusHostname: process.env.AMADEUS_HOSTNAME ?? 'test.api.amadeus.com',
    /** Display conversion only when Amadeus returns non-KRW (usually EUR). Not a live FX feed. */
    amadeusKrwPerEur: Number(process.env.AMADEUS_KRW_PER_EUR ?? 1500),

    /**
     * Duffel access token (server-only). Create in Dashboard → Developers → Access tokens.
     * Test tokens start with `duffel_test_`; live with `duffel_live_`. Do not mix modes.
     * https://duffel.com/docs/api/overview/making-requests
     * https://duffel.com/docs/api/overview/test-mode
     */
    duffelConfigured,
    duffelAccessToken: duffelConfigured
      ? required('DUFFEL_ACCESS_TOKEN', duffelAccessToken ?? undefined)
      : null,
    duffelBaseUrl: process.env.DUFFEL_BASE_URL ?? 'https://api.duffel.com',
    duffelApiVersion: process.env.DUFFEL_API_VERSION ?? 'v2',
    duffelTimeoutMs: Number(process.env.DUFFEL_TIMEOUT_MS ?? 12_000),

    /**
     * SerpApi API key (server-only). Used for Google Flights / Google Hotels search
     * in later migration steps. Never put SERPAPI_API_KEY in VITE_*.
     * https://serpapi.com/manage-api-key
     * Missing key does not block server startup — providers stay on Duffel/Amadeus/mock.
     */
    serpapiConfigured,
    serpapiApiKey: serpapiConfigured
      ? required('SERPAPI_API_KEY', serpapiApiKey ?? undefined)
      : null,
    serpapiBaseUrl: process.env.SERPAPI_BASE_URL ?? 'https://serpapi.com',
    serpapiTimeoutMs: Number(process.env.SERPAPI_TIMEOUT_MS ?? 15_000),
    /** Google locale / language / currency defaults for SerpApi engines (갈만해). */
    serpapiGl: process.env.SERPAPI_GL ?? 'kr',
    serpapiHl: process.env.SERPAPI_HL ?? 'ko',
    serpapiCurrency: process.env.SERPAPI_CURRENCY ?? 'KRW',

    flightCacheTtlMs: Number(process.env.FLIGHT_CACHE_TTL_MS ?? 15 * 60 * 1000),
    flightTimeoutMs: Number(process.env.FLIGHT_TIMEOUT_MS ?? 12_000),
    flightRateLimitPerMinute: Number(process.env.FLIGHT_RATE_LIMIT_PER_MINUTE ?? 30),

    /** Hotel List + Hotel Search (same Amadeus OAuth credentials). */
    accommodationCacheTtlMs: Number(process.env.ACCOMMODATION_CACHE_TTL_MS ?? 15 * 60 * 1000),
    accommodationTimeoutMs: Number(process.env.ACCOMMODATION_TIMEOUT_MS ?? 12_000),
    accommodationRateLimitPerMinute: Number(
      process.env.ACCOMMODATION_RATE_LIMIT_PER_MINUTE ?? 30,
    ),
    /** Max hotels from Hotel List to price via Hotel Search v3 */
    accommodationHotelIdLimit: Number(process.env.ACCOMMODATION_HOTEL_ID_LIMIT ?? 5),
  };
}

export type ServerEnv = ReturnType<typeof loadServerEnv>;
