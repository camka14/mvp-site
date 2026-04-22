import { createRef } from 'react';
import { screen } from '@testing-library/react';

import EventsTabContent from '../EventsTabContent';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';

jest.mock('@/components/location/LocationSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="location-search" />,
}));

jest.mock('@/components/ui/EventCard', () => ({
  __esModule: true,
  default: () => <div data-testid="event-card" />,
}));

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/Loading', () => ({
  __esModule: true,
  default: ({ text }: { text?: string }) => <div>{text ?? 'Loading...'}</div>,
}));

describe('EventsTabContent', () => {
  it('disables organization event creation and shows the field warning', () => {
    renderWithMantine(
      <EventsTabContent
        location={null}
        searchTerm=""
        setSearchTerm={jest.fn()}
        selectedEventTypes={['EVENT', 'TOURNAMENT']}
        setSelectedEventTypes={jest.fn()}
        eventTypeOptions={['EVENT', 'TOURNAMENT'] as const}
        selectedSports={[]}
        setSelectedSports={jest.fn()}
        maxDistance={null}
        setMaxDistance={jest.fn()}
        selectedStartDate={null}
        setSelectedStartDate={jest.fn()}
        selectedEndDate={null}
        setSelectedEndDate={jest.fn()}
        sports={[]}
        sportsLoading={false}
        sportsError={null}
        defaultMaxDistance={50}
        kmBetween={jest.fn(() => 0)}
        events={[]}
        isLoadingInitial={false}
        isLoadingMore={false}
        hasMoreEvents={false}
        sentinelRef={createRef<HTMLDivElement>()}
        eventsError={null}
        onEventClick={jest.fn()}
        onCreateEvent={jest.fn()}
        showCreateEventButton
        createEventDisabled
        createEventHelperText="Create a field for this organization before creating an event."
      />,
    );

    expect(screen.getByRole('button', { name: 'Create event' })).toBeDisabled();
    expect(
      screen.getByText('Create a field for this organization before creating an event.'),
    ).toBeInTheDocument();
  });
});
