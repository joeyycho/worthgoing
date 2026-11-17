function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadServerEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configured = Boolean(supabaseUrl && serviceRoleKey);

  return {
    port: Number(process.env.PORT ?? 8787),
    configured,
    supabaseUrl: configured ? required('SUPABASE_URL', supabaseUrl) : null,
    serviceRoleKey: configured ? required('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey) : null,
    /** Optional CORS origin for the Vite mini-app */
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
  };
}

export type ServerEnv = ReturnType<typeof loadServerEnv>;
