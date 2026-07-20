import { parseAffiliateScrapeMapping } from '../types';
import {
  WESTSIDE_METROS_HOME_URL,
  WESTSIDE_METROS_LOGO_SOURCE_URL,
  WESTSIDE_METROS_MANUAL_CANDIDATES,
  WESTSIDE_METROS_MAPPING,
  WESTSIDE_METROS_SOURCE_EVIDENCE,
} from '../westsideMetrosFcSource';

describe('Westside Metros FC affiliate source', () => {
  it('creates one ongoing club listing and no unsupported event, team, or rental rows', () => {
    const mapping = parseAffiliateScrapeMapping(WESTSIDE_METROS_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Westside Metros FC',
        officialActionUrl: WESTSIDE_METROS_HOME_URL,
        sportName: 'Grass Soccer',
        tags: ['Club'],
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'RENTAL')).toBe(false);
  });

  it('records exact live intake provenance and the withheld source rows', () => {
    const candidate = WESTSIDE_METROS_MANUAL_CANDIDATES[0];

    expect(WESTSIDE_METROS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeSourceKey: 'site-westsidemetros-org',
      runId: 'f7143726-814c-49d2-a480-e755bdc2ba31',
      provider: 'FIRECRAWL',
    }));
    expect(WESTSIDE_METROS_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      'PAGE_HTML',
      'PAGE_MARKDOWN',
      'PAGE_SCREENSHOT',
      'LOGO_CANDIDATE',
      'ROBOTS',
    ]));
    expect(candidate.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('adidas Beaverton Cup'),
      expect.stringContaining('supplemental registration'),
      expect.stringContaining('no TEAM candidate'),
      expect.stringContaining('no RENTAL candidate'),
    ]));
    expect(WESTSIDE_METROS_LOGO_SOURCE_URL).toContain('/_templates/Home-2022/images/logo.png');
  });
});
