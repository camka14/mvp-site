import { parseAffiliateScrapeMapping } from '../types';
import {
  FA_EURO_NEW_YORK_MAPPING,
  FA_EURO_NEW_YORK_MANUAL_CANDIDATES,
  FA_EURO_NEW_YORK_SOURCE_EVIDENCE,
  FA_EURO_NEW_YORK_TRYOUTS_URL,
} from '../faEuroNewYorkSource';

describe('FA Euro New York affiliate source', () => {
  it('keeps one ongoing review-only CLUB candidate and no TEAM rows', () => {
    const mapping = parseAffiliateScrapeMapping(FA_EURO_NEW_YORK_MAPPING);
    expect(mapping.kind).toBe('CLUB');
    expect(mapping.listUrl).toBe(FA_EURO_NEW_YORK_TRYOUTS_URL);
    expect(FA_EURO_NEW_YORK_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'FA Euro New York',
        officialActionUrl: FA_EURO_NEW_YORK_TRYOUTS_URL,
        sportName: 'Soccer',
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(FA_EURO_NEW_YORK_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
    expect(FA_EURO_NEW_YORK_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('past'),
      expect.stringContaining('TBD'),
      expect.stringContaining('TEAM'),
    ]));
  });

  it('preserves stored live-intake provenance and policy evidence', () => {
    expect(FA_EURO_NEW_YORK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '6b21bb63-817b-4c02-bcbb-27e8bfb8649c',
      intakeSourceKey: 'new-york-new-york-metropolitan-area-boys-soccer-tryouts-faeuro-com',
      runId: '4160a98f-6f8c-4efe-b152-648269d93610',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(FA_EURO_NEW_YORK_SOURCE_EVIDENCE.artifacts).toEqual(expect.objectContaining({
      pageMarkdown: expect.stringMatching(/^[a-f0-9]{64}$/),
      logoCandidate: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });
});
