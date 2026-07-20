import { parseAffiliateScrapeMapping } from '../types';
import {
  FLY_ACADEMY_ADDRESS,
  FLY_ACADEMY_HOME_URL,
  FLY_ACADEMY_LOGO_SOURCE_URL,
  FLY_ACADEMY_MANUAL_CANDIDATES,
  FLY_ACADEMY_MAPPING,
} from '../flyAcademySource';

describe('Fly Academy affiliate source', () => {
  it('creates one ongoing public club candidate without inventing dated tryouts or teams', () => {
    const mapping = parseAffiliateScrapeMapping(FLY_ACADEMY_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toHaveLength(1);
    expect(candidates).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Fly Academy',
        officialActionUrl: FLY_ACADEMY_HOME_URL,
        address: FLY_ACADEMY_ADDRESS,
        dateDisplayMode: 'ONGOING',
        sportName: 'Basketball',
        priceText: '$500-$3,250 per season',
        tags: ['Club'],
      }),
    ]);
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('keeps source-supported limits and official logo handoff visible for review', () => {
    const candidate = FLY_ACADEMY_MANUAL_CANDIDATES[0];

    expect(FLY_ACADEMY_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(candidate).toEqual(expect.objectContaining({
      participantOptionsText: expect.stringContaining('official Fly Academy tryouts page'),
      warnings: expect.arrayContaining([
        expect.stringContaining('does not publish a date, time, or location'),
        expect.stringContaining('No TEAM candidates'),
      ]),
    }));
    expect(FLY_ACADEMY_LOGO_SOURCE_URL).toContain('Fly+logo_white_no+background.png');
  });
});
