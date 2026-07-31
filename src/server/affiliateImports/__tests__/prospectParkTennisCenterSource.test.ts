import { parseAffiliateScrapeMapping } from '../types';
import {
  PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL,
  PROSPECT_PARK_TENNIS_CENTER_MAPPING,
  PROSPECT_PARK_TENNIS_CENTER_MANUAL_CANDIDATES,
  PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE,
  PROSPECT_PARK_TENNIS_CENTER_URL,
} from '../prospectParkTennisCenterSource';

describe('Prospect Park Tennis Center affiliate source', () => {
  it('emits one ongoing RENTAL link-out with no invented address or price', () => {
    expect(parseAffiliateScrapeMapping(PROSPECT_PARK_TENNIS_CENTER_MAPPING).kind).toBe('RENTAL');
    expect(PROSPECT_PARK_TENNIS_CENTER_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'RENTAL',
        title: 'Prospect Park Tennis Center Court Rentals',
        officialActionUrl: PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL,
        sourceUrl: PROSPECT_PARK_TENNIS_CENTER_URL,
        dateDisplayMode: 'ONGOING',
        address: null,
        priceText: null,
      }),
    ]);
    expect(PROSPECT_PARK_TENNIS_CENTER_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('real-time availability')]),
    );
  });

  it('preserves stored provenance and the explicit umbrella-logo review disposition', () => {
    expect(PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '668c5cac-3fdd-45f4-9c00-3aa6e6a8e08d',
        runId: '15694515-9357-4bad-b801-c2d2c9c0203c',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE.pages).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: PROSPECT_PARK_TENNIS_CENTER_URL, robotsStatus: 'ALLOWED' })]),
    );
  });
});
