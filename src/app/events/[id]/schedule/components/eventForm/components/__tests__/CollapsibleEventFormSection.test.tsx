import { screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';
import { CollapsibleEventFormSection } from '../CollapsibleEventFormSection';

describe('CollapsibleEventFormSection', () => {
    it('shows its error count and first message while collapsed', () => {
        renderWithMantine(
            <CollapsibleEventFormSection
                id="section-manual-payments"
                title="Manual Payments"
                collapsed
                onToggle={jest.fn()}
                errorCount={1}
                firstErrorMessage="Enter a valid Cash App username."
            >
                <input aria-label="Cash App username" />
            </CollapsibleEventFormSection>,
        );

        expect(screen.getByRole('heading', { name: 'Manual Payments' })).toBeInTheDocument();
        expect(screen.getByLabelText('Manual Payments: 1 error')).toBeInTheDocument();
        expect(screen.getByText('Enter a valid Cash App username.')).toBeInTheDocument();
        expect(screen.queryByLabelText('Cash App username')).not.toBeVisible();
        expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false');
    });
});
