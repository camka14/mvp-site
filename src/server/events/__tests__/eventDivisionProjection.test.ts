import { projectRelationalEventDivisionIds } from '@/server/events/eventDivisionProjection';

describe('projectRelationalEventDivisionIds', () => {
  it('uses active relational divisions and ignores conflicting event JSON fields', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { eventId: 'event_1', id: 'division_open' },
      { eventId: 'event_1', id: 'division_competitive' },
    ]);

    const [event] = await projectRelationalEventDivisionIds(
      { divisions: { findMany } },
      [{
        id: 'event_1',
        divisions: ['stale_legacy_division'],
        divisionDetails: [{ id: 'stale_legacy_division' }],
        playoffDivisionDetails: [{ id: 'stale_legacy_playoff' }],
      }],
    );

    expect(event.divisions).toEqual(['division_open', 'division_competitive']);
    expect(event.divisionDetails).toBeUndefined();
    expect(event.playoffDivisionDetails).toBeUndefined();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        eventId: { in: ['event_1'] },
        scope: 'EVENT',
        status: 'ACTIVE',
        OR: [
          { kind: 'LEAGUE' },
          { kind: null },
        ],
      },
    }));
  });
});
