import type { ServerEnv } from '../env.js';
import { DuffelApiError, parseDuffelErrorBody } from './errors.js';

/**
 * Duffel REST client (server-only).
 * Auth + headers per https://duffel.com/docs/api/overview/making-requests
 * - Authorization: Bearer <DUFFEL_ACCESS_TOKEN>
 * - Duffel-Version: v2
 * - Accept: application/json
 * - Content-Type: application/json on JSON bodies
 *
 * Does not perform flight/stay searches by itself — providers call these helpers (step 3+).
 */

const DEFAULT_BASE = 'https://api.duffel.com';

export function assertDuffelConfigured(env: ServerEnv): string {
  if (!env.duffelConfigured || !env.duffelAccessToken) {
    throw new DuffelApiError({
      message: 'Duffel is not configured. Set DUFFEL_ACCESS_TOKEN on the server.',
      status: 503,
      path: '',
    });
  }
  return env.duffelAccessToken;
}

function buildHeaders(env: ServerEnv, hasJsonBody: boolean): HeadersInit {
  const token = assertDuffelConfigured(env);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Duffel-Version': env.duffelApiVersion,
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
  };
  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function duffelRequest<T>(
  env: ServerEnv,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: {
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? env.duffelTimeoutMs;
  const hasJsonBody = options.body !== undefined;
  const url = `${env.duffelBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: buildHeaders(env, hasJsonBody),
      body: hasJsonBody ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? `Duffel ${method} ${path} timed out after ${timeoutMs}ms`
        : `Duffel ${method} ${path} network error: ${error instanceof Error ? error.message : String(error)}`;
    throw new DuffelApiError({
      message,
      status: 504,
      path,
    });
  }

  const requestId = response.headers.get('x-request-id');
  const text = await response.text();

  if (!response.ok) {
    const details = parseDuffelErrorBody(text);
    const first = details[0]?.message ?? response.statusText;
    throw new DuffelApiError({
      message: `Duffel ${method} ${path} failed (${response.status}): ${first}`,
      status: response.status,
      path,
      requestId,
      details,
    });
  }

  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DuffelApiError({
      message: `Duffel ${method} ${path} returned non-JSON success body`,
      status: response.status,
      path,
      requestId,
    });
  }
}

export async function duffelGet<T>(
  env: ServerEnv,
  path: string,
  timeoutMs?: number,
): Promise<T> {
  return duffelRequest<T>(env, 'GET', path, { timeoutMs });
}

export async function duffelPost<T>(
  env: ServerEnv,
  path: string,
  body: unknown,
  timeoutMs?: number,
): Promise<T> {
  return duffelRequest<T>(env, 'POST', path, { body, timeoutMs });
}

/** Smoke helper — validates env wiring without calling Duffel. */
export function describeDuffelClient(env: ServerEnv): {
  configured: boolean;
  baseUrl: string;
  apiVersion: string;
  tokenPrefix: string | null;
} {
  const token = env.duffelAccessToken;
  return {
    configured: env.duffelConfigured,
    baseUrl: env.duffelBaseUrl || DEFAULT_BASE,
    apiVersion: env.duffelApiVersion,
    tokenPrefix: token
      ? token.startsWith('duffel_test_')
        ? 'duffel_test_'
        : token.startsWith('duffel_live_')
          ? 'duffel_live_'
          : 'other'
      : null,
  };
}
