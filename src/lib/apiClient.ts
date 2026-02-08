export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Optional request timeout in milliseconds.
   * - `undefined`: use the default timeout.
   * - `0` or a negative number: disable timeout.
   */
  timeoutMs?: number;
  /** Optional AbortSignal for caller-driven cancellation. */
  signal?: AbortSignal;
}

const isFormData = (value: unknown): value is FormData => {
  return typeof FormData !== 'undefined' && value instanceof FormData;
};

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, headers, signal, timeoutMs } = options;
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      ...(headers ?? {}),
    },
  };

  if (body !== undefined) {
    if (isFormData(body)) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers = {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      };
    }
  }

  const DEFAULT_TIMEOUT_MS = 15_000;
  const timeout = typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
  }

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data)
      ? String((data as { error?: string }).error)
      : res.statusText || 'Request failed';
    throw new Error(message);
  }

  return data as T;
};
