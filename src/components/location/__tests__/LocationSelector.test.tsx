import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import LocationSelector from '../LocationSelector';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const mockSessionToken = { token: 'places-session' };
const mockCreatePlacesSessionToken = jest.fn(() => mockSessionToken);
const mockGetPlacePredictions = jest.fn();
const mockGetPlaceDetails = jest.fn();
const mockControlElements: HTMLElement[] = [];
const mockMapControlArray = {
  push: jest.fn((element: HTMLElement) => {
    mockControlElements.push(element);
    document.body.appendChild(element);
    return mockControlElements.length - 1;
  }),
  forEach: jest.fn((callback: (element: HTMLElement, index: number) => void) => {
    mockControlElements.forEach((element, index) => callback(element, index));
  }),
  removeAt: jest.fn((index: number) => {
    const [element] = mockControlElements.splice(index, 1);
    element?.remove();
    return element;
  }),
};
const mockGoogleMapOptions: any[] = [];

jest.mock('@/lib/locationService', () => ({
  locationService: {
    createPlacesSessionToken: (...args: unknown[]) => mockCreatePlacesSessionToken(...args),
    getPlacePredictions: (...args: unknown[]) => mockGetPlacePredictions(...args),
    getPlaceDetails: (...args: unknown[]) => mockGetPlaceDetails(...args),
    geocodeLocation: jest.fn(),
  },
}));

jest.mock('@react-google-maps/api', () => {
  const React = require('react');
  return {
    GoogleMap: ({ onLoad, onUnmount, options }: any) => {
      mockGoogleMapOptions.push(options);
      React.useEffect(() => {
        onLoad?.({
          controls: {
            1: mockMapControlArray,
          },
        });
        return () => onUnmount?.();
      }, []);
      return React.createElement('div', { 'data-testid': 'google-map' });
    },
    useJsApiLoader: () => ({ isLoaded: true }),
  };
});

describe('LocationSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockControlElements.splice(0).forEach((element) => element.remove());
    mockGoogleMapOptions.splice(0);
    mockGetPlacePredictions.mockResolvedValue([
      {
        description: '2130 N Q St, Washougal, WA, USA',
        placeId: 'place_address',
      },
    ]);
    mockGetPlaceDetails.mockResolvedValue({
      name: 'Riverside Courts',
      formattedAddress: '2130 N Q St, Washougal, WA 98671, USA',
      lat: 45.579,
      lng: -122.351,
    });
    (window as typeof window & { google?: any }).google = {
      maps: {
        ControlPosition: {
          TOP_LEFT: 1,
        },
      },
    };
  });

  afterEach(() => {
    mockControlElements.splice(0).forEach((element) => element.remove());
    delete (window as typeof window & { google?: any }).google;
  });

  it('uses unrestricted place autocomplete in the map search control and hides Street View', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <LocationSelector
        value=""
        coordinates={{ lat: 0, lng: 0 }}
        onChange={jest.fn()}
        isValid
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Show Map' }));

    const searchInput = await screen.findByPlaceholderText('Search for an address or place');
    expect(mockMapControlArray.push).toHaveBeenCalledTimes(1);

    const latestOptions = mockGoogleMapOptions[mockGoogleMapOptions.length - 1];
    expect(latestOptions).toEqual(expect.objectContaining({
      fullscreenControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    }));

    await user.type(searchInput, '2130 N Q St');

    await waitFor(() => {
      expect(mockGetPlacePredictions).toHaveBeenLastCalledWith(
        '2130 N Q St',
        mockSessionToken,
        { includeAllPlaceTypes: true },
      );
    });
    expect(await screen.findByRole('button', { name: '2130 N Q St, Washougal, WA, USA' })).toBeInTheDocument();
  });

  it('selects a main-input address prediction and marks the location as selected', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    function ControlledLocationSelector() {
      const [location, setLocation] = React.useState('');
      const [coordinates, setCoordinates] = React.useState({ lat: 0, lng: 0 });
      const [selected, setSelected] = React.useState(false);
      return (
        <LocationSelector
          value={location}
          coordinates={coordinates}
          onChange={(nextLocation, lat, lng, address, meta) => {
            setLocation(nextLocation);
            setCoordinates({ lat, lng });
            setSelected(Boolean(meta?.selected));
            onChange(nextLocation, lat, lng, address, meta);
          }}
          isValid
          requireSelection
          selected={selected}
        />
      );
    }

    renderWithMantine(
      <ControlledLocationSelector />,
    );

    const input = screen.getByLabelText('Location');
    await user.type(input, '2130 N Q St');

    expect(await screen.findByRole('button', { name: '2130 N Q St, Washougal, WA, USA' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2130 N Q St, Washougal, WA, USA' }));

    await waitFor(() => {
      expect(mockGetPlaceDetails).toHaveBeenCalledWith('place_address', mockSessionToken);
    });
    expect(onChange).toHaveBeenLastCalledWith(
      'Riverside Courts',
      45.579,
      -122.351,
      '2130 N Q St, Washougal, WA 98671, USA',
      {
        selected: true,
        source: 'prediction',
        placeId: 'place_address',
        formattedAddress: '2130 N Q St, Washougal, WA 98671, USA',
      },
    );
  });
});
