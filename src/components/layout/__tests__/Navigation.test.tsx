import { render, screen } from '@testing-library/react';
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
      isGuest: false,
    });
  });

  it('includes an info link back to the landing page', () => {
    render(<Navigation />);

    expect(screen.getByRole('link', { name: /info/i })).toHaveAttribute('href', '/info');
    expect(screen.getByRole('link', { name: /guides/i })).toHaveAttribute('href', '/guides');
  });

  it('shows the hydrated profile name instead of the stale auth name', () => {
    render(<Navigation />);

    expect(screen.getByRole('link', { name: /profile name/i })).toHaveAttribute('href', '/profile');
    expect(screen.queryByText('Taylor')).not.toBeInTheDocument();
  });

  it('shows the mobile app link before the profile component for signed-in users', () => {
    render(<Navigation />);

    const mobileAppLink = screen.getByRole('link', { name: /get the mobile app/i });
    const profileLink = screen.getByRole('link', { name: /profile name/i });

    expect(mobileAppLink).toHaveAttribute('href', '/mobile-app');
    expect(Boolean(mobileAppLink.compareDocumentPosition(profileLink) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('shows the AI assistant trigger for signed-in users', () => {
    render(<Navigation />);

    expect(screen.getByRole('button', { name: /open ai assistant/i })).toBeInTheDocument();
  });

  it('shows guest navigation without requiring an authenticated user', () => {
    useAppMock.mockReturnValue({
      user: null,
      authUser: null,
      setUser: jest.fn(),
      setAuthUser: jest.fn(),
      isGuest: true,
    });

    render(<Navigation />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bracketiq/i })).toHaveAttribute('href', '/discover');
    expect(screen.getByRole('link', { name: /info/i })).toHaveAttribute('href', '/info');
    expect(screen.getByRole('link', { name: /guides/i })).toHaveAttribute('href', '/guides');
    expect(screen.getAllByRole('link', { name: /discover/i })[0]).toHaveAttribute('href', '/discover');
    expect(screen.getByRole('link', { name: /my organizations/i })).toHaveAttribute('href', '/organizations');
    expect(screen.getByRole('link', { name: /my schedule/i })).toHaveAttribute('href', '/my-schedule');
    expect(screen.getByRole('link', { name: /login \/ signup/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).not.toBeInTheDocument();
  });
});
