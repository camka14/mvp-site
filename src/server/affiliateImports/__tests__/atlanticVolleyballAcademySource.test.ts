import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  ATLANTIC_VOLLEYBALL_HOME_URL,
  ATLANTIC_VOLLEYBALL_MAPPING,
  ATLANTIC_VOLLEYBALL_MANUAL_CANDIDATES,
  ATLANTIC_VOLLEYBALL_ORG_DESCRIPTION,
  ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE,
} from '../atlanticVolleyballAcademySource';
import { parseAffiliateScrapeMapping } from '../types';

describe('Atlantic Volleyball Academy source', () => {
  it('emits one ongoing CLUB profile and withholds unchecked inventory', () => {
    expect(parseAffiliateScrapeMapping(ATLANTIC_VOLLEYBALL_MAPPING).kind).toBe('CLUB');
    expect(ATLANTIC_VOLLEYBALL_MANUAL_CANDIDATES).toHaveLength(1);
    expect(ATLANTIC_VOLLEYBALL_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Atlantic Volleyball Academy',
      city: 'Long Island, NY',
      address: null,
      description: ATLANTIC_VOLLEYBALL_ORG_DESCRIPTION,
    }));
    expect(ATLANTIC_VOLLEYBALL_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('no complete current dated EVENT or RENTAL row'),
    ]));
  });

  it('preserves allowed-home provenance and duplicate-safe extraction', () => {
    expect(ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '4ad229d3-d60d-49d1-aba0-c300de5ad765',
      runId: '7dc35ec8-2aa4-4d55-b505-312d53c5b0f0',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: ATLANTIC_VOLLEYBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({
      url: ATLANTIC_VOLLEYBALL_HOME_URL,
      finalUrl: ATLANTIC_VOLLEYBALL_HOME_URL,
      statusCode: 200,
      body: '',
      fetchedAt: ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
    }, ATLANTIC_VOLLEYBALL_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'Atlantic Volleyball Academy' }));
  });
});
