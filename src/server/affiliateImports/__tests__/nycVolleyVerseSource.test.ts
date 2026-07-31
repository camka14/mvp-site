import { parseAffiliateScrapeMapping } from '../types';
import {
  NYC_VOLLEYVERSE_HOME_URL,
  NYC_VOLLEYVERSE_MAPPING,
  NYC_VOLLEYVERSE_MANUAL_CANDIDATES,
  NYC_VOLLEYVERSE_SOURCE_EVIDENCE,
} from '../nycVolleyVerseSource';

describe('NYC VolleyVerse affiliate source', () => {
  it('emits one ongoing CLUB profile and withholds unchecked dated rows', () => {
    expect(parseAffiliateScrapeMapping(NYC_VOLLEYVERSE_MAPPING).kind).toBe('CLUB');
    expect(NYC_VOLLEYVERSE_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'NYC VolleyVerse',
        officialActionUrl: 'https://www.nycvolleyverse.com/tryouts-faq',
        sourceUrl: NYC_VOLLEYVERSE_HOME_URL,
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(NYC_VOLLEYVERSE_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no complete current')]),
    );
    expect(NYC_VOLLEYVERSE_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(NYC_VOLLEYVERSE_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(NYC_VOLLEYVERSE_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '95a1dab8-8fa1-4fb8-8576-2e855d8e301d',
        runId: 'a7ad0949-2883-47a3-84df-cda6521bc74a',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NYC_VOLLEYVERSE_SOURCE_EVIDENCE.artifactKinds).toEqual(
      expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 4 }]),
    );
  });
});
