import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Navigation from '../Navigation';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => <img {...props} alt={props.alt ?? ''} />,
}));

const replaceMock = jest.fn();
const refreshMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/discover',
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

const mockOpenAssistant = jest.fn();
jest.mock('@/context/AgentContext', () => ({
  useAgentContext: () => ({
    openAssistant: mockOpenAssistant,
  }),
}));

const logoutMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  authService: {
    logout: (...args: unknown[]) => logoutMock(...args),
  },
}));

describe('Navigation', () => {
  const fetchMock = jest.fn();
  const renderNavigation = () => render(
    <MantineProvider>
      <Navigation />
    </MantineProvider>,
  );

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    useAppMock.mockReturnValue({
      user: {
        firstName: 'Profile',
        lastName: 'Name',
        userName: 'profile_name',
        homePageOrganizationId: 'org_42',
        onboardingIntent: 'ORGANIZATION',
      },
      authUser: { $id: 'user_1', email: 'user@example.com', name: 'Taylor' },
      setUser: jest.fn(),
      setAuthUser: jest.fn(),
      loading: false,
      isGuest: false,
      isAuthenticated: true,
    });
  });

  it('includes an info link back to the landing page', () => {
    renderNavigation();

    expect(screen.getByRole('link', { name: /info/i })).toHaveAttribute('href', '/info');
    expect(screen.getByRole('link', { name: /guides/i })).toHaveAttribute('href', '/guides');
  });

  it('shows the hydrated profile name instead of the stale auth name', () => {
    renderNavigation();

    expect(screen.getByRole('link', { name: /profile name/i })).toHaveAttribute('href', '/profile');
    expect(screen.queryByText('Taylor')).not.toBeInTheDocument();
  });

  it('shows the mobile app link before the profile component for signed-in users', () => {
    renderNavigation();

    const mobileAppLink = screen.getByRole('link', { name: /get the mobile app/i });
    const profileLink = screen.getByRole('link', { name: /profile name/i });

    expect(mobileAppLink).toHaveAttribute('href', '/mobile-app');
    expect(Boolean(mobileAppLink.compareDocumentPosition(profileLink) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('shows the AI assistant trigger for signed-in users', () => {
    renderNavigation();

    expect(screen.getByRole('button', { name: /open ai assistant/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
  });

  it('shows feedback in the authenticated mobile menu with accessible menu state', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-controls', 'mobile-navigation-menu');

    await user.click(menuButton);

    expect(screen.getByRole('button', { name: /close navigation menu/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^feedback$/i })).toBeInTheDocument();
  });

  it('shows guest navigation without requiring an authenticated user', () => {
    useAppMock.mockReturnValue({
      user: null,
      authUser: null,
      setUser: jest.fn(),
      setAuthUser: jest.fn(),
      loading: false,
      isGuest: true,
      isAuthenticated: false,
    });

    renderNavigation();

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bracketiq/i })).toHaveAttribute('href', '/discover');
    expect(screen.getByRole('link', { name: /info/i })).toHaveAttribute('href', '/info');
    expect(screen.getByRole('link', { name: /guides/i })).toHaveAttribute('href', '/guides');
    expect(screen.getAllByRole('link', { name: /discover/i })[0]).toHaveAttribute('href', '/discover');
    expect(screen.getByRole('link', { name: /my organizations/i })).toHaveAttribute('href', '/organizations');
    expect(screen.getByRole('link', { name: /my schedule/i })).toHaveAttribute('href', '/my-schedule');
    expect(screen.getByRole('link', { name: /login \/ signup/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
  });

  it('shows guest navigation for a signed-out visitor without an explicit guest session', () => {
    useAppMock.mockReturnValue({
      user: null,
      authUser: null,
      setUser: jest.fn(),
      setAuthUser: jest.fn(),
      loading: false,
      isGuest: false,
      isAuthenticated: false,
    });

    renderNavigation();

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /login \/ signup/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /my organizations/i })).toHaveAttribute('href', '/organizations');
    expect(screen.getByRole('link', { name: /my schedule/i })).toHaveAttribute('href', '/my-schedule');
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
  });
});
