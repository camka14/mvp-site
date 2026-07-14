import {
  parseMatchInstantInput,
  serializeInstantField,
  serializeMatchRecord,
} from '@/server/matches/instantPayloads';

describe('match instant payload helpers', () => {
  it('serializes date fields to ISO instants', () => {
    const serialized = serializeMatchRecord({
      id: 'match_1',
      $id: 'obsolete_match_1',
      $createdAt: '2020-01-01T00:00:00.000Z',
      start: new Date('2026-07-11T16:30:00.000Z'),
      end: new Date('2026-07-11T17:45:00.000Z'),
      actualStart: null,
      actualEnd: new Date('2026-07-11T17:50:00.000Z'),
    });

    expect(serialized).toEqual(expect.objectContaining({
      id: 'match_1',
      start: '2026-07-11T16:30:00.000Z',
      end: '2026-07-11T17:45:00.000Z',
      actualStart: null,
      actualEnd: '2026-07-11T17:50:00.000Z',
    }));
    expect(serialized).not.toHaveProperty('$id');
    expect(serialized).not.toHaveProperty('$createdAt');
  });

  it('accepts only explicit-offset instant strings', () => {
    expect(parseMatchInstantInput('2026-07-11T09:30:00-07:00')?.toISOString())
      .toBe('2026-07-11T16:30:00.000Z');
    expect(parseMatchInstantInput('2026-07-11T09:30:00')).toBeNull();
    expect(serializeInstantField('2026-07-11T09:30:00')).toBeNull();
  });
});
