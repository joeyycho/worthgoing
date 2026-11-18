import cors from 'cors';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AccommodationSearchService,
  resolveActiveAccommodationProvider,
} from './accommodations/service.js';
import { describeDuffelClient } from './duffel/client.js';
import { loadServerEnv } from './env.js';
import { FlightSearchService, resolveActiveFlightProvider } from './flights/service.js';
import { FixedWindowRateLimiter } from './flights/rateLimit.js';
import { registerAccommodationRoutes } from './routes/accommodations.js';
import { registerFlightRoutes } from './routes/flights.js';
import { registerSavedTripRoutes } from './routes/savedTrips.js';
import { registerSharedTripRoutes } from './routes/sharedTrips.js';
import { describeSerpapiClient } from './serpapi/client.js';
import { createServiceClient } from './supabase.js';

const env = loadServerEnv();
const duffelClientInfo = describeDuffelClient(env);
const serpapiClientInfo = describeSerpapiClient(env);
const app = express();

app.use(
  cors({
    origin:
      env.corsOrigins === '*'
        ? true
        : env.corsOrigins.length === 1
          ? env.corsOrigins[0]
          : env.corsOrigins,
  }),
);
app.use(express.json({ limit: '1mb' }));

let supabase: SupabaseClient | null = null;
if (env.supabaseConfigured) {
  supabase = createServiceClient(env);
  registerSavedTripRoutes(app, supabase);
  registerSharedTripRoutes(app, supabase);
} else {
  const supabaseUnavailable = (_req: express.Request, res: express.Response) => {
    res.status(503).json({
      error:
        'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.',
      mode: 'unconfigured',
    });
  };
  app.all('/api/saved-trips', supabaseUnavailable);
  app.all('/api/saved-trips/:id', supabaseUnavailable);
  app.all('/api/shared-trips', supabaseUnavailable);
  app.all('/api/shared-trips/:token', supabaseUnavailable);
}

const flightService = new FlightSearchService(env, supabase);
const flightRateLimiter = new FixedWindowRateLimiter(env.flightRateLimitPerMinute);
registerFlightRoutes(app, flightService, flightRateLimiter);

const accommodationService = new AccommodationSearchService(env, supabase);
const accommodationRateLimiter = new FixedWindowRateLimiter(
  env.accommodationRateLimitPerMinute,
);
registerAccommodationRoutes(app, accommodationService, accommodationRateLimiter);

app.get('/health', (_req, res) => {
  // serpapiConfigured = key present; active* = resolved search path (may differ when unset).
  const activeFlightProvider = resolveActiveFlightProvider(env);
  const activeAccommodationProvider = resolveActiveAccommodationProvider(env);
  res.json({
    ok: true,
    supabaseConfigured: env.supabaseConfigured,
    amadeusConfigured: env.amadeusConfigured,
    duffelConfigured: env.duffelConfigured,
    serpapiConfigured: env.serpapiConfigured,
    duffel: {
      configured: duffelClientInfo.configured,
      baseUrl: duffelClientInfo.baseUrl,
      apiVersion: duffelClientInfo.apiVersion,
      tokenPrefix: duffelClientInfo.tokenPrefix,
    },
    serpapi: {
      configured: serpapiClientInfo.configured,
      baseUrl: serpapiClientInfo.baseUrl,
      gl: serpapiClientInfo.gl,
      hl: serpapiClientInfo.hl,
      currency: serpapiClientInfo.currency,
    },
    // Active search path: SerpApi → mock (flights + stays). Duffel/Amadeus stay configured flags only.
    flightProvider: activeFlightProvider,
    accommodationProvider: activeAccommodationProvider,
    activeFlightProvider,
    activeAccommodationProvider,
    mode:
      env.supabaseConfigured ||
      env.amadeusConfigured ||
      env.duffelConfigured ||
      env.serpapiConfigured
        ? 'partial-or-full'
        : 'offline-mock',
  });
});

app.listen(env.port, () => {
  console.log(
    `[galmanhae-server] :${env.port} supabase=${env.supabaseConfigured} amadeus=${env.amadeusConfigured} duffel=${env.duffelConfigured} serpapi=${env.serpapiConfigured} flights=${resolveActiveFlightProvider(env)} stays=${resolveActiveAccommodationProvider(env)}`,
  );
});
