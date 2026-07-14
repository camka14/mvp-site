import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { Event } from '@/types';

import { EventDetailOverlays } from '../EventDetailOverlays';

jest.mock('@/components/events/EventQrCodeModal', () => ({ EventQrCodeModal: () => null }));
jest.mock('@/components/ui/BillingAddressModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ui/RegistrationHoldTimer', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ui/PaymentModal', () => ({
    __esModule: true,
    default: ({ onPaymentSuccess, onPaymentPending }: {
        onPaymentSuccess: () => Promise<void>;
        onPaymentPending: () => Promise<void>;
    }) => (
        <div>
            <button type="button" onClick={() => { void onPaymentSuccess(); }}>Payment success</button>
            <button type="button" onClick={() => { void onPaymentPending(); }}>Payment pending</button>
        </div>
    ),
}));
jest.mock('../EventRegistrationDialogs', () => ({
    CheckoutPreviewDialog: () => null,
    PasswordConfirmationDialog: () => null,
    PaymentPlanPreviewDialog: () => null,
    RegistrationQuestionsDialog: () => null,
    SigningDialog: () => null,
}));
jest.mock('../EventDetailDialogs', () => ({
    FreeAgentActionsDialog: () => null,
    InlineEventAuthDialog: () => null,
}));
jest.mock('../EventParticipantsSection', () => ({ EventParticipantDropdowns: () => null }));
jest.mock('../EventTeamParticipantCard', () => ({ EventTeamParticipantCard: () => null }));
jest.mock('../ManualPaymentProofDialog', () => ({
    ManualPaymentProofDialog: ({ onClose }: { onClose: () => void }) => (
        <button type="button" onClick={onClose}>Close manual payment</button>
    ),
}));

type EventDetailOverlaysProps = ComponentProps<typeof EventDetailOverlays>;

const buildProps = (): EventDetailOverlaysProps => ({
    checkoutController: {
        clearPaymentData: jest.fn(),
        clearProgress: jest.fn(),
    } as unknown as EventDetailOverlaysProps['checkoutController'],
    currentEvent: {
        $id: 'event_1',
        name: 'Summer League',
    } as Event,
    currentEventPublicUrl: 'https://bracket-iq.com/events/event_1',
    divisionDisplayNameIndex: new Map(),
    freeAgents: [],
    isLoadingEvent: false,
    isTeamSignup: false,
    joinError: null,
    joining: false,
    joinFinalizationController: {} as EventDetailOverlaysProps['joinFinalizationController'],
    maxAuthDob: '2013-07-14',
    navigationController: {
        auth: {},
    } as EventDetailOverlaysProps['navigationController'],
    onContinuePaymentPlanPreview: jest.fn(),
    onInviteFreeAgentToTeam: jest.fn(),
    onParticipantReload: jest.fn(),
    onSetJoinNotice: jest.fn(),
    participantsVisible: false,
    paymentPlanPreviewRows: [],
    players: [],
    presentationController: {} as EventDetailOverlaysProps['presentationController'],
    registeringChild: false,
    registrationConfirmationController: {
        confirmRegistrationAfterPayment: jest.fn().mockResolvedValue(undefined),
    } as EventDetailOverlaysProps['registrationConfirmationController'],
    registrationQuestionAnswers: {},
    registrationQuestions: [],
    registrationQuestionsController: {} as EventDetailOverlaysProps['registrationQuestionsController'],
    registrationWorkflowController: {
        setManualPaymentOpened: jest.fn(),
    } as EventDetailOverlaysProps['registrationWorkflowController'],
    selectedDivisionPriceCents: 2500,
    signingController: {} as EventDetailOverlaysProps['signingController'],
    signingModalZIndex: 2000,
    teams: [],
});

describe('EventDetailOverlays', () => {
    it('clears checkout state before confirming a successful payment', async () => {
        const props = buildProps();
        render(<EventDetailOverlays {...props} />);

        fireEvent.click(screen.getByRole('button', { name: 'Payment success' }));

        await waitFor(() => {
            expect(props.checkoutController.clearPaymentData).toHaveBeenCalledTimes(1);
            expect(props.checkoutController.clearProgress).toHaveBeenCalledTimes(1);
            expect(props.registrationConfirmationController.confirmRegistrationAfterPayment).toHaveBeenCalledWith();
        });
    });

    it('marks pending payment confirmation and closes manual payment through the workflow owner', async () => {
        const props = buildProps();
        render(<EventDetailOverlays {...props} />);

        fireEvent.click(screen.getByRole('button', { name: 'Payment pending' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close manual payment' }));

        await waitFor(() => {
            expect(props.registrationConfirmationController.confirmRegistrationAfterPayment).toHaveBeenCalledWith({ pendingPayment: true });
        });
        expect(props.registrationWorkflowController.setManualPaymentOpened).toHaveBeenCalledWith(false);
    });
});
