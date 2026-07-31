import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LocationSearch from '../LocationSearch';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const mockRequestLocation = jest.fn();
const mockSearchLocation = jest.fn();
const mockClearLocation = jest.fn();
const mockSetLocationFromInfo = jest.fn();
const mockGetPlacePredictions = jest.fn();
const mockGetPlaceDetails = jest.fn();

jest.mock('@/app/hooks/useLocation', () => ({
  useLocation: () => ({
    location: null,
    locationInfo: null,
    loading: false,
    error: null,
    requestLocation: mockRequestLocation,
    searchLocation: mockSearchLocation,
    clearLocation: mockClearLocation,
    setLocationFromInfo: mockSetLocationFromInfo,
  }),
}));

jest.mock('@/lib/locationService', () => ({
  locationService: {
    createPlacesSessionToken: jest.fn(() => null),
    getPlacePredictions: (...args: unknown[]) => mockGetPlacePredictions(...args),
    getPlaceDetails: (...args: unknown[]) => mockGetPlaceDetails(...args),
  },
}));

jest.mock('@/app/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

describe('LocationSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestLocation.mockResolvedValue(undefined);
    mockSearchLocation.mockResolvedValue(true);
    mockGetPlacePredictions.mockResolvedValue([]);
    mockGetPlaceDetails.mockResolvedValue(null);
  });

  it('requests browser location from the Set Location click gesture', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);

    await user.click(screen.getByRole('button', { name: 'Set Location' }));

    expect(await screen.findByPlaceholderText('Enter city, state, or ZIP')).toBeInTheDocument();
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('submits a typed ZIP through the shared location search and closes on success', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);

    const locationButton = screen.getByRole('button', { name: 'Set Location' });
    await user.click(locationButton);
    await user.type(await screen.findByPlaceholderText('Enter city, state, or ZIP'), '98671{Enter}');

    await waitFor(() => {
      expect(mockSearchLocation).toHaveBeenCalledWith('98671');
    });
    expect(locationButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the picker open when a typed location cannot be resolved', async () => {
    mockSearchLocation.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);

    const locationButton = screen.getByRole('button', { name: 'Set Location' });
    await user.click(locationButton);
    await user.type(await screen.findByPlaceholderText('Enter city, state, or ZIP'), 'not-a-real-place{Enter}');

    await waitFor(() => {
      expect(mockSearchLocation).toHaveBeenCalledWith('not-a-real-place');
    });
    expect(locationButton).toHaveAttribute('aria-expanded', 'true');
  });
});
