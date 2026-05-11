import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PriceWithFeesPreview from '../PriceWithFeesPreview';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

describe('PriceWithFeesPreview', () => {
  it('shows the fee-inclusive total and opens the breakdown in a modal', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <PriceWithFeesPreview amountCents={1000} eventType="LEAGUE" />,
    );

    expect(screen.getByText('$10.92')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /fee breakdown/i });
    expect(within(dialog).getByText('BracketIQ fee (3%)')).toBeInTheDocument();
    expect(within(dialog).getByText('Stripe fee')).toBeInTheDocument();
    expect(screen.getAllByText('$10.92')).toHaveLength(2);
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
    expect(screen.getAllByText('$0.00')).toHaveLength(5);
  });

  it('lumps tax service costs into the Stripe fee and marks taxable previews as + Tax', async () => {
    const user = userEvent.setup();

    renderWithMantine(<PriceWithFeesPreview amountCents={1000} taxable />);

    expect(screen.getByText('$11.23 + Tax')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /fee breakdown/i });
    expect(within(dialog).getByText('Stripe fee')).toBeInTheDocument();
    expect(within(dialog).getByText('$1.13')).toBeInTheDocument();
    expect(screen.queryByText('Stripe tax service fee')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Calculated at checkout')).toBeInTheDocument();
  });
});
