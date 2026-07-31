import { parseAffiliateScrapeMapping } from '../types';
import {
  NYC_PICKLEBALL_LEAGUE_CANDIDATES,
  NYC_PICKLEBALL_LEAGUES_URL,
  NYC_PICKLEBALL_LOGO_SOURCE_URL,
  NYC_PICKLEBALL_MAPPING,
  NYC_PICKLEBALL_MANUAL_CANDIDATES,
  NYC_PICKLEBALL_SOURCE_EVIDENCE,
} from '../nycPickleballLeaguesSource';

describe('NYC Pickleball leagues affiliate source', () => {
  it('emits one CLUB profile and five no-fixed-date league candidates', () => {
    expect(parseAffiliateScrapeMapping(NYC_PICKLEBALL_MAPPING).kind).toBe('EVENT');
    expect(NYC_PICKLEBALL_MANUAL_CANDIDATES).toHaveLength(6);
    expect(NYC_PICKLEBALL_MANUAL_CANDIDATES[0]).toEqual(
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'NYC Pickleball',
        officialActionUrl: NYC_PICKLEBALL_LEAGUES_URL,
        dateDisplayMode: 'ONGOING',
        logoSourceUrl: NYC_PICKLEBALL_LOGO_SOURCE_URL,
      }),
    );
    expect(NYC_PICKLEBALL_LEAGUE_CANDIDATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ listingKind: 'EVENT', dateDisplayMode: 'NO_FIXED_DATE' }),
      ]),
    );
    expect(NYC_PICKLEBALL_LEAGUE_CANDIDATES.every((candidate) => candidate.startsAt === null)).toBe(true);
    expect(NYC_PICKLEBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and current-page stale-row warning', () => {
    expect(NYC_PICKLEBALL_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '95f99887-8218-4392-a5f3-f4fa1b535780',
        runId: 'f7c39f1a-a8fc-44ee-9e37-ccd71e01abc9',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NYC_PICKLEBALL_LEAGUE_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('past start date')]),
    );
    expect(NYC_PICKLEBALL_SOURCE_EVIDENCE.artifactKinds).toEqual(
      expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 5 }]),
    );
  });
});
