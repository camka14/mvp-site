import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CreateOrganizationModal from '../CreateOrganizationModal';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const createOrganizationMock = jest.fn();

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    createOrganization: (...args: unknown[]) => createOrganizationMock(...args),
  },
}));

jest.mock('@mantine/notifications', () => ({
  notifications: {
    show: jest.fn(),
  },
  Notifications: () => null,
}));

jest.mock('@/app/hooks/useLocation', () => ({
  useLocation: () => ({
    location: { lat: 40.7128, lng: -74.006 },
    locationInfo: { city: 'New York', state: 'NY' },
  }),
}));

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => ({
    sports: [{ name: 'Basketball' }, { name: 'Soccer' }],
    loading: false,
    error: null,
  }),
}));

jest.mock('@/components/location/LocationSelector', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ value, onChange }: any) =>
      React.createElement('input', {
        'aria-label': 'Location',
        value: value ?? '',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          onChange?.(event.target.value, 40.7128, -74.006, event.target.value);
        },
      }),
  };
});

jest.mock('../ImageUploader', () => ({
  ImageUploader: ({ placeholder }: { placeholder: string }) => (
    <div>{placeholder}</div>
  ),
}));

describe('CreateOrganizationModal', () => {
  beforeEach(() => {
    createOrganizationMock.mockReset();
    createOrganizationMock.mockResolvedValue({
      $id: 'org_1',
      name: 'Downtown Sports',
    });
  });

  it('submits tax setting checkbox values without relying on the event during state updates', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
      />,
    );

    await user.type(await screen.findByPlaceholderText('Organization name'), 'Downtown Sports');
    await user.click(screen.getByLabelText(/operates or rents out an athletic facility/i));
    await user.click(screen.getByLabelText(/responsible for determining taxability/i));
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(createOrganizationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Downtown Sports',
          ownerId: 'user_1',
          operatesAthleticFacility: true,
          defaultEventTaxHandling: 'STRIPE_TAX',
          defaultRentalTaxHandling: 'STRIPE_TAX',
          taxResponsibilityAgreementAccepted: true,
        }),
      );
    });
  });
});
