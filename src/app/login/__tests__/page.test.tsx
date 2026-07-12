import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '../page';

const pushMock = jest.fn();
const startGuestSessionMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
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
  });

  it('enters guest mode through the mounted provider before navigating to onboarding', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));

    await waitFor(() => {
      expect(startGuestSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).toHaveBeenCalledWith('/onboarding');
  });
});
