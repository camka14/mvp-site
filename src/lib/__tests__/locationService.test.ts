import { locationService } from '../locationService';

const setGooglePlacesMock = (places: Record<string, unknown>) => {
  (window as typeof window & { google?: any }).google = {
    maps: {
      places,
    },
  };
};

describe('locationService Places autocomplete', () => {
  afterEach(() => {
    delete (window as typeof window & { google?: any }).google;
    jest.clearAllMocks();
  });

  it('uses AutocompleteSuggestion for place predictions', async () => {
    const fetchAutocompleteSuggestions = jest.fn().mockResolvedValue({
      suggestions: [
        {
          placePrediction: {
            placeId: 'place_austin',
            text: { text: 'Austin, TX, USA' },
          },
        },
        { placePrediction: null },
      ],
    });
    const autocompleteServiceConstructor = jest.fn();

    setGooglePlacesMock({
      AutocompleteSuggestion: { fetchAutocompleteSuggestions },
      AutocompleteService: autocompleteServiceConstructor,
    });

    const sessionToken = { token: 'places-session' };
    const predictions = await locationService.getPlacePredictions('Austin', sessionToken);

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: 'Austin',
      includedPrimaryTypes: [
        'locality',
        'postal_code',
        'administrative_area_level_1',
        'administrative_area_level_2',
        'country',
      ],
      sessionToken,
    });
    expect(autocompleteServiceConstructor).not.toHaveBeenCalled();
    expect(predictions).toEqual([
      {
        description: 'Austin, TX, USA',
        placeId: 'place_austin',
      },
    ]);
  });

  it('maps legacy address filters to AutocompleteSuggestion request fields', async () => {
    const fetchAutocompleteSuggestions = jest.fn().mockResolvedValue({
      suggestions: [],
    });

    setGooglePlacesMock({
      AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    });

    await locationService.getPlacePredictions(
      '1600 Amphitheatre',
      undefined,
      {
        types: ['address'],
        componentRestrictions: { country: ['US', 'CA'] },
      },
    );

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: '1600 Amphitheatre',
      includedPrimaryTypes: ['street_address'],
      includedRegionCodes: ['us', 'ca'],
    });
  });

  it('falls back to AutocompleteService when AutocompleteSuggestion is unavailable', async () => {
    const getPlacePredictions = jest.fn((request, callback) => {
      callback(
        [{ description: 'Austin, TX, USA', place_id: 'place_austin' }],
        'OK',
      );
    });
    const autocompleteServiceConstructor = jest.fn(() => ({ getPlacePredictions }));

    setGooglePlacesMock({
      AutocompleteService: autocompleteServiceConstructor,
      PlacesServiceStatus: {
        OK: 'OK',
        ZERO_RESULTS: 'ZERO_RESULTS',
      },
    });

    const predictions = await locationService.getPlacePredictions('Austin');

    expect(autocompleteServiceConstructor).toHaveBeenCalledTimes(1);
    expect(getPlacePredictions).toHaveBeenCalledWith(
      { input: 'Austin', types: ['(cities)'] },
      expect.any(Function),
    );
    expect(predictions).toEqual([
      {
        description: 'Austin, TX, USA',
        placeId: 'place_austin',
      },
    ]);
  });
});
