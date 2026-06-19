import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import RentalReservationCheckout from '../RentalReservationCheckout';
import type { RentalSelectionCheckoutPayload } from '@/app/organizations/[id]/FieldsTabContent';

const pushMock = jest.fn();
const apiRequestMock = jest.fn();
const showNotificationMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@mantine/notifications', () => ({
  notifications: {
    show: (...args: any[]) => showNotificationMock(...args),
  },
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  isApiRequestError: () => false,
}));

jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createPaymentIntent: jest.fn(),
    releaseRentalCheckoutLock: jest.fn(),
  },
}));

jest.mock('@/components/ui/BillingAddressModal', () => () => null);
jest.mock('@/components/ui/PaymentModal', () => () => null);

const organization = {
  $id: 'org_1',
  name: 'Razumly',
  location: 'Washougal, WA',
  coordinates: [-122.353, 45.582],
} as any;

const payload: RentalSelectionCheckoutPayload = {
  eventId: 'rental_booking_1',
  manageEventUrl: '/events/rental_booking_1/schedule?create=1',
  organizationId: 'org_1',
  organizationName: 'Razumly',
  renterOrganizationId: 'renter_org_1',
  facilityId: 'facility_1',
  facilityName: 'Razumly',
  facilityLocation: '2130 N Q St',
  facilityAddress: '2130 N Q St, Washougal, WA 98671, USA',
  totalRentalCents: 0,
  rentalStart: '2026-06-22T05:30',
  rentalEnd: '2026-06-22T11:00',
  rentalSelections: [
    {
      key: 'selection_1',
      scheduledFieldIds: ['field_1'],
      dayOfWeek: 1,
      daysOfWeek: [1],
      startTimeMinutes: 330,
      endTimeMinutes: 660,
      startDate: '2026-06-22T05:30',
      endDate: '2026-06-22T11:00',
      repeating: false,
    },
  ],
  fieldIds: ['field_1'],
  primaryFieldId: 'field_1',
  primaryFieldName: 'Razumly - Main',
  location: '2130 N Q St, Washougal, WA 98671, USA',
  coordinates: [-122.353, 45.582],
  requiredTemplateIds: ['template_player'],
  hostRequiredTemplateIds: ['template_host'],
};

describe('RentalReservationCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiRequestMock.mockResolvedValue({
      bookingId: 'rental_booking_1',
      totalCents: 0,
      items: [
        {
          id: 'item_1',
          fieldId: 'field_1',
          start: '2026-06-22T05:30',
          end: '2026-06-22T11:00',
        },
      ],
    });
  });

  it('opens reservation checkout in place and creates rental orders without navigation', async () => {
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <RentalReservationCheckout
          organization={organization}
          rentalOrderSlug="razumly"
          currentUser={{ $id: 'user_1' } as any}
        >
          {({ onRentalSelectionReady }) => (
            <button type="button" onClick={() => onRentalSelectionReady(payload)}>
              Reserve resources
            </button>
          )}
        </RentalReservationCheckout>
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Reserve resources' }));

    expect(await screen.findByRole('dialog', { name: 'Reserve resources' })).toBeInTheDocument();
    expect(screen.getByText('Continue to complete any required documents and payment. After checkout, these resources are reserved and can be attached to an event.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue to checkout' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/public/organizations/razumly/rental-orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            eventId: 'rental_booking_1',
            selections: payload.rentalSelections,
            paymentIntentId: null,
            renterOrganizationId: 'renter_org_1',
          }),
        }),
      );
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Resources reserved for Razumly.')).toBeInTheDocument();
  });
});
