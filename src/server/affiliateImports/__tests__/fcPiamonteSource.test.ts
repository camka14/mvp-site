import { parseAffiliateScrapeMapping } from '../types';
import {
  FC_PIAMONTE_HOME_URL,
  FC_PIAMONTE_LOGO_SOURCE_URL,
  FC_PIAMONTE_MANUAL_CANDIDATES,
  FC_PIAMONTE_MAPPING,
  FC_PIAMONTE_PROGRAM_DIVISIONS,
  FC_PIAMONTE_SOURCE_EVIDENCE,
} from '../fcPiamonteSource';

describe('FC Piamonte affiliate source', () => {
  it('creates one ongoing club listing and no unsupported event, team, or rental rows', () => {
    const mapping = parseAffiliateScrapeMapping(FC_PIAMONTE_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'FC Piamonte',
        officialActionUrl: FC_PIAMONTE_HOME_URL,
        sportName: 'Grass Soccer',
        tags: ['Club'],
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'RENTAL')).toBe(false);
  });

  it('preserves only the age and gender program groups proven by the captured homepage', () => {
    expect(FC_PIAMONTE_PROGRAM_DIVISIONS).toHaveLength(6);
    expect(FC_PIAMONTE_PROGRAM_DIVISIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Boys U6/U7/U8',
        gender: 'M',
        ratingType: 'AGE',
        ageDivisionTypeId: 'u8',
        priceCents: null,
      }),
      expect.objectContaining({
        name: 'Girls U6/U7/U8',
        gender: 'F',
        ratingType: 'AGE',
        ageDivisionTypeId: 'u8',
        priceCents: null,
      }),
      expect.objectContaining({
        name: 'Boys U16/U17',
        gender: 'M',
        ratingType: 'AGE',
        ageDivisionTypeId: 'u17',
        priceCents: null,
      }),
    ]));
    expect(FC_PIAMONTE_PROGRAM_DIVISIONS.every((division) => (
      !('skillDivisionTypeId' in division) && division.priceCents === null
    ))).toBe(true);
  });

  it('records exact live intake provenance and all withheld row types', () => {
    expect(FC_PIAMONTE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeSourceKey: 'site-fcpiamonte-org',
      runId: 'b6b48be9-7966-42ae-b8f0-0643390d008a',
      provider: 'FIRECRAWL',
    }));
    expect(FC_PIAMONTE_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      'PAGE_HTML',
      'PAGE_MARKDOWN',
      'PAGE_SCREENSHOT',
      'LOGO_CANDIDATE',
      'ROBOTS',
    ]));
    expect(FC_PIAMONTE_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Available Programs page'),
      expect.stringContaining('No EVENT candidate'),
      expect.stringContaining('No TEAM candidate'),
      expect.stringContaining('No RENTAL candidate'),
    ]));
    expect(FC_PIAMONTE_LOGO_SOURCE_URL).toContain('/Portals/52932/logo');
  });
});
