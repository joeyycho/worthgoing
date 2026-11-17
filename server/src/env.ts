function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadServerEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

  const amadeusClientId = process.env.AMADEUS_CLIENT_ID;
  const amadeusClientSecret = process.env.AMADEUS_CLIENT_SECRET;
  const amadeusConfigured = Boolean(amadeusClientId && amadeusClientSecret);

  return {
    port: Number(process.env.PORT ?? 8787),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',

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

    flightCacheTtlMs: Number(process.env.FLIGHT_CACHE_TTL_MS ?? 15 * 60 * 1000),
    flightTimeoutMs: Number(process.env.FLIGHT_TIMEOUT_MS ?? 12_000),
    flightRateLimitPerMinute: Number(process.env.FLIGHT_RATE_LIMIT_PER_MINUTE ?? 30),
  };
}

export type ServerEnv = ReturnType<typeof loadServerEnv>;
