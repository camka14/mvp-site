import { parseAffiliateScrapeMapping } from '../types';
import {
  FIVE_OH_THREE_BASEBALL_LOGO_SOURCE_URL,
  FIVE_OH_THREE_BASEBALL_MANUAL_CANDIDATES,
  FIVE_OH_THREE_BASEBALL_MAPPING,
  FIVE_OH_THREE_BASEBALL_TRYOUT_ADDRESS,
} from '../fiveOhThreeBaseballSource';

describe('503 Baseball affiliate source', () => {
  it('keeps the public club and the three current age-specific tryout rows', () => {
    const mapping = parseAffiliateScrapeMapping(FIVE_OH_THREE_BASEBALL_MAPPING);
    const candidates = mapping.manualCandidates ?? [];
    const clubs = candidates.filter((candidate) => candidate.listingKind === 'CLUB');
    const events = candidates.filter((candidate) => candidate.listingKind === 'EVENT');

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toHaveLength(4);
    expect(clubs).toHaveLength(1);
    expect(events).toHaveLength(3);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
    expect(events.every((candidate) => candidate.startsAt?.startsWith('2026-08-04'))).toBe(true);
    expect(events.every((candidate) => candidate.dateDisplayText === 'August 4, 2026')).toBe(true);
  });

  it('preserves the official URLs, exact venue, price, and division age for every tryout', () => {
    const events = FIVE_OH_THREE_BASEBALL_MANUAL_CANDIDATES.filter(
      (candidate) => candidate.listingKind === 'EVENT',
    );

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '503 Baseball 12U Travel Team Tryout',
        officialActionUrl: expect.stringContaining('/events/200260-2027-12u-tryouts'),
        address: FIVE_OH_THREE_BASEBALL_TRYOUT_ADDRESS,
        priceText: '$20',
        tags: ['Tryouts'],
        divisions: [expect.objectContaining({ ageCutoffLabel: '12U', priceCents: 2000 })],
      }),
      expect.objectContaining({
        title: '503 Baseball 13U Travel Team Tryout',
        officialActionUrl: expect.stringContaining('/events/200252-2027-13u-tryouts'),
        divisions: [expect.objectContaining({ ageCutoffLabel: '13U', priceCents: 2000 })],
      }),
      expect.objectContaining({
        title: '503 Baseball 14U Travel Team Tryout',
        officialActionUrl: expect.stringContaining('/events/200253-2027-14u-tryouts'),
        divisions: [expect.objectContaining({ ageCutoffLabel: '14U', priceCents: 2000 })],
      }),
    ]));
    expect(FIVE_OH_THREE_BASEBALL_LOGO_SOURCE_URL).toContain('503-logo-RWB-Transparent.png');
  });

  it('uses a stable candidate identity for local repeat runs', () => {
    expect(FIVE_OH_THREE_BASEBALL_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(FIVE_OH_THREE_BASEBALL_MANUAL_CANDIDATES.map((candidate) => `${candidate.title}|${candidate.startsAt ?? ''}`)).toEqual([
      '503 Baseball|',
      '503 Baseball 12U Travel Team Tryout|2026-08-04T12:00:00-07:00',
      '503 Baseball 13U Travel Team Tryout|2026-08-04T10:00:00-07:00',
      '503 Baseball 14U Travel Team Tryout|2026-08-04T10:00:00-07:00',
    ]);
  });
});
