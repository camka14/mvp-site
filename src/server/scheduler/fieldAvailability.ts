import { League, Tournament } from './types';

type SchedulerEvent = League | Tournament;

const normalizeFieldIds = (slot: { fieldIds?: unknown; field?: unknown }): string[] => {
  if (Array.isArray(slot.fieldIds) && slot.fieldIds.length) {
    return Array.from(
      new Set(
        slot.fieldIds
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0),
      ),
    );
  }
  if (typeof slot.field === 'string' && slot.field.trim().length > 0) {
    return [slot.field.trim()];
  }
  return [];
};

/**
 * Event time slots represent availability windows for scheduling. They may also
 * be attached to fields as rental slots for UI hydration, but those same slots
 * must not be interpreted as blocking events by the scheduler.
 */
export const stripEventAvailabilityFromFieldRentalSlots = (event: SchedulerEvent): void => {
  if (!event.timeSlots.length) {
    return;
  }

  const eventSlotFieldIds = new Map<string, Set<string>>();
  for (const slot of event.timeSlots) {
    const slotId = typeof slot?.id === 'string' ? slot.id.trim() : '';
    if (!slotId) {
      continue;
    }
    eventSlotFieldIds.set(slotId, new Set(normalizeFieldIds(slot)));
  }
  if (!eventSlotFieldIds.size) {
    return;
  }

  for (const field of Object.values(event.fields)) {
    if (!Array.isArray(field.rentalSlots) || field.rentalSlots.length === 0) {
      continue;
    }
    field.rentalSlots = field.rentalSlots.filter((slot) => {
      const slotId = typeof slot?.id === 'string' ? slot.id.trim() : '';
      if (!slotId) {
        return true;
      }
      const scheduledFieldIds = eventSlotFieldIds.get(slotId);
      if (!scheduledFieldIds) {
        return true;
      }
      if (!scheduledFieldIds.size) {
        return false;
      }
      return !scheduledFieldIds.has(field.id);
    });
  }
};
