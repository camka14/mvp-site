import { parseAffiliateScrapeMapping } from '../types';
import { NYUSA_MANUAL_CANDIDATES, NYUSA_MAPPING, NYUSA_SOURCE_EVIDENCE } from '../newYorkUnitedSoccerAcademySource';

describe('New York United Soccer Academy affiliate source', () => {
  it('emits one ongoing Queens soccer club profile', () => {
    expect(parseAffiliateScrapeMapping(NYUSA_MAPPING).kind).toBe('CLUB');
    expect(NYUSA_MANUAL_CANDIDATES).toHaveLength(1);
    expect(NYUSA_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'New York United Soccer Academy',
      dateDisplayMode: 'ONGOING',
      city: 'Queens, NY',
    }));
  });

  it('preserves the allowed homepage boundary and withheld detail pages', () => {
    expect(NYUSA_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '140ed625-9c81-4042-b476-280d5a5e89e9',
      runId: '08c97a93-75e3-4030-aed0-9a9af7958b2a',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(NYUSA_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://www.nyunitedsoccer.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.nyunitedsoccer.com/summer-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    ]));
    expect(NYUSA_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 2 },
      { kind: 'ROBOTS', count: 1 },
    ]));
  });
});
