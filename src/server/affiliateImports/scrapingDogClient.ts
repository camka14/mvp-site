import type { ScrapedPage, ScrapePageClient } from './types';

const SCRAPINGDOG_ENDPOINT = 'https://api.scrapingdog.com/scrape';

export class ScrapingDogClient implements ScrapePageClient {
  constructor(private readonly apiKey = process.env.SCRAPINGDOG_API_KEY ?? '') {}

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

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`ScrapingDog request failed with HTTP ${response.status}.`);
    }

    return {
      url: params.url,
      finalUrl: response.url || params.url,
      statusCode: response.status,
      body,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export const scrapingDogClient = new ScrapingDogClient();
