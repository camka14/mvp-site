import { act, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import DiscoverPage from '../page';

const pushMock = jest.fn();
const listOrganizationsMock = jest.fn();
const getEventsPageMock = jest.fn();
const searchOpenRegistrationTeamsMock = jest.fn();
const mockSportsResult: { sports: Array<{ $id: string; name: string }>; loading: boolean; error: null } = {
  sports: [],
  loading: false,
  error: null,
};
let navigationSearchParams = 'tab=organizations';
let mockLocation: { lat: number; lng: number } | null = null;
let intersectionCallbacks: IntersectionObserverCallback[] = [];

jest.mock('next/navigation', () => ({
  usePathname: () => '/discover',
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(navigationSearchParams),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => ({
    user: null,
    loading: false,
    isAuthenticated: false,
    isGuest: true,
  }),
}));

jest.mock('@/app/hooks/useLocation', () => ({
  useLocation: () => ({
    location: mockLocation,
    locationInfo: mockLocation ? { city: 'New York', state: 'NY', formattedAddress: 'New York, NY' } : null,
    requestLocation: jest.fn().mockResolvedValue(undefined),
    setLocationFromInfo: jest.fn(),
  }),
}));

jest.mock('@/app/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => mockSportsResult,
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    listOrganizationsWithFieldsPage: (...args: unknown[]) => listOrganizationsMock(...args),
  },
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventsPage: (...args: unknown[]) => getEventsPageMock(...args),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    searchOpenRegistrationTeamsPage: (...args: unknown[]) => searchOpenRegistrationTeamsMock(...args),
  },
}));

jest.mock('@/components/layout/Navigation', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/Loading', () => ({
  __esModule: true,
  default: ({ text }: { text?: string }) => <div>{text ?? 'Loading'}</div>,
}));

jest.mock('@/components/ui/OrganizationCard', () => ({
  __esModule: true,
  default: ({ organization }: { organization: { name: string } }) => (
    <div data-testid="organization-card">{organization.name}</div>
  ),
}));

jest.mock('@/components/ui/TeamCard', () => ({
  __esModule: true,
  default: ({
    team,
    actions,
  }: {
    team: { $id: string; affiliateUrl?: string | null };
    actions?: React.ReactNode;
  }) => (
    <div data-testid={`team-card-${team.$id}`}>
      {actions}
      {team.affiliateUrl?.trim() ? <span>External registration</span> : null}
    </div>
  ),
}));

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../components/EventsTabContent', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/DiscoverSearchControls', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/DiscoverMapModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/DivisionDiscoveryFilters', () => ({
  __esModule: true,
  default: () => <div data-testid="division-discovery-filters">Division filters</div>,
}));

describe('Discover organization loading', () => {
  beforeEach(() => {
    pushMock.mockReset();
    listOrganizationsMock.mockReset();
    intersectionCallbacks = [];
    navigationSearchParams = 'tab=organizations';
    mockLocation = null;
    mockSportsResult.sports = [];
    getEventsPageMock.mockReset();
    searchOpenRegistrationTeamsMock.mockReset();
    getEventsPageMock.mockResolvedValue({
      events: [],
      pagination: { limit: 18, offset: 0, nextOffset: 0, hasMore: false, totalCount: 0 },
    });
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    listOrganizationsMock.mockResolvedValue({
      organizations: [{
        $id: 'org_1',
        name: 'Rose City Sports',
        description: 'Community sports club',
        coordinates: [-122.6765, 45.5231],
        sports: [],
        tags: [],
      }],
      pagination: {
        limit: 100,
        offset: 0,
        nextOffset: 1,
        hasMore: false,
      },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    }) as jest.Mock;
    global.IntersectionObserver = class IntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [];
    } as unknown as typeof IntersectionObserver;
  });

  it('loads the first organization page once and clears the loading state', async () => {
    const { container } = renderWithMantine(<DiscoverPage />);

    expect(await screen.findByTestId('organization-card')).toHaveTextContent('Rose City Sports');
    await waitFor(() => {
      expect(screen.queryByText('Loading organizations...')).not.toBeInTheDocument();
    });
    expect(container.querySelector('aside')).toContainElement(
      screen.getByTestId('division-discovery-filters'),
    );
    expect(listOrganizationsMock).toHaveBeenCalledTimes(1);
  });

  it('restores organization filters from the URL and keeps them shareable', async () => {
    navigationSearchParams = [
      'tab=organizations',
      'q=rose',
      'sport=Soccer',
      'tags=club',
      'genders=C',
      'skillDivisionTypeIds=competitive',
      'ageDivisionTypeIds=u18',
      'priceMin=10',
      'priceMax=75.5',
    ].join('&');
    mockSportsResult.sports = [{ $id: 'soccer', name: 'Soccer' }];
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    renderWithMantine(<DiscoverPage />);

    await waitFor(() => {
      expect(listOrganizationsMock).toHaveBeenCalledWith(100, 0, expect.objectContaining({
        query: 'rose',
        tagSlugs: ['club'],
        sports: ['Soccer'],
        divisionGenders: ['C'],
        skillDivisionTypeIds: ['competitive'],
        ageDivisionTypeIds: ['u18'],
        divisionPriceMin: 1000,
        divisionPriceMax: 7550,
      }));
      expect(window.location.search).toContain('tab=organizations');
      expect(window.location.search).toContain('sport=Soccer');
      expect(window.location.search).toContain('tags=club');
      expect(window.location.search).toContain('skillDivisionTypeIds=competitive');
      expect(window.location.search).toContain('priceMax=75.5');
    });
  });

  it('sends organization text and area filters to the server before pagination', async () => {
    navigationSearchParams = [
      'tab=organizations',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
      'distanceMiles=50',
    ].join('&');
    mockLocation = { lat: 45.5231, lng: -122.6765 };
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    renderWithMantine(<DiscoverPage />);

    await waitFor(() => {
      expect(listOrganizationsMock).toHaveBeenCalledWith(100, 0, expect.objectContaining({
        query: 'Salmon Creek',
        area: {
          lat: 45.5231,
          lng: -122.6765,
          radiusKm: expect.closeTo(80.467, 3),
        },
      }));
    });
  });

  it('sends rental text and area filters to the server before pagination', async () => {
    navigationSearchParams = [
      'tab=rentals',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
      'distanceMiles=50',
    ].join('&');
    mockLocation = { lat: 45.5231, lng: -122.6765 };
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    renderWithMantine(<DiscoverPage />);

    await waitFor(() => {
      expect(listOrganizationsMock).toHaveBeenCalledWith(100, 0, expect.objectContaining({
        includeAffiliateRentals: true,
        query: 'Salmon Creek',
        area: {
          lat: 45.5231,
          lng: -122.6765,
          radiusKm: expect.closeTo(80.467, 3),
        },
      }));
    });
  });

  it('loads the next organization page when the organization sentinel intersects', async () => {
    listOrganizationsMock
      .mockReset()
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_1',
          name: 'Rose City Sports',
          coordinates: [-122.6765, 45.5231],
          sports: [],
          tags: [],
        }],
        pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: true },
      })
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_2',
          name: 'Cascade Athletics',
          coordinates: [-122.6587, 45.5122],
          sports: [],
          tags: [],
        }],
        pagination: { limit: 100, offset: 1, nextOffset: 2, hasMore: false },
      });

    renderWithMantine(<DiscoverPage />);

    expect(await screen.findByText('Rose City Sports')).toBeInTheDocument();
    expect(intersectionCallbacks.length).toBeGreaterThan(0);

    await act(async () => {
      const callback = intersectionCallbacks[intersectionCallbacks.length - 1];
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(await screen.findByText('Cascade Athletics')).toBeInTheDocument();
    expect(listOrganizationsMock).toHaveBeenCalledTimes(2);
    expect(listOrganizationsMock.mock.calls[1]?.slice(0, 2)).toEqual([100, 1]);
  });

  it('does not duplicate external registration on affiliate team cards', async () => {
    navigationSearchParams = 'tab=teams';
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    searchOpenRegistrationTeamsMock.mockResolvedValue({
      teams: [{
        $id: 'team_external',
        name: 'Rose City Futsal Community Team',
        division: 'Mens D2',
        sport: 'Indoor Soccer',
        openRegistration: true,
        affiliateUrl: 'https://example.test/register',
      }],
      pagination: { limit: 18, offset: 0, nextOffset: 1, hasMore: false },
    });

    renderWithMantine(<DiscoverPage />);

    const card = await screen.findByTestId('team-card-team_external');
    expect(card).toHaveTextContent('External registration');
    expect(card.textContent?.match(/External registration/g)).toHaveLength(1);
  });

  it('loads the next rental page when the rental sentinel intersects', async () => {
    navigationSearchParams = 'tab=rentals';
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    listOrganizationsMock
      .mockReset()
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_1',
          name: 'Rose City Sports',
          sports: [],
          tags: [],
          facilities: [{
            $id: 'facility_1',
            name: 'Rose City Field Rentals',
            status: 'ACTIVE',
            affiliateUrl: 'https://example.test/rose-city',
          }],
        }],
        pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: true },
      })
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_2',
          name: 'Salmon Creek Indoor',
          sports: [],
          tags: [],
          facilities: [{
            $id: 'facility_2',
            name: 'Salmon Creek Indoor Field Rentals',
            status: 'ACTIVE',
            affiliateUrl: 'https://example.test/salmon-creek',
          }],
        }],
        pagination: { limit: 100, offset: 1, nextOffset: 2, hasMore: false },
      });

    renderWithMantine(<DiscoverPage />);

    expect(await screen.findByText('Rose City Field Rentals')).toBeInTheDocument();
    expect(intersectionCallbacks.length).toBeGreaterThan(0);

    await act(async () => {
      const callback = intersectionCallbacks[intersectionCallbacks.length - 1];
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(await screen.findByText('Salmon Creek Indoor Field Rentals')).toBeInTheDocument();
    expect(listOrganizationsMock).toHaveBeenCalledTimes(2);
    expect(listOrganizationsMock.mock.calls[1]?.slice(0, 2)).toEqual([100, 1]);
  });

  it('keeps the current area rental response when an older request finishes later', async () => {
    navigationSearchParams = [
      'tab=rentals',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
      'distanceMiles=50',
    ].join('&');
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    let resolveFirstRequest!: (value: unknown) => void;
    listOrganizationsMock
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRequest = resolve;
      }))
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_salmon_creek',
          name: 'Salmon Creek Indoor',
          sports: [],
          tags: [],
          facilities: [{
            $id: 'facility_salmon_creek',
            name: 'Salmon Creek Indoor Field Rentals',
            status: 'ACTIVE',
            affiliateUrl: 'https://example.test/salmon-creek',
            coordinates: [-122.6714042, 45.7224249],
          }],
        }],
        pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: false },
      });

    const { rerender } = renderWithMantine(<DiscoverPage />);
    await waitFor(() => expect(listOrganizationsMock).toHaveBeenCalledTimes(1));

    mockLocation = { lat: 45.5231, lng: -122.6765 };
    rerender(
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <DiscoverPage />
        </ModalsProvider>
      </MantineProvider>,
    );

    expect(await screen.findByText('Salmon Creek Indoor Field Rentals')).toBeInTheDocument();
    expect(listOrganizationsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFirstRequest({
        organizations: [],
        pagination: { limit: 100, offset: 0, nextOffset: 0, hasMore: false },
      });
    });

    expect(screen.getByText('Salmon Creek Indoor Field Rentals')).toBeInTheDocument();
    expect(screen.queryByText('No rentals available')).not.toBeInTheDocument();
  });

  it('defaults a location-based event search to a 50 mile radius', async () => {
    navigationSearchParams = 'sport=Tennis&lat=40.7127753&lng=-74.0059728&location=New+York%2C+NY';
    mockLocation = { lat: 40.7127753, lng: -74.0059728 };
    mockSportsResult.sports = [{ $id: 'Tennis', name: 'Tennis' }];
    getEventsPageMock.mockResolvedValue({
      events: [],
      pagination: { limit: 18, offset: 0, nextOffset: 0, hasMore: false, totalCount: 1 },
    });
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    renderWithMantine(<DiscoverPage />);

    await waitFor(() => {
      expect(getEventsPageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sports: ['Tennis'],
          userLocation: mockLocation,
          maxDistance: expect.closeTo(80.467, 3),
        }),
        18,
        0,
        'RECOMMENDED',
      );
      expect(window.location.search).toContain('distanceMiles=50');
    });
  });

  it('falls back to all distances when the automatic 50 mile search is empty', async () => {
    navigationSearchParams = 'lat=40.7127753&lng=-74.0059728&location=New+York%2C+NY';
    mockLocation = { lat: 40.7127753, lng: -74.0059728 };
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    renderWithMantine(<DiscoverPage />);

    await waitFor(() => {
      expect(getEventsPageMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxDistance: expect.closeTo(80.467, 3) }),
        18,
        0,
        'RECOMMENDED',
      );
      expect(getEventsPageMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxDistance: undefined }),
        18,
        0,
        'RECOMMENDED',
      );
      expect(window.location.search).not.toContain('distanceMiles=');
    });
  });
});
