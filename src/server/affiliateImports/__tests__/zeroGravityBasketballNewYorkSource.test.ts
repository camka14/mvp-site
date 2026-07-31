import { parseAffiliateScrapeMapping } from '../types';
import { ZERO_GRAVITY_NEW_YORK_MAPPING, ZERO_GRAVITY_NEW_YORK_MANUAL_CANDIDATES, ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE } from '../zeroGravityBasketballNewYorkSource';

describe('Zero Gravity Basketball New York affiliate source', () => {
  it('emits one ongoing CLUB and withholds uncaptured tournament rows', () => {
    expect(parseAffiliateScrapeMapping(ZERO_GRAVITY_NEW_YORK_MAPPING).kind).toBe('CLUB');
    expect(ZERO_GRAVITY_NEW_YORK_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'CLUB', title: 'Zero Gravity Basketball New York', dateDisplayMode: 'ONGOING' })]);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: 'ab0c048a-5bd6-47e5-ad1a-c9739090fb26', runId: 'e51aebfb-323a-4ca1-aeac-7231470cadb7', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 2 }]));
  });
});
