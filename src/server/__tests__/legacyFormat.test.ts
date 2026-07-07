import { withLegacyFields } from '@/server/legacyFormat';

describe('withLegacyFields', () => {
  it('fills open-ended event end values from start for mobile compatibility', () => {
    const start = new Date('2026-07-08T01:15:00.000Z');

    const row = withLegacyFields({
      id: 'event_1',
      start,
      end: null,
      noFixedEndDateTime: true,
    });

    expect(row.end).toBe(start);
    expect(row.$id).toBe('event_1');
  });

  it('preserves null end values when the row is not an open-ended event', () => {
    const row = withLegacyFields({
      id: 'row_1',
      start: new Date('2026-07-08T01:15:00.000Z'),
      end: null,
      noFixedEndDateTime: false,
    });

    expect(row.end).toBeNull();
  });
});
