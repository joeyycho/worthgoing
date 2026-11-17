import cors from 'cors';
import express from 'express';
import { loadServerEnv } from './env.js';
import { registerSavedTripRoutes } from './routes/savedTrips.js';
import { registerSharedTripRoutes } from './routes/sharedTrips.js';
import { createServiceClient } from './supabase.js';

const env = loadServerEnv();
const app = express();

app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: env.configured,
    mode: env.configured ? 'supabase' : 'unconfigured',
  });
});

if (env.configured) {
  const supabase = createServiceClient(env);
  registerSavedTripRoutes(app, supabase);
  registerSharedTripRoutes(app, supabase);
} else {
  app.use('/api', (_req, res) => {
    res.status(503).json({
      error:
        'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server. Frontend will use client Storage fallback.',
      mode: 'unconfigured',
    });
  });
}

app.listen(env.port, () => {
  console.log(
    `[galmanhae-server] listening on :${env.port} (supabase=${env.configured ? 'configured' : 'OFFLINE fallback expected'})`,
  );
});
