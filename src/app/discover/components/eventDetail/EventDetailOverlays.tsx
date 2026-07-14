import type { ComponentProps } from 'react';

import type { Event, Team, UserData } from '@/types';
import { EventQrCodeModal } from '@/components/events/EventQrCodeModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import RegistrationHoldTimer from '@/components/ui/RegistrationHoldTimer';

import type { useEventCheckoutController } from './hooks/useEventCheckoutController';
import type { useEventDetailNavigationController } from './hooks/useEventDetailNavigationController';
import type { useEventDetailPresentationController } from './hooks/useEventDetailPresentationController';
import type { useEventJoinFinalizationController } from './hooks/useEventJoinFinalizationController';
import type { useEventSigningController } from './hooks/useEventSigningController';
import type { useRegistrationConfirmationController } from './hooks/useRegistrationConfirmationController';
import type { useRegistrationQuestionsController } from './hooks/useRegistrationQuestionsController';
import type { useRegistrationWorkflowController } from './hooks/useRegistrationWorkflowController';
import {
    CheckoutPreviewDialog,
    PasswordConfirmationDialog,
    PaymentPlanPreviewDialog,
    RegistrationQuestionsDialog,
    SigningDialog,
    type PaymentPlanPreviewRow,
} from './EventRegistrationDialogs';
import {
    FreeAgentActionsDialog,
    InlineEventAuthDialog,
} from './EventDetailDialogs';
import { EventParticipantDropdowns } from './EventParticipantsSection';
import { EventTeamParticipantCard } from './EventTeamParticipantCard';
import { ManualPaymentProofDialog } from './ManualPaymentProofDialog';
import { normalizePriceCents } from './divisionRegistration';

type EventDetailOverlaysProps = {
    checkoutController: ReturnType<typeof useEventCheckoutController>;
    checkoutEvent?: Event | null;
    currentEvent: Event;
    currentEventPublicUrl: string;
    currentOrganizationLogoId?: string | null;
    divisionDisplayNameIndex: Map<string, string>;
    freeAgents: UserData[];
    isLoadingEvent: boolean;
    isTeamSignup: boolean;
    joinError: string | null;
    joining: boolean;
    joinFinalizationController: ReturnType<typeof useEventJoinFinalizationController>;
    maxAuthDob: ComponentProps<typeof InlineEventAuthDialog>['maxDateOfBirth'];
    navigationController: ReturnType<typeof useEventDetailNavigationController>;
    onInviteFreeAgentToTeam: () => void;
    onContinuePaymentPlanPreview: () => void | Promise<void>;
    onParticipantReload: () => Promise<unknown> | unknown;
    onSetJoinNotice: (message: string) => void;
    participantsVisible: boolean;
    paymentPlanPreviewRows: PaymentPlanPreviewRow[];
    players: UserData[];
    presentationController: ReturnType<typeof useEventDetailPresentationController>;
    registeringChild: boolean;
    registrationConfirmationController: ReturnType<typeof useRegistrationConfirmationController>;
    registrationQuestionAnswers: Record<string, string>;
    registrationQuestions: ComponentProps<typeof RegistrationQuestionsDialog>['questions'];
    registrationQuestionsController: ReturnType<typeof useRegistrationQuestionsController>;
    registrationWorkflowController: ReturnType<typeof useRegistrationWorkflowController>;
    selectedDivisionName?: string;
    selectedDivisionPriceCents: number;
    signingController: ReturnType<typeof useEventSigningController>;
    signingModalZIndex: number;
    teams: Team[];
    user?: UserData | null;
};

export const EventDetailOverlays = ({
    checkoutController,
    checkoutEvent,
    currentEvent,
    currentEventPublicUrl,
    currentOrganizationLogoId,
    divisionDisplayNameIndex,
    freeAgents,
    isLoadingEvent,
    isTeamSignup,
    joinError,
    joining,
    joinFinalizationController,
    maxAuthDob,
    navigationController,
    onInviteFreeAgentToTeam,
    onContinuePaymentPlanPreview,
    onParticipantReload,
    onSetJoinNotice,
    participantsVisible,
    paymentPlanPreviewRows,
    players,
    presentationController,
    registeringChild,
    registrationConfirmationController,
    registrationQuestionAnswers,
    registrationQuestions,
    registrationQuestionsController,
    registrationWorkflowController,
    selectedDivisionName,
    selectedDivisionPriceCents,
    signingController,
    signingModalZIndex,
    teams,
    user,
}: EventDetailOverlaysProps) => {
    const {
        clearDiscountCode,
        clearPaymentData,
        clearProgress,
        closeBillingAddress,
        closeCheckoutPreview,
        closePayment,
        continueAfterBillingAddress,
        continueCheckoutPreview,
        discountCode,
        discountPreview,
        discountPreviewError,
        discountPreviewLoading,
        expireHold,
        holdExpiresAt,
        paymentData,
        pendingCheckout,
        applyDiscountPreview,
        changeDiscountCode,
    } = checkoutController;
    const {
        auth,
    } = navigationController;
    const {
        manualPaymentBill,
        submitManualProof,
    } = joinFinalizationController;
    const {
        closeFreeAgentActions,
        closeFreeAgentsDropdown,
        closePlayersDropdown,
        closeQrCode,
        closeTeamsDropdown,
        freeAgentsDropdownOpened,
        openFreeAgentActions,
        playersDropdownOpened,
        qrCodeOpened,
        selectedFreeAgentActionUser,
        teamsDropdownOpened,
    } = presentationController;
    const {
        confirmingPurchase,
        paymentPlanPreview,
        setManualPaymentOpened,
        setPaymentPlanPreview,
        showBillingAddressModal,
        showCheckoutPreviewModal,
        showManualPaymentModal,
        showPasswordModal,
        showPaymentModal,
        showRegistrationQuestionsModal,
        showSignModal,
    } = registrationWorkflowController;
    const {
        close: closeRegistrationQuestions,
        submit: submitRegistrationQuestions,
        updateAnswer,
    } = registrationQuestionsController;
    const {
        cancelPasswordConfirmation,
        cancelSigning,
        confirmingPassword,
        confirmPasswordAndStartSigning,
        currentSignIndex,
        handleSignedDocument,
        handleTextAcceptance,
        password,
        passwordError,
        recordingSignature,
        setPassword,
        setTextAccepted,
        signLinks,
        textAccepted,
    } = signingController;

    const renderTeam = (participant: Team | UserData) => (
        <EventTeamParticipantCard
            event={currentEvent}
            team={participant as Team}
            user={user}
            divisionNameIndex={divisionDisplayNameIndex}
            onRequireAuth={auth.open}
            onReload={onParticipantReload}
            onNotice={onSetJoinNotice}
        />
    );

    return (
        <>
            <EventQrCodeModal
                eventId={currentEvent.$id}
                eventName={currentEvent.name || 'Event'}
                eventUrl={currentEventPublicUrl}
                organizationLogoId={currentOrganizationLogoId}
                opened={qrCodeOpened}
                onClose={closeQrCode}
            />

            <EventParticipantDropdowns
                visible={participantsVisible}
                isTeamSignup={isTeamSignup}
                playersOpened={playersDropdownOpened}
                teamsOpened={teamsDropdownOpened}
                freeAgentsOpened={freeAgentsDropdownOpened}
                players={players}
                teams={teams}
                freeAgents={freeAgents}
                loading={isLoadingEvent}
                renderTeam={renderTeam}
                onClosePlayers={closePlayersDropdown}
                onCloseTeams={closeTeamsDropdown}
                onCloseFreeAgents={closeFreeAgentsDropdown}
                onOpenFreeAgentActions={openFreeAgentActions}
            />

            <InlineEventAuthDialog
                opened={auth.opened}
                mode={auth.mode}
                form={auth.form}
                loading={auth.loading}
                error={auth.error}
                maxDateOfBirth={maxAuthDob}
                verificationEmail={auth.verificationEmail}
                verificationMessage={auth.verificationMessage}
                verificationMessageType={auth.verificationMessageType}
                resendingVerification={auth.resendingVerification}
                onFieldChange={auth.updateField}
                onToggleMode={auth.toggleMode}
                onResendVerification={auth.resendVerification}
                onContinueWithGoogle={auth.continueWithGoogle}
                onSubmit={auth.submit}
                onClose={auth.close}
            />

            <FreeAgentActionsDialog
                user={selectedFreeAgentActionUser}
                eventId={currentEvent.$id ?? null}
                onInvite={onInviteFreeAgentToTeam}
                onClose={closeFreeAgentActions}
            />

            <RegistrationQuestionsDialog
                opened={showRegistrationQuestionsModal}
                questions={registrationQuestions}
                answers={registrationQuestionAnswers}
                error={joinError}
                submitting={joining || registeringChild}
                onAnswerChange={updateAnswer}
                onClose={closeRegistrationQuestions}
                onSubmit={submitRegistrationQuestions}
            />

            <PaymentPlanPreviewDialog
                opened={Boolean(paymentPlanPreview)}
                ownerLabel={paymentPlanPreview?.ownerLabel ?? 'you'}
                divisionName={selectedDivisionName}
                totalPriceCents={selectedDivisionPriceCents}
                rows={paymentPlanPreviewRows}
                onClose={() => setPaymentPlanPreview(null)}
                onContinue={onContinuePaymentPlanPreview}
            />

            <PasswordConfirmationDialog
                opened={showPasswordModal}
                password={password}
                error={passwordError}
                loading={confirmingPassword}
                onPasswordChange={setPassword}
                onClose={cancelPasswordConfirmation}
                onSubmit={confirmPasswordAndStartSigning}
            />

            <SigningDialog
                opened={showSignModal}
                signLinks={signLinks}
                currentIndex={currentSignIndex}
                textAccepted={textAccepted}
                recording={recordingSignature}
                onTextAcceptedChange={setTextAccepted}
                onAcceptText={handleTextAcceptance}
                onFinishedSigning={handleSignedDocument}
                onClose={cancelSigning}
            />

            <CheckoutPreviewDialog
                opened={showCheckoutPreviewModal && Boolean(pendingCheckout)}
                originalPriceCents={normalizePriceCents(selectedDivisionPriceCents)}
                discountCode={discountCode}
                discountPreview={discountPreview}
                discountPreviewLoading={discountPreviewLoading}
                discountPreviewError={discountPreviewError}
                checkoutError={joinError}
                joining={joining}
                onDiscountCodeChange={changeDiscountCode}
                onClearDiscount={clearDiscountCode}
                onApplyDiscount={applyDiscountPreview}
                onCheckout={continueCheckoutPreview}
                onClose={closeCheckoutPreview}
            />

            <BillingAddressModal
                opened={showBillingAddressModal}
                onClose={closeBillingAddress}
                onSaved={continueAfterBillingAddress}
            />

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={closePayment}
                event={checkoutEvent ?? currentEvent}
                paymentData={paymentData}
                onPaymentSuccess={async () => {
                    clearPaymentData();
                    clearProgress();
                    await registrationConfirmationController.confirmRegistrationAfterPayment();
                }}
                onPaymentPending={async () => {
                    clearPaymentData();
                    clearProgress();
                    await registrationConfirmationController.confirmRegistrationAfterPayment({ pendingPayment: true });
                }}
            />
            <ManualPaymentProofDialog
                opened={showManualPaymentModal}
                event={checkoutEvent ?? currentEvent}
                bill={manualPaymentBill}
                zIndex={signingModalZIndex}
                onClose={() => setManualPaymentOpened(false)}
                onSubmit={submitManualProof}
            />
            <RegistrationHoldTimer expiresAt={holdExpiresAt} onExpire={expireHold} />
        </>
    );
};
