import { parseAffiliateScrapeMapping } from '../types';
import {
  THE_NYC_VOLLEYBALL_HOME_URL,
  THE_NYC_VOLLEYBALL_MAPPING,
  THE_NYC_VOLLEYBALL_MANUAL_CANDIDATES,
  THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE,
} from '../theNycVolleyballClubSource';

describe('The NYC Volleyball Club affiliate source', () => {
  it('emits one ongoing CLUB profile and withholds unchecked dated rows', () => {
    expect(parseAffiliateScrapeMapping(THE_NYC_VOLLEYBALL_MAPPING).kind).toBe('CLUB');
    expect(THE_NYC_VOLLEYBALL_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'The NYC Volleyball Club',
        officialActionUrl: 'https://thenycvolleyball.com/tryouts/',
        sourceUrl: THE_NYC_VOLLEYBALL_HOME_URL,
        city: 'Bronx, NY',
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(THE_NYC_VOLLEYBALL_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no complete current')]),
    );
    expect(THE_NYC_VOLLEYBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(THE_NYC_VOLLEYBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '61b8a6c7-9fe9-433f-a768-3a0a670d59be',
        runId: '4a511404-6f98-4d1f-9ffa-b06f2c40008c',
        complianceStatus: 'ALLOWED',
        runStatus: 'PARTIAL',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE.artifactKinds).toEqual(
      expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 5 }]),
    );
  });
});
