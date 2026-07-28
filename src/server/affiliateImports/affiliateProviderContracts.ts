export type AffiliateProviderName = 'SCRAPINGDOG' | 'FIRECRAWL';

export type AffiliateSourceSearchOptions = {
  limit?: number;
  location?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
};

export type AffiliateSourceSearchRow = {
  url: string;
  title: string | null;
  description: string | null;
  category: string | null;
};

export type AffiliateSourceSearchResult = {
  provider: AffiliateProviderName;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  rows: AffiliateSourceSearchRow[];
  providerJobId: string | null;
  estimatedCredits: number | null;
};

export type AffiliateSourceProviderArtifacts = {
  markdown: string | null;
  links: string[];
  images: string[];
  branding: Record<string, unknown> | null;
  screenshotUrl: string | null;
  metadata: Record<string, unknown>;
};

export type AffiliateSourcePageCapture = {
  provider: AffiliateProviderName;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  requestedUrl: string;
  finalUrl: string;
  providerStatusCode: number;
  targetStatusCode: number | null;
  rawHtml: string;
  renderMode: 'STATIC' | 'JAVASCRIPT';
  elapsedMs: number;
  estimatedCredits: number | null;
  warnings: string[];
  providerJobId?: string | null;
  providerArtifacts?: AffiliateSourceProviderArtifacts;
  attempts?: AffiliateSourceCaptureAttempt[];
};

export type AffiliateSourceCaptureAttempt = {
  renderMode: 'STATIC' | 'JAVASCRIPT';
  providerStatusCode: number;
  elapsedMs: number;
  estimatedCredits: number | null;
  accepted: boolean;
  quality?: Record<string, unknown>;
  error?: string;
};

export type AffiliateSourceScreenshot = {
  provider: AffiliateProviderName;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  data: Buffer;
  mimeType: string;
  providerStatusCode: number;
  elapsedMs: number;
  estimatedCredits: number | null;
};

export interface AffiliateSourceSearchClient {
  readonly provider: AffiliateProviderName;
  searchSources(
    query: string,
    options?: AffiliateSourceSearchOptions,
  ): Promise<AffiliateSourceSearchResult>;
}

export interface AffiliateSourceCaptureClient {
  readonly provider: AffiliateProviderName;
  captureSourcePage(url: string): Promise<AffiliateSourcePageCapture>;
  captureScreenshot(url: string): Promise<AffiliateSourceScreenshot>;
}
