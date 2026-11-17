import type { ServerEnv } from '../env.js';

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

let tokenState: TokenState | null = null;

/**
 * Official Amadeus OAuth2 client-credentials flow.
 * POST /v1/security/oauth2/token with grant_type, client_id, client_secret.
 */
export async function getAmadeusAccessToken(env: ServerEnv): Promise<string> {
  if (!env.amadeusConfigured || !env.amadeusClientId || !env.amadeusClientSecret) {
    throw new Error('Amadeus is not configured');
  }

  if (tokenState && Date.now() < tokenState.expiresAt - 30_000) {
    return tokenState.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.amadeusClientId,
    client_secret: env.amadeusClientSecret,
  });

  const response = await fetch(`https://${env.amadeusHostname}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(env.flightTimeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus auth failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenState = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return tokenState.accessToken;
}
