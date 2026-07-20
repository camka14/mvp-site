import {
  CLACKAMAS_JR_DIVISIONS,
  CLACKAMAS_JR_MANUAL_CANDIDATES,
  CLACKAMAS_JR_MAPPING,
} from '../clackamasJuniorVolleyballSource';

describe('Clackamas Jr Rec affiliate source', () => {
  it('keeps the public club and future season event in the import contract', () => {
    expect(CLACKAMAS_JR_MAPPING.kind).toBe('CLUB');
    expect(CLACKAMAS_JR_MANUAL_CANDIDATES).toHaveLength(2);
    expect(CLACKAMAS_JR_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      dateDisplayMode: 'ONGOING',
      priceText: '$65-$125',
    }));
    expect(CLACKAMAS_JR_MANUAL_CANDIDATES[1]).toEqual(expect.objectContaining({
      listingKind: 'EVENT',
      startsAt: '2027-03-29T00:00:00-07:00',
      endsAt: '2027-05-23T23:59:00-07:00',
      tags: ['League'],
    }));
  });

  it('preserves each published age division fee and leaves capacity unspecified', () => {
    expect(CLACKAMAS_JR_DIVISIONS).toEqual([
      expect.objectContaining({ name: 'Kindy', priceCents: 6500, maxParticipants: null }),
      expect.objectContaining({ name: '1st/2nd Grade', priceCents: 7000, maxParticipants: null }),
      expect.objectContaining({ name: '3rd/4th Grade', priceCents: 10000, maxParticipants: null }),
      expect.objectContaining({ name: '4th/5th Grade', priceCents: 10000, maxParticipants: null }),
      expect.objectContaining({ name: '6th/7th Grade', priceCents: 12500, maxParticipants: null }),
      expect.objectContaining({ name: '7th/8th Grade', priceCents: 12500, maxParticipants: null }),
      expect.objectContaining({ name: '9th-12th Grade', priceCents: 12500, maxParticipants: null }),
    ]);
  });
});
