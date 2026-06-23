import type { RefObject } from 'react';
import { Tabs } from '@mantine/core';

import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import type { Event, Organization, UserData } from '@/types';
import EventForm, { type EventFormHandle } from '../components/EventForm';
import type { DefaultLocation, RentalPurchaseContext } from '../components/eventForm/types';
import type { WeeklyOccurrenceSelection } from './helpers';

type DetailsTabPanelProps = {
  shouldShowCreationSheet: boolean;
  user: UserData | null | undefined;
  eventFormRenderKey: string;
  eventFormRef: RefObject<EventFormHandle | null>;
  isActive: boolean;
  onClose: () => void;
  onDirtyStateChange: (hasChanges: boolean) => void;
  event: Event;
  organization: Organization | null;
  defaultLocation?: DefaultLocation;
  isCreateMode: boolean;
  immutableDefaults?: Partial<Event>;
  rentalPurchase?: RentalPurchaseContext;
  templateOrganizationId?: string;
  selectedOccurrence: WeeklyOccurrenceSelection | null;
  onWeeklyOccurrenceChange: (occurrence: { slotId: string; occurrenceDate: string } | null) => void;
};

export default function DetailsTabPanel({
  shouldShowCreationSheet,
  user,
  eventFormRenderKey,
  eventFormRef,
  isActive,
  onClose,
  onDirtyStateChange,
  event,
  organization,
  defaultLocation,
  isCreateMode,
  immutableDefaults,
  rentalPurchase,
  templateOrganizationId,
  selectedOccurrence,
  onWeeklyOccurrenceChange,
}: DetailsTabPanelProps) {
  return (
    <Tabs.Panel value="details" pt="md">
      {shouldShowCreationSheet && user ? (
        <EventForm
          key={eventFormRenderKey}
          ref={eventFormRef}
          isOpen={isActive}
          onClose={onClose}
          onDirtyStateChange={onDirtyStateChange}
          currentUser={user}
          event={event}
          organization={organization}
          defaultLocation={defaultLocation}
          isCreateMode={isCreateMode}
          immutableDefaults={isCreateMode ? immutableDefaults : undefined}
          rentalPurchase={isCreateMode ? rentalPurchase : undefined}
          templateOrganizationId={isCreateMode ? templateOrganizationId : undefined}
        />
      ) : (
        <EventDetailSheet
          event={event}
          isOpen={isActive}
          renderInline
          selectedOccurrence={selectedOccurrence}
          onWeeklyOccurrenceChange={onWeeklyOccurrenceChange}
          onClose={onClose}
        />
      )}
    </Tabs.Panel>
  );
}
