/** @jest-environment node */

const prismaMock = {
  events: { findFirst: jest.fn() },
  canonicalTeams: { findFirst: jest.fn() },
  facilities: { findFirst: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  buildAffiliateOutboundPath,
  buildAffiliateOutboundUrl,
  createAffiliateBrowserProof,
  createAffiliateOutboundSignature,
  isBlockedAffiliateUserAgent,
  protectAffiliateRow,
  resolveAffiliateDestination,
  verifyAffiliateBrowserProof,
  verifyAffiliateOutboundSignature,
} from '@/server/affiliateOutbound';

describe('affiliate outbound protection', () => {
  const originalSecret = process.env.AFFILIATE_REDIRECT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AFFILIATE_REDIRECT_SECRET = 'affiliate-outbound-test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.AFFILIATE_REDIRECT_SECRET;
    else process.env.AFFILIATE_REDIRECT_SECRET = originalSecret;
  });

  it('builds deterministic signed BracketIQ URLs that cannot be altered', () => {
    const signature = createAffiliateOutboundSignature('event', 'event_1');

    expect(buildAffiliateOutboundPath('event', 'event_1')).toBe(`/out/event/event_1/${signature}`);
    expect(buildAffiliateOutboundUrl('event', 'event_1')).toBe(`https://bracket-iq.com/out/event/event_1/${signature}`);
    expect(verifyAffiliateOutboundSignature('event', 'event_1', signature)).toBe(true);
    expect(verifyAffiliateOutboundSignature('event', 'event_2', signature)).toBe(false);
    expect(verifyAffiliateOutboundSignature('team', 'event_1', signature)).toBe(false);
  });

  it('replaces public affiliate destinations and removes event source provenance', () => {
    const row = protectAffiliateRow({
      id: 'event_1',
      affiliateUrl: 'https://partner.example.com/register',
      sourceUrl: 'https://partner.example.com/source',
      name: 'Summer League',
    }, 'event');

    expect(row).toEqual(expect.objectContaining({
      name: 'Summer League',
      sourceUrl: null,
      affiliateUrl: expect.stringMatching(/^https:\/\/bracket-iq\.com\/out\/event\/event_1\//),
    }));
    expect(JSON.stringify(row)).not.toContain('partner.example.com');
  });

  it('removes malformed affiliate destinations instead of exposing them publicly', () => {
    const row = protectAffiliateRow({
      id: 'event_1',
      affiliateUrl: 'javascript:alert(1)',
      sourceUrl: 'https://partner.example.com/source',
    }, 'event');

    expect(row).toEqual(expect.objectContaining({
      affiliateUrl: null,
      sourceUrl: null,
    }));
  });

  it('binds short-lived browser proofs to the target and browser cookie', () => {
    const nowMs = Date.parse('2026-07-21T20:00:00.000Z');
    const target = {
      kind: 'event' as const,
      id: 'event_1',
      signature: createAffiliateOutboundSignature('event', 'event_1'),
    };
    const proof = createAffiliateBrowserProof(target, 'browser-session-a', nowMs);

    expect(verifyAffiliateBrowserProof(proof, target, 'browser-session-a', nowMs + 60_000)).toBe(true);
    expect(verifyAffiliateBrowserProof(proof, target, 'browser-session-b', nowMs + 60_000)).toBe(false);
    expect(verifyAffiliateBrowserProof(proof, { ...target, id: 'event_2' }, 'browser-session-a', nowMs + 60_000)).toBe(false);
    expect(verifyAffiliateBrowserProof(proof, target, 'browser-session-a', nowMs + 6 * 60_000)).toBe(false);
  });

  it('blocks declared crawlers and basic automation clients without blocking a normal browser', () => {
    expect(isBlockedAffiliateUserAgent('Mozilla/5.0 compatible; GPTBot/1.2')).toBe(true);
    expect(isBlockedAffiliateUserAgent('curl/8.7.1')).toBe(true);
    expect(isBlockedAffiliateUserAgent('Mozilla/5.0 HeadlessChrome/126 Safari/537.36')).toBe(true);
    expect(isBlockedAffiliateUserAgent('Mozilla/5.0 AppleWebKit/537.36 Chrome/126 Safari/537.36')).toBe(false);
    expect(isBlockedAffiliateUserAgent(null)).toBe(true);
  });

  it('resolves only active public targets and normalizes the destination', async () => {
    prismaMock.events.findFirst.mockResolvedValue({ affiliateUrl: ' https://partner.example.com/register ' });

    await expect(resolveAffiliateDestination('event', 'event_1')).resolves.toBe('https://partner.example.com/register');
    expect(prismaMock.events.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'event_1',
        archivedAt: null,
        OR: [{ state: 'PUBLISHED' }, { state: null }],
      },
      select: { affiliateUrl: true },
    });
  });
});
