import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CreateFieldModal from '../CreateFieldModal';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { fieldService } from '@/lib/fieldService';
import { sportsService } from '@/lib/sportsService';

jest.setTimeout(15000);

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    createField: jest.fn(),
  },
}));

jest.mock('@/lib/sportsService', () => ({
  sportsService: {
    getAll: jest.fn(),
  },
}));

jest.mock('@/components/location/LocationSelector', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ value, label = 'Location', onChange, disabled }: any) =>
      React.createElement('input', {
        'aria-label': label,
        value: value ?? '',
        disabled,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          onChange?.(event.target.value, 0, 0);
        },
      }),
  };
});

describe('CreateFieldModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sportsService.getAll as jest.Mock).mockResolvedValue([
      { $id: 'Basketball', name: 'Basketball' },
      { $id: 'Indoor Soccer', name: 'Indoor Soccer' },
      { $id: 'Pickleball', name: 'Pickleball' },
    ]);
    (fieldService.createField as jest.Mock).mockImplementation(async (payload: any) => ({
      $id: payload.$id ?? 'field_1',
      name: payload.name,
      location: payload.location ?? '',
      lat: payload.lat ?? 0,
      long: payload.long ?? 0,
      sportIds: payload.sportIds ?? [],
    }));
  });

  it('allows typing into inputs without throwing', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateFieldModal
        isOpen
        onClose={() => {}}
        onFieldSaved={() => {}}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Create Resource' })).toBeInTheDocument();

    const nameInput = await screen.findByLabelText(/Name/i);
    await user.type(nameInput, 'Court B');

    expect((nameInput as HTMLInputElement).value).toBe('Court B');

    const locationInput = await screen.findByLabelText(/Location \(optional, defaults to Facility location\)/i);
    await user.type(locationInput, 'Downtown');

    expect((locationInput as HTMLInputElement).value).toBe('Downtown');
  });

  it('adds sports as pills from the dropdown and saves sport ids', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateFieldModal
        isOpen
        onClose={() => {}}
        onFieldSaved={() => {}}
      />,
    );

    await user.type(await screen.findByLabelText(/Name/i), 'Court B');

    const sportsInput = await screen.findByPlaceholderText('Select sports');
    await user.click(sportsInput);
    await user.click(await screen.findByRole('button', { name: 'Basketball' }));

    expect(await screen.findByText('Basketball')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Add sport'), 'Indoor{enter}');

    expect(await screen.findByText('Indoor Soccer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Resource' }));

    await waitFor(() => {
      expect(fieldService.createField).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Court B',
          sportIds: ['Basketball', 'Indoor Soccer'],
        }),
      );
    });
  });
});
