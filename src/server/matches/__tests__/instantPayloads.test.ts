import {
  parseMatchInstantInput,
  serializeInstantField,
  serializeMatchRecordLegacy,
} from '@/server/matches/instantPayloads';

describe('match instant payload helpers', () => {
  it('serializes date fields to ISO instants', () => {
    const serialized = serializeMatchRecordLegacy({
      id: 'match_1',
      start: new Date('2026-07-11T16:30:00.000Z'),
      end: new Date('2026-07-11T17:45:00.000Z'),
      actualStart: null,
      actualEnd: new Date('2026-07-11T17:50:00.000Z'),
    });

    expect(serialized).toEqual(expect.objectContaining({
      $id: 'match_1',
      start: '2026-07-11T16:30:00.000Z',
      end: '2026-07-11T17:45:00.000Z',
      actualStart: null,
      actualEnd: '2026-07-11T17:50:00.000Z',
    }));
  });

  it('accepts only explicit-offset instant strings', () => {
    expect(parseMatchInstantInput('2026-07-11T09:30:00-07:00')?.toISOString())
      .toBe('2026-07-11T16:30:00.000Z');
    expect(parseMatchInstantInput('2026-07-11T09:30:00')).toBeNull();
    expect(serializeInstantField('2026-07-11T09:30:00')).toBeNull();
  });
});
