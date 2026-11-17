import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerEnv } from './env.js';

/**
 * Service-role client for server routes ONLY.
 * Never import this module from the Vite frontend.
 */
export function createServiceClient(env: ServerEnv): SupabaseClient {
  if (!env.supabaseConfigured || !env.supabaseUrl || !env.serviceRoleKey) {
    throw new Error('Supabase is not configured on the server');
  }

  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
