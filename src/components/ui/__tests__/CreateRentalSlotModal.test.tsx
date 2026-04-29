import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import CreateRentalSlotModal from '../CreateRentalSlotModal';
import { getIndexedEntityColorPair } from '@/lib/entityColors';

const createRentalSlotMock = jest.fn();
const updateRentalSlotMock = jest.fn();
const deleteRentalSlotMock = jest.fn();
const apiRequestMock = jest.fn();

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    createRentalSlot: (...args: any[]) => createRentalSlotMock(...args),
    updateRentalSlot: (...args: any[]) => updateRentalSlotMock(...args),
    deleteRentalSlot: (...args: any[]) => deleteRentalSlotMock(...args),
  },
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
}));

jest.mock('@/components/ui/PriceWithFeesPreview', () => () => null);

describe('CreateRentalSlotModal multi-field creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiRequestMock.mockResolvedValue({ templates: [] });
  });

  it('creates one rental slot per selected field in create mode', async () => {
    const selectedFields = [
      {
        $id: 'field_main',
        name: 'Main',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
      {
        $id: 'field_aux',
        name: 'Aux',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
    ] as any[];

    createRentalSlotMock.mockImplementation(async (field: any) => ({
      field: {
        ...field,
        rentalSlotIds: [`slot_${field.$id}`],
        rentalSlots: [{ $id: `slot_${field.$id}`, dayOfWeek: 1, repeating: false }],
      },
      slot: { $id: `slot_${field.$id}`, dayOfWeek: 1, repeating: false },
    }));

    const onSaved = jest.fn();
    const onClose = jest.fn();
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <CreateRentalSlotModal
          opened
          onClose={onClose}
          field={selectedFields[0]}
          selectedFields={selectedFields}
          slot={null}
          initialRange={null}
          onSaved={onSaved}
          organizationId={null}
          organizationHasStripeAccount={false}
        />
      </MantineProvider>,
    );

    const submitButton = await screen.findByRole('button', { name: 'Create Rental Slots (2)' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(createRentalSlotMock).toHaveBeenCalledTimes(2);
    });

    expect(createRentalSlotMock.mock.calls[0]?.[0]?.$id).toBe('field_main');
    expect(createRentalSlotMock.mock.calls[1]?.[0]?.$id).toBe('field_aux');
    expect(onSaved).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $id: 'field_main' }),
        expect.objectContaining({ $id: 'field_aux' }),
      ]),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('renders selected fields with colors from the provided field reference list', async () => {
    const selectedFields = [
      {
        $id: 'field_main',
        name: 'Main',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
      {
        $id: 'field_aux',
        name: 'Aux',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
    ] as any[];

    render(
      <MantineProvider>
        <CreateRentalSlotModal
          opened
          onClose={() => undefined}
          field={selectedFields[0]}
          selectedFields={selectedFields}
          slot={null}
          initialRange={null}
          organizationId={null}
          organizationHasStripeAccount={false}
          fieldColorReferenceList={['field_main', 'field_aux']}
        />
      </MantineProvider>,
    );

    expect(await screen.findByText('Main')).toBeInTheDocument();
    expect(screen.getByTestId('rental-slot-field-chip-field_main')).toHaveStyle(`background-color: ${getIndexedEntityColorPair(0).bg}`);
    expect(screen.getByTestId('rental-slot-field-chip-field_aux')).toHaveStyle(`background-color: ${getIndexedEntityColorPair(1).bg}`);
  });
});
