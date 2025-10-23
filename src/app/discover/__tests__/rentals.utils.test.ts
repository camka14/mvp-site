import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';
import type { TimeSlot } from '@/types';

describe('getNextRentalOccurrence', () => {
  const reference = new Date('2024-01-01T12:00:00Z');

  it('returns the start date for a non-repeating future slot', () => {
    const slot: TimeSlot = {
      $id: 'slot_1',
      dayOfWeek: 0,
      repeating: false,
      startDate: '2024-01-02T18:00:00',
    } as TimeSlot;

    const occurrence = getNextRentalOccurrence(slot, reference);

    expect(occurrence).not.toBeNull();
    expect(occurrence?.getTime()).toBe(new Date('2024-01-02T18:00:00').getTime());
  });

  it('returns null for a non-repeating slot in the past', () => {
    const slot: TimeSlot = {
      $id: 'slot_2',
      dayOfWeek: 1,
      repeating: false,
      startDate: '2023-12-15T10:00:00',
    } as TimeSlot;

    expect(getNextRentalOccurrence(slot, reference)).toBeNull();
  });

  it('returns the next weekly occurrence for a repeating slot', () => {
    const slot: TimeSlot = {
      $id: 'slot_3',
      dayOfWeek: 2, // Wednesday
      repeating: true,
      startDate: '2023-12-20T00:00:00',
      startTimeMinutes: 18 * 60,
      endTimeMinutes: 19 * 60,
    } as TimeSlot;

    const occurrence = getNextRentalOccurrence(slot, reference);

    expect(occurrence).not.toBeNull();
    expect(occurrence?.getTime()).toBe(new Date('2024-01-03T18:00:00').getTime());
  });

  it('respects the repeating end date', () => {
    const slot: TimeSlot = {
      $id: 'slot_4',
      dayOfWeek: 2,
      repeating: true,
      startDate: '2023-12-01T00:00:00',
      endDate: '2023-12-31T00:00:00',
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 10 * 60,
    } as TimeSlot;

    expect(getNextRentalOccurrence(slot, reference)).toBeNull();
  });
});
