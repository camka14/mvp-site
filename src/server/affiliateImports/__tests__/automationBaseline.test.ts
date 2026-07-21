/** @jest-environment node */

import {
  affiliateAutomationDriftReasons,
  buildAffiliateAutomationBaseline,
  calculateAffiliateAutomationRunMetrics,
} from '@/server/affiliateImports/automationBaseline';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  listingKind: 'EVENT' as const,
  title: 'Summer League',
  officialActionUrl: 'https://example.test/register',
  sourceUrl: 'https://example.test/leagues',
  startsAt: '2026-08-01T17:00:00.000Z',
  dateDisplayMode: 'SCHEDULED',
  city: 'Portland',
  venueName: 'Test Gym',
  address: '100 Main St, Portland, OR',
  priceText: '$100',
  ...overrides,
});

describe('affiliate automation baseline', () => {
  it('creates a deterministic normalized baseline', () => {
    const baseline = buildAffiliateAutomationBaseline({
      mappingId: 'mapping_1',
      mappingVersion: 2,
      approvedAt: new Date('2026-07-21T12:00:00.000Z'),
      candidates: [candidate({ title: 'B' }), candidate({ title: 'A' })],
      rejectedCount: 1,
    });
    const reordered = buildAffiliateAutomationBaseline({
      mappingId: 'mapping_1',
      mappingVersion: 2,
      approvedAt: new Date('2026-07-21T12:00:00.000Z'),
      candidates: [candidate({ title: 'A' }), candidate({ title: 'B' })],
      rejectedCount: 1,
    });

    expect(baseline.normalizedFieldsHash).toBe(reordered.normalizedFieldsHash);
    expect(baseline).toMatchObject({ candidateCount: 2, rejectedCount: 1, listingKinds: ['EVENT'] });
  });

  it('holds a nonzero baseline that drops to zero', () => {
    const baseline = buildAffiliateAutomationBaseline({
      mappingId: 'mapping_1',
      mappingVersion: 1,
      approvedAt: new Date(),
      candidates: [candidate()],
    });

    expect(affiliateAutomationDriftReasons(
      baseline,
      calculateAffiliateAutomationRunMetrics([], 0),
    )).toContain('Candidate count fell from a nonzero baseline to zero.');
  });

  it('holds kind changes, rejection spikes, and critical-field loss', () => {
    const baseline = buildAffiliateAutomationBaseline({
      mappingId: 'mapping_1',
      mappingVersion: 1,
      approvedAt: new Date(),
      candidates: [candidate(), candidate({ title: 'Second' })],
    });
    const current = calculateAffiliateAutomationRunMetrics([
      candidate({ listingKind: 'TEAM', title: 'One', startsAt: null, address: null, venueName: null, city: null }),
      candidate({ listingKind: 'TEAM', title: 'Two', startsAt: null, address: null, venueName: null, city: null }),
    ], 3);
    const reasons = affiliateAutomationDriftReasons(baseline, current);

    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('missing critical'),
      expect.stringContaining('Listing kinds changed'),
      expect.stringContaining('were rejected'),
    ]));
  });

  it('allows a stable run', () => {
    const baseline = buildAffiliateAutomationBaseline({
      mappingId: 'mapping_1',
      mappingVersion: 1,
      approvedAt: new Date(),
      candidates: [candidate()],
    });

    expect(affiliateAutomationDriftReasons(
      baseline,
      calculateAffiliateAutomationRunMetrics([candidate()], 0),
    )).toEqual([]);
  });
});
