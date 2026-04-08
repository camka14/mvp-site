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

jest.mock('@/components/landing/LandingPage', () => ({
  __esModule: true,
  default: ({ brandHref }: { brandHref: string }) => (
    <div data-testid="landing-page" data-brand-href={brandHref}>
      Landing page
    </div>
  ),
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

  it('renders the landing page for visitors without a redirect target', async () => {
    const view = await HomePage();

    render(view);

    expect(resolveLandingRedirectPathFromTokenMock).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('landing-page')).toHaveAttribute('data-brand-href', '/');
  });
});
