import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '../page';

const pushMock = jest.fn();
const startGuestSessionMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/app/providers', () => ({
  useApp: () => ({
    user: null,
    setUser: jest.fn(),
    setAuthUser: jest.fn(),
    loading: false,
    requiresProfileCompletion: false,
    startGuestSession: (...args: unknown[]) => startGuestSessionMock(...args),
  }),
}));

jest.mock('@/lib/auth', () => ({
  ApiError: class ApiError extends Error {},
  authService: {
    oauthLoginWithGoogle: jest.fn(),
  },
}));

describe('LoginPage guest entry', () => {
  beforeEach(() => {
    pushMock.mockReset();
    startGuestSessionMock.mockReset();
    startGuestSessionMock.mockResolvedValue(undefined);
    searchParamsMock = new URLSearchParams();
  });

  it('enters guest mode through the mounted provider before returning to the first-visit router', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));

    await waitFor(() => {
      expect(startGuestSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).toHaveBeenCalledWith('/');
  });

  it('opens directly in account creation mode when requested by guest onboarding', () => {
    searchParamsMock = new URLSearchParams('mode=signup&onboardingIntent=ORGANIZATION&next=%2Forganizations%3Fcreate%3D1');

    render(<LoginPage />);

    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });
});
