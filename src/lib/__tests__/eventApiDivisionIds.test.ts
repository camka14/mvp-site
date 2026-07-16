import { resolveRelationalEventDivisionIds } from '@/lib/eventApiDivisionIds';

describe('resolveRelationalEventDivisionIds', () => {
  it('uses relational division detail ids', () => {
    expect(resolveRelationalEventDivisionIds([
      { id: 'event_1__division__open' },
      { id: ' event_1__division__adult ' },
      { id: 'event_1__division__open' },
    ])).toEqual([
      'event_1__division__open',
      'event_1__division__adult',
    ]);
  });

  it('does not fall back to legacy event fields', () => {
    expect(resolveRelationalEventDivisionIds(null)).toEqual([]);
  });
});
