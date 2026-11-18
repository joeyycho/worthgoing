/**
 * Shared server error shape for SerpApi HTTP / payload failures.
 * Providers (step 3+) can catch SerpapiApiError and fall back to Mock.
 * Never include API keys or secret fragments in messages.
 */

export type SerpapiErrorKind =
  | 'missing_config'
  | 'timeout'
  | 'http'
  | 'api'
  | 'invalid_json';

export class SerpapiApiError extends Error {
  readonly kind: SerpapiErrorKind;
  readonly status: number;
  /** Request path or engine label (no query string / secrets). */
  readonly path: string;
  readonly engine: string | null;

  constructor(options: {
    message: string;
    kind: SerpapiErrorKind;
    status: number;
    path?: string;
    engine?: string | null;
  }) {
    super(options.message);
    this.name = 'SerpapiApiError';
    this.kind = options.kind;
    this.status = options.status;
    this.path = options.path ?? '';
    this.engine = options.engine ?? null;
  }

  toJSON() {
    return {
      error: this.message,
      provider: 'serpapi' as const,
      kind: this.kind,
      status: this.status,
      path: this.path,
      engine: this.engine,
    };
  }
}

/** Pull a human message from a SerpApi error body without echoing secrets. */
export function parseSerpapiErrorMessage(bodyText: string): string {
  if (!bodyText) return 'empty body';
  try {
    const json = JSON.parse(bodyText) as { error?: unknown; message?: unknown };
    if (typeof json.error === 'string' && json.error.trim()) {
      return json.error.slice(0, 240);
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return json.message.slice(0, 240);
    }
  } catch {
    // non-JSON body
  }
  return bodyText.slice(0, 240);
}
