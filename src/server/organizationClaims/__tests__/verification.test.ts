/** @jest-environment node */

import {
  checkOrganizationDnsChallenge,
  checkOrganizationHtmlChallenge,
  getOrganizationDnsChallengeHostname,
  htmlContainsOrganizationVerificationMeta,
} from '@/server/organizationClaims/verification';

describe('organization claim verification', () => {
  it('finds an exact verification meta tag regardless of attribute order', () => {
    expect(htmlContainsOrganizationVerificationMeta(
      '<html><head><meta content="bracketiq_token" data-test="1" name="bracketiq-site-verification"></head></html>',
      'bracketiq_token',
    )).toBe(true);
    expect(htmlContainsOrganizationVerificationMeta(
      '<meta name="bracketiq-site-verification" content="wrong">',
      'bracketiq_token',
    )).toBe(false);
  });

  it('checks the exact DNS TXT challenge value', async () => {
    const resolver = jest.fn().mockResolvedValue([
      ['unrelated=value'],
      ['bracketiq_', 'token'],
    ]);

    await expect(checkOrganizationDnsChallenge({
      registrableDomain: 'example.co.uk',
      expectedValue: 'bracketiq_token',
      resolver,
      now: new Date('2026-07-29T20:00:00.000Z'),
    })).resolves.toEqual(expect.objectContaining({
      verified: true,
      failureReason: null,
      metadata: {
        hostname: '_bracketiq-challenge.example.co.uk',
        recordCount: 2,
      },
    }));
    expect(getOrganizationDnsChallengeHostname('example.co.uk')).toBe(
      '_bracketiq-challenge.example.co.uk',
    );
  });

  it('returns a bounded DNS failure instead of throwing resolver details', async () => {
    const result = await checkOrganizationDnsChallenge({
      registrableDomain: 'rivercitysports.org',
      expectedValue: 'bracketiq_token',
      resolver: jest.fn().mockRejectedValue(new Error('ENOTFOUND')),
    });

    expect(result).toEqual(expect.objectContaining({
      verified: false,
      failureReason: 'ENOTFOUND',
    }));
  });

  it('accepts same-domain HTML verification and enforces bounded fetch options', async () => {
    const fetchResource = jest.fn().mockResolvedValue({
      body: Buffer.from('<meta name="bracketiq-site-verification" content="bracketiq_token">'),
      finalUrl: 'https://www.rivercitysports.org/',
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      headers: {},
    });

    const result = await checkOrganizationHtmlChallenge({
      canonicalUrl: 'https://rivercitysports.org',
      expectedValue: 'bracketiq_token',
      fetchResource,
    });

    expect(result.verified).toBe(true);
    expect(fetchResource).toHaveBeenCalledWith(
      'https://rivercitysports.org/',
      expect.objectContaining({
        timeoutMs: 10_000,
        maxBytes: 1024 * 1024,
        maxRedirects: 3,
      }),
    );
  });

  it('rejects a redirect to another registrable domain before following it', async () => {
    const fetchResource = jest.fn().mockImplementation(async (_url, options) => {
      expect(() => options.validateRedirect(
        new URL('https://rivercitysports.org'),
        new URL('https://attacker.example/claim'),
      )).toThrow('cannot follow a redirect to another domain');
      throw new Error('Website verification cannot follow a redirect to another domain.');
    });

    const result = await checkOrganizationHtmlChallenge({
      canonicalUrl: 'https://rivercitysports.org',
      expectedValue: 'bracketiq_token',
      fetchResource,
    });

    expect(result).toEqual(expect.objectContaining({
      verified: false,
      failureReason: 'Website verification cannot follow a redirect to another domain.',
    }));
  });

  it('does not use shared platforms for HTML ownership proof', async () => {
    const fetchResource = jest.fn();
    const result = await checkOrganizationHtmlChallenge({
      canonicalUrl: 'https://river-city.sportsengine.com',
      expectedValue: 'bracketiq_token',
      fetchResource,
    });

    expect(result).toEqual(expect.objectContaining({
      verified: false,
      failureReason: 'Shared website platforms require manual review.',
    }));
    expect(fetchResource).not.toHaveBeenCalled();
  });
});
