import type { Event } from '@/types';

const normalizeCapacity = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.trunc(numeric));
};

export const resolveEventParticipantCapacity = (
  event: Pick<Event, 'maxParticipants' | 'singleDivision' | 'divisionDetails'>,
): number => {
  const fallbackCapacity = normalizeCapacity(event.maxParticipants) ?? 0;
  if (event.singleDivision !== false) {
    return fallbackCapacity;
  }

  const detailRows = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
  const splitCapacity = detailRows.reduce((total, detail) => {
    const capacity = normalizeCapacity(detail?.maxParticipants);
    if (capacity && capacity > 0) {
      return total + capacity;
    }
    return total;
  }, 0);

  return splitCapacity > 0 ? splitCapacity : fallbackCapacity;
};
