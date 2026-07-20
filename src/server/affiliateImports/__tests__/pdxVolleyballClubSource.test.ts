import { parseAffiliateScrapeMapping } from '../types';
import {
  PDX_VB_CAMP_ADDRESS,
  PDX_VB_CAMP_REGISTRATION_URL,
  PDX_VB_MAPPING,
  PDX_VB_MANUAL_CANDIDATES,
} from '../pdxVolleyballClubSource';

describe('PDX Volleyball Club affiliate source', () => {
  it('keeps the club profile and future camp rows in the import contract', () => {
    const mapping = parseAffiliateScrapeMapping(PDX_VB_MAPPING);
    const candidates = mapping.manualCandidates ?? [];
    const campCandidates = candidates.filter((candidate) => candidate.listingKind === 'EVENT');

    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({
      listingKind: 'CLUB',
      title: 'PDX Volleyball Club',
      officialActionUrl: 'https://pdx-vb.com/',
      dateDisplayMode: 'ONGOING',
    });
    expect(campCandidates).toHaveLength(2);
    expect(campCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'PDX VB Portland Parks Grass Camp: Grades 3-6',
        officialActionUrl: PDX_VB_CAMP_REGISTRATION_URL,
        sourceUrl: 'https://pdx-vb.com/portland-parks-recreation-summer-sessions/',
        address: PDX_VB_CAMP_ADDRESS,
        startsAt: '2026-07-28T18:00:00-07:00',
        priceText: '$90',
        tags: ['Camp'],
        divisions: [expect.objectContaining({ name: 'Grades 3-6', priceCents: 9000 })],
      }),
      expect.objectContaining({
        title: 'PDX VB Portland Parks Grass Camp: Grades 7-12',
        startsAt: '2026-07-28T19:20:00-07:00',
        divisions: [expect.objectContaining({ name: 'Grades 7-12', priceCents: 9000 })],
      }),
    ]));
    expect(candidates.every((candidate) => !candidate.logoUrl)).toBe(true);
  });

  it('uses stable dedupe fields for repeatable manual runs', () => {
    expect(PDX_VB_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(PDX_VB_MANUAL_CANDIDATES.map((candidate) => `${candidate.title}|${candidate.startsAt ?? ''}`)).toEqual([
      'PDX Volleyball Club|',
      'PDX VB Portland Parks Grass Camp: Grades 3-6|2026-07-28T18:00:00-07:00',
      'PDX VB Portland Parks Grass Camp: Grades 7-12|2026-07-28T19:20:00-07:00',
    ]);
  });
});
