import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  NY_CRUSH_MANUAL_CANDIDATES,
  NY_CRUSH_MAPPING,
  NY_CRUSH_REGISTER_URL,
  NY_CRUSH_SOURCE_EVIDENCE,
  NY_CRUSH_TRYOUTS_FAQ_URL,
} from '../nyCrushSoccerClubSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('New York Crush SC source', () => {
  it('emits a minimal CLUB profile without inventing missing tryout facts', () => {
    expect(parseAffiliateScrapeMapping(NY_CRUSH_MAPPING).kind).toBe('CLUB');
    expect(NY_CRUSH_MANUAL_CANDIDATES).toHaveLength(1);
    expect(NY_CRUSH_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'New York Crush SC',
      city: null,
      address: null,
      officialActionUrl: NY_CRUSH_REGISTER_URL,
    }));
    expect(NY_CRUSH_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('does not publish a canonical city'),
    ]));
  });

  it('preserves allowed-FAQ provenance and duplicate-safe extraction', () => {
    expect(NY_CRUSH_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'b50c3dc2-9492-466d-85a2-fa1e3c7965f4',
      runId: 'ede02847-b4be-4890-862f-a9611b81ee3d',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(NY_CRUSH_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: NY_CRUSH_TRYOUTS_FAQ_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({
      url: NY_CRUSH_TRYOUTS_FAQ_URL,
      finalUrl: NY_CRUSH_TRYOUTS_FAQ_URL,
      statusCode: 200,
      body: '',
      fetchedAt: NY_CRUSH_SOURCE_EVIDENCE.capturedAt,
    }, NY_CRUSH_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'New York Crush SC' }));
  });
});
