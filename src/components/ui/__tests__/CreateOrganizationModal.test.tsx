import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CreateOrganizationModal from '../CreateOrganizationModal';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const createOrganizationMock = jest.fn();
const updateOrganizationMock = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    createOrganization: (...args: unknown[]) => createOrganizationMock(...args),
    updateOrganization: (...args: unknown[]) => updateOrganizationMock(...args),
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
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    }) as unknown as typeof fetch;
    createOrganizationMock.mockReset();
    updateOrganizationMock.mockReset();
    createOrganizationMock.mockResolvedValue({
      $id: 'org_1',
      name: 'Downtown Sports',
    });
    updateOrganizationMock.mockResolvedValue({
      $id: 'org_1',
      name: 'Downtown Sports',
      status: 'UNLISTED',
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
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
          status: 'LISTED',
          operatesAthleticFacility: true,
          defaultEventTaxHandling: 'STRIPE_TAX',
          defaultRentalTaxHandling: 'STRIPE_TAX',
          taxResponsibilityAgreementAccepted: true,
        }),
      );
    });
  });

  it('submits an unlisted visibility selection when creating an organization', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
      />,
    );

    await user.type(await screen.findByPlaceholderText('Organization name'), 'Private Training Lab');
    fireEvent.mouseDown(screen.getByRole('textbox', { name: /visibility/i }));
    const unlistedOption = await screen.findByText('Unlisted', { selector: '[data-combobox-option] span' });
    await user.click(unlistedOption);
    await user.click(screen.getByLabelText(/responsible for determining taxability/i));
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(createOrganizationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Private Training Lab',
          ownerId: 'user_1',
          status: 'UNLISTED',
        }),
      );
    });
  });

  it('submits visibility changes from the edit organization modal', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateOrganizationModal
        isOpen
        onClose={() => undefined}
        currentUser={{ $id: 'user_1' } as any}
        organization={{
          $id: 'org_1',
          name: 'Downtown Sports',
          status: 'LISTED',
          location: 'New York, NY',
          coordinates: [-74.006, 40.7128],
          taxResponsibilityAcceptedAt: '2026-05-12T00:00:00.000Z',
        } as any}
      />,
    );

    expect(await screen.findByRole('textbox', { name: /visibility/i })).toHaveValue('Listed');

    fireEvent.mouseDown(screen.getByRole('textbox', { name: /visibility/i }));
    const unlistedOption = await screen.findByText('Unlisted', { selector: '[data-combobox-option] span' });
    await user.click(unlistedOption);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(updateOrganizationMock).toHaveBeenCalledWith(
        'org_1',
        expect.objectContaining({
          name: 'Downtown Sports',
          status: 'UNLISTED',
        }),
      );
    });
  });
});
