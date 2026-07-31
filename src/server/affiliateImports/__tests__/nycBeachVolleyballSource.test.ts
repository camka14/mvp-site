import { parseAffiliateScrapeMapping } from '../types';
import {
  NYC_BEACH_VOLLEYBALL_MAPPING,
  NYC_BEACH_VOLLEYBALL_MANUAL_CANDIDATES,
  NYC_BEACH_VOLLEYBALL_SOURCE_EVIDENCE,
  NYC_BEACH_VOLLEYBALL_LOGO_SOURCE_URL,
  NYC_BEACH_VOLLEYBALL_TRAINING_URL,
} from '../nycBeachVolleyballSource';

describe('NYC Beach Volleyball affiliate source', () => {
  it('emits one ongoing CLUB candidate and withholds unsupported dated rows', () => {
    expect(parseAffiliateScrapeMapping(NYC_BEACH_VOLLEYBALL_MAPPING).kind).toBe('CLUB');
    expect(NYC_BEACH_VOLLEYBALL_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'NYC Beach Volleyball',
        officialActionUrl: NYC_BEACH_VOLLEYBALL_TRAINING_URL,
        dateDisplayMode: 'ONGOING',
        city: 'New York City, NY',
      }),
    ]);
    expect(NYC_BEACH_VOLLEYBALL_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no complete current date')]),
    );
    expect(NYC_BEACH_VOLLEYBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and the official first-party logo URL', () => {
    expect(NYC_BEACH_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: 'bb0a260b-6a4f-49b4-8b78-83e7d58bbbd5',
        runId: '8aae8b70-45ab-44f0-9d07-e11a9120be04',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NYC_BEACH_VOLLEYBALL_SOURCE_EVIDENCE.artifacts.logoCandidates).toHaveLength(2);
    expect(NYC_BEACH_VOLLEYBALL_LOGO_SOURCE_URL).toContain('NYC%2BBEACH%2BVOLLYBALL%2BLOGO_4_DIGITAL.png');
  });
});
