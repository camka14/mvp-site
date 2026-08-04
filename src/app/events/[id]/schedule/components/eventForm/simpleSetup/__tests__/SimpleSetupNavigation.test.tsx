import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import {
    SetupModeControl,
    SimpleSetupPageFrame,
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
                id: 'operations-plan',
                label: 'Operations Plan',
                status: 'not-used',
                used: false,
                unavailableReason: 'Not needed.',
            },
        ];
        const onSelectPage = jest.fn();
        renderWithProvider(<SimpleSetupProgressRail pages={pages} onSelectPage={onSelectPage} />);

        fireEvent.click(screen.getByRole('button', { name: 'Operations Plan: Not used' }));

        expect(onSelectPage).toHaveBeenCalledWith('operations-plan');
        expect(screen.getByRole('button', { name: 'Basics: Current' })).toHaveAttribute('aria-current', 'step');
    });

    it('leaves border, radius, and shadow ownership to the outer event form shell', () => {
        renderWithProvider(
            <SimpleSetupPageFrame
                page={{ id: 'format', label: 'Format', status: 'current', used: true }}
                isFirstUsedPage
                isLastUsedPage={false}
                canSubmit={false}
                onBack={jest.fn()}
                onNext={jest.fn()}
                onOpenControllerPage={jest.fn()}
            >
                <p>Format content</p>
            </SimpleSetupPageFrame>,
        );

        const pageFrame = screen.getByRole('region', { name: 'Format' });

        expect(pageFrame).not.toHaveClass('rounded-lg');
        expect(pageFrame).not.toHaveClass('border');
        expect(pageFrame).not.toHaveClass('shadow-sm');
    });

    it('uses the final action to create the event and disables it until the form is valid', () => {
        const onSubmit = jest.fn();
        const { rerender } = renderWithProvider(
            <SimpleSetupPageFrame
                page={{ id: 'review', label: 'Review and Publish', status: 'current', used: true }}
                isFirstUsedPage={false}
                isLastUsedPage
                canSubmit={false}
                onBack={jest.fn()}
                onNext={jest.fn()}
                onSubmit={onSubmit}
                onOpenControllerPage={jest.fn()}
            >
                <p>Review content</p>
            </SimpleSetupPageFrame>,
        );

        expect(screen.queryByRole('button', { name: 'Review event' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create Event' })).toBeDisabled();

        rerender(
            <MantineProvider>
                <SimpleSetupPageFrame
                    page={{ id: 'review', label: 'Review and Publish', status: 'current', used: true }}
                    isFirstUsedPage={false}
                    isLastUsedPage
                    canSubmit
                    onBack={jest.fn()}
                    onNext={jest.fn()}
                    onSubmit={onSubmit}
                    onOpenControllerPage={jest.fn()}
                >
                    <p>Review content</p>
                </SimpleSetupPageFrame>
            </MantineProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});
