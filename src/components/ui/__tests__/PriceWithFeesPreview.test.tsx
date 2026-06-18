import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PriceWithFeesPreview from '../PriceWithFeesPreview';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

describe('PriceWithFeesPreview', () => {
  it('shows the subtotal plus variable Stripe fees and opens the breakdown in a modal', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <PriceWithFeesPreview amountCents={1000} eventType="LEAGUE" />,
    );

    expect(screen.getByText('$10.10 + Stripe fees')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /fee breakdown/i });
    expect(within(dialog).getByText('BracketIQ fee (1%)')).toBeInTheDocument();
    expect(within(dialog).getByText('Stripe fees')).toBeInTheDocument();
    expect(within(dialog).getByText('Vary by payment method')).toBeInTheDocument();
    expect(screen.getAllByText('$10.10 + Stripe fees')).toHaveLength(2);
  });

  it('keeps zero-priced previews at zero instead of inventing fees', async () => {
    const user = userEvent.setup();

    renderWithMantine(<PriceWithFeesPreview amountCents={0} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /fee breakdown/i });
    expect(within(dialog).getByText('BracketIQ fee (1%)')).toBeInTheDocument();
    expect(within(dialog).queryByText('Stripe fees')).not.toBeInTheDocument();
    expect(screen.getAllByText('$0.00')).toHaveLength(4);
  });

  it('marks taxable previews as plus tax and variable Stripe fees', async () => {
    const user = userEvent.setup();

    renderWithMantine(<PriceWithFeesPreview amountCents={1000} taxable />);

    expect(screen.getByText('$10.10 + Tax + Stripe fees')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /fee breakdown/i });
    expect(within(dialog).getByText('Stripe fees')).toBeInTheDocument();
    expect(within(dialog).getByText('Vary by payment method')).toBeInTheDocument();
    expect(screen.queryByText('Stripe tax service fee')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Calculated at checkout')).toBeInTheDocument();
  });
});
