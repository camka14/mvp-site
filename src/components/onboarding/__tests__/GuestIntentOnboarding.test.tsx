import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import GuestIntentOnboarding from '../GuestIntentOnboarding';

const pushMock = jest.fn();
const startGuestSessionMock = jest.fn();
const setLocationFromInfoMock = jest.fn();
const requestLocationMock = jest.fn();
const geocodeLocationMock = jest.fn();
const getPlacePredictionsMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => ({ startGuestSession: (...args: unknown[]) => startGuestSessionMock(...args) }),
}));

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => ({
    sports: [{ $id: 'sport_soccer', name: 'Soccer' }],
    sportsByName: new Map([['soccer', { $id: 'sport_soccer', name: 'Soccer' }]]),
    loading: false,
  }),
}));

jest.mock('@/app/hooks/useLocation', () => ({
  useLocation: () => ({
    locationInfo: null,
    loading: false,
    error: null,
    requestLocation: (...args: unknown[]) => requestLocationMock(...args),
    setLocationFromInfo: (...args: unknown[]) => setLocationFromInfoMock(...args),
  }),
}));

jest.mock('@/lib/locationService', () => ({
  locationService: {
    createPlacesSessionToken: () => ({ token: 'session' }),
    getPlacePredictions: (...args: unknown[]) => getPlacePredictionsMock(...args),
    getPlaceDetails: jest.fn(),
    geocodeLocation: (...args: unknown[]) => geocodeLocationMock(...args),
  },
}));

jest.mock('@/lib/id', () => ({ createId: () => 'event_1' }));

const renderWizard = () => render(
  <MantineProvider>
    <GuestIntentOnboarding />
  </MantineProvider>,
);

describe('GuestIntentOnboarding', () => {
  beforeEach(() => {
    pushMock.mockReset();
    startGuestSessionMock.mockReset().mockResolvedValue(undefined);
    setLocationFromInfoMock.mockReset();
    requestLocationMock.mockReset().mockResolvedValue(undefined);
    geocodeLocationMock.mockReset().mockResolvedValue({
      lat: 45.52,
      lng: -122.68,
      city: 'Portland',
      state: 'OR',
      formattedAddress: 'Portland, OR',
    });
    getPlacePredictionsMock.mockReset().mockResolvedValue([]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sportSkills: [{ sportId: 'sport_soccer', skills: [{ id: 'competitive', name: 'Competitive' }] }],
      }),
    }) as jest.Mock;
    window.localStorage.clear();
  });

  it('starts a guest session and routes an event search with the selected location', async () => {
    renderWizard();

    fireEvent.click(screen.getByText('Events').closest('button') as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Portland, OR' } });
    fireEvent.click(screen.getByRole('button', { name: /show events/i }));

    await waitFor(() => expect(startGuestSessionMock).toHaveBeenCalledTimes(1));
    expect(setLocationFromInfoMock).toHaveBeenCalledWith(expect.objectContaining({ city: 'Portland' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/discover?tab=events&lat=45.52&lng=-122.68&location=Portland%2C+OR&distanceMiles=50',
    );
  });

  it('does not show an unsupported skill filter for rentals', async () => {
    renderWizard();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/division-types', expect.any(Object)));

    fireEvent.click(screen.getByText('Rentals').closest('button') as HTMLButtonElement);

    expect(screen.queryByLabelText('Skill level')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Any sport')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
  });

  it('gates club creation behind signup and preserves the club creation preset', async () => {
    renderWizard();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/division-types', expect.any(Object)));

    fireEvent.click(screen.getByText('Club', { selector: 'p' }).closest('button') as HTMLButtonElement);
    expect(screen.getByText(/create a free account first/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /create free account/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/login?mode=signup&onboardingIntent=ORGANIZATION&next=%2Forganizations%3Fcreate%3D1%26preset%3Dclub',
    );
  });
});
