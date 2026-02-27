/** @jest-environment node */

import {
  buildCanonicalRewritePlan,
  normalizeBaseSlotId,
  type EventSlotRefRow,
  type FieldSlotRefRow,
  type TimeSlotRow,
} from '../rewrite-timeslots-canonical';

describe('rewrite-timeslots-canonical', () => {
  it('groups legacy expanded rows into canonical rows and remaps event/field slot ids', () => {
    const rows: TimeSlotRow[] = [
      {
        id: 'slot_multi__d1__ffield_a',
        dayOfWeek: 1,
        daysOfWeek: [1],
        startTimeMinutes: 540,
        endTimeMinutes: 600,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-03-01T00:00:00.000Z'),
        repeating: true,
        scheduledFieldId: 'field_a',
        scheduledFieldIds: ['field_a'],
        price: null,
        divisions: ['open'],
        requiredTemplateIds: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-10T00:00:00.000Z'),
      },
      {
        id: 'slot_multi__d3__ffield_b',
        dayOfWeek: 3,
        daysOfWeek: [3],
        startTimeMinutes: 540,
        endTimeMinutes: 600,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-03-01T00:00:00.000Z'),
        repeating: true,
        scheduledFieldId: 'field_b',
        scheduledFieldIds: ['field_b'],
        price: null,
        divisions: ['open'],
        requiredTemplateIds: [],
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-11T00:00:00.000Z'),
      },
      {
        id: 'slot_unique',
        dayOfWeek: 2,
        daysOfWeek: [2],
        startTimeMinutes: 600,
        endTimeMinutes: 660,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        repeating: true,
        scheduledFieldId: 'field_c',
        scheduledFieldIds: ['field_c'],
        price: null,
        divisions: ['open'],
        requiredTemplateIds: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-12T00:00:00.000Z'),
      },
    ];

    const events: EventSlotRefRow[] = [
      { id: 'event_1', timeSlotIds: ['slot_multi__d1__ffield_a', 'slot_multi__d3__ffield_b', 'slot_unique'] },
    ];
    const fields: FieldSlotRefRow[] = [
      { id: 'field_a', rentalSlotIds: ['slot_multi__d3__ffield_b', 'slot_multi__d1__ffield_a'] },
    ];

    const plan = buildCanonicalRewritePlan(rows, events, fields);

    const multiSlot = plan.canonicalSlots.find((slot) => slot.sourceIds.length === 2);
    expect(multiSlot).toBeTruthy();
    expect(multiSlot?.id).toBe('slot_multi');
    expect(multiSlot?.daysOfWeek).toEqual([1, 3]);
    expect(multiSlot?.scheduledFieldIds).toEqual(['field_a', 'field_b']);

    expect(plan.eventUpdates).toEqual([
      {
        id: 'event_1',
        timeSlotIds: ['slot_multi', 'slot_unique'],
      },
    ]);
    expect(plan.fieldUpdates).toEqual([
      {
        id: 'field_a',
        rentalSlotIds: ['slot_multi'],
      },
    ]);
    expect(plan.staleSlotIds.sort()).toEqual(['slot_multi__d1__ffield_a', 'slot_multi__d3__ffield_b']);
  });

  it('reports conflict base ids when one legacy base id maps to multiple logical groups', () => {
    const rows: TimeSlotRow[] = [
      {
        id: 'slot_conflict__d1',
        dayOfWeek: 1,
        daysOfWeek: [1],
        startTimeMinutes: 540,
        endTimeMinutes: 600,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        repeating: true,
        scheduledFieldId: 'field_a',
        scheduledFieldIds: ['field_a'],
        price: null,
        divisions: ['open'],
        requiredTemplateIds: [],
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'slot_conflict__d3',
        dayOfWeek: 3,
        daysOfWeek: [3],
        startTimeMinutes: 600,
        endTimeMinutes: 660,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        repeating: true,
        scheduledFieldId: 'field_a',
        scheduledFieldIds: ['field_a'],
        price: null,
        divisions: ['open'],
        requiredTemplateIds: [],
        createdAt: null,
        updatedAt: null,
      },
    ];

    const plan = buildCanonicalRewritePlan(rows, [], []);

    expect(plan.canonicalSlots).toHaveLength(2);
    expect(plan.conflictBaseIds).toEqual([normalizeBaseSlotId('slot_conflict__d1')]);
  });
});
