import { parseAffiliateScrapeMapping } from '../types';
import {
  HOT_VOLLEYBALL_NYC_HOME_URL,
  HOT_VOLLEYBALL_NYC_LOGO_SOURCE_URL,
  HOT_VOLLEYBALL_NYC_MAPPING,
  HOT_VOLLEYBALL_NYC_MANUAL_CANDIDATES,
  HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE,
} from '../hotVolleyballNycSource';

describe('HOT Volleyball NYC affiliate source', () => {
  it('emits one ongoing CLUB candidate and withholds uncaptured dated details', () => {
    expect(parseAffiliateScrapeMapping(HOT_VOLLEYBALL_NYC_MAPPING).kind).toBe('CLUB');
    expect(HOT_VOLLEYBALL_NYC_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'High Octane Training Volleyball NYC',
        officialActionUrl: HOT_VOLLEYBALL_NYC_HOME_URL,
        dateDisplayMode: 'ONGOING',
        logoSourceUrl: HOT_VOLLEYBALL_NYC_LOGO_SOURCE_URL,
      }),
    ]);
    expect(HOT_VOLLEYBALL_NYC_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no complete current event row')]),
    );
    expect(HOT_VOLLEYBALL_NYC_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '0c6f4a9c-361b-4c21-908d-0ed7f5cd804b',
        runId: 'ea19cf81-24ac-464a-8979-55e7bcd74ddc',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE.artifactKinds).toEqual(
      expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 5 }]),
    );
  });
});
