import type {
  AffiliateProviderName,
  AffiliateSourceCaptureClient,
  AffiliateSourceSearchClient,
} from './affiliateProviderContracts';
import { FirecrawlAffiliateClient } from './firecrawlClient';
import { ScrapingDogAffiliateClient } from './scrapingDogAffiliateClient';

export type AffiliateIntakeScreenshotMode = 'all' | 'first' | 'none';

const providerName = (
  value: string | undefined,
  fallback: AffiliateProviderName,
): AffiliateProviderName => {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return fallback;
  if (normalized === 'SCRAPINGDOG' || normalized === 'FIRECRAWL') return normalized;
  throw new Error(`Unsupported affiliate provider: ${value}`);
};

export const resolveAffiliateDiscoveryProvider = (): AffiliateProviderName => (
  providerName(process.env.AFFILIATE_DISCOVERY_PROVIDER, 'SCRAPINGDOG')
);

export const resolveAffiliateIntakeProvider = (): AffiliateProviderName => (
  providerName(process.env.AFFILIATE_INTAKE_PROVIDER, 'SCRAPINGDOG')
);

export const resolveAffiliateFallbackProvider = (): AffiliateProviderName | null => {
  const normalized = process.env.AFFILIATE_PROVIDER_FALLBACK?.trim().toUpperCase();
  if (!normalized || normalized === 'NONE') return null;
  return providerName(normalized, 'FIRECRAWL');
};

export const resolveAffiliateIntakeScreenshotMode = (): AffiliateIntakeScreenshotMode => {
  const value = process.env.AFFILIATE_INTAKE_SCREENSHOT_MODE?.trim().toLowerCase();
  if (!value) return 'first';
  if (value === 'all' || value === 'first' || value === 'none') return value;
  throw new Error(`Unsupported affiliate intake screenshot mode: ${value}`);
};

export const createAffiliateSourceSearchClient = (
  provider = resolveAffiliateDiscoveryProvider(),
): AffiliateSourceSearchClient => (
  provider === 'SCRAPINGDOG'
    ? new ScrapingDogAffiliateClient()
    : new FirecrawlAffiliateClient()
);

export const createAffiliateSourceCaptureClient = (
  provider = resolveAffiliateIntakeProvider(),
): AffiliateSourceCaptureClient => (
  provider === 'SCRAPINGDOG'
    ? new ScrapingDogAffiliateClient()
    : new FirecrawlAffiliateClient()
);

export const createAffiliateFallbackCaptureClient = (
  primary = resolveAffiliateIntakeProvider(),
): AffiliateSourceCaptureClient | null => {
  const fallback = resolveAffiliateFallbackProvider();
  if (!fallback || fallback === primary) return null;
  return createAffiliateSourceCaptureClient(fallback);
};
