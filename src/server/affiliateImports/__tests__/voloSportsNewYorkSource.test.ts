import { parseAffiliateScrapeMapping } from '../types';
import { VOLO_NEW_YORK_MAPPING, VOLO_NEW_YORK_MANUAL_CANDIDATES, VOLO_NEW_YORK_SOURCE_EVIDENCE } from '../voloSportsNewYorkSource';

describe('Volo Sports New York affiliate source', () => {
  it('emits one ongoing multi-sport CLUB and withholds incomplete rows', () => {
    expect(parseAffiliateScrapeMapping(VOLO_NEW_YORK_MAPPING).kind).toBe('CLUB');
    expect(VOLO_NEW_YORK_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'CLUB', title: 'Volo Sports New York Metro Area', city: 'New York Metro Area', dateDisplayMode: 'ONGOING' })]);
  });

  it('preserves stored provenance and allowed source pages', () => {
    expect(VOLO_NEW_YORK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '0d600914-7edb-4bba-874e-02810e2c924a', runId: 'b4ffdfbb-05b3-4feb-beab-0d4db9e793ae', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(VOLO_NEW_YORK_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 24 }, { kind: 'PAGE_MARKDOWN', count: 5 }]));
  });
});
