import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import {
    SetupModeControl,
    SimpleSetupProgressRail,
} from '../SimpleSetupNavigation';
import type { EventSetupPage } from '../types';

describe('SimpleSetupNavigation', () => {
    const renderWithProvider = (ui: React.ReactNode) => render(
        <MantineProvider>{ui}</MantineProvider>,
    );

    it('switches between simple and advanced setup', () => {
        const onChange = jest.fn();
        renderWithProvider(<SetupModeControl value="SIMPLE" onChange={onChange} />);

        fireEvent.click(screen.getByText('Advanced Setup'));

        expect(onChange).toHaveBeenCalledWith('ADVANCED');
    });

    it('renders named progress states and allows page selection', () => {
        const pages: EventSetupPage[] = [
            { id: 'format', label: 'Format', status: 'complete', used: true },
            {
                id: 'basics',
                label: 'Basics',
                status: 'current',
                used: true,
            },
            {
                id: 'competition-rules',
                label: 'Competition Rules',
                status: 'not-used',
                used: false,
                unavailableReason: 'Not needed.',
                controlledByPageId: 'competition-plan',
            },
        ];
        const onSelectPage = jest.fn();
        renderWithProvider(<SimpleSetupProgressRail pages={pages} onSelectPage={onSelectPage} />);

        fireEvent.click(screen.getByRole('button', { name: 'Competition Rules: Not used' }));

        expect(onSelectPage).toHaveBeenCalledWith('competition-rules');
        expect(screen.getByRole('button', { name: 'Basics: Current' })).toHaveAttribute('aria-current', 'step');
    });
});
