import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BillingAddressModal from '../BillingAddressModal';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const getBillingAddressProfileMock = jest.fn();
const saveBillingAddressMock = jest.fn();
const createPlacesSessionTokenMock = jest.fn();
const getPlacePredictionsMock = jest.fn();
const getPlaceDetailsMock = jest.fn();

jest.mock('@/app/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

jest.mock('@/lib/billingAddressService', () => ({
  billingAddressService: {
    getBillingAddressProfile: (...args: unknown[]) => getBillingAddressProfileMock(...args),
    saveBillingAddress: (...args: unknown[]) => saveBillingAddressMock(...args),
  },
}));

jest.mock('@/lib/locationService', () => ({
  locationService: {
    createPlacesSessionToken: (...args: unknown[]) => createPlacesSessionTokenMock(...args),
    getPlacePredictions: (...args: unknown[]) => getPlacePredictionsMock(...args),
    getPlaceDetails: (...args: unknown[]) => getPlaceDetailsMock(...args),
  },
}));

describe('BillingAddressModal', () => {
  beforeEach(() => {
    getBillingAddressProfileMock.mockResolvedValue({
      billingAddress: null,
      email: 'payer@example.com',
    });
    saveBillingAddressMock.mockResolvedValue({
      billingAddress: null,
      email: 'payer@example.com',
    });
    createPlacesSessionTokenMock.mockReturnValue({ token: 'places-session' });
    getPlacePredictionsMock.mockResolvedValue([]);
    getPlaceDetailsMock.mockResolvedValue({});
  });

  it('fills city, ZIP, state, and country when a Google address suggestion is selected', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();

    getPlacePredictionsMock.mockResolvedValue([
      {
        description: '1600 Amphitheatre Parkway, Mountain View, CA, USA',
        placeId: 'place_1600',
      },
    ]);
    getPlaceDetailsMock.mockResolvedValue({
      line1: '1600 Amphitheatre Parkway',
      city: 'Mountain View',
      state: 'CA',
      zipCode: '94043',
      country: 'US',
    });

    renderWithMantine(
      <BillingAddressModal
        opened
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    const line1Input = await screen.findByLabelText(/Address line 1/i);
    fireEvent.focus(line1Input);
    fireEvent.change(line1Input, { target: { value: '1600 Amphitheatre' } });

    const suggestion = await screen.findByRole('button', {
      name: '1600 Amphitheatre Parkway, Mountain View, CA, USA',
    });
    await user.click(suggestion);

    await waitFor(() => {
      expect(screen.getByLabelText(/Address line 1/i)).toHaveValue('1600 Amphitheatre Parkway');
    });
    expect(screen.getByLabelText(/City/i)).toHaveValue('Mountain View');
    expect(screen.getByLabelText(/ZIP code/i)).toHaveValue('94043');
    expect(screen.getByDisplayValue('California')).toBeInTheDocument();
    expect(screen.getByDisplayValue('United States')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save billing address/i }));

    await waitFor(() => {
      expect(saveBillingAddressMock).toHaveBeenCalledWith({
        line1: '1600 Amphitheatre Parkway',
        line2: '',
        city: 'Mountain View',
        state: 'CA',
        postalCode: '94043',
        countryCode: 'US',
      });
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      state: 'CA',
      countryCode: 'US',
    }));
  });

  it('requires a supported state from the dropdown before saving', async () => {
    const user = userEvent.setup();

    getBillingAddressProfileMock.mockResolvedValue({
      billingAddress: {
        line1: '1 Test Street',
        line2: '',
        city: 'Testville',
        state: 'Atlantis',
        postalCode: '12345',
        countryCode: 'US',
      },
      email: 'payer@example.com',
    });

    renderWithMantine(
      <BillingAddressModal
        opened
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    await screen.findByDisplayValue('1 Test Street');
    await user.click(screen.getByRole('button', { name: /Save billing address/i }));

    expect(await screen.findByText('Select a supported billing state.')).toBeInTheDocument();
    expect(saveBillingAddressMock).not.toHaveBeenCalled();
  });
});
