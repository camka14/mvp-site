import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import type { Bill, Event } from '@/types';

import { ManualPaymentProofDialog } from '../ManualPaymentProofDialog';

const event = {
    price: 2_500,
    manualPaymentInstructions: 'Include your team name in the note.',
    manualPaymentLinks: [{
        id: 'venmo_1',
        provider: 'VENMO',
        label: 'Pay the host',
        url: 'https://venmo.com/example',
    }],
} as Event;

const bill = {
    $id: 'bill_1',
    totalAmountCents: 2_500,
    payments: [{
        $id: 'payment_1',
        sequence: 1,
        status: 'PENDING',
        amountCents: 1_000,
    }],
} as unknown as Bill;

describe('ManualPaymentProofDialog', () => {
    it('renders the pending amount, host instructions, and payment link', () => {
        renderWithMantine(
            <ManualPaymentProofDialog
                opened
                event={event}
                bill={bill}
                zIndex={2000}
                onClose={jest.fn()}
                onSubmit={jest.fn()}
            />,
        );

        expect(screen.getByText('$10.00')).toBeInTheDocument();
        expect(screen.getByText('Include your team name in the note.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Pay the host/i })).toHaveAttribute(
            'href',
            'https://venmo.com/example',
        );
    });

    it('requires an image before forwarding submission', () => {
        const onSubmit = jest.fn();
        renderWithMantine(
            <ManualPaymentProofDialog
                opened
                event={event}
                bill={bill}
                zIndex={2000}
                onClose={jest.fn()}
                onSubmit={onSubmit}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Upload proof' }));
        expect(screen.getByText('Upload an image showing proof of payment.')).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('forwards the selected file and displays a submission error', async () => {
        const onSubmit = jest.fn().mockRejectedValue(new Error('Host review is unavailable.'));
        renderWithMantine(
            <ManualPaymentProofDialog
                opened
                event={event}
                bill={bill}
                zIndex={2000}
                onClose={jest.fn()}
                onSubmit={onSubmit}
            />,
        );
        const proof = new File(['proof'], 'proof.png', { type: 'image/png' });
        const input = document.querySelector('input[type="file"]');
        expect(input).not.toBeNull();
        fireEvent.change(input as HTMLInputElement, { target: { files: [proof] } });
        fireEvent.click(screen.getByRole('button', { name: 'Upload proof' }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(proof));
        expect(await screen.findByText('Host review is unavailable.')).toBeInTheDocument();
    });
});
