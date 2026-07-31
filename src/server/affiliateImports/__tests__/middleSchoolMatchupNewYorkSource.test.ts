import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  MSM_NEW_YORK_HOME_URL,
  MSM_NEW_YORK_MANUAL_CANDIDATES,
  MSM_NEW_YORK_MAPPING,
  MSM_NEW_YORK_PREREGISTER_URL,
  MSM_NEW_YORK_SOURCE_EVIDENCE,
} from '../middleSchoolMatchupNewYorkSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('Middle School Matchup New York source', () => {
  it('emits one ongoing CLUB profile and withholds unsupported dated and TEAM rows', () => {
    expect(parseAffiliateScrapeMapping(MSM_NEW_YORK_MAPPING).kind).toBe('CLUB');
    expect(MSM_NEW_YORK_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Middle School Matchup New York',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Summer 2026',
        officialActionUrl: MSM_NEW_YORK_PREREGISTER_URL,
        city: 'New York Area',
        sportName: 'Baseball',
      }),
    ]);
    expect(MSM_NEW_YORK_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(MSM_NEW_YORK_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('no exact event date'),
      expect.stringContaining('MANUAL_REVIEW'),
    ]));
  });

  it('preserves allowed-listing provenance and duplicate-safe manual extraction', () => {
    expect(MSM_NEW_YORK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '021bd253-be2a-4b02-b9f9-2993363b0c24',
      runId: '6789ddb7-6fbb-49fe-8f61-715051b949e6',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(MSM_NEW_YORK_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: MSM_NEW_YORK_HOME_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
      { url: 'https://www.middleschoolmatchup.com/newyork-pre-registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({ url: MSM_NEW_YORK_HOME_URL, finalUrl: MSM_NEW_YORK_HOME_URL, statusCode: 200, body: '', fetchedAt: MSM_NEW_YORK_SOURCE_EVIDENCE.capturedAt }, MSM_NEW_YORK_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', officialActionUrl: MSM_NEW_YORK_PREREGISTER_URL, sourceUrl: MSM_NEW_YORK_HOME_URL }));
  });
});
