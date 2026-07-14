import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import {
    CheckoutPreviewDialog,
    PasswordConfirmationDialog,
    PaymentPlanPreviewDialog,
    RegistrationQuestionsDialog,
    SigningDialog,
} from '../EventRegistrationDialogs';

describe('EventRegistrationDialogs', () => {
    it('forwards question edits and submission without owning workflow state', () => {
        const onAnswerChange = jest.fn();
        const onSubmit = jest.fn();

        renderWithMantine(
            <RegistrationQuestionsDialog
                opened
                questions={[{
                    id: 'question_1',
                    scopeType: 'EVENT',
                    scopeId: 'event_1',
                    prompt: 'Why are you joining?',
                    answerType: 'LONG_TEXT',
                    required: true,
                    sortOrder: 0,
                }]}
                answers={{ question_1: 'To compete' }}
                error={null}
                submitting={false}
                onAnswerChange={onAnswerChange}
                onClose={jest.fn()}
                onSubmit={onSubmit}
            />,
        );

        fireEvent.change(screen.getByLabelText(/Why are you joining\?/), {
            target: { value: 'To learn' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        expect(onAnswerChange).toHaveBeenCalledWith('question_1', 'To learn');
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('renders the payment-plan view model and continues through its action', () => {
        const onContinue = jest.fn();

        renderWithMantine(
            <PaymentPlanPreviewDialog
                opened
                ownerLabel="Taylor"
                divisionName="Open"
                totalPriceCents={3000}
                rows={[{
                    id: 'installment_1',
                    installmentNumber: 1,
                    amountCents: 1500,
                    dueDateLabel: 'July 20, 2026',
                }]}
                onClose={jest.fn()}
                onContinue={onContinue}
            />,
        );

        expect(screen.getByText(/payment plan for Taylor/i)).toBeInTheDocument();
        expect(screen.getByText('Division: Open')).toBeInTheDocument();
        expect(screen.getByText('Due July 20, 2026')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Continue with Payment Plan' }));
        expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('forwards password confirmation to the controller action', () => {
        const onPasswordChange = jest.fn();
        const onSubmit = jest.fn();

        renderWithMantine(
            <PasswordConfirmationDialog
                opened
                password="secret-password"
                error={null}
                loading={false}
                onPasswordChange={onPasswordChange}
                onClose={jest.fn()}
                onSubmit={onSubmit}
            />,
        );

        fireEvent.change(screen.getByLabelText(/Password/), {
            target: { value: 'next-password' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        expect(onPasswordChange).toHaveBeenCalledWith('next-password');
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('renders a text signing step and forwards acceptance', () => {
        const onTextAcceptedChange = jest.fn();
        const onAcceptText = jest.fn();

        renderWithMantine(
            <SigningDialog
                opened
                signLinks={[{
                    templateId: 'template_1',
                    type: 'TEXT',
                    title: 'Participant waiver',
                    content: 'Waiver terms',
                    requiredSignerLabel: 'Participant',
                }]}
                currentIndex={0}
                textAccepted
                recording={false}
                onTextAcceptedChange={onTextAcceptedChange}
                onAcceptText={onAcceptText}
                onFinishedSigning={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        expect(screen.getByText('Waiver terms')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('I agree to the waiver above.'));
        fireEvent.click(screen.getByRole('button', { name: 'Accept and continue' }));

        expect(onTextAcceptedChange).toHaveBeenCalledWith(false);
        expect(onAcceptText).toHaveBeenCalledTimes(1);
    });

    it('derives discount readiness while forwarding checkout actions', () => {
        const onApplyDiscount = jest.fn();
        const onCheckout = jest.fn();

        renderWithMantine(
            <CheckoutPreviewDialog
                opened
                originalPriceCents={5000}
                discountCode="SAVE10"
                discountPreview={{
                    code: 'SAVE10',
                    applied: true,
                    originalAmountCents: 5000,
                    discountAmountCents: 500,
                    discountedAmountCents: 4500,
                }}
                discountPreviewLoading={false}
                discountPreviewError={null}
                checkoutError={null}
                joining={false}
                onDiscountCodeChange={jest.fn()}
                onClearDiscount={jest.fn()}
                onApplyDiscount={onApplyDiscount}
                onCheckout={onCheckout}
                onClose={jest.fn()}
            />,
        );

        expect(screen.getByText('Discount')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));

        expect(onApplyDiscount).toHaveBeenCalledTimes(1);
        expect(onCheckout).toHaveBeenCalledTimes(1);
    });
});
