import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  FIVE_STAR_SOCCER_HOME_URL,
  FIVE_STAR_SOCCER_MANUAL_CANDIDATES,
  FIVE_STAR_SOCCER_MAPPING,
  FIVE_STAR_SOCCER_SOURCE_EVIDENCE,
  FIVE_STAR_SOCCER_TRAINING_URL,
} from '../fiveStarSoccerAcademySource';
import { parseAffiliateScrapeMapping } from '../types';

describe('5 Star Soccer Academy source', () => {
  it('emits one ongoing CLUB profile and withholds unchecked event and team rows', () => {
    expect(parseAffiliateScrapeMapping(FIVE_STAR_SOCCER_MAPPING).kind).toBe('CLUB');
    expect(FIVE_STAR_SOCCER_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: '5 Star Soccer Academy',
        dateDisplayMode: 'ONGOING',
        officialActionUrl: FIVE_STAR_SOCCER_TRAINING_URL,
        sportName: 'Soccer',
      }),
    ]);
    expect(FIVE_STAR_SOCCER_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(FIVE_STAR_SOCCER_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('no complete current dated EVENT row'),
      expect.stringContaining('TEAM mappings are out of scope'),
    ]));
  });

  it('preserves allowed-home provenance and program age bands', () => {
    expect(FIVE_STAR_SOCCER_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'a083b51e-56bb-449d-ace9-b1809642fcc4',
      runId: '0a516731-e735-4940-a511-ab58a6b9caf9',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(FIVE_STAR_SOCCER_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: FIVE_STAR_SOCCER_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.5starsocceracademy.com/event-details/spring-day-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    ]));
    expect(FIVE_STAR_SOCCER_MANUAL_CANDIDATES[0].scheduleText).toEqual(expect.stringContaining('Little 5 Stars for ages 3-5'));
    const extracted = extractAffiliateCandidatesFromPage({ url: FIVE_STAR_SOCCER_HOME_URL, finalUrl: FIVE_STAR_SOCCER_HOME_URL, statusCode: 200, body: '', fetchedAt: FIVE_STAR_SOCCER_SOURCE_EVIDENCE.capturedAt }, FIVE_STAR_SOCCER_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', officialActionUrl: FIVE_STAR_SOCCER_TRAINING_URL, sourceUrl: FIVE_STAR_SOCCER_HOME_URL }));
  });
});
