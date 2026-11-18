/**
 * Shared server error shape for Duffel HTTP failures.
 * Providers (step 3+) can catch DuffelApiError and fall back to Mock.
 */

export interface DuffelErrorDetail {
  message: string;
  type?: string;
  code?: string;
  title?: string;
  documentation_url?: string;
  source?: unknown;
}

export class DuffelApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly requestId: string | null;
  readonly details: DuffelErrorDetail[];

  constructor(options: {
    message: string;
    status: number;
    path: string;
    requestId?: string | null;
    details?: DuffelErrorDetail[];
  }) {
    super(options.message);
    this.name = 'DuffelApiError';
    this.status = options.status;
    this.path = options.path;
    this.requestId = options.requestId ?? null;
    this.details = options.details ?? [];
  }

  toJSON() {
    return {
      error: this.message,
      provider: 'duffel' as const,
      status: this.status,
      path: this.path,
      requestId: this.requestId,
      details: this.details,
    };
  }
}

export function parseDuffelErrorBody(bodyText: string): DuffelErrorDetail[] {
  if (!bodyText) return [];
  try {
    const json = JSON.parse(bodyText) as { errors?: DuffelErrorDetail[]; error?: string };
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      return json.errors.map((item) => ({
        message: item.message ?? item.title ?? 'Duffel error',
        type: item.type,
        code: item.code,
        title: item.title,
        documentation_url: item.documentation_url,
        source: item.source,
      }));
    }
    if (typeof json.error === 'string') {
      return [{ message: json.error }];
    }
  } catch {
    // non-JSON body
  }
  return [{ message: bodyText.slice(0, 240) }];
}
