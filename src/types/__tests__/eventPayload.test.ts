import { toEventPayload, type Event } from '@/types';

const baseEvent = (): Event => ({
  $id: 'event_1',
  name: 'League Event',
  start: '2026-01-01T00:00:00.000Z',
  end: '2026-01-02T00:00:00.000Z',
  eventType: 'LEAGUE',
} as unknown as Event);

describe('toEventPayload division teamIds serialization', () => {
  it('omits division teamIds when the source division does not define teamIds', () => {
    const event = {
      ...baseEvent(),
      divisions: ['event_1__division__open'],
      divisionDetails: [
        {
          id: 'event_1__division__open',
          key: 'open',
          name: 'Open',
        },
      ],
    } as Event;

    const payload = toEventPayload(event);
    expect(payload.divisionDetails?.[0]).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(payload.divisionDetails?.[0] ?? {}, 'teamIds')).toBe(false);
  });

  it('includes division teamIds when the source division explicitly defines teamIds', () => {
    const event = {
      ...baseEvent(),
      divisions: ['event_1__division__open'],
      divisionDetails: [
        {
          id: 'event_1__division__open',
          key: 'open',
          name: 'Open',
          teamIds: ['team_1', 'team_2'],
        },
      ],
    } as Event;

    const payload = toEventPayload(event);
    expect(payload.divisionDetails?.[0]).toBeDefined();
    expect(payload.divisionDetails?.[0]?.teamIds).toEqual(['team_1', 'team_2']);
  });

  it('serializes timeslot ids as id instead of $id', () => {
    const event = {
      ...baseEvent(),
      timeSlots: [
        {
          $id: 'slot_1',
          dayOfWeek: 1,
          daysOfWeek: [1, 3],
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          startTimeMinutes: 540,
          endTimeMinutes: 780,
          repeating: true,
        },
      ],
    } as Event;

    const payload = toEventPayload(event);

    expect(payload.timeSlots?.[0]).toEqual(expect.objectContaining({
      id: 'slot_1',
      dayOfWeek: 1,
      daysOfWeek: [1, 3],
      scheduledFieldId: 'field_1',
      scheduledFieldIds: ['field_1'],
      startTimeMinutes: 540,
      endTimeMinutes: 780,
      repeating: true,
    }));
    expect(Object.prototype.hasOwnProperty.call(payload.timeSlots?.[0] ?? {}, '$id')).toBe(false);
  });
});
