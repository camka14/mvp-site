import { parseAffiliateScrapeMapping } from '../types';
import {
  STADIUM_TENNIS_CENTER_BOOKING_URL,
  STADIUM_TENNIS_CENTER_MAPPING,
  STADIUM_TENNIS_CENTER_MANUAL_CANDIDATES,
  STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE,
  STADIUM_TENNIS_CENTER_URL,
} from '../stadiumTennisCenterSource';

describe('Stadium Tennis Center affiliate source', () => {
  it('emits indoor and outdoor ongoing RENTAL candidates with source-bound details', () => {
    expect(parseAffiliateScrapeMapping(STADIUM_TENNIS_CENTER_MAPPING).kind).toBe('RENTAL');
    expect(STADIUM_TENNIS_CENTER_MANUAL_CANDIDATES).toHaveLength(2);
    expect(STADIUM_TENNIS_CENTER_MANUAL_CANDIDATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ listingKind: 'RENTAL', title: expect.stringContaining('Indoor'), officialActionUrl: STADIUM_TENNIS_CENTER_BOOKING_URL, priceText: null }),
        expect.objectContaining({ listingKind: 'RENTAL', title: expect.stringContaining('Outdoor'), officialActionUrl: STADIUM_TENNIS_CENTER_URL, priceText: null }),
      ]),
    );
    expect(STADIUM_TENNIS_CENTER_MANUAL_CANDIDATES.every((candidate) => candidate.address?.includes('Bronx, NY'))).toBe(true);
  });

  it('preserves stored provenance and allowed rental-page boundary', () => {
    expect(STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: 'c75307dc-6227-4da4-9b66-244ca8826b2b',
        runId: '66da27d3-fae2-4c64-ad7f-8ced5ae8aeae',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE.pages).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: STADIUM_TENNIS_CENTER_URL, role: 'RENTAL', robotsStatus: 'ALLOWED' })]),
    );
  });
});
