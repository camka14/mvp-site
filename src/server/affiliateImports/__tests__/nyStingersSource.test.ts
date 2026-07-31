import { parseAffiliateScrapeMapping } from '../types';
import { NY_STINGERS_MANUAL_CANDIDATES, NY_STINGERS_MAPPING, NY_STINGERS_SOURCE_EVIDENCE } from '../nyStingersSource';

describe('NY Stingers affiliate source', () => {
  it('emits one ongoing New York baseball club profile', () => {
    expect(parseAffiliateScrapeMapping(NY_STINGERS_MAPPING).kind).toBe('CLUB');
    expect(NY_STINGERS_MANUAL_CANDIDATES).toHaveLength(1);
    expect(NY_STINGERS_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'NY Stingers',
      dateDisplayMode: 'ONGOING',
      city: 'New York, NY',
    }));
  });

  it('preserves missing-logo and unchecked team provenance', () => {
    expect(NY_STINGERS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'abd6c117-9e96-4d87-bacf-0d1b451a4f97',
      runId: '3dad0a31-d3c0-41e3-bf25-2cb6b2631e77',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(NY_STINGERS_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://nystingers.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://nystingers.com/teams', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    ]));
    expect(NY_STINGERS_SOURCE_EVIDENCE.artifactKinds).not.toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: expect.any(Number) }]));
  });
});
