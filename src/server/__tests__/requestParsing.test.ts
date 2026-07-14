import { findDollarPrefixedFields, parseDateInput } from '@/server/requestParsing';

describe('findDollarPrefixedFields', () => {
  it('reports nested obsolete aliases with stable paths', () => {
    expect(findDollarPrefixedFields({
      id: 'canonical',
      profile: {
        $id: 'obsolete',
        children: [{ $createdAt: 'obsolete' }, { name: 'canonical' }],
      },
    })).toEqual([
      'profile.$id',
      'profile.children[0].$createdAt',
    ]);
  });

  it('accepts canonical JSON and scalar values', () => {
    expect(findDollarPrefixedFields({ id: 'canonical', nested: [null, 1, 'value'] })).toEqual([]);
    expect(findDollarPrefixedFields(null)).toEqual([]);
  });
});

describe('parseDateInput', () => {
  it('preserves Date instances and parses valid scalar dates', () => {
    const date = new Date('2026-07-14T12:00:00.000Z');
    expect(parseDateInput(date)).toBe(date);
    expect(parseDateInput('2026-07-14T12:00:00.000Z')).toEqual(date);
  });

  it('returns null for absent or invalid values', () => {
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput('not-a-date')).toBeNull();
    expect(parseDateInput({})).toBeNull();
  });
});
