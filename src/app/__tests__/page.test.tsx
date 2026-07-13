import { render, screen } from '@testing-library/react';
import HomePage from '../page';

const cookiesMock = jest.fn();
jest.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
}));

const redirectMock = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
jest.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}));

const resolveLandingRedirectPathFromTokenMock = jest.fn();
jest.mock('@/server/landingRedirect', () => ({
  resolveLandingRedirectPathFromToken: (...args: unknown[]) =>
    resolveLandingRedirectPathFromTokenMock(...args),
}));

jest.mock('@/components/onboarding/GuestIntentOnboarding', () => ({
  __esModule: true,
  default: () => <div data-testid="guest-onboarding">Guest onboarding</div>,
}));

jest.mock('@/components/onboarding/GuestDiscoverRedirect', () => ({
  __esModule: true,
  default: () => <div data-testid="guest-discover-redirect">Guest Discover redirect</div>,
}));

describe('Home page route', () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    redirectMock.mockClear();
    resolveLandingRedirectPathFromTokenMock.mockReset();
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    });
    resolveLandingRedirectPathFromTokenMock.mockResolvedValue(null);
  });

  it('redirects authenticated users to their home path', async () => {
    cookiesMock.mockResolvedValue({
      get: () => ({ value: 'auth-token' }),
    });
    resolveLandingRedirectPathFromTokenMock.mockResolvedValue('/organizations/org_42');

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/organizations/org_42');

    expect(resolveLandingRedirectPathFromTokenMock).toHaveBeenCalledWith('auth-token');
    expect(redirectMock).toHaveBeenCalledWith('/organizations/org_42');
  });

  it('renders guest onboarding for a first-time visitor', async () => {
    const view = await HomePage();

    render(view);

    expect(resolveLandingRedirectPathFromTokenMock).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('guest-onboarding')).toBeInTheDocument();
  });

  it('routes a repeat anonymous visitor to Discover', async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) => name === 'bracketiq_guest_onboarding_v1' ? { value: '1' } : undefined,
    });

    const view = await HomePage();

    render(view);

    expect(screen.getByTestId('guest-discover-redirect')).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
