import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  GG_VOLLEYBALL_MANUAL_CANDIDATES,
  GG_VOLLEYBALL_MAPPING,
  GG_VOLLEYBALL_REGISTER_URL,
  GG_VOLLEYBALL_SOURCE_EVIDENCE,
  GG_VOLLEYBALL_TRYOUTS_URL,
} from '../ggVolleyballClubSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('G&G Volleyball Club source', () => {
  it('emits one ongoing CLUB profile and withholds undated tryout rows and TEAM output', () => {
    expect(parseAffiliateScrapeMapping(GG_VOLLEYBALL_MAPPING).kind).toBe('CLUB');
    expect(GG_VOLLEYBALL_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'G&G Volleyball Club',
        dateDisplayMode: 'ONGOING',
        officialActionUrl: GG_VOLLEYBALL_REGISTER_URL,
        venueName: 'East Midwood Jewish Center',
        address: '1625 Ocean Ave, Brooklyn, NY 11230',
      }),
    ]);
    expect(GG_VOLLEYBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(GG_VOLLEYBALL_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('individual source year'),
      expect.stringContaining('TEAM rows are out of scope'),
    ]));
  });

  it('preserves allowed registration provenance and exact recurring schedule', () => {
    expect(GG_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '3aae373c-5042-4f09-a552-39374bf6a76c',
      runId: '27f3e511-52b2-404a-89e7-e6f04f5c9dca',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(GG_VOLLEYBALL_SOURCE_EVIDENCE.pages).toEqual([
      { url: GG_VOLLEYBALL_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    ]);
    expect(GG_VOLLEYBALL_MANUAL_CANDIDATES[0].scheduleText).toEqual(expect.stringContaining('Tuesdays for Beginners at 6:30 PM'));
    const extracted = extractAffiliateCandidatesFromPage({ url: GG_VOLLEYBALL_TRYOUTS_URL, finalUrl: GG_VOLLEYBALL_TRYOUTS_URL, statusCode: 200, body: '', fetchedAt: GG_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt }, GG_VOLLEYBALL_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', officialActionUrl: GG_VOLLEYBALL_REGISTER_URL, sourceUrl: GG_VOLLEYBALL_TRYOUTS_URL }));
  });
});
