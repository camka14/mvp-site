import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers, useApp } from '@/app/providers';

const fetchSessionMock = jest.fn();
const isGuestMock = jest.fn();
const guestLoginMock = jest.fn();
const setCurrentAuthUserMock = jest.fn();
const setCurrentUserDataMock = jest.fn();
const getAllSportsMock = jest.fn();
const getTeamsByUserIdMock = jest.fn();
const getUserByIdMock = jest.fn();

jest.mock('@/lib/auth', () => ({
  authService: {
    fetchSession: (...args: unknown[]) => fetchSessionMock(...args),
    isGuest: (...args: unknown[]) => isGuestMock(...args),
    guestLogin: (...args: unknown[]) => guestLoginMock(...args),
    setCurrentAuthUser: (...args: unknown[]) => setCurrentAuthUserMock(...args),
    setCurrentUserData: (...args: unknown[]) => setCurrentUserDataMock(...args),
    getStoredUserData: () => null,
    getStoredAuthUser: () => null,
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: (...args: unknown[]) => getUserByIdMock(...args),
  },
}));

jest.mock('@/lib/sportsService', () => ({
  sportsService: {
    getAll: (...args: unknown[]) => getAllSportsMock(...args),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getTeamsByUserId: (...args: unknown[]) => getTeamsByUserIdMock(...args),
  },
}));

function Probe() {
  const {
    authUser,
    user,
    isGuest,
    isAuthenticated,
    setAuthUser,
    setUser,
    startGuestSession,
    loading,
  } = useApp();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="guest">{String(isGuest)}</div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="auth-user">{authUser?.$id ?? 'none'}</div>
      <div data-testid="user">{user?.$id ?? 'none'}</div>
      <button
        type="button"
        onClick={() => setAuthUser({ $id: 'user_1', email: 'member@example.com' })}
      >
        set-auth
      </button>
      <button
        type="button"
        onClick={() => setUser({ $id: 'user_1', homePageOrganizationId: null } as any)}
      >
        set-user
      </button>
      <button type="button" onClick={() => void startGuestSession()}>
        start-guest
      </button>
    </div>
  );
}

describe('Providers guest/auth state synchronization', () => {
  beforeEach(() => {
    fetchSessionMock.mockReset();
    isGuestMock.mockReset();
    guestLoginMock.mockReset();
    setCurrentAuthUserMock.mockReset();
    setCurrentUserDataMock.mockReset();
    getAllSportsMock.mockReset();
    getTeamsByUserIdMock.mockReset();
    getUserByIdMock.mockReset();

    fetchSessionMock.mockResolvedValue({
      user: null,
      profile: null,
      session: null,
      token: null,
      requiresProfileCompletion: false,
      missingProfileFields: [],
    });
    isGuestMock.mockReturnValue(true);
    guestLoginMock.mockResolvedValue(undefined);
    getUserByIdMock.mockResolvedValue(null);
    getAllSportsMock.mockResolvedValue([]);
    getTeamsByUserIdMock.mockResolvedValue([]);
  });

  it('clears guest mode when setAuthUser is called', async () => {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('guest')).toHaveTextContent('true');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'set-auth' }));

    await waitFor(() => {
      expect(screen.getByTestId('guest')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
  });

  it('clears guest mode when setUser is called', async () => {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('guest')).toHaveTextContent('true');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'set-user' }));

    await waitFor(() => {
      expect(screen.getByTestId('guest')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
  });

  it('enters guest mode in the mounted provider before client-side navigation', async () => {
    isGuestMock.mockReturnValue(false);
    fetchSessionMock.mockResolvedValue({
      user: { $id: 'member_1', email: 'member@example.com' },
      profile: { $id: 'member_1', homePageOrganizationId: null },
      session: { token: 'session-token' },
      token: 'session-token',
      requiresProfileCompletion: false,
      missingProfileFields: [],
      requiresEmailVerification: false,
    });
    getUserByIdMock.mockResolvedValue({ $id: 'member_1', homePageOrganizationId: null });

    render(
      <Providers>
        <Probe />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-user')).toHaveTextContent('member_1');
      expect(screen.getByTestId('user')).toHaveTextContent('member_1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-guest' }));

    await waitFor(() => {
      expect(guestLoginMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('guest')).toHaveTextContent('true');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('auth-user')).toHaveTextContent('none');
      expect(screen.getByTestId('user')).toHaveTextContent('none');
    });
  });
});
