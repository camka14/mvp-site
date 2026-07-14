import { Button, Group } from '@mantine/core';
import { QrCode } from 'lucide-react';

import type { Event, Team } from '@/types';

import { collectUniqueUserIds } from './eventDetailData';
import type { createEventJoinActions } from './eventJoinActions';
import type { createEventParticipantActions } from './eventParticipantActions';
import type { buildEventDetailPublicModel } from './eventDetailPublicModel';
import type { useEventDetailPresentationController } from './hooks/useEventDetailPresentationController';
import type { useEventDivisionRegistrationModel } from './hooks/useEventDivisionRegistrationModel';
import type { useEventJoinFinalizationController } from './hooks/useEventJoinFinalizationController';
import type { useEventParticipantModel } from './hooks/useEventParticipantModel';
import type { useRegistrationWorkflowController } from './hooks/useRegistrationWorkflowController';
import type { useWeeklyEventSelectionModel } from './hooks/useWeeklyEventSelectionModel';
import { ChildRegistrationPanel } from './ChildRegistrationPanel';
import { EventIndividualRegistrationPanel } from './EventIndividualRegistrationPanel';
import { EventTeamRegistrationPanel } from './EventTeamRegistrationPanel';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };

type EventDetailRegistrationPanelsProps = {
    childrenError: string | null;
    childrenLoading: boolean;
    currentEvent: Event;
    currentUserPaymentFailed: boolean;
    divisionModel: ReturnType<typeof useEventDivisionRegistrationModel>;
    eventTeams: Team[];
    isLoadingTeams: boolean;
    joinActions: ReturnType<typeof createEventJoinActions>;
    joining: boolean;
    joiningChildFreeAgent: boolean;
    joinFinalizationController: ReturnType<typeof useEventJoinFinalizationController>;
    onManageTeams: () => void;
    onSelectedChildChange: (childId: string) => void;
    onSelectedTeamChange: (teamId: string) => void;
    onViewBracket: () => void;
    onViewSchedule: () => void;
    participantActions: ReturnType<typeof createEventParticipantActions>;
    participantModel: ReturnType<typeof useEventParticipantModel>;
    paymentFailedTeamIds: string[];
    presentationController: ReturnType<typeof useEventDetailPresentationController>;
    publicModel: ReturnType<typeof buildEventDetailPublicModel>;
    registrationWorkflowController: ReturnType<typeof useRegistrationWorkflowController>;
    renderInline: boolean;
    selectedChildId: string;
    selectedTeamId: string;
    selectedTeamIsWaitlisted: boolean;
    userTeams: Team[];
    weeklyModel: ReturnType<typeof useWeeklyEventSelectionModel>;
};

type EventDetailHostManageActionsProps = {
    onOpenQrCode: () => void;
    onViewSchedule: () => void;
    scheduleButtonLabel: string;
};

export const EventDetailHostManageActions = ({
    onOpenQrCode,
    onViewSchedule,
    scheduleButtonLabel,
}: EventDetailHostManageActionsProps) => (
    <Group grow gap="sm" wrap="wrap">
        <Button variant="light" onClick={onViewSchedule}>
            {scheduleButtonLabel}
        </Button>
        <Button
            variant="default"
            leftSection={<QrCode size={16} />}
            onClick={onOpenQrCode}
        >
            QR Code
        </Button>
    </Group>
);

export const EventDetailRegistrationPanels = ({
    childrenError,
    childrenLoading,
    currentEvent,
    currentUserPaymentFailed,
    divisionModel,
    eventTeams,
    isLoadingTeams,
    joinActions,
    joining,
    joiningChildFreeAgent,
    joinFinalizationController,
    onManageTeams,
    onSelectedChildChange,
    onSelectedTeamChange,
    onViewBracket,
    onViewSchedule,
    participantActions,
    participantModel,
    paymentFailedTeamIds,
    presentationController,
    publicModel,
    registrationWorkflowController,
    renderInline,
    selectedChildId,
    selectedTeamId,
    selectedTeamIsWaitlisted,
    userTeams,
    weeklyModel,
}: EventDetailRegistrationPanelsProps) => {
    const isTeamSignup = Boolean(currentEvent.teamSignup);
    const selectedTeamRegistration = selectedTeamId
        ? eventTeams.find((team) => team.$id === selectedTeamId || team.parentTeamId === selectedTeamId) ?? null
        : null;
    const selectedTeamUsesSchedulableSlots = isTeamSignup
        && ['LEAGUE', 'TOURNAMENT'].includes(String(currentEvent.eventType ?? '').toUpperCase());
    const selectedTeamIsRegistered = Boolean(
        selectedTeamRegistration
        || (
            !selectedTeamUsesSchedulableSlots
            && selectedTeamId
            && collectUniqueUserIds(currentEvent.teamIds).includes(selectedTeamId)
        ),
    );
    const selectedTeamPaymentFailed = Boolean(
        selectedTeamId && paymentFailedTeamIds.includes(selectedTeamId),
    );
    const joinAtCapacity = participantModel.eventAtCapacity || divisionModel.selectedDivisionAtCapacity;
    const showSelfWaitlistActions = !currentUserPaymentFailed
        && (joinAtCapacity || participantModel.isUserWaitlisted);
    const childWaitlistMode = !isTeamSignup
        && (joinAtCapacity || participantModel.selectedChildIsWaitlisted);
    const showTeamWaitlistActions = !selectedTeamPaymentFailed
        && !selectedTeamIsRegistered
        && (joinAtCapacity || selectedTeamIsWaitlisted);
    const selfJoinDisabled = weeklyModel.weeklySelectionRequired
        || Boolean(divisionModel.selfRegistrationBlockedReason)
        || joining
        || registrationWorkflowController.confirmingPurchase
        || divisionModel.isDivisionSelectionMissing;
    const selfWaitlistJoinDisabled = weeklyModel.weeklySelectionRequired
        || Boolean(divisionModel.selfRegistrationBlockedReason)
        || joining
        || divisionModel.isDivisionSelectionMissing;
    const selfWaitlistLeaveDisabled = joining || divisionModel.eventHasStarted;
    const freeAgentJoinBlockedReason = weeklyModel.weeklySelectionRequired
        ? 'Select a weekly session before joining as a free agent.'
        : divisionModel.selfRegistrationBlockedReason;
    const hostManageQrActions = (
        <EventDetailHostManageActions
            onOpenQrCode={presentationController.openQrCode}
            onViewSchedule={onViewSchedule}
            scheduleButtonLabel={publicModel.scheduleButtonLabel}
        />
    );
    const childRegistrationPanel = (
        <ChildRegistrationPanel
            visible={participantModel.shouldShowChildRegistrationPanel}
            isTeamSignup={isTeamSignup}
            waitlistMode={childWaitlistMode}
            childrenError={childrenError}
            childrenLoading={childrenLoading}
            childOptions={participantModel.childOptions}
            selectedChildId={selectedChildId}
            selectedChildPresent={Boolean(participantModel.selectedChild)}
            selectedChildHasEmail={participantModel.selectedChildHasEmail}
            selectedChildEligible={participantModel.selectedChildEligible}
            selectedChildIsFreeAgent={participantModel.selectedChildIsFreeAgent}
            selectedChildIsWaitlisted={participantModel.selectedChildIsWaitlisted}
            selectedChildIsRegistered={participantModel.selectedChildIsRegistered}
            joiningChildFreeAgent={joiningChildFreeAgent}
            registeringChild={joinFinalizationController.registeringChild}
            canRegisterChild={divisionModel.canRegisterChild}
            weeklySelectionRequired={weeklyModel.weeklySelectionRequired}
            isDivisionSelectionMissing={divisionModel.isDivisionSelectionMissing}
            hasAgeLimits={divisionModel.hasAgeLimits}
            eventMinAge={divisionModel.eventMinAge}
            eventMaxAge={divisionModel.eventMaxAge}
            showRegistrationStatus={participantModel.showChildRegistrationStatus}
            registration={joinFinalizationController.childRegistration}
            consent={joinFinalizationController.childConsent}
            comboboxProps={sharedComboboxProps}
            onChildChange={onSelectedChildChange}
            onAction={() => { void joinActions.handleRegisterChild(); }}
        />
    );

    if (isTeamSignup) {
        return (
            <EventTeamRegistrationPanel
                eventHasStarted={divisionModel.eventHasStarted}
                selectedWeeklySession={Boolean(weeklyModel.isWeeklyParentEvent && weeklyModel.selectedWeeklyOccurrenceOption)}
                showTeamJoinOptions={presentationController.teamJoinOptionsOpened}
                isLoadingTeams={isLoadingTeams}
                userTeams={userTeams}
                selectedTeamId={selectedTeamId}
                showTeamWaitlistActions={showTeamWaitlistActions}
                joining={joining}
                weeklySelectionRequired={weeklyModel.weeklySelectionRequired}
                selectedTeamIsWaitlisted={selectedTeamIsWaitlisted}
                isDivisionSelectionMissing={divisionModel.isDivisionSelectionMissing}
                selectedTeamIsRegistered={selectedTeamIsRegistered}
                confirmingPurchase={registrationWorkflowController.confirmingPurchase}
                isFreeForUser={divisionModel.isFreeForUser}
                priceCents={divisionModel.selectedDivisionBilling.priceCents}
                selectedTeamPaymentFailed={selectedTeamPaymentFailed}
                selfRegistrationBlockedReason={divisionModel.selfRegistrationBlockedReason}
                isMinor={divisionModel.isMinor}
                isUserFreeAgent={participantModel.isUserFreeAgent}
                freeAgentJoinBlockedReason={freeAgentJoinBlockedReason}
                childRegistrationPanel={childRegistrationPanel}
                canShowScheduleButton={publicModel.canShowScheduleButton}
                hostManageQrActions={hostManageQrActions}
                renderInline={renderInline}
                isTournament={currentEvent.eventType === 'TOURNAMENT'}
                sportName={typeof currentEvent.sport === 'string'
                    ? currentEvent.sport
                    : currentEvent.sport?.name}
                totalParticipants={participantModel.totalParticipants}
                participantCapacity={participantModel.participantCapacity}
                comboboxProps={sharedComboboxProps}
                onToggleTeamOptions={presentationController.toggleTeamJoinOptions}
                onSelectedTeamChange={onSelectedTeamChange}
                onManageTeams={onManageTeams}
                onJoinTeamWaitlist={() => { void joinActions.handleJoinTeamWaitlist(); }}
                onJoinAsTeam={() => { void joinActions.handleJoinAsTeam(); }}
                onWithdrawTeam={() => { void joinActions.handleWithdrawTeam(); }}
                onLeaveFreeAgents={() => { void participantActions.handleLeaveFreeAgents(); }}
                onJoinFreeAgents={() => { void participantActions.handleJoinFreeAgents(); }}
                onViewBracket={onViewBracket}
            />
        );
    }

    return (
        <EventIndividualRegistrationPanel
            selfRegistrationBlockedReason={divisionModel.selfRegistrationBlockedReason}
            isMinor={divisionModel.isMinor}
            showSelfWaitlistActions={showSelfWaitlistActions}
            isUserWaitlisted={participantModel.isUserWaitlisted}
            selfWaitlistLeaveDisabled={selfWaitlistLeaveDisabled}
            selfWaitlistJoinDisabled={selfWaitlistJoinDisabled}
            selfJoinDisabled={selfJoinDisabled}
            eventHasStarted={divisionModel.eventHasStarted}
            joining={joining}
            confirmingPurchase={registrationWorkflowController.confirmingPurchase}
            priceCents={divisionModel.selectedDivisionBilling.priceCents}
            currentUserPaymentFailed={currentUserPaymentFailed}
            canShowScheduleButton={publicModel.canShowScheduleButton}
            hostManageQrActions={hostManageQrActions}
            childRegistrationPanel={childRegistrationPanel}
            onLeaveWaitlist={() => { void participantActions.handleLeaveWaitlist(); }}
            onJoinWaitlist={() => { void joinActions.handleJoinWaitlist(); }}
            onJoinEvent={() => { void joinActions.handleJoinEvent(); }}
        />
    );
};
