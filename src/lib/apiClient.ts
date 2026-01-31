export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

const isFormData = (value: unknown): value is FormData => {
  return typeof FormData !== 'undefined' && value instanceof FormData;
};

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, headers } = options;
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

  const res = await fetch(path, init);
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
