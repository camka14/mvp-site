import { parseAffiliateScrapeMapping } from '../types';
import {
  SOCCER_FRIENDS_USA_HOME_URL,
  SOCCER_FRIENDS_USA_MAPPING,
  SOCCER_FRIENDS_USA_MANUAL_CANDIDATES,
  SOCCER_FRIENDS_USA_SOURCE_EVIDENCE,
} from '../soccerFriendsUsaSource';

describe('Soccer Friends USA affiliate source', () => {
  it('emits one ongoing CLUB profile and withholds current dated program rows', () => {
    expect(parseAffiliateScrapeMapping(SOCCER_FRIENDS_USA_MAPPING).kind).toBe('CLUB');
    expect(SOCCER_FRIENDS_USA_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Soccer Friends USA',
        officialActionUrl: 'https://www.soccerfriendsusa.com/programs',
        sourceUrl: SOCCER_FRIENDS_USA_HOME_URL,
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(SOCCER_FRIENDS_USA_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no complete current')]),
    );
    expect(SOCCER_FRIENDS_USA_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(SOCCER_FRIENDS_USA_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: 'f3ff83fa-dd19-49fd-a78c-cf308d1bd567',
        runId: '4447a805-527d-468b-89cb-4bf8a307b5ad',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(SOCCER_FRIENDS_USA_SOURCE_EVIDENCE.artifactKinds).toEqual(
      expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 4 }]),
    );
  });
});
