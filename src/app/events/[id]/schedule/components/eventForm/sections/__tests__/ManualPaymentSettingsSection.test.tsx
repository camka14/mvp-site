import {
    fireEvent,
    render,
    screen,
} from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useForm } from 'react-hook-form';

import type { EventFormValues } from '../../formTypes';
import { ManualPaymentSettingsSection } from '../ManualPaymentSettingsSection';

const links = [{
    id: 'link_1',
    provider: 'VENMO',
    label: 'River City Sports Club',
    url: 'https://venmo.com/u/river-city-sports',
}] as NonNullable<EventFormValues['manualPaymentLinks']>;

type HarnessProps = {
    visible?: boolean;
    onAddLink?: () => void;
    onLinkChange?: (index: number, field: 'provider' | 'label' | 'url', value: string) => void;
    onRemoveLink?: (index: number) => void;
};

const Harness = ({
    visible = true,
    onAddLink = jest.fn(),
    onLinkChange = jest.fn(),
    onRemoveLink = jest.fn(),
}: HarnessProps) => {
    const { control } = useForm<EventFormValues>({
        defaultValues: { manualPaymentInstructions: 'Include the team name.' },
    });
    return (
        <MantineProvider>
            <ManualPaymentSettingsSection
                visible={visible}
                collapsed={false}
                control={control}
                links={links}
                onToggle={jest.fn()}
                onAddLink={onAddLink}
                onLinkChange={onLinkChange}
                onRemoveLink={onRemoveLink}
            />
        </MantineProvider>
    );
};

describe('ManualPaymentSettingsSection', () => {
    it('renders payment-link fields and forwards edits and actions', () => {
        const onAddLink = jest.fn();
        const onLinkChange = jest.fn();
        const onRemoveLink = jest.fn();
        render(
            <Harness
                onAddLink={onAddLink}
                onLinkChange={onLinkChange}
                onRemoveLink={onRemoveLink}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
            target: { value: 'Summit United' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add payment link' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(onLinkChange).toHaveBeenCalledWith(0, 'label', 'Summit United');
        expect(onAddLink).toHaveBeenCalledTimes(1);
        expect(onRemoveLink).toHaveBeenCalledWith(0);
        expect(screen.getByRole('textbox', { name: 'Manual payment instructions' })).toHaveValue('Include the team name.');
    });

    it('does not render the section when manual payments are disabled', () => {
        render(<Harness visible={false} />);
        expect(screen.queryByRole('heading', { name: 'Manual Payments' })).not.toBeInTheDocument();
    });
});
