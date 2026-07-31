import { parseAffiliateScrapeMapping } from '../types';
import {
  NY_URBAN_ENROLL_URL,
  NY_URBAN_EVENT_CANDIDATES,
  NY_URBAN_MAPPING,
  NY_URBAN_MANUAL_CANDIDATES,
  NY_URBAN_OPEN_PLAY_URL,
  NY_URBAN_SOURCE_EVIDENCE,
} from '../nyUrbanVolleyballSource';

describe('NY Urban volleyball affiliate source', () => {
  it('emits one CLUB profile and recurring/no-fixed-date volleyball candidates', () => {
    expect(parseAffiliateScrapeMapping(NY_URBAN_MAPPING).kind).toBe('EVENT');
    expect(NY_URBAN_MANUAL_CANDIDATES).toHaveLength(7);
    expect(NY_URBAN_MANUAL_CANDIDATES[0]).toEqual(
      expect.objectContaining({ listingKind: 'CLUB', title: 'New York Urban Professionals Volleyball League', officialActionUrl: NY_URBAN_OPEN_PLAY_URL }),
    );
    expect(NY_URBAN_EVENT_CANDIDATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining('W.50th'), officialActionUrl: NY_URBAN_ENROLL_URL, priceText: '$18', dateDisplayMode: 'ONGOING' }),
        expect.objectContaining({ title: expect.stringContaining('Clinics'), dateDisplayMode: 'NO_FIXED_DATE', priceText: '$19' }),
      ]),
    );
    expect(NY_URBAN_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and the allowed listing boundary', () => {
    expect(NY_URBAN_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '9c84cd57-895c-4be7-b2f0-1fa8165ff831',
        runId: 'b450f9ad-2f02-4f92-923a-5a806c49de5f',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NY_URBAN_SOURCE_EVIDENCE.pages).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: NY_URBAN_OPEN_PLAY_URL, robotsStatus: 'ALLOWED' })]),
    );
    expect(NY_URBAN_SOURCE_EVIDENCE.artifactKinds).toEqual(
      expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 2 }]),
    );
  });
});
