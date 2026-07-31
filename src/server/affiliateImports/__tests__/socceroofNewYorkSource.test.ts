import { parseAffiliateScrapeMapping } from '../types';
import { SOCCEROOF_NEW_YORK_MANUAL_CANDIDATES, SOCCEROOF_NEW_YORK_MAPPING, SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE } from '../socceroofNewYorkSource';

describe('Socceroof New York affiliate source', () => {
  it('emits one ongoing CLUB and one ongoing RENTAL', () => {
    expect(parseAffiliateScrapeMapping(SOCCEROOF_NEW_YORK_MAPPING).kind).toBe('RENTAL');
    expect(SOCCEROOF_NEW_YORK_MANUAL_CANDIDATES).toEqual(expect.arrayContaining([
      expect.objectContaining({ listingKind: 'CLUB', title: 'Socceroof New York', dateDisplayMode: 'ONGOING' }),
      expect.objectContaining({ listingKind: 'RENTAL', title: 'Socceroof New York Indoor Soccer Field Rental', dateDisplayMode: 'ONGOING' }),
    ]));
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '535c81a6-f19d-495c-8140-ff23eb5815a6', runId: '396cd6c8-3bf8-4e40-8205-cda8933964af', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 5 }]));
  });
});
