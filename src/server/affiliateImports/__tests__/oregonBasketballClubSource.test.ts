import { parseAffiliateScrapeMapping } from '../types';
import {
  OBC_HOME_URL,
  OBC_LOGO_SOURCE_URL,
  OBC_MAPPING,
  OBC_MANUAL_CANDIDATES,
  OBC_TEAMS_URL,
} from '../oregonBasketballClubSource';

describe('Oregon Basketball Club affiliate source', () => {
  it('keeps OBC as one public ongoing club candidate', () => {
    const mapping = parseAffiliateScrapeMapping(OBC_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toHaveLength(1);
    expect(candidates).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Oregon Basketball Club',
        officialActionUrl: OBC_HOME_URL,
        sourceUrl: OBC_TEAMS_URL,
        dateDisplayMode: 'ONGOING',
        city: 'Beaverton, OR',
        sportName: 'Basketball',
        ageGroup: 'Grades 3rd-12th',
        tags: ['Club'],
      }),
    ]);
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves the source constraints and logo handoff for review', () => {
    const candidate = OBC_MANUAL_CANDIDATES[0];

    expect(OBC_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(candidate).toEqual(expect.objectContaining({
      venueName: 'The Courts in Beaverton',
      address: null,
      description: expect.stringContaining('youth basketball club'),
      warnings: expect.arrayContaining([
        expect.stringContaining('March 16 and 18 evaluation dates'),
        expect.stringContaining('conflicting March 23-25 versus March 24-26'),
        expect.stringContaining('No TEAM candidates'),
      ]),
    }));
    expect(OBC_LOGO_SOURCE_URL).toBe(
      'https://oregonbasketballclub.teamsnapsites.com/wp-content/uploads/sites/1999/2019/10/N1-e1571951855652.png',
    );
  });
});
