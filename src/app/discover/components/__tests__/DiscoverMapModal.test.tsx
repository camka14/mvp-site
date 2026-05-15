import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import DiscoverMapModal from '../DiscoverMapModal';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';

const VANCOUVER_WA_CENTER = { lat: 45.6387, lng: -122.6615 };

let mockMapCenter = { ...VANCOUVER_WA_CENTER };

const mockMap = {
  getCenter: jest.fn(() => ({
    lat: () => mockMapCenter.lat,
    lng: () => mockMapCenter.lng,
  })),
  getBounds: jest.fn(() => ({
    getNorthEast: () => ({
      lat: () => mockMapCenter.lat + 0.45,
      lng: () => mockMapCenter.lng,
    }),
    getSouthWest: () => ({
      lat: () => mockMapCenter.lat - 0.45,
      lng: () => mockMapCenter.lng,
    }),
  })),
  getZoom: jest.fn(() => 11),
  panTo: jest.fn(),
  setZoom: jest.fn(),
};

jest.mock('@react-google-maps/api', () => {
  const React = require('react');

  return {
    GoogleMap: ({ children, onDragStart, onIdle, onLoad }: any) => {
      const loadedRef = React.useRef(false);

      React.useEffect(() => {
        if (!loadedRef.current) {
          loadedRef.current = true;
          onLoad?.(mockMap);
          onIdle?.();
        }
      }, [onIdle, onLoad]);

      return React.createElement(
        'div',
        { 'data-testid': 'google-map' },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              mockMapCenter = { lat: VANCOUVER_WA_CENTER.lat + 0.05, lng: VANCOUVER_WA_CENTER.lng };
              onDragStart?.();
              onIdle?.();
            },
          },
          'Simulate map idle',
        ),
        children,
      );
    },
    InfoWindowF: ({ children }: any) => React.createElement('div', null, children),
    MarkerF: () => React.createElement('span', { 'data-testid': 'map-marker' }),
    OVERLAY_LAYER: 'overlayLayer',
    OverlayViewF: ({ children }: any) => React.createElement('div', null, children),
    useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
  };
});

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventsPaginated: jest.fn(),
  },
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    listOrganizationsWithFields: jest.fn(),
  },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ''} />;
  },
}));

const mockedEventService = eventService as jest.Mocked<typeof eventService>;
const mockedOrganizationService = organizationService as jest.Mocked<typeof organizationService>;

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => (
  Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111
);

const renderModal = (location = VANCOUVER_WA_CENTER) => renderWithMantine(
  <DiscoverMapModal
    opened
    onClose={jest.fn()}
    location={location}
    requestLocation={jest.fn()}
    kmBetween={kmBetween}
    selectedEventTypes={['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT']}
    setSelectedEventTypes={jest.fn()}
    eventTypeOptions={['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'] as const}
    selectedSports={[]}
    setSelectedSports={jest.fn()}
    sports={[]}
    sportsLoading={false}
    sportsError={null}
    maxDistance={null}
    setMaxDistance={jest.fn()}
    selectedStartDate={null}
    setSelectedStartDate={jest.fn()}
    selectedEndDate={null}
    setSelectedEndDate={jest.fn()}
    defaultMaxDistance={50}
    onEventClick={jest.fn()}
    onOrganizationClick={jest.fn()}
  />,
);

function CurrentLocationHarness() {
  const [location, setLocation] = useState(VANCOUVER_WA_CENTER);

  return (
    <>
      <button
        type="button"
        onClick={() => setLocation({ ...VANCOUVER_WA_CENTER })}
      >
        Re-emit Vancouver location
      </button>
      <DiscoverMapModal
        opened
        onClose={jest.fn()}
        location={location}
        requestLocation={jest.fn()}
        kmBetween={kmBetween}
        selectedEventTypes={['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT']}
        setSelectedEventTypes={jest.fn()}
        eventTypeOptions={['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'] as const}
        selectedSports={[]}
        setSelectedSports={jest.fn()}
        sports={[]}
        sportsLoading={false}
        sportsError={null}
        maxDistance={null}
        setMaxDistance={jest.fn()}
        selectedStartDate={null}
        setSelectedStartDate={jest.fn()}
        selectedEndDate={null}
        setSelectedEndDate={jest.fn()}
        defaultMaxDistance={50}
        onEventClick={jest.fn()}
        onOrganizationClick={jest.fn()}
      />
    </>
  );
}

describe('DiscoverMapModal', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    mockMapCenter = { ...VANCOUVER_WA_CENTER };
    mockedEventService.getEventsPaginated.mockResolvedValue([]);
    mockedOrganizationService.listOrganizationsWithFields.mockResolvedValue([]);
  });

  it('loads the Vancouver area on open, then waits for Search this area before refreshing after map movement', async () => {
    renderModal();

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Simulate map idle' }));

    const searchAreaButton = await screen.findByRole('button', { name: 'Search this area' });
    expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);

    fireEvent.click(searchAreaButton);

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(2);
    });
  });

  it('does not repeat the initial Vancouver-area load when the same current location is re-emitted', async () => {
    renderWithMantine(<CurrentLocationHarness />);

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Re-emit Vancouver location' }));

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });

    expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
  });
});
