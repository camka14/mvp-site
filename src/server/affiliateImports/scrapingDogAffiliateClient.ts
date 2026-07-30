import {
  deriveAffiliateHtmlArtifacts,
  evaluateAffiliateHtmlQuality,
} from './affiliateHtmlArtifacts';
import type {
  AffiliateSourceCaptureAttempt,
  AffiliateSourceCaptureClient,
  AffiliateSourcePageCapture,
  AffiliateSourceScreenshot,
  AffiliateSourceSearchClient,
  AffiliateSourceSearchOptions,
  AffiliateSourceSearchResult,
} from './affiliateProviderContracts';
import { ScrapingDogTransport } from './scrapingDogTransport';

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 20;
const DEFAULT_DYNAMIC_WAIT_MS = 2_500;
const MAX_DYNAMIC_WAIT_MS = 35_000;

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const searchLimit = (value: number | undefined): number => {
  if (!Number.isInteger(value) || !value) return DEFAULT_SEARCH_LIMIT;
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, value));
};

const normalizedDomains = (values: string[] | undefined): Set<string> => new Set(
  (values ?? []).map((value) => value.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean),
);

const hostnameFor = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

const domainMatches = (hostname: string, domains: Set<string>): boolean => (
  [...domains].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
);

const toggledWwwUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase().startsWith('www.')
      ? url.hostname.slice(4)
      : `www.${url.hostname}`;
    return url.toString();
  } catch {
    return null;
  }
};

export const scrapingDogDynamicWaitMs = (): number => {
  const configured = Number.parseInt(process.env.SCRAPINGDOG_DYNAMIC_WAIT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 0 && configured <= MAX_DYNAMIC_WAIT_MS
    ? configured
    : DEFAULT_DYNAMIC_WAIT_MS;
};

export class ScrapingDogAffiliateClient implements AffiliateSourceSearchClient, AffiliateSourceCaptureClient {
  readonly provider = 'SCRAPINGDOG' as const;

  constructor(
    private readonly transport = new ScrapingDogTransport(),
  ) {}

  private async requestScrapeOnce(
    url: string,
    params: Record<string, string | number | boolean>,
  ): Promise<{
    response: Awaited<ReturnType<ScrapingDogTransport['requestText']>>;
    captureUrl: string;
    stealthModeUsed: boolean;
  }> {
    try {
      return {
        response: await this.transport.requestText({
          endpoint: '/scrape',
          targetUrl: url,
          params: { ...params, url },
        }),
        captureUrl: url,
        stealthModeUsed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/stealth(?: mode)?|stealth_mode=true/i.test(message)) throw error;
      return {
        response: await this.transport.requestText({
          endpoint: '/scrape',
          targetUrl: url,
          params: {
            ...params,
            url,
            stealth_mode: true,
          },
        }),
        captureUrl: url,
        stealthModeUsed: true,
      };
    }
  }

  private async requestScrape(
    url: string,
    params: Record<string, string | number | boolean>,
  ): Promise<{
    response: Awaited<ReturnType<ScrapingDogTransport['requestText']>>;
    captureUrl: string;
    stealthModeUsed: boolean;
    wwwFallbackUsed: boolean;
  }> {
    try {
      return {
        ...await this.requestScrapeOnce(url, params),
        wwwFallbackUsed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const alternateUrl = /HTTP 404/i.test(message) ? toggledWwwUrl(url) : null;
      if (!alternateUrl) throw error;
      return {
        ...await this.requestScrapeOnce(alternateUrl, params),
        wwwFallbackUsed: true,
      };
    }
  }

  async searchSources(
    query: string,
    options: AffiliateSourceSearchOptions = {},
  ): Promise<AffiliateSourceSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error('Affiliate source discovery query is required.');
    const response = await this.transport.requestJson({
      endpoint: '/google',
      params: {
        query: normalizedQuery,
        results: searchLimit(options.limit),
        page: 0,
        country: 'us',
        language: 'en',
        ...(options.location?.trim() ? { location: options.location.trim() } : {}),
      },
    });
    const payload = recordValue(response.body);
    const includeDomains = normalizedDomains(options.includeDomains);
    const excludeDomains = normalizedDomains(options.excludeDomains);
    const organicResults = Array.isArray(payload.organic_results) ? payload.organic_results : [];
    const rows = organicResults.flatMap((value) => {
      const row = recordValue(value);
      const url = stringValue(row.link) ?? stringValue(row.url);
      if (!url) return [];
      const hostname = hostnameFor(url);
      if (!hostname) return [];
      if (includeDomains.size && !domainMatches(hostname, includeDomains)) return [];
      if (excludeDomains.size && domainMatches(hostname, excludeDomains)) return [];
      return [{
        url,
        title: stringValue(row.title),
        description: stringValue(row.snippet) ?? stringValue(row.description),
        category: stringValue(row.source) ?? 'web',
      }];
    }).slice(0, searchLimit(options.limit));

    return {
      provider: this.provider,
      request: response.request,
      response: { ...response.response, data: payload },
      rows,
      providerJobId: stringValue(recordValue(payload.search_information).id)
        ?? response.headers['x-request-id']
        ?? null,
      estimatedCredits: 5,
    };
  }

  async captureSourcePage(url: string): Promise<AffiliateSourcePageCapture> {
    const attempts: AffiliateSourceCaptureAttempt[] = [];
    const staticCapture = await this.requestScrape(url, {
      dynamic: false,
      formats: 'html',
    });
    const staticResponse = staticCapture.response;
    const staticQuality = evaluateAffiliateHtmlQuality(staticResponse.body, staticCapture.captureUrl);
    attempts.push({
      renderMode: 'STATIC',
      providerStatusCode: staticResponse.statusCode,
      elapsedMs: staticResponse.elapsedMs,
      estimatedCredits: 1,
      accepted: staticQuality.accepted,
      quality: staticQuality,
    });

    if (staticQuality.accepted) {
      const artifacts = deriveAffiliateHtmlArtifacts(staticResponse.body, staticCapture.captureUrl);
      return {
        provider: this.provider,
        request: staticResponse.request,
        response: staticResponse.response,
        requestedUrl: url,
        finalUrl: artifacts.inferredCanonicalUrl ?? staticCapture.captureUrl,
        providerStatusCode: staticResponse.statusCode,
        targetStatusCode: null,
        rawHtml: staticResponse.body,
        renderMode: 'STATIC',
        elapsedMs: staticResponse.elapsedMs,
        estimatedCredits: 1,
        warnings: [
          ...(staticCapture.stealthModeUsed
            ? ['The standard ScrapingDog request failed; stealth mode was used.']
            : []),
          ...(staticCapture.wwwFallbackUsed
            ? [`The requested host returned 404; capture used ${new URL(staticCapture.captureUrl).hostname}.`]
            : []),
        ],
        providerJobId: staticResponse.headers['x-request-id'] ?? null,
        attempts,
      };
    }

    const dynamicCapture = await this.requestScrape(url, {
      dynamic: true,
      formats: 'html',
      wait: scrapingDogDynamicWaitMs(),
    });
    const dynamicResponse = dynamicCapture.response;
    const dynamicQuality = evaluateAffiliateHtmlQuality(dynamicResponse.body, dynamicCapture.captureUrl);
    attempts.push({
      renderMode: 'JAVASCRIPT',
      providerStatusCode: dynamicResponse.statusCode,
      elapsedMs: dynamicResponse.elapsedMs,
      estimatedCredits: 5,
      accepted: dynamicQuality.accepted,
      quality: dynamicQuality,
    });
    const artifacts = deriveAffiliateHtmlArtifacts(dynamicResponse.body, dynamicCapture.captureUrl);
    return {
      provider: this.provider,
      request: dynamicResponse.request,
      response: dynamicResponse.response,
      requestedUrl: url,
      finalUrl: artifacts.inferredCanonicalUrl ?? dynamicCapture.captureUrl,
      providerStatusCode: dynamicResponse.statusCode,
      targetStatusCode: null,
      rawHtml: dynamicResponse.body,
      renderMode: 'JAVASCRIPT',
      elapsedMs: staticResponse.elapsedMs + dynamicResponse.elapsedMs,
      estimatedCredits: 6,
      warnings: [
        ...(staticCapture.stealthModeUsed || dynamicCapture.stealthModeUsed
          ? ['The standard ScrapingDog request failed; stealth mode was used.']
          : []),
        ...(staticCapture.wwwFallbackUsed || dynamicCapture.wwwFallbackUsed
          ? [`The requested host returned 404; capture used ${new URL(dynamicCapture.captureUrl).hostname}.`]
          : []),
        dynamicQuality.accepted
          ? 'Static HTML quality was insufficient; JavaScript rendering was used.'
          : 'JavaScript-rendered HTML still failed the content-quality gate.',
      ],
      providerJobId: dynamicResponse.headers['x-request-id'] ?? null,
      attempts,
    };
  }

  async captureScreenshot(url: string): Promise<AffiliateSourceScreenshot> {
    const screenshot = await this.transport.requestBuffer({
      endpoint: '/screenshot',
      targetUrl: url,
      params: {
        url,
        fullPage: true,
        format: 'png',
        quality: 80,
        wait_until: 'networkidle',
      },
    });
    return {
      provider: this.provider,
      request: screenshot.request,
      response: screenshot.response,
      data: screenshot.body,
      mimeType: screenshot.headers['content-type'] ?? 'image/png',
      providerStatusCode: screenshot.statusCode,
      elapsedMs: screenshot.elapsedMs,
      estimatedCredits: 5,
    };
  }
}

export const createScrapingDogAffiliateClient = (): ScrapingDogAffiliateClient => (
  new ScrapingDogAffiliateClient()
);
