import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  GLOBALL_COMPETITIONS_HOME_URL,
  GLOBALL_COMPETITIONS_MAPPING,
  GLOBALL_COMPETITIONS_MANUAL_CANDIDATES,
  GLOBALL_COMPETITIONS_ORG_DESCRIPTION,
  GLOBALL_COMPETITIONS_SOURCE_EVIDENCE,
} from '../globallCompetitionsSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('Globall Competitions source', () => {
  it('emits one ongoing CLUB profile and withholds incomplete event inventory', () => {
    expect(parseAffiliateScrapeMapping(GLOBALL_COMPETITIONS_MAPPING).kind).toBe('CLUB');
    expect(GLOBALL_COMPETITIONS_MANUAL_CANDIDATES).toHaveLength(1);
    expect(GLOBALL_COMPETITIONS_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Globall Competitions',
      city: 'New York region',
      address: null,
      description: GLOBALL_COMPETITIONS_ORG_DESCRIPTION,
    }));
    expect(GLOBALL_COMPETITIONS_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('no complete current date, time, venue, or registration row'),
    ]));
  });

  it('preserves allowed-home provenance and duplicate-safe extraction', () => {
    expect(GLOBALL_COMPETITIONS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'eb7490d3-e094-439c-b474-cc55d7aaafbc',
      runId: '2975283c-b4aa-464f-a70e-e448c5f64f02',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(GLOBALL_COMPETITIONS_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: GLOBALL_COMPETITIONS_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({
      url: GLOBALL_COMPETITIONS_HOME_URL,
      finalUrl: GLOBALL_COMPETITIONS_HOME_URL,
      statusCode: 200,
      body: '',
      fetchedAt: GLOBALL_COMPETITIONS_SOURCE_EVIDENCE.capturedAt,
    }, GLOBALL_COMPETITIONS_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'Globall Competitions' }));
  });
});
