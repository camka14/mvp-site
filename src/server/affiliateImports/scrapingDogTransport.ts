import { createHash } from 'crypto';

const SCRAPINGDOG_BASE_URL = 'https://api.scrapingdog.com';
const DEFAULT_SCRAPINGDOG_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_SCRAPINGDOG_TIMEOUT_MS = 10_000;
const MAX_SCRAPINGDOG_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_RETRIES = 1;

export type ScrapingDogResponseType = 'text' | 'json' | 'buffer';

export type ScrapingDogTransportRequest = {
  endpoint: '/scrape' | '/google' | '/screenshot';
  targetUrl?: string;
  params: Record<string, string | number | boolean | null | undefined>;
  responseType: ScrapingDogResponseType;
};

export type ScrapingDogTransportResult<T> = {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  statusCode: number;
  headers: Record<string, string>;
  body: T;
  elapsedMs: number;
};

type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export const scrapingDogTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.SCRAPINGDOG_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured)
    && configured >= MIN_SCRAPINGDOG_TIMEOUT_MS
    && configured <= MAX_SCRAPINGDOG_TIMEOUT_MS
    ? configured
    : DEFAULT_SCRAPINGDOG_TIMEOUT_MS;
};

const safeHeaders = (headers?: Headers): Record<string, string> => {
  if (!headers || typeof headers.get !== 'function') return {};
  const allowed = ['content-type', 'content-length', 'retry-after', 'x-request-id'];
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = headers.get(name);
    return value ? [[name, value]] : [];
  }));
};

const normalizedParams = (
  params: ScrapingDogTransportRequest['params'],
): Record<string, string | number | boolean> => Object.fromEntries(
  Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => (
      entry[1] !== null && entry[1] !== undefined
    ))
    .sort(([left], [right]) => left.localeCompare(right)),
);

const retryDelayMs = (response: Response, attempt: number): number => {
  const retryAfter = Number.parseInt(response.headers?.get?.('retry-after') ?? '', 10);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(10_000, retryAfter * 1_000);
  }
  return Math.min(2_000, 500 * (2 ** attempt));
};

const responseError = async (response: Response): Promise<Error> => {
  const body = await response.text().catch(() => '');
  const suffix = body.trim() ? `: ${body.trim().slice(0, 300)}` : '';
  return new Error(`ScrapingDog request failed with HTTP ${response.status}${suffix}`);
};

export class ScrapingDogTransport {
  constructor(
    private readonly apiKey = process.env.SCRAPINGDOG_API_KEY?.trim() ?? '',
    private readonly fetchImpl: typeof fetch | null = null,
    private readonly sleep: Sleep = defaultSleep,
  ) {}

  async requestText(
    request: Omit<ScrapingDogTransportRequest, 'responseType'>,
  ): Promise<ScrapingDogTransportResult<string>> {
    return this.request({ ...request, responseType: 'text' });
  }

  async requestJson<T = unknown>(
    request: Omit<ScrapingDogTransportRequest, 'responseType'>,
  ): Promise<ScrapingDogTransportResult<T>> {
    return this.request<T>({ ...request, responseType: 'json' });
  }

  async requestBuffer(
    request: Omit<ScrapingDogTransportRequest, 'responseType'>,
  ): Promise<ScrapingDogTransportResult<Buffer>> {
    return this.request({ ...request, responseType: 'buffer' });
  }

  private async request<T>(
    input: ScrapingDogTransportRequest,
  ): Promise<ScrapingDogTransportResult<T>> {
    if (!this.apiKey) {
      throw new Error('SCRAPINGDOG_API_KEY is not configured.');
    }
    const params = normalizedParams(input.params);
    const requestUrl = new URL(input.endpoint, SCRAPINGDOG_BASE_URL);
    requestUrl.searchParams.set('api_key', this.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, String(value));
    });
    const redactedRequest = {
      provider: 'SCRAPINGDOG',
      endpoint: input.endpoint,
      ...(input.targetUrl ? { targetUrl: input.targetUrl } : {}),
      options: Object.fromEntries(
        Object.entries(params).filter(([key]) => key !== 'url' && key !== 'query'),
      ),
      ...(typeof params.query === 'string' ? { query: params.query } : {}),
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeoutMs = scrapingDogTimeoutMs();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();
      let response: Response;
      try {
        const request = this.fetchImpl ?? globalThis.fetch;
        if (typeof request !== 'function') throw new Error('Global fetch is not available.');
        response = await request(requestUrl, {
          method: 'GET',
          headers: {
            Accept: input.responseType === 'buffer'
              ? 'image/png,image/jpeg,image/webp,*/*;q=0.8'
              : 'application/json,text/html,application/xhtml+xml,*/*;q=0.8',
          },
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(`ScrapingDog request timed out after ${timeoutMs}ms.`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      const canRetry = attempt < MAX_RETRIES
        && (response.status === 429 || response.status >= 500 || response.status === 202);
      if (!response.ok || response.status === 202) {
        if (canRetry) {
          await this.sleep(retryDelayMs(response, attempt));
          continue;
        }
        throw await responseError(response);
      }

      let body: unknown;
      if (input.responseType === 'json') {
        body = await response.json();
      } else if (input.responseType === 'buffer') {
        body = Buffer.from(await response.arrayBuffer());
      } else {
        body = await response.text();
      }
      const headers = safeHeaders(response.headers);
      const elapsedMs = Date.now() - startedAt;
      const bodyBytes = typeof body === 'string'
        ? Buffer.from(body, 'utf8')
        : Buffer.isBuffer(body) ? body : null;
      return {
        request: redactedRequest,
        response: {
          provider: 'SCRAPINGDOG',
          statusCode: response.status,
          headers,
          elapsedMs,
          ...(bodyBytes ? {
            bodyBytes: bodyBytes.length,
            bodyHash: createHash('sha256').update(bodyBytes).digest('hex'),
            bodyHashAlgorithm: 'sha256',
          } : {}),
        },
        statusCode: response.status,
        headers,
        body: body as T,
        elapsedMs,
      };
    }
    throw new Error('ScrapingDog request exhausted retries.');
  }
}
