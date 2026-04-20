'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import type { Event } from '@/types';

type SelectedWeeklyOccurrence = {
  slotId: string;
  occurrenceDate: string;
} | null;

export default function EventRegistrationClient({
  event,
  selectedOccurrence = null,
  publicCompletion,
}: {
  event: Event;
  selectedOccurrence?: SelectedWeeklyOccurrence;
  publicCompletion?: {
    slug: string;
    redirectUrl?: string | null;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleWeeklyOccurrenceChange = (occurrence: SelectedWeeklyOccurrence) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (occurrence) {
      params.set('slotId', occurrence.slotId);
      params.set('occurrenceDate', occurrence.occurrenceDate);
    } else {
      params.delete('slotId');
      params.delete('occurrenceDate');
    }
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl);
  };

  return (
    <EventDetailSheet
      event={event}
      isOpen
      onClose={() => undefined}
      renderInline
      selectedOccurrence={selectedOccurrence}
      onWeeklyOccurrenceChange={handleWeeklyOccurrenceChange}
      publicCompletion={publicCompletion}
    />
  );
}
