import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PriceWithFeesPreview from '../PriceWithFeesPreview';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

describe('PriceWithFeesPreview', () => {
  it('shows the online price with included fees and opens the breakdown in a modal', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <PriceWithFeesPreview amountCents={1000} eventType="LEAGUE" />,
    );

    expect(screen.getByText('$10.00')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /fee breakdown/i });
    expect(within(dialog).getByText('BracketIQ fee (1%)')).toBeInTheDocument();
    expect(within(dialog).getByText('Processing fee')).toBeInTheDocument();
    expect(within(dialog).getByText('Host take-home')).toBeInTheDocument();
    expect(within(dialog).queryByText('Stripe fees')).not.toBeInTheDocument();
    expect(screen.getAllByText('$10.00')).toHaveLength(3);
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
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(4);
  });

  it('marks taxable previews as plus tax without adding visible Stripe fees', async () => {
    const user = userEvent.setup();

    renderWithMantine(<PriceWithFeesPreview amountCents={1000} taxable />);

    expect(screen.getByText('$10.00 + Tax')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /fee breakdown/i });
    expect(within(dialog).queryByText('Stripe fees')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Processing fee')).toBeInTheDocument();
    expect(screen.queryByText('Stripe tax service fee')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Calculated at checkout')).toBeInTheDocument();
  });
});
