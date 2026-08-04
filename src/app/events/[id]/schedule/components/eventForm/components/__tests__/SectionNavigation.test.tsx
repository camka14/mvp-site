import { screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';
import { SectionNavigation } from '../SectionNavigation';

describe('SectionNavigation', () => {
    it.each(['desktop', 'mobile'] as const)('shows section error counts in the %s navigation', (variant) => {
        renderWithMantine(
            <SectionNavigation
                items={[
                    { id: 'section-basic-information', label: 'Basic Information' },
                    { id: 'section-manual-payments', label: 'Manual Payments', errorCount: 2 },
                ]}
                activeSectionId="section-basic-information"
                variant={variant}
                onSelectSection={jest.fn()}
            />,
        );

        expect(screen.getByLabelText('Manual Payments: 2 errors')).toHaveTextContent('2');
    });
});
