import {
  MAPPING_ID,
  SOURCE_URL,
  WITHHELD_ROWS,
  manualCandidates,
  mapping,
} from '../stumptownVolleyballSource';

describe('Stumptown Volleyball Club affiliate source', () => {
  it('keeps the public club and evergreen training candidates source-backed', () => {
    expect(mapping.kind).toBe('CLUB');
    expect(mapping.listUrl).toBe(SOURCE_URL);
    expect(mapping.manualCandidates).toHaveLength(3);
    expect(manualCandidates.map((candidate) => candidate.listingKind)).toEqual([
      'CLUB',
      'EVENT',
      'EVENT',
    ]);

    const lessons = manualCandidates[1];
    expect(lessons).toMatchObject({
      title: 'Stumptown Volleyball Lessons - All Ages',
      officialActionUrl: 'https://www.stumptownvb.com/training',
      dateDisplayMode: 'NO_FIXED_DATE',
      startsAt: null,
      priceText: '$40/hr plus court fee',
      tags: ['Clinic'],
    });

    const sand = manualCandidates[2];
    expect(sand).toMatchObject({
      title: 'Stumptown Summer Sand Training',
      dateDisplayMode: 'ONGOING',
      startsAt: null,
      priceText: '$10 per session',
      tags: ['Open Play', 'Clinic'],
    });
  });

  it('withholds undated or stale tryout and tournament rows instead of guessing dates', () => {
    expect(WITHHELD_ROWS).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '2025-26 junior volleyball tryouts' }),
      expect.objectContaining({ title: '2025-26 CEVA Power League schedule' }),
    ]));
    expect(WITHHELD_ROWS.every((row) => row.reason.length > 20)).toBe(true);
    expect(MAPPING_ID).toBe('affiliate_mapping_stumptown_volleyball_club_v1');
  });
});
