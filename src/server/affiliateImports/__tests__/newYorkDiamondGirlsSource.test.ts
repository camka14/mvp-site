import { parseAffiliateScrapeMapping } from '../types';
import {
  NEW_YORK_DIAMOND_GIRLS_MAPPING,
  NEW_YORK_DIAMOND_GIRLS_MANUAL_CANDIDATES,
  NEW_YORK_DIAMOND_GIRLS_SOURCE_EVIDENCE,
  NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL,
} from '../newYorkDiamondGirlsSource';

describe('New York Diamond Girls affiliate source', () => {
  it('emits one ongoing CLUB candidate and withholds incomplete dated rows', () => {
    expect(parseAffiliateScrapeMapping(NEW_YORK_DIAMOND_GIRLS_MAPPING).kind).toBe('CLUB');
    expect(NEW_YORK_DIAMOND_GIRLS_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'New York Diamond Girls Softball',
        officialActionUrl: NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL,
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(NEW_YORK_DIAMOND_GIRLS_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('tryouts page was not captured')]),
    );
    expect(NEW_YORK_DIAMOND_GIRLS_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored live provenance and the first-party logo artifact', () => {
    expect(NEW_YORK_DIAMOND_GIRLS_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '4e8352d8-dd39-4e74-832b-a78d985ed995',
        runId: '5a75a085-3c8f-4dc5-acb6-b644084e2876',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NEW_YORK_DIAMOND_GIRLS_SOURCE_EVIDENCE.artifacts.logoCandidate).toMatch(/^[a-f0-9]{64}$/);
  });
});
