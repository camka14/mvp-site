import { parseAffiliateScrapeMapping } from '../types';
import {
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MANUAL_CANDIDATES,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MAPPING,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_REGISTER_URL,
} from '../southeastPortlandGirlsBasketballSource';

describe('Southeast Portland Girls Basketball affiliate source', () => {
  it('creates one ongoing club candidate without inventing a dated event or team', () => {
    const mapping = parseAffiliateScrapeMapping(SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      officialActionUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_REGISTER_URL,
      dateDisplayMode: 'ONGOING',
      ageGroup: 'Girls grades 1-8',
      tags: ['Club'],
    }));
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('makes stale registration and missing source data visible for review', () => {
    expect(SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('2025-26 player registration is closed'),
      expect.stringContaining('street address'),
      expect.stringContaining('No TEAM candidates'),
    ]));
  });
});
