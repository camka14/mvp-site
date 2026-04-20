import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers, useApp } from '@/app/providers';

const fetchSessionMock = jest.fn();
const isGuestMock = jest.fn();
const setCurrentAuthUserMock = jest.fn();
const setCurrentUserDataMock = jest.fn();
const getAllSportsMock = jest.fn();

jest.mock('@/lib/auth', () => ({
  authService: {
    fetchSession: (...args: unknown[]) => fetchSessionMock(...args),
    isGuest: (...args: unknown[]) => isGuestMock(...args),
    setCurrentAuthUser: (...args: unknown[]) => setCurrentAuthUserMock(...args),
    setCurrentUserData: (...args: unknown[]) => setCurrentUserDataMock(...args),
    getStoredUserData: () => null,
    getStoredAuthUser: () => null,
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('@/lib/sportsService', () => ({
  sportsService: {
    getAll: (...args: unknown[]) => getAllSportsMock(...args),
  },
}));

function Probe() {
  const { isGuest, isAuthenticated, setAuthUser, setUser, loading } = useApp();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="guest">{String(isGuest)}</div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
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
    </div>
  );
}

describe('Providers guest/auth state synchronization', () => {
  beforeEach(() => {
    fetchSessionMock.mockReset();
    isGuestMock.mockReset();
    setCurrentAuthUserMock.mockReset();
    setCurrentUserDataMock.mockReset();
    getAllSportsMock.mockReset();

    fetchSessionMock.mockResolvedValue({
      user: null,
      profile: null,
      session: null,
      token: null,
      requiresProfileCompletion: false,
      missingProfileFields: [],
    });
    isGuestMock.mockReturnValue(true);
    getAllSportsMock.mockResolvedValue([]);
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
});
