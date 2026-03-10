import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PriceWithFeesPreview from '../PriceWithFeesPreview';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

describe('PriceWithFeesPreview', () => {
  it('shows the fee-inclusive total and expandable breakdown', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <PriceWithFeesPreview amountCents={1000} eventType="LEAGUE" />,
    );

    expect(screen.getByText('$10.92')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    expect(screen.getByText('BracketIQ fee (3%)')).toBeInTheDocument();
    expect(
      screen.getByText('Stripe fee (2.9% + $0.30)'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('$10.92')).toHaveLength(2);
  });

  it('keeps zero-priced previews at zero instead of inventing fees', async () => {
    const user = userEvent.setup();

    renderWithMantine(<PriceWithFeesPreview amountCents={0} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show fee breakdown/i }),
    );

    expect(screen.getByText('BracketIQ fee (1%)')).toBeInTheDocument();
    expect(screen.getAllByText('$0.00')).toHaveLength(5);
  });
});
