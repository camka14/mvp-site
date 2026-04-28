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
        name: /bring your facility operations into one command center/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /sign up/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i })[0]).toHaveAttribute('href', '/request-demo');
    expect(screen.getByRole('link', { name: /^platform$/i })).toHaveAttribute('href', '#platform');
    expect(screen.getByRole('link', { name: /^operations$/i })).toHaveAttribute('href', '#operations');
    expect(screen.getByRole('link', { name: /^integrations$/i })).toHaveAttribute('href', '#integrations');
    expect(screen.getByRole('link', { name: /read schedule guide/i })).toHaveAttribute(
      'href',
      '/blog/tournament-schedule-maker',
    );
    expect(screen.queryByRole('link', { name: /browse all guides/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /free to use\. pay only on processing/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /your site stays live/i })).toBeInTheDocument();
    expect(screen.getByText(/publish schedules, brackets, registration, payments, and documents/i)).toBeInTheDocument();
    expect(screen.getAllByText(/live event data/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /support@bracket-iq.com/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /continue as guest/i }).length).toBeGreaterThan(0);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('keeps the marketing page visible while auth state resolves', () => {
    useAppMock.mockReturnValue({
      user: null,
      loading: true,
      isGuest: false,
      isAuthenticated: false,
    });

    render(<LandingPage />);

    expect(
      screen.getByRole('heading', {
        name: /bring your facility operations into one command center/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Loading\.\.\.$/i)).not.toBeInTheDocument();
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
        name: /bring your facility operations into one command center/i,
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

  it('renders the connected platform layers', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /web for staff\. mobile for everyone else/i })).toBeInTheDocument();
    expect(screen.getByText('Organizer console').closest('article')).toHaveClass('landing-platform-card');
    expect(screen.getByText('Mobile participant layer').closest('article')).toHaveClass('landing-platform-card');
  });

  it('renders a supported use cases section', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /built for every run of play/i })).toBeInTheDocument();
    expect(screen.getByAltText('Facility operations dashboard for mixed programs')).toBeInTheDocument();
    expect(screen.getByText('Facility Programs').closest('article')).toHaveClass('landing-use-case');
  });

  it('renders the compact workflow steps', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /from setup to game day/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /set up the operating model/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /open registration and schedules/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /manage game day from the same system/i })).toBeInTheDocument();
  });

  it('renders feature screenshots in the pinned operations section', () => {
    render(<LandingPage />);

    expect(screen.getAllByRole('heading', { name: /schedule courts fast/i }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/operations progress/i)).toBeInTheDocument();
    expect(screen.getByAltText('Web field and scheduling view').closest('.landing-surface-soft')).toBeNull();
    expect(screen.getByAltText('Mobile schedule view').closest('.landing-surface-soft')).toBeNull();
    expect(screen.getByAltText('Web field and scheduling view').closest('article')).toHaveClass('landing-operation-scroll-panel');
    expect(screen.getByAltText('Web team management and roster view').closest('article')).toHaveClass('landing-operation-scroll-panel');
  });

  it('presents signable document creation for rentals, events, and teams', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /documents signed/i })).toBeInTheDocument();
    expect(screen.getAllByText(/waivers/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/clearance/i).length).toBeGreaterThan(0);
    expect(screen.getByAltText('Web signable document creation screen')).toBeInTheDocument();
  });

  it('opens and closes the mobile navigation menu', () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));

    expect(screen.getAllByRole('link', { name: /^platform$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /close navigation menu/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close navigation menu/i }));

    expect(screen.queryByRole('button', { name: /close navigation menu/i })).not.toBeInTheDocument();
  });
});
