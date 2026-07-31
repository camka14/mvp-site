import { parseAffiliateScrapeMapping } from '../types';
import {
  ASPHALT_GREEN_HOME_URL,
  ASPHALT_GREEN_MANUAL_CANDIDATES,
  ASPHALT_GREEN_MAPPING,
  ASPHALT_GREEN_SOURCE_EVIDENCE,
} from '../asphaltGreenSoccerClubSource';

describe('Asphalt Green Soccer Club affiliate source', () => {
  it('keeps the stored homepage as one review-only ongoing CLUB candidate', () => {
    const mapping = parseAffiliateScrapeMapping(ASPHALT_GREEN_MAPPING);
    expect(mapping.kind).toBe('CLUB');
    expect(ASPHALT_GREEN_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Asphalt Green Soccer Club',
        officialActionUrl: ASPHALT_GREEN_HOME_URL,
        sportName: 'Soccer',
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(ASPHALT_GREEN_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(ASPHALT_GREEN_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves the live intake/run provenance and logo review gap', () => {
    expect(ASPHALT_GREEN_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'edab1d0f-a6c6-44ae-afd7-8e841c6417da',
      intakeSourceKey: 'new-york-new-york-metropolitan-area-asphalt-green-soccer-club-agsoccerclub-com',
      runId: '073d1ff4-18d4-4c5d-b015-d1c8f619bb75',
      provider: 'SCRAPINGDOG',
    }));
    expect(ASPHALT_GREEN_SOURCE_EVIDENCE.pages[0].artifactKinds).toEqual(expect.arrayContaining([
      'PAGE_HTML', 'PAGE_MARKDOWN', 'PAGE_SCREENSHOT', 'LOGO_CANDIDATE', 'ROBOTS',
    ]));
    expect(ASPHALT_GREEN_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('MANUAL_REVIEW'),
      expect.stringContaining('No EVENT candidate'),
      expect.stringContaining('No TEAM candidate'),
    ]));
  });
});
