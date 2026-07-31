import { parseAffiliateScrapeMapping } from '../types';
import {
  NEW_YORK_ELITE_VOLLEYBALL_MAPPING,
  NEW_YORK_ELITE_VOLLEYBALL_MANUAL_CANDIDATES,
  NEW_YORK_ELITE_VOLLEYBALL_SOURCE_EVIDENCE,
  NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL,
} from '../newYorkEliteVolleyballSource';

describe('New York Elite Volleyball affiliate source', () => {
  it('emits one ongoing CLUB candidate and withholds uncaptured dated details', () => {
    expect(parseAffiliateScrapeMapping(NEW_YORK_ELITE_VOLLEYBALL_MAPPING).kind).toBe('CLUB');
    expect(NEW_YORK_ELITE_VOLLEYBALL_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'New York Elite Volleyball',
        officialActionUrl: NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL,
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(NEW_YORK_ELITE_VOLLEYBALL_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('were not captured in the stored evidence')]),
    );
    expect(NEW_YORK_ELITE_VOLLEYBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and the explicit logo review disposition', () => {
    expect(NEW_YORK_ELITE_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: 'b80cdce4-c566-401b-a7c0-6f0e9e9769c0',
        runId: 'd078564e-7f0f-4265-be38-2bbc8b5d701f',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NEW_YORK_ELITE_VOLLEYBALL_SOURCE_EVIDENCE.artifacts.logoCandidates).toHaveLength(3);
  });
});
