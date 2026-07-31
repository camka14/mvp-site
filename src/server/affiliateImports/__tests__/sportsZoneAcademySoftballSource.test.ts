import { parseAffiliateScrapeMapping } from '../types';
import { SPORTS_ZONE_SOFTBALL_MAPPING, SPORTS_ZONE_SOFTBALL_MANUAL_CANDIDATES, SPORTS_ZONE_SOFTBALL_SOURCE_EVIDENCE } from '../sportsZoneAcademySoftballSource';

describe('Sports Zone Academy softball affiliate source', () => {
  it('emits one ongoing CLUB and withholds team-only material', () => {
    expect(parseAffiliateScrapeMapping(SPORTS_ZONE_SOFTBALL_MAPPING).kind).toBe('CLUB');
    expect(SPORTS_ZONE_SOFTBALL_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'CLUB', title: 'Sports Zone Academy Softball', dateDisplayMode: 'ONGOING' })]);
    expect(SPORTS_ZONE_SOFTBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });
  it('preserves stored provenance and favicon evidence', () => {
    expect(SPORTS_ZONE_SOFTBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '16a9b35f-7808-4e1b-bee3-50aad16b739b', runId: '77eee6d1-cb0a-4553-af61-b1b25820f35f', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(SPORTS_ZONE_SOFTBALL_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 2 }]));
  });
});
