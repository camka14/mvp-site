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
    onLinkChange,
    onRemoveLink = jest.fn(),
}: HarnessProps) => {
    const { control, setValue } = useForm<EventFormValues>({
        defaultValues: {
            manualPaymentInstructions: 'Include the team name.',
            manualPaymentLinks: links,
        },
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
                onLinkChange={onLinkChange ?? ((index, field, value) => setValue(
                    `manualPaymentLinks.${index}.${field}`,
                    value,
                    { shouldDirty: true, shouldValidate: true },
                ))}
                onRemoveLink={onRemoveLink}
            />
        </MantineProvider>
    );
};

describe('ManualPaymentSettingsSection', () => {
    it('renders payment-link fields and forwards edits and actions', () => {
        const onAddLink = jest.fn();
        const onRemoveLink = jest.fn();
        render(
            <Harness
                onAddLink={onAddLink}
                onRemoveLink={onRemoveLink}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: 'Public label' }), {
            target: { value: 'Summit United' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add payment destination' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(screen.getByRole('textbox', { name: 'Public label' })).toHaveValue('Summit United');
        expect(onAddLink).toHaveBeenCalledTimes(1);
        expect(onRemoveLink).toHaveBeenCalledWith(0);
        expect(screen.getByRole('textbox', { name: 'Manual payment instructions' })).toHaveValue('Include the team name.');
    });

    it('does not render the section when manual payments are disabled', () => {
        render(<Harness visible={false} />);
        expect(screen.queryByRole('heading', { name: 'Manual Payments' })).not.toBeInTheDocument();
    });
});
