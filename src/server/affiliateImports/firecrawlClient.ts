import Firecrawl, { type Document, type MapData, type ScrapeOptions } from '@mendable/firecrawl-js';

const DEFAULT_MAP_LIMIT = 50;
const MAX_MAP_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 90_000;

const firecrawlTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.FIRECRAWL_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 30_000 && configured <= 180_000
    ? configured
    : DEFAULT_TIMEOUT_MS;
};

export type FirecrawlMappedLink = {
  url: string;
  title?: string | null;
  description?: string | null;
};

export type FirecrawlMapResult = {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  links: FirecrawlMappedLink[];
  providerJobId: string | null;
};

export type FirecrawlCaptureResult = {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  normalized: {
    finalUrl: string;
    statusCode: number | null;
    markdown: string | null;
    rawHtml: string | null;
    links: string[];
    images: string[];
    branding: Record<string, unknown> | null;
    screenshotUrl: string | null;
    metadata: Record<string, unknown>;
  };
  providerJobId: string | null;
};

export interface AffiliateFirecrawlClient {
  mapSourceUrls(url: string, options?: { limit?: number; search?: string }): Promise<FirecrawlMapResult>;
  scrapeSourcePage(url: string): Promise<FirecrawlCaptureResult>;
}

const serializableRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
};

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const numberValue = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const mapLimit = (value: number | undefined): number => {
  if (!Number.isInteger(value) || !value) return DEFAULT_MAP_LIMIT;
  return Math.max(1, Math.min(MAX_MAP_LIMIT, value));
};

export class FirecrawlAffiliateClient implements AffiliateFirecrawlClient {
  private readonly client: Firecrawl;

  constructor(apiKey = process.env.FIRECRAWL_API_KEY?.trim()) {
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY is required to inspect affiliate sources.');
    }
    this.client = new Firecrawl({
      apiKey,
      timeoutMs: firecrawlTimeoutMs(),
      maxRetries: 1,
    });
  }

  async mapSourceUrls(url: string, options: { limit?: number; search?: string } = {}): Promise<FirecrawlMapResult> {
    const timeout = firecrawlTimeoutMs();
    const request = {
      url,
      options: {
        limit: mapLimit(options.limit),
        search: stringValue(options.search) ?? undefined,
        includeSubdomains: false,
        ignoreQueryParameters: false,
        timeout,
        integration: 'cli',
      },
    };
    const response: MapData = await this.client.map(url, request.options);
    const links = (response.links ?? [])
      .map((entry) => ({
        url: stringValue(entry.url) ?? '',
        title: stringValue(entry.title),
        description: stringValue(entry.description),
      }))
      .filter((entry) => entry.url);

    return {
      request: serializableRecord(request),
      response: serializableRecord(response),
      links,
      providerJobId: stringValue(response.id),
    };
  }

  async scrapeSourcePage(url: string): Promise<FirecrawlCaptureResult> {
    const timeout = firecrawlTimeoutMs();
    const options: ScrapeOptions = {
      formats: [
        'markdown',
        'rawHtml',
        'links',
        'images',
        'branding',
        { type: 'screenshot', fullPage: true, quality: 80 },
      ],
      onlyMainContent: false,
      timeout,
      removeBase64Images: true,
      blockAds: true,
      integration: 'cli',
    };
    const request = { url, options };
    const response: Document = await this.client.scrape(url, options);
    const metadata = serializableRecord(response.metadata);
    const finalUrl = stringValue(metadata.sourceURL)
      ?? stringValue(metadata.url)
      ?? url;

    return {
      request: serializableRecord(request),
      response: serializableRecord(response),
      normalized: {
        finalUrl,
        statusCode: numberValue(metadata.statusCode),
        markdown: stringValue(response.markdown),
        rawHtml: stringValue(response.rawHtml),
        links: (response.links ?? []).map((entry) => entry.trim()).filter(Boolean),
        images: (response.images ?? []).map((entry) => entry.trim()).filter(Boolean),
        branding: response.branding ? serializableRecord(response.branding) : null,
        screenshotUrl: stringValue(response.screenshot),
        metadata,
      },
      providerJobId: stringValue(metadata.scrapeId),
    };
  }
}

export const createFirecrawlAffiliateClient = (): AffiliateFirecrawlClient => new FirecrawlAffiliateClient();
