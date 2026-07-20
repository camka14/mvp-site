import { parseAffiliateScrapeMapping } from '../types';
import {
  ROSE_CITY_HOCKEY_HOME_URL,
  ROSE_CITY_HOCKEY_LOGO_SOURCE_URL,
  ROSE_CITY_HOCKEY_MANUAL_CANDIDATES,
  ROSE_CITY_HOCKEY_MAPPING,
  ROSE_CITY_HOCKEY_SOURCE_EVIDENCE,
} from '../roseCityHockeyClubSource';

describe('Rose City Hockey Club affiliate source', () => {
  it('creates one ongoing club listing and no unsupported event or team rows', () => {
    const mapping = parseAffiliateScrapeMapping(ROSE_CITY_HOCKEY_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Rose City Hockey Club',
        officialActionUrl: ROSE_CITY_HOCKEY_HOME_URL,
        sportName: 'Hockey',
        tags: ['Club'],
        dateDisplayMode: 'ONGOING',
        address: null,
      }),
    ]);
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('records the live intake provenance and withheld stale season', () => {
    const candidate = ROSE_CITY_HOCKEY_MANUAL_CANDIDATES[0];

    expect(ROSE_CITY_HOCKEY_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeSourceKey: 'site-rosecityhockeyclub-com',
      runId: '7d004c23-3634-428d-8153-e033e8d3d328',
      provider: 'FIRECRAWL',
    }));
    expect(ROSE_CITY_HOCKEY_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      'PAGE_MARKDOWN',
      'PAGE_SCREENSHOT',
      'LOGO_CANDIDATE',
      'ROBOTS',
    ]));
    expect(candidate.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('2025-2026 season'),
      expect.stringContaining('coordinates are intentionally left unspecified'),
      expect.stringContaining('No EVENT candidate'),
      expect.stringContaining('No TEAM candidate'),
    ]));
    expect(ROSE_CITY_HOCKEY_LOGO_SOURCE_URL).toContain('rchclogo-transparentwithborder_orig.png');
  });
});
