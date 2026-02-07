import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CreateFieldModal from '../CreateFieldModal';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

jest.setTimeout(15000);

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    createField: jest.fn(),
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
  it('allows typing into inputs without throwing', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateFieldModal
        isOpen
        onClose={() => {}}
        onFieldSaved={() => {}}
      />,
    );

    const nameInput = await screen.findByLabelText(/Name/i);
    await user.type(nameInput, 'Court B');

    expect((nameInput as HTMLInputElement).value).toBe('Court B');

    const locationInput = await screen.findByLabelText(/Location \(optional\)/i);
    await user.type(locationInput, 'Downtown');

    expect((locationInput as HTMLInputElement).value).toBe('Downtown');
  });
});
