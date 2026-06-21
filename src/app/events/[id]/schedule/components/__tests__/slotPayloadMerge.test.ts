import { mergeSlotPayloadsForForm } from '../slotPayloadMerge';

describe('mergeSlotPayloadsForForm', () => {
  it('merges expanded rows that share the same slot base id', () => {
    const merged = mergeSlotPayloadsForForm([
      {
        $id: 'slot_1__ffield_1',
        dayOfWeek: 5,
        startTimeMinutes: 540,
        endTimeMinutes: 900,
        repeating: true,
        scheduledFieldId: 'field_1',
        divisions: ['event_1__division__open'],
      } as any,
      {
        $id: 'slot_1__ffield_2',
        dayOfWeek: 5,
        startTimeMinutes: 540,
        endTimeMinutes: 900,
        repeating: true,
        scheduledFieldId: 'field_2',
        divisions: ['event_1__division__open'],
      } as any,
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      $id: 'slot_1',
      dayOfWeek: 5,
      daysOfWeek: [5],
      scheduledFieldIds: ['field_1', 'field_2'],
      startTimeMinutes: 540,
      endTimeMinutes: 900,
    });
  });

  it('keeps distinct base slot ids separate even when schedule values match', () => {
    const merged = mergeSlotPayloadsForForm([
      {
        $id: 'slot_1__ffield_1',
        dayOfWeek: 5,
        startTimeMinutes: 540,
        endTimeMinutes: 900,
        repeating: true,
        scheduledFieldId: 'field_1',
        divisions: ['event_1__division__open'],
      } as any,
      {
        $id: 'slot_2__ffield_1',
        dayOfWeek: 6,
        startTimeMinutes: 540,
        endTimeMinutes: 900,
        repeating: true,
        scheduledFieldId: 'field_1',
        divisions: ['event_1__division__open'],
      } as any,
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.$id).toBe('slot_1');
    expect(merged[0]?.daysOfWeek).toEqual([5]);
    expect(merged[1]?.$id).toBe('slot_2');
    expect(merged[1]?.daysOfWeek).toEqual([6]);
  });

  it('preserves rental booking metadata when merging slot payloads for the form', () => {
    const merged = mergeSlotPayloadsForForm([
      {
        $id: 'slot_rental_1',
        dayOfWeek: 3,
        daysOfWeek: [3],
        startTimeMinutes: 900,
        endTimeMinutes: 960,
        repeating: false,
        scheduledFieldId: 'rental_field_1',
        scheduledFieldIds: ['rental_field_1'],
        divisions: ['open'],
        startDate: '2026-03-12T15:00:00.000Z',
        endDate: '2026-03-12T16:00:00.000Z',
        sourceType: 'RENTAL_BOOKING',
        rentalBookingId: 'booking_1',
        rentalBookingItemId: 'booking_item_1',
        rentalLocked: true,
        price: 5000,
        requiredTemplateIds: ['template_1'],
        hostRequiredTemplateIds: ['host_template_1'],
      } as any,
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      $id: 'slot_rental_1',
      scheduledFieldId: 'rental_field_1',
      scheduledFieldIds: ['rental_field_1'],
      sourceType: 'RENTAL_BOOKING',
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'booking_item_1',
      rentalLocked: true,
      price: 5000,
      requiredTemplateIds: ['template_1'],
      hostRequiredTemplateIds: ['host_template_1'],
    });
  });
});
