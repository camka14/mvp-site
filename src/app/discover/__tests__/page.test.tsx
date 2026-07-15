import { act, screen, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import DiscoverPage from '../page';

const pushMock = jest.fn();
const listOrganizationsMock = jest.fn();
const mockSportsResult = { sports: [], loading: false, error: null };
let intersectionCallbacks: IntersectionObserverCallback[] = [];

jest.mock('next/navigation', () => ({
  usePathname: () => '/discover',
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('tab=organizations'),
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
    location: null,
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
    getEventsPage: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    searchOpenRegistrationTeamsPage: jest.fn(),
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
  default: () => null,
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
});
