import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  NEW_YORK_TENNIS_CLUB_ADDRESS,
  NEW_YORK_TENNIS_CLUB_BOOKING_URL,
  NEW_YORK_TENNIS_CLUB_MANUAL_CANDIDATES,
  NEW_YORK_TENNIS_CLUB_MAPPING,
  NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE,
  NEW_YORK_TENNIS_CLUB_URL,
} from '../newYorkTennisClubRentalSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('New York Tennis Club rental source', () => {
  it('emits the stored court-rental row with address and rates', () => {
    expect(parseAffiliateScrapeMapping(NEW_YORK_TENNIS_CLUB_MAPPING).kind).toBe('RENTAL');
    expect(NEW_YORK_TENNIS_CLUB_MANUAL_CANDIDATES).toHaveLength(1);
    expect(NEW_YORK_TENNIS_CLUB_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'RENTAL',
      title: 'New York Tennis Club Court Time',
      address: NEW_YORK_TENNIS_CLUB_ADDRESS,
      officialActionUrl: NEW_YORK_TENNIS_CLUB_BOOKING_URL,
      priceText: 'Monday-Friday $65-$125/hour; Saturday-Sunday $100-$115/hour',
    }));
  });

  it('preserves allowed-listing provenance and duplicate-safe extraction', () => {
    expect(NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'f0772090-e2a6-4fc6-bce7-d21dac49fc58',
      runId: 'a643a11c-a232-4359-bc27-04f54c4bd52b',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: NEW_YORK_TENNIS_CLUB_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({
      url: NEW_YORK_TENNIS_CLUB_URL,
      finalUrl: NEW_YORK_TENNIS_CLUB_URL,
      statusCode: 200,
      body: '',
      fetchedAt: NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE.capturedAt,
    }, NEW_YORK_TENNIS_CLUB_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'RENTAL', title: 'New York Tennis Club Court Time' }));
  });
});
