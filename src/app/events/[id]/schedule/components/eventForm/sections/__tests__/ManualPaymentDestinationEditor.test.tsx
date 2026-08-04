import { useEffect } from 'react';
import { screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';
import type { EventFormValues } from '../../formTypes';
import { ManualPaymentDestinationEditor } from '../ManualPaymentDestinationEditor';

const links = [{
    id: 'cash_app',
    provider: 'CASH_APP',
    label: 'Cash App',
    url: '$',
}] as NonNullable<EventFormValues['manualPaymentLinks']>;

const Harness = () => {
    const { control, setError, setValue } = useForm<EventFormValues>({
        defaultValues: { manualPaymentLinks: links },
    });
    useEffect(() => {
        setError('manualPaymentLinks.0.url', {
            message: 'Enter a valid Cash App username or HTTPS link.',
        });
    }, [setError]);
    return (
        <ManualPaymentDestinationEditor
            control={control}
            links={links}
            onAddLink={jest.fn()}
            onLinkChange={(index, field, value) => setValue(
                `manualPaymentLinks.${index}.${field}`,
                value,
                { shouldDirty: true, shouldValidate: true },
            )}
            onRemoveLink={jest.fn()}
        />
    );
};

describe('ManualPaymentDestinationEditor', () => {
    it('shows provider artwork, provider-specific input copy, and inline errors', () => {
        renderWithMantine(
            <Harness />,
        );

        expect(screen.getAllByAltText('Cash App logo').length).toBeGreaterThan(0);
        expect(screen.getByLabelText('Cash App username')).toHaveAttribute(
            'placeholder',
            '$bracketiq',
        );
        expect(screen.getByText('Enter a valid Cash App username or HTTPS link.'))
            .toBeInTheDocument();
        expect(screen.getByLabelText('Cash App username')).toHaveAttribute(
            'aria-describedby',
            'manual-payment-link-0-url-error',
        );
    });
});
