import { parseAffiliateScrapeMapping } from '../types';
import {
  NEAAU_NEW_YORK_CITY_MAPPING,
  NEAAU_NEW_YORK_CITY_MANUAL_CANDIDATES,
  NEAAU_NEW_YORK_CITY_REGISTRATION_URL,
  NEAAU_NEW_YORK_CITY_SOURCE_EVIDENCE,
} from '../neaauNewYorkCitySource';

describe('NEAAU New York City affiliate source', () => {
  it('emits the future 2027 EVENT with source-stated details', () => {
    expect(parseAffiliateScrapeMapping(NEAAU_NEW_YORK_CITY_MAPPING).kind).toBe('EVENT');
    expect(NEAAU_NEW_YORK_CITY_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'EVENT',
        title: 'New York City',
        officialActionUrl: NEAAU_NEW_YORK_CITY_REGISTRATION_URL,
        startsAt: '2027-03-12T00:00:00-05:00',
        endsAt: '2027-03-14T23:59:00-04:00',
        venueName: 'Javits on the Hudson (The Javits Center)',
        priceText: '$995 per team',
        ageGroup: 'Girls 12-18; Boys 14-18',
      }),
    ]);
    expect(NEAAU_NEW_YORK_CITY_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no individual game times')]),
    );
    expect(NEAAU_NEW_YORK_CITY_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and records why the logo needs review', () => {
    expect(NEAAU_NEW_YORK_CITY_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '3b625c45-24d2-44e0-9fcf-f95c2b5d8b35',
        runId: '7811f4f1-3dcb-4055-9ded-2c01b78c3d9b',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NEAAU_NEW_YORK_CITY_SOURCE_EVIDENCE.artifacts.logoCandidates).toHaveLength(3);
  });
});
