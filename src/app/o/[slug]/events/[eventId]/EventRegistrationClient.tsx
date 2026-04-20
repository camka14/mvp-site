'use client';

import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import type { Event } from '@/types';

export default function EventRegistrationClient({ event }: { event: Event }) {
  return (
    <EventDetailSheet
      event={event}
      isOpen
      onClose={() => undefined}
      renderInline
    />
  );
}
