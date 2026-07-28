/** @jest-environment node */

import {
  resolveAffiliateDiscoveryProvider,
  resolveAffiliateFallbackProvider,
  resolveAffiliateIntakeProvider,
  resolveAffiliateIntakeScreenshotMode,
} from '@/server/affiliateImports/affiliateProviderFactory';

describe('affiliate provider configuration', () => {
  const priorEnvironment = { ...process.env };

  beforeEach(() => {
    process.env = { ...priorEnvironment };
    delete process.env.AFFILIATE_DISCOVERY_PROVIDER;
    delete process.env.AFFILIATE_INTAKE_PROVIDER;
    delete process.env.AFFILIATE_PROVIDER_FALLBACK;
    delete process.env.AFFILIATE_INTAKE_SCREENSHOT_MODE;
  });

  afterAll(() => {
    process.env = priorEnvironment;
  });

  it('defaults new discovery and intake work to ScrapingDog', () => {
    expect(resolveAffiliateDiscoveryProvider()).toBe('SCRAPINGDOG');
    expect(resolveAffiliateIntakeProvider()).toBe('SCRAPINGDOG');
    expect(resolveAffiliateFallbackProvider()).toBeNull();
    expect(resolveAffiliateIntakeScreenshotMode()).toBe('first');
  });

  it('accepts case-insensitive provider and screenshot overrides', () => {
    process.env.AFFILIATE_DISCOVERY_PROVIDER = 'firecrawl';
    process.env.AFFILIATE_INTAKE_PROVIDER = 'scrapingdog';
    process.env.AFFILIATE_PROVIDER_FALLBACK = 'Firecrawl';
    process.env.AFFILIATE_INTAKE_SCREENSHOT_MODE = 'FIRST';

    expect(resolveAffiliateDiscoveryProvider()).toBe('FIRECRAWL');
    expect(resolveAffiliateIntakeProvider()).toBe('SCRAPINGDOG');
    expect(resolveAffiliateFallbackProvider()).toBe('FIRECRAWL');
    expect(resolveAffiliateIntakeScreenshotMode()).toBe('first');
  });

  it('rejects unsupported provider values', () => {
    process.env.AFFILIATE_INTAKE_PROVIDER = 'unknown';
    expect(() => resolveAffiliateIntakeProvider()).toThrow('Unsupported affiliate provider');
  });
});
