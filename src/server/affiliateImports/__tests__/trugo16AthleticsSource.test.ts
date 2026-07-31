import { parseAffiliateScrapeMapping } from '../types';
import { TRUGO16_ATHLETICS_MAPPING, TRUGO16_ATHLETICS_MANUAL_CANDIDATES, TRUGO16_ATHLETICS_SOURCE_EVIDENCE, TRUGO16_ATHLETICS_TRYOUT_URL } from '../trugo16AthleticsSource';

describe('Trugo16 Athletics affiliate source', () => {
  it('emits one ongoing CLUB and withholds team, event, and rental rows', () => {
    expect(parseAffiliateScrapeMapping(TRUGO16_ATHLETICS_MAPPING).kind).toBe('CLUB');
    expect(TRUGO16_ATHLETICS_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'Trugo16 Athletics', officialActionUrl: TRUGO16_ATHLETICS_TRYOUT_URL, dateDisplayMode: 'ONGOING' }),
    ]);
    expect(TRUGO16_ATHLETICS_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM' || candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL')).toBe(false);
  });

  it('preserves the stored partial intake provenance and official logo evidence', () => {
    expect(TRUGO16_ATHLETICS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '663682d5-30a9-4784-9976-3e314a3e3dde', runId: '1418bc65-6d3c-4f34-8de3-03a0a03e257e', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(TRUGO16_ATHLETICS_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 4 }]));
  });
});
