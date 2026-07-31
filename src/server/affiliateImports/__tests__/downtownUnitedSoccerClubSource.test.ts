import { parseAffiliateScrapeMapping } from '../types';
import { DUSC_MANUAL_CANDIDATES, DUSC_MAPPING, DUSC_SOURCE_EVIDENCE } from '../downtownUnitedSoccerClubSource';

describe('Downtown United Soccer Club affiliate source', () => {
  it('emits one ongoing NYC soccer club profile', () => {
    expect(parseAffiliateScrapeMapping(DUSC_MAPPING).kind).toBe('CLUB');
    expect(DUSC_MANUAL_CANDIDATES).toHaveLength(1);
    expect(DUSC_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Downtown United Soccer Club (DUSC)',
      dateDisplayMode: 'ONGOING',
      city: 'New York, NY',
    }));
  });

  it('preserves the allowed home capture and withheld detail boundary', () => {
    expect(DUSC_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '7e0cebb2-e9af-4ce8-9e0b-68d1a57dd98f',
      runId: '77e0839a-e804-4564-b062-21dc22c85547',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(DUSC_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 2 },
      { kind: 'ROBOTS', count: 1 },
    ]));
  });
});
