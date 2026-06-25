import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HostPriceInput from '../HostPriceInput';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

function HostPriceInputHarness() {
  const [priceCents, setPriceCents] = useState(1000);

  return (
    <HostPriceInput
      value={priceCents}
      onChange={setPriceCents}
    />
  );
}

describe('HostPriceInput', () => {
  it('keeps host take-home and online price editable in both directions', async () => {
    const user = userEvent.setup();

    renderWithMantine(<HostPriceInputHarness />);

    const hostInput = screen.getByLabelText(/host take-home/i);
    const totalInput = screen.getByLabelText(/online price/i);

    expect(hostInput).toHaveValue('9.32');
    expect(totalInput).toHaveValue('10.00');
    expect(screen.getByText('$9.32 + $0.59 processing + $0.09 platform = $10.00')).toBeInTheDocument();

    await user.clear(hostInput);
    await user.type(hostInput, '20.00');

    expect(hostInput).toHaveValue('20.00');
    expect(totalInput).toHaveValue('21.11');
    expect(screen.getByText('$20.00 + $0.91 processing + $0.20 platform = $21.11')).toBeInTheDocument();

    await user.clear(totalInput);
    await user.type(totalInput, '25.00');

    expect(hostInput).toHaveValue('23.73');
    expect(totalInput).toHaveValue('25.00');
    expect(screen.getByText('$23.73 + $1.03 processing + $0.24 platform = $25.00')).toBeInTheDocument();
  });
});
