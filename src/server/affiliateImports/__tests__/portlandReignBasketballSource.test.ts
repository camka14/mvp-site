import { parseAffiliateScrapeMapping } from '../types';
import {
  PORTLAND_REIGN_CAMPS_URL,
  PORTLAND_REIGN_MANUAL_CANDIDATES,
  PORTLAND_REIGN_MAPPING,
  PORTLAND_REIGN_VENUE_ADDRESS,
  PORTLAND_REIGN_WITHHELD_ROWS,
} from '../portlandReignBasketballSource';

describe('Portland Reign Basketball affiliate source', () => {
  it('keeps only reviewed future camp events and creates no club or team candidate', () => {
    const mapping = parseAffiliateScrapeMapping(PORTLAND_REIGN_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('EVENT');
    expect(candidates).toHaveLength(5);
    expect(candidates.every((candidate) => candidate.listingKind === 'EVENT')).toBe(true);
    expect(candidates.every((candidate) => candidate.listingKind !== 'TEAM')).toBe(true);
    expect(candidates.map((candidate) => candidate.title)).toEqual([
      'Portland Reign Summer Camp 6',
      'Portland Reign Summer Camp 7',
      'Portland Reign Summer Camp 8',
      'Portland Reign Summer Camp 9',
      'Portland Reign Summer Camp 10',
    ]);
    expect(candidates.every((candidate) => candidate.startsAt && new Date(candidate.startsAt) > new Date('2026-07-15T00:00:00-07:00'))).toBe(true);
  });

  it('preserves the official registration action, venue, price range, age divisions, and tag', () => {
    expect(PORTLAND_REIGN_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      officialActionUrl: PORTLAND_REIGN_CAMPS_URL,
      sourceUrl: PORTLAND_REIGN_CAMPS_URL,
      venueName: 'Portland Reign Facility',
      address: PORTLAND_REIGN_VENUE_ADDRESS,
      startsAt: '2026-07-20T09:00:00-07:00',
      endsAt: '2026-07-24T15:00:00-07:00',
      dateDisplayText: 'July 20-24, 2026',
      priceText: '$125-$215',
      tags: ['Camp'],
      divisions: [
        expect.objectContaining({ name: 'Full Day (9 AM-3 PM)', gender: 'C', priceCents: 21500 }),
        expect.objectContaining({ name: 'Half Day (9 AM-Noon)', gender: 'C', priceCents: 12500 }),
        expect.objectContaining({ name: 'Half Day (Noon-3 PM)', gender: 'C', priceCents: 12500 }),
      ],
    }));
  });

  it('uses stable dedupe fields and records the withheld source rows', () => {
    expect(PORTLAND_REIGN_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(PORTLAND_REIGN_WITHHELD_ROWS).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Summer Camp 5', reason: expect.stringContaining('already started') }),
      expect.objectContaining({ title: 'Reign Fall 2026 Tryouts', reason: expect.stringContaining('does not publish') }),
      expect.objectContaining({ title: 'AAU team pages', reason: expect.stringContaining('stable roster-level') }),
    ]));
  });
});
