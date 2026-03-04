/**
 * Centralized API client for frontend fetch calls.
 * All requests include credentials and consistent error handling.
 */

/** Typed API error with HTTP status code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Shared response handling: error parsing, 204/non-JSON, JSON extraction. */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      data.error || `Request failed: ${res.status}`,
      res.status,
    );
  }
  if (
    res.status === 204 ||
    !res.headers.get('content-type')?.includes('application/json')
  ) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Fetch JSON from an API endpoint with credentials and abort support. */
export async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  return handleResponse<T>(res);
}

/** POST/PATCH/DELETE with JSON body. */
export async function apiMutate<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    method: opts.method ?? 'POST',
    headers:
      opts.body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  return handleResponse<T>(res);
}
