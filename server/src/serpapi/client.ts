import type { ServerEnv } from '../env.js';
import { SerpapiApiError, parseSerpapiErrorMessage } from './errors.js';

/**
 * SerpApi HTTP client (server-only).
 * Auth via query param `api_key` per https://serpapi.com/search-api
 * Default endpoint: GET {SERPAPI_BASE_URL}/search
 *
 * Does not parse flight/hotel result shapes — providers call this helper (step 3+).
 */

const DEFAULT_BASE = 'https://serpapi.com';
const SEARCH_PATH = '/search';

export type SerpapiEngine = 'google_flights' | 'google_hotels';

/** Query params for GET /search. `api_key` is injected from env — do not pass it. */
export type SerpapiSearchParams = {
  engine: SerpapiEngine;
} & Record<string, string | number | boolean | undefined | null>;

/** Untyped JSON object from SerpApi — callers narrow engine-specific fields. */
export type SerpapiSearchResponse = Record<string, unknown>;

export function assertSerpapiConfigured(env: ServerEnv): string {
  if (!env.serpapiConfigured || !env.serpapiApiKey) {
    throw new SerpapiApiError({
      message: 'SerpApi is not configured. Set SERPAPI_API_KEY on the server.',
      kind: 'missing_config',
      status: 503,
      path: SEARCH_PATH,
    });
  }
  return env.serpapiApiKey;
}

function buildSearchUrl(env: ServerEnv, params: SerpapiSearchParams): string {
  const apiKey = assertSerpapiConfigured(env);
  const base = (env.serpapiBaseUrl || DEFAULT_BASE).replace(/\/$/, '');
  const url = new URL(`${base}${SEARCH_PATH}`);

  for (const [key, value] of Object.entries(params)) {
    if (key === 'api_key') continue;
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('api_key', apiKey);
  return url.toString();
}

/** Strip the configured key (and common query forms) from any user-facing text. */
function redactSecrets(text: string, apiKey: string | null): string {
  let out = text;
  if (apiKey) {
    out = out.split(apiKey).join('[redacted]');
  }
  out = out.replace(/api_key=[^&\s"']+/gi, 'api_key=[redacted]');
  return out;
}

/**
 * GET SerpApi `/search`. Injects `api_key` from env.
 * Throws SerpapiApiError on missing config, timeout, HTTP error, API-level
 * error payload (including HTTP 200), or invalid JSON.
 * Empty search inventories (valid JSON without `error`) are returned as-is.
 */
export async function serpapiGet(
  env: ServerEnv,
  params: SerpapiSearchParams,
  timeoutMs?: number,
): Promise<SerpapiSearchResponse> {
  const apiKey = assertSerpapiConfigured(env);
  const effectiveTimeout = timeoutMs ?? env.serpapiTimeoutMs;
  const engine = params.engine;
  const url = buildSearchUrl(env, params);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(effectiveTimeout),
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    const rawNetwork =
      error instanceof Error ? error.message : String(error);
    const message = isTimeout
      ? `SerpApi GET ${SEARCH_PATH} (${engine}) timed out after ${effectiveTimeout}ms`
      : `SerpApi GET ${SEARCH_PATH} (${engine}) network error: ${redactSecrets(rawNetwork, apiKey)}`;
    throw new SerpapiApiError({
      message,
      kind: isTimeout ? 'timeout' : 'http',
      status: isTimeout ? 504 : 502,
      path: SEARCH_PATH,
      engine,
    });
  }

  const text = await response.text();

  if (!response.ok) {
    const detail = redactSecrets(parseSerpapiErrorMessage(text), apiKey);
    throw new SerpapiApiError({
      message: `SerpApi GET ${SEARCH_PATH} (${engine}) failed (${response.status}): ${detail}`,
      kind: 'http',
      status: response.status,
      path: SEARCH_PATH,
      engine,
    });
  }

  if (!text.trim()) {
    throw new SerpapiApiError({
      message: `SerpApi GET ${SEARCH_PATH} (${engine}) returned empty body`,
      kind: 'invalid_json',
      status: response.status,
      path: SEARCH_PATH,
      engine,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SerpapiApiError({
      message: `SerpApi GET ${SEARCH_PATH} (${engine}) returned non-JSON success body`,
      kind: 'invalid_json',
      status: response.status,
      path: SEARCH_PATH,
      engine,
    });
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SerpapiApiError({
      message: `SerpApi GET ${SEARCH_PATH} (${engine}) returned non-object JSON`,
      kind: 'invalid_json',
      status: response.status,
      path: SEARCH_PATH,
      engine,
    });
  }

  const body = parsed as SerpapiSearchResponse;
  if (typeof body.error === 'string' && body.error.trim()) {
    const detail = redactSecrets(body.error.slice(0, 240), apiKey);
    throw new SerpapiApiError({
      message: `SerpApi GET ${SEARCH_PATH} (${engine}) API error: ${detail}`,
      kind: 'api',
      status: response.status,
      path: SEARCH_PATH,
      engine,
    });
  }

  return body;
}

/** Smoke helper — validates env wiring without calling SerpApi or exposing the key. */
export function describeSerpapiClient(env: ServerEnv): {
  configured: boolean;
  baseUrl: string;
  timeoutMs: number;
  gl: string;
  hl: string;
  currency: string;
} {
  return {
    configured: env.serpapiConfigured,
    baseUrl: env.serpapiBaseUrl || DEFAULT_BASE,
    timeoutMs: env.serpapiTimeoutMs,
    gl: env.serpapiGl,
    hl: env.serpapiHl,
    currency: env.serpapiCurrency,
  };
}
