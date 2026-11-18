import cors from 'cors';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccommodationSearchService } from './accommodations/service.js';
import { describeDuffelClient } from './duffel/client.js';
import { loadServerEnv } from './env.js';
import { FlightSearchService, resolveActiveFlightProvider } from './flights/service.js';
import { FixedWindowRateLimiter } from './flights/rateLimit.js';
import { registerAccommodationRoutes } from './routes/accommodations.js';
import { registerFlightRoutes } from './routes/flights.js';
import { registerSavedTripRoutes } from './routes/savedTrips.js';
import { registerSharedTripRoutes } from './routes/sharedTrips.js';
import { createServiceClient } from './supabase.js';

const env = loadServerEnv();
const duffelClientInfo = describeDuffelClient(env);
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
  res.json({
    ok: true,
    supabaseConfigured: env.supabaseConfigured,
    amadeusConfigured: env.amadeusConfigured,
    duffelConfigured: env.duffelConfigured,
    duffel: {
      configured: duffelClientInfo.configured,
      baseUrl: duffelClientInfo.baseUrl,
      apiVersion: duffelClientInfo.apiVersion,
      tokenPrefix: duffelClientInfo.tokenPrefix,
    },
    // Flights: Duffel → Amadeus → mock (never both live providers). Stays still Amadeus until step 4.
    flightProvider: resolveActiveFlightProvider(env),
    accommodationProvider: env.amadeusConfigured ? 'amadeus' : 'mock',
    mode:
      env.supabaseConfigured || env.amadeusConfigured || env.duffelConfigured
        ? 'partial-or-full'
        : 'offline-mock',
  });
});

app.listen(env.port, () => {
  console.log(
    `[galmanhae-server] :${env.port} supabase=${env.supabaseConfigured} amadeus=${env.amadeusConfigured} duffel=${env.duffelConfigured} flights=${resolveActiveFlightProvider(env)}`,
  );
});
