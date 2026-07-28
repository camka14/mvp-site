import type { ScrapedPage, ScrapePageClient } from './types';
import { ScrapingDogTransport } from './scrapingDogTransport';

export class ScrapingDogClient implements ScrapePageClient {
  constructor(
    private readonly apiKey = process.env.SCRAPINGDOG_API_KEY ?? '',
    private readonly fetchImpl: typeof fetch | null = null,
  ) {}

  async fetchPage(params: { url: string; renderJavascript?: boolean; waitMs?: number }): Promise<ScrapedPage> {
    const response = await new ScrapingDogTransport(
      this.apiKey,
      this.fetchImpl,
    ).requestText({
      endpoint: '/scrape',
      targetUrl: params.url,
      params: {
        url: params.url,
        ...(params.renderJavascript ? { dynamic: true } : {}),
        ...(params.waitMs != null && Number.isFinite(params.waitMs) && params.waitMs > 0
          ? { wait: Math.trunc(params.waitMs) }
          : {}),
      },
    });
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: response.statusCode,
      body: response.body,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export const scrapingDogClient = new ScrapingDogClient();
