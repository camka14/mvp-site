import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  NYCLI_VOLLEYBALL_ADDRESS,
  NYCLI_VOLLEYBALL_MANUAL_CANDIDATES,
  NYCLI_VOLLEYBALL_MAPPING,
  NYCLI_VOLLEYBALL_REGISTER_URL,
  NYCLI_VOLLEYBALL_SOURCE_EVIDENCE,
  NYCLI_VOLLEYBALL_SUMMER_URL,
  NYCLI_VOLLEYBALL_VENUE,
} from '../nycliVolleyballSummerSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('NYCLI Volleyball Summer 2026 source', () => {
  it('emits one CLUB profile and one future EVENT while withholding stale rows', () => {
    expect(parseAffiliateScrapeMapping(NYCLI_VOLLEYBALL_MAPPING).kind).toBe('EVENT');
    expect(NYCLI_VOLLEYBALL_MANUAL_CANDIDATES).toHaveLength(2);
    expect(NYCLI_VOLLEYBALL_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'NYCLI Volleyball Club', venueName: NYCLI_VOLLEYBALL_VENUE, address: NYCLI_VOLLEYBALL_ADDRESS }));
    expect(NYCLI_VOLLEYBALL_MANUAL_CANDIDATES[1]).toEqual(expect.objectContaining({ listingKind: 'EVENT', title: 'Pre-Tryout All Skills Academy', startsAt: '2026-08-15T10:00:00-04:00', endsAt: '2026-08-16T19:00:00-04:00', officialActionUrl: NYCLI_VOLLEYBALL_REGISTER_URL, priceText: '$150' }));
    expect(NYCLI_VOLLEYBALL_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('past as of 2026-07-31')]));
  });

  it('preserves allowed-listing provenance, event schedule, and duplicate-safe extraction', () => {
    expect(NYCLI_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '991b0f36-5367-4c66-b983-64d86437af6e', runId: '3cd10ef2-127a-44a8-be4b-8735ce7183d1', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(NYCLI_VOLLEYBALL_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([{ url: NYCLI_VOLLEYBALL_SUMMER_URL, role: 'LISTING', robotsStatus: 'ALLOWED' }]));
    expect(NYCLI_VOLLEYBALL_MANUAL_CANDIDATES[1].scheduleText).toEqual(expect.stringContaining('7th & 8th Grade 10:00 AM-12:00 PM'));
    const extracted = extractAffiliateCandidatesFromPage({ url: NYCLI_VOLLEYBALL_SUMMER_URL, finalUrl: NYCLI_VOLLEYBALL_SUMMER_URL, statusCode: 200, body: '', fetchedAt: NYCLI_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt }, NYCLI_VOLLEYBALL_MAPPING);
    expect(extracted).toHaveLength(2);
    expect(extracted.map((candidate) => candidate.listingKind)).toEqual(['CLUB', 'EVENT']);
  });
});
