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
      user: { homePageOrganizationId: 'org_42' },
      authUser: { $id: 'user_1', email: 'user@example.com', name: 'Taylor' },
      setUser: jest.fn(),
      setAuthUser: jest.fn(),
      isGuest: false,
    });
  });

  it('includes an info link back to the landing page', () => {
    render(<Navigation />);

    expect(screen.getByRole('link', { name: /info/i })).toHaveAttribute('href', '/');
  });
});
