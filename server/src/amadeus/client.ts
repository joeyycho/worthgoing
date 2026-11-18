import type { ServerEnv } from '../env.js';
import { getAmadeusAccessToken } from './auth.js';

export async function amadeusGet<T>(
  env: ServerEnv,
  pathWithQuery: string,
  timeoutMs = env.flightTimeoutMs,
): Promise<T> {
  const token = await getAmadeusAccessToken(env);
  const response = await fetch(`https://${env.amadeusHostname}${pathWithQuery}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.amadeus+json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus GET ${pathWithQuery} failed (${response.status}): ${text.slice(0, 240)}`);
  }

  return (await response.json()) as T;
}
