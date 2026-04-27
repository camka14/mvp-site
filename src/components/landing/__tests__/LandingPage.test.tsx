import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LandingPage from '../LandingPage';

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

describe('LandingPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    guestLoginMock.mockReset();
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isGuest: false,
      isAuthenticated: false,
    });
  });

  it('renders landing content and auth actions for signed-out users', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('heading', {
        name: /run leagues, tournaments, and sports events in one platform/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /sign up/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i })[0]).toHaveAttribute('href', '/request-demo');
    expect(screen.getByRole('link', { name: /^integrations$/i })).toHaveAttribute('href', '#integrations');
    expect(screen.getByRole('link', { name: /visit the blog/i })).toHaveAttribute('href', '/blog');
    expect(screen.getByRole('heading', { name: /free app access\. fees only apply when you process payments/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /we integrate our api with your website for free/i })).toBeInTheDocument();
    expect(screen.getByText(/branded bracketiq public pages and embeddable widgets/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /support@bracket-iq.com/i })).toHaveAttribute(
      'href',
      'mailto:support@bracket-iq.com',
    );
    expect(screen.getAllByRole('button', { name: /continue as guest/i }).length).toBeGreaterThan(0);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders a single app CTA for signed-in users on the landing page', () => {
    useAppMock.mockReturnValue({
      user: { homePageOrganizationId: 'org_42' },
      loading: false,
      isGuest: false,
      isAuthenticated: true,
    });

    render(<LandingPage />);

    expect(screen.getAllByRole('link', { name: /go to app/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /^sign up$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders landing content for active guest sessions', () => {
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isGuest: true,
      isAuthenticated: false,
    });

    render(<LandingPage />);

    expect(
      screen.getByRole('heading', {
        name: /run leagues, tournaments, and sports events in one platform/i,
      }),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('starts a guest session and routes to discover when continue as guest is clicked', async () => {
    guestLoginMock.mockResolvedValue(undefined);

    render(<LandingPage />);

    fireEvent.click(screen.getAllByRole('button', { name: /continue as guest/i })[0]);

    await waitFor(() => {
      expect(guestLoginMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).toHaveBeenCalledWith('/discover');
  });

  it('keeps the brand link on the info route when configured', () => {
    render(<LandingPage brandHref="/info" />);

    expect(screen.getByRole('link', { name: /bracketiq/i })).toHaveAttribute('href', '/info');
  });

  it('can render the hero screenshots in a horizontal layout', () => {
    render(<LandingPage heroMediaLayout="horizontal" />);

    expect(screen.getByAltText('Web discover dashboard').closest('.landing-hero-stack')).toHaveClass(
      'landing-hero-stack-horizontal',
    );
  });

  it('centers the two-sides screenshot section text', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /two sides of the platform/i }).parentElement).toHaveClass(
      'text-center',
    );
    expect(screen.getByText('For Organizers (Web)').closest('article')).toHaveClass('text-center');
    expect(screen.getByText('For Players and Parents (Mobile)').closest('article')).toHaveClass('text-center');
  });

  it('renders feature screenshots without the blue media container', () => {
    render(<LandingPage />);

    expect(screen.getByAltText('Web bracket and standings screen').closest('.landing-surface-soft')).toBeNull();
    expect(screen.getByAltText('Mobile bracket screen').closest('.landing-surface-soft')).toBeNull();
    expect(screen.getByAltText('Web bracket and standings screen').closest('.landing-media-grid')?.parentElement).toHaveClass(
      'p-5',
    );
  });

  it('presents signable document creation for rentals, events, and teams', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /create signable documents for every commitment/i })).toBeInTheDocument();
    expect(screen.getByText(/rentals, event registration, and team participation/i)).toBeInTheDocument();
    expect(screen.getByAltText('Web signable document creation screen')).toBeInTheDocument();
  });
});
