import { parseAffiliateScrapeMapping } from '../types';
import {
  RIVERSIDE_PARK_MAPPING,
  RIVERSIDE_PARK_MANUAL_CANDIDATES,
  RIVERSIDE_PARK_PERMIT_URL,
  RIVERSIDE_PARK_SOURCE_EVIDENCE,
} from '../riversideParkBeachVolleyballSource';

describe('Riverside Park South beach volleyball affiliate source', () => {
  it('emits one ongoing RENTAL candidate and no unsupported rows', () => {
    expect(parseAffiliateScrapeMapping(RIVERSIDE_PARK_MAPPING).kind).toBe('RENTAL');
    expect(RIVERSIDE_PARK_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'RENTAL',
        title: 'Riverside Park South Beach Volleyball Courts',
        officialActionUrl: RIVERSIDE_PARK_PERMIT_URL,
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(RIVERSIDE_PARK_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves the stored live provenance and allowed evidence', () => {
    expect(RIVERSIDE_PARK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'cfe3585b-bcc2-4bce-b4b3-3ef9fc6830e8',
      runId: 'c800b424-d471-4c29-9a14-5b5c64e7ed7a',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(RIVERSIDE_PARK_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 40 },
      { kind: 'PAGE_MARKDOWN', count: 8 },
      { kind: 'ROBOTS', count: 10 },
    ]));
  });
});
