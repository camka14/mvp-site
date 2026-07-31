import { parseAffiliateScrapeMapping } from '../types';
import { JUVENTUS_ACADEMY_NY_BOOKINGS_URL, JUVENTUS_ACADEMY_NY_MANUAL_CANDIDATES, JUVENTUS_ACADEMY_NY_MAPPING, JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE } from '../juventusAcademyNewYorkSource';

describe('Juventus Academy New York source', () => {
  it('emits one ongoing CLUB profile and withholds uncertain travel details', () => {
    expect(parseAffiliateScrapeMapping(JUVENTUS_ACADEMY_NY_MAPPING).kind).toBe('CLUB');
    expect(JUVENTUS_ACADEMY_NY_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'Juventus Academy New York', sportName: 'Soccer', officialActionUrl: JUVENTUS_ACADEMY_NY_BOOKINGS_URL, dateDisplayMode: 'ONGOING' }),
    ]);
    expect(JUVENTUS_ACADEMY_NY_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(JUVENTUS_ACADEMY_NY_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('internally inconsistent')]));
  });

  it('preserves allowed-home provenance and logo review details', () => {
    expect(JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '57ac3076-df63-4415-ab46-8480662d944b', runId: 'a47c3e4f-64ab-42a8-9dec-9707144b4995', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([{ url: 'https://juventusny.com/', role: 'HOME', robotsStatus: 'ALLOWED' }]));
    expect(JUVENTUS_ACADEMY_NY_MANUAL_CANDIDATES[0].logoSourceUrl).toContain('logo_white-panorama');
  });
});
