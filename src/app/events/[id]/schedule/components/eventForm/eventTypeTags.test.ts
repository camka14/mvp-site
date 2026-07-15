import {
  getLockedEventTypeTagSlugs,
  isEventTypeTag,
  syncEventTypeTagsForEventType,
} from './eventTypeTags';

describe('event type tags', () => {
  it('locks Tryouts and replaces stale event type tags', () => {
    expect(getLockedEventTypeTagSlugs('TRYOUT')).toEqual(['tryouts']);
    expect(isEventTypeTag({ name: 'Tryouts', slug: 'tryouts' })).toBe(true);
    expect(syncEventTypeTagsForEventType([
      { name: 'League', slug: 'league' },
      { name: 'Clinic', slug: 'clinic' },
    ], 'TRYOUT')).toEqual([
      { name: 'Clinic', slug: 'clinic' },
      { name: 'Tryouts', slug: 'tryouts' },
    ]);
  });
});
