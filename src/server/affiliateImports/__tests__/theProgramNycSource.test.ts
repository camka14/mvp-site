import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  THE_PROGRAM_NYC_HOME_URL,
  THE_PROGRAM_NYC_MANUAL_CANDIDATES,
  THE_PROGRAM_NYC_MAPPING,
  THE_PROGRAM_NYC_SOURCE_EVIDENCE,
  THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL,
} from '../theProgramNycSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('The Program NYC source', () => {
  it('emits one ongoing CLUB profile and withholds unchecked event/rental rows', () => {
    expect(parseAffiliateScrapeMapping(THE_PROGRAM_NYC_MAPPING).kind).toBe('CLUB');
    expect(THE_PROGRAM_NYC_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'The Program NYC',
        dateDisplayMode: 'ONGOING',
        officialActionUrl: THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL,
        city: 'Greenpoint, Brooklyn, NY',
        venueName: 'The Program NYC',
      }),
    ]);
    expect(THE_PROGRAM_NYC_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(THE_PROGRAM_NYC_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('rental pages are UNCHECKED'),
      expect.stringContaining('TEAM mappings are out of scope'),
    ]));
  });

  it('preserves allowed-home provenance, facility description, and official logo source', () => {
    expect(THE_PROGRAM_NYC_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'ab53d52b-b7e8-48a6-8be0-4095ef32bf36',
      runId: '45af2e4a-4e00-4145-b22d-41f96770cf79',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(THE_PROGRAM_NYC_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: THE_PROGRAM_NYC_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.theprogramnyc.com/rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    ]));
    expect(THE_PROGRAM_NYC_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({ logoSourceUrl: expect.stringContaining('The_Program_Logo-05.svg'), description: expect.stringContaining('12,500-square-foot') }));
    const extracted = extractAffiliateCandidatesFromPage({ url: THE_PROGRAM_NYC_HOME_URL, finalUrl: THE_PROGRAM_NYC_HOME_URL, statusCode: 200, body: '', fetchedAt: THE_PROGRAM_NYC_SOURCE_EVIDENCE.capturedAt }, THE_PROGRAM_NYC_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', officialActionUrl: THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL, sourceUrl: THE_PROGRAM_NYC_HOME_URL }));
  });
});
