import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomePage from '../page';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

const guestLoginMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  authService: {
    guestLogin: (...args: unknown[]) => guestLoginMock(...args),
  },
}));

describe('Home landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    guestLoginMock.mockReset();
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isGuest: false,
    });
  });

  it('renders landing content and auth actions for signed-out users', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', {
        name: /run leagues, tournaments, and sports events in one platform/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /sign up/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /visit the blog/i })).toHaveAttribute('href', '/blog');
    expect(screen.getAllByRole('button', { name: /continue as guest/i }).length).toBeGreaterThan(0);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('redirects authenticated users to their home path', async () => {
    useAppMock.mockReturnValue({
      user: { homePageOrganizationId: 'org_42' },
      loading: false,
      isGuest: false,
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/organizations/org_42');
    });
  });

  it('renders landing content for active guest sessions', () => {
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isGuest: true,
    });

    render(<HomePage />);

    expect(
      screen.getByRole('heading', {
        name: /run leagues, tournaments, and sports events in one platform/i,
      }),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('starts a guest session and routes to discover when continue as guest is clicked', async () => {
    guestLoginMock.mockResolvedValue(undefined);

    render(<HomePage />);

    fireEvent.click(screen.getAllByRole('button', { name: /continue as guest/i })[0]);

    await waitFor(() => {
      expect(guestLoginMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).toHaveBeenCalledWith('/discover');
  });
});
