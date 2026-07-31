import { parseAffiliateScrapeMapping } from '../types';
import { ASPHALT_GREEN_SOCCER_OVERVIEW_CANDIDATES, ASPHALT_GREEN_SOCCER_OVERVIEW_MAPPING, ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE } from '../asphaltGreenSoccerOverviewSource';

describe('Asphalt Green soccer overview affiliate source', () => {
  it('emits one ongoing soccer club profile and withholds undated program rows', () => {
    expect(parseAffiliateScrapeMapping(ASPHALT_GREEN_SOCCER_OVERVIEW_MAPPING).kind).toBe('CLUB');
    expect(ASPHALT_GREEN_SOCCER_OVERVIEW_CANDIDATES).toHaveLength(1);
    expect(ASPHALT_GREEN_SOCCER_OVERVIEW_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      dateDisplayMode: 'ONGOING',
      sportName: 'Soccer',
      officialActionUrl: 'https://www.asphaltgreen.org/sports/soccer',
    }));
  });

  it('preserves allowed-source provenance and unchecked detail boundaries', () => {
    expect(ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '7321341b-96e2-42e3-8d0c-9b33f480ed0b',
      runId: 'e96e90ff-70a6-4271-80e4-33fbb469ee15',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 5 },
      { kind: 'ROBOTS', count: 1 },
    ]));
    expect(ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE.pages.filter((page) => page.robotsStatus === 'UNCHECKED')).toHaveLength(4);
  });
});
