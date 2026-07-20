import type { ScrapedPage, ScrapePageClient } from './types';

const SCRAPINGDOG_ENDPOINT = 'https://api.scrapingdog.com/scrape';
const DEFAULT_SCRAPINGDOG_TIMEOUT_MS = 5 * 60 * 1000;

const scrapingDogTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.SCRAPINGDOG_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 10_000 && configured <= 15 * 60 * 1000
    ? configured
    : DEFAULT_SCRAPINGDOG_TIMEOUT_MS;
};

export class ScrapingDogClient implements ScrapePageClient {
  constructor(
    private readonly apiKey = process.env.SCRAPINGDOG_API_KEY ?? '',
    private readonly fetchImpl: typeof fetch | null = null,
  ) {}

  async fetchPage(params: { url: string; renderJavascript?: boolean; waitMs?: number }): Promise<ScrapedPage> {
    if (!this.apiKey.trim()) {
      throw new Error('SCRAPINGDOG_API_KEY is not configured.');
    }

    const requestUrl = new URL(SCRAPINGDOG_ENDPOINT);
    requestUrl.searchParams.set('api_key', this.apiKey);
    requestUrl.searchParams.set('url', params.url);
    if (params.renderJavascript) {
      requestUrl.searchParams.set('dynamic', 'true');
    }
    if (params.waitMs != null && Number.isFinite(params.waitMs) && params.waitMs > 0) {
      requestUrl.searchParams.set('wait', String(Math.trunc(params.waitMs)));
    }

    const timeoutMs = scrapingDogTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      const request = this.fetchImpl ?? globalThis.fetch;
      if (typeof request !== 'function') {
        throw new Error('Global fetch is not available.');
      }
      response = await request(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
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
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`ScrapingDog request failed with HTTP ${response.status}.`);
    }

    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: response.status,
      body,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export const scrapingDogClient = new ScrapingDogClient();
