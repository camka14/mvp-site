import { useState, type Dispatch, type SetStateAction } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import DiscoverMapModal from '../DiscoverMapModal';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import type { Event, Organization } from '@/types';
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
    MarkerF: ({ onClick, title }: any) => React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'map-marker',
        onClick,
        title,
      },
      title ?? 'Map marker',
    ),
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
  default: ({ unoptimized, ...props }: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ''} />;
  },
}));

const mockedEventService = eventService as jest.Mocked<typeof eventService>;
const mockedOrganizationService = organizationService as jest.Mocked<typeof organizationService>;

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => (
  Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111
);

const buildMapEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event-1',
  name: 'Riverside FC Pickup',
  description: 'Open play for local teams.',
  start: '2099-01-01T18:00:00.000Z',
  end: null,
  location: 'River City Sports Club',
  coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
  price: 0,
  imageId: null,
  hostId: null,
  state: 'PUBLISHED',
  maxParticipants: 24,
  teamSizeLimit: 1,
  teamSignup: false,
  singleDivision: true,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: null,
  registrationCutoffHours: null,
  seedColor: 0,
  $createdAt: '2098-12-01T00:00:00.000Z',
  $updatedAt: '2098-12-01T00:00:00.000Z',
  eventType: 'EVENT',
  sport: { $id: 'soccer', name: 'Soccer' } as Event['sport'],
  divisions: [],
  ...overrides,
} as Event);

const DEFAULT_EVENT_TAGS = [
  { id: 'tag-tryouts', name: 'Tryouts', slug: 'tryouts' },
  { id: 'tag-clinic', name: 'Clinic', slug: 'clinic' },
];

const renderModal = (
  location = VANCOUVER_WA_CENTER,
  options: {
    selectedTags?: string[];
    setSelectedTags?: Dispatch<SetStateAction<string[]>>;
  } = {},
) => renderWithMantine(
  <DiscoverMapModal
    opened
    onClose={jest.fn()}
    location={location}
    requestLocation={jest.fn()}
    kmBetween={kmBetween}
    selectedSports={[]}
    setSelectedSports={jest.fn()}
    selectedTags={options.selectedTags ?? []}
    setSelectedTags={options.setSelectedTags ?? jest.fn()}
    eventTags={DEFAULT_EVENT_TAGS}
    eventTagsLoading={false}
    eventTagsError={null}
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

const buildAffiliateRentalOrganization = (): Organization => ({
  $id: 'org-affiliate-rentals',
  name: 'Affiliate Rentals',
  location: 'Vancouver, WA',
  address: null,
  description: 'External rental inventory',
  logoId: null,
  ownerId: 'owner-1',
  website: 'https://example.com',
  sports: ['Soccer'],
  status: 'UNLISTED',
  coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
  productIds: [],
  fields: [],
  facilities: [
    {
      $id: 'facility-affiliate',
      name: 'Affiliate Indoor Court',
      organizationId: 'org-affiliate-rentals',
      location: 'Vancouver, WA',
      address: '100 Main St, Vancouver, WA',
      coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
      operatingHours: null,
      timeZone: 'America/Los_Angeles',
      status: 'ACTIVE',
      isDefault: false,
      sortOrder: null,
      affiliateUrl: 'https://example.com/book',
    },
  ],
  events: [],
  teams: [],
  officials: [],
  hosts: [],
  products: [],
} as unknown as Organization);

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
        selectedSports={[]}
        setSelectedSports={jest.fn()}
        selectedTags={[]}
        setSelectedTags={jest.fn()}
        eventTags={DEFAULT_EVENT_TAGS}
        eventTagsLoading={false}
        eventTagsError={null}
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

  it('uses event tags instead of event types in the map event filter', async () => {
    renderModal(VANCOUVER_WA_CENTER, { selectedTags: ['Tryouts'] });

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
    });

    expect(mockedEventService.getEventsPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['Tryouts'],
      }),
      100,
      0,
    );
    expect(mockedEventService.getEventsPaginated).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventTypes: expect.any(Array),
      }),
      expect.any(Number),
      expect.any(Number),
    );
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getAllByText('Tryouts').length).toBeGreaterThan(0);
    expect(screen.queryByText('Event Type')).not.toBeInTheDocument();
    expect(screen.queryByText('Tournament')).not.toBeInTheDocument();
  });

  it('groups touching event markers into a count marker', async () => {
    mockedEventService.getEventsPaginated.mockResolvedValue([
      buildMapEvent({
        $id: 'riverside-pickup',
        name: 'Riverside FC Pickup',
        coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
      }),
      buildMapEvent({
        $id: 'cascade-clinic',
        name: 'Cascade Crew Clinic',
        coordinates: [VANCOUVER_WA_CENTER.lng + 0.0001, VANCOUVER_WA_CENTER.lat + 0.0001],
      }),
      buildMapEvent({
        $id: 'harbor-league',
        name: 'Harbor Strikers League',
        coordinates: [VANCOUVER_WA_CENTER.lng + 0.2, VANCOUVER_WA_CENTER.lat + 0.2],
      }),
    ]);

    renderModal();

    const clusterMarker = await screen.findByRole('button', { name: '2 events' });
    expect(clusterMarker).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riverside FC Pickup' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Harbor Strikers League' })).toBeInTheDocument();

    fireEvent.click(clusterMarker);

    expect(await screen.findByText('Riverside FC Pickup')).toBeInTheDocument();
    expect(screen.getByText('Cascade Crew Clinic')).toBeInTheDocument();
  });

  it('shows affiliate rental facilities on the rentals map and opens their affiliate URL', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    mockedOrganizationService.listOrganizationsWithFields.mockResolvedValue([
      buildAffiliateRentalOrganization(),
    ]);

    renderModal();

    await waitFor(() => {
      expect(mockedOrganizationService.listOrganizationsWithFields).toHaveBeenCalledWith(
        100,
        { includeAffiliateRentals: true },
      );
    });

    fireEvent.change(screen.getAllByLabelText('Map search category')[0], {
      target: { value: 'Rentals' },
    });
    fireEvent.click(await screen.findByText('Rentals'));

    const marker = await screen.findByRole('button', { name: 'Affiliate Indoor Court' });
    fireEvent.click(marker);

    fireEvent.click(await screen.findByRole('button', { name: 'Open booking' }));

    expect(openSpy).toHaveBeenCalledWith('https://example.com/book', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });
});
