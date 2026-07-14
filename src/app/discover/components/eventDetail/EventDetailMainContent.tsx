import type { ComponentProps, ReactNode } from 'react';

import type { Event } from '@/types';

import type { buildEventDetailPublicModel } from './eventDetailPublicModel';
import { EventDetailContent } from './EventDetailContent';
import { EventDetailHostManageActions } from './EventDetailRegistrationPanels';
import type { useEventDetailNavigationController } from './hooks/useEventDetailNavigationController';
import type { useEventDetailPresentationController } from './hooks/useEventDetailPresentationController';
import type { useEventDivisionRegistrationModel } from './hooks/useEventDivisionRegistrationModel';
import type { useEventParticipantModel } from './hooks/useEventParticipantModel';
import type { useJoinCardDocking } from './hooks/useJoinCardDocking';
import type { useWeeklyEventSelectionModel } from './hooks/useWeeklyEventSelectionModel';

type EventDetailContentProps = ComponentProps<typeof EventDetailContent>;

type EventDetailMainContentProps = {
    currentEvent: Event;
    divisionModel: ReturnType<typeof useEventDivisionRegistrationModel>;
    eventImageFallbackUrl: string;
    eventImageUrl: string;
    freeAgents: EventDetailContentProps['participantsProps']['freeAgents'];
    hasUser: boolean;
    hostUser: EventDetailContentProps['overviewProps']['hostUser'];
    isLoadingEvent: boolean;
    joinCardDocking: ReturnType<typeof useJoinCardDocking>;
    joinError: string | null;
    joinNotice: string | null;
    navigationController: ReturnType<typeof useEventDetailNavigationController>;
    onAffiliateClick: () => void;
    onClearWeeklyOccurrence?: () => void;
    onClose: () => void;
    onRefundSuccess: EventDetailContentProps['joinCardProps']['onRefundSuccess'];
    participantModel: ReturnType<typeof useEventParticipantModel>;
    players: EventDetailContentProps['participantsProps']['players'];
    presentationController: ReturnType<typeof useEventDetailPresentationController>;
    publicModel: ReturnType<typeof buildEventDetailPublicModel>;
    registrationPanel: ReactNode;
    renderInline: boolean;
    sheetPopoverZIndex: number;
    teams: EventDetailContentProps['participantsProps']['teams'];
    weeklyModel: ReturnType<typeof useWeeklyEventSelectionModel>;
};

export const EventDetailMainContent = ({
    currentEvent,
    divisionModel,
    eventImageFallbackUrl,
    eventImageUrl,
    freeAgents,
    hasUser,
    hostUser,
    isLoadingEvent,
    joinCardDocking,
    joinError,
    joinNotice,
    navigationController,
    onAffiliateClick,
    onClearWeeklyOccurrence,
    onClose,
    onRefundSuccess,
    participantModel,
    players,
    presentationController,
    publicModel,
    registrationPanel,
    renderInline,
    sheetPopoverZIndex,
    teams,
    weeklyModel,
}: EventDetailMainContentProps) => {
    const isTeamSignup = Boolean(currentEvent.teamSignup);
    const joinAtCapacity = participantModel.eventAtCapacity || divisionModel.selectedDivisionAtCapacity;
    const registrationStatusLabel = divisionModel.eventHasStarted
        ? 'Registration closed'
        : joinAtCapacity
            ? 'Waitlist available'
            : 'Registration is open';
    const registrationStatusClassName = divisionModel.eventHasStarted
        ? 'border-slate-200 bg-slate-100 text-slate-700'
        : joinAtCapacity
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900';

    return (
        <EventDetailContent
            renderInline={renderInline}
            onClose={onClose}
            sheetPopoverZIndex={sheetPopoverZIndex}
            heroProps={{
                imageUrl: eventImageUrl,
                imageFallbackUrl: eventImageFallbackUrl,
                eventName: currentEvent.name,
                eventTypeLabel: publicModel.eventTypeLabel,
                sportLabel: publicModel.sportLabel,
                registrationTypeLabel: publicModel.registrationTypeLabel,
                showHostedByLabel: publicModel.shouldShowHostedByHeroLabel,
                hostedByLabel: publicModel.hostedByLabel,
                scheduleLabel: publicModel.eventScheduleDisplayText,
                locationLabel: publicModel.eventLocationSummary,
                spotsLabel: publicModel.spotsSummary,
            }}
            overviewProps={{
                description: currentEvent.description,
                organization: publicModel.organization,
                hostUser,
                hostedByHref: publicModel.hostedByHref,
                hostedByLabel: publicModel.hostedByLabel,
                hostedByHandle: publicModel.hostedByHandle,
                isAffiliateEvent: publicModel.isAffiliateEvent,
                registrationStatusClassName,
                registrationStatusLabel,
                isEvergreenProgram: publicModel.isEvergreenProgram,
                sharesSingleDayWindow: publicModel.sharesSingleDayWindow,
                scheduleDisplayText: publicModel.eventScheduleDisplayText,
                startDate: publicModel.startDateValue,
                endDate: publicModel.endDateValue,
                displayTimeZone: publicModel.eventDisplayTimeZone,
                locationSummary: publicModel.eventLocationSummary,
                address: publicModel.eventAddress,
                mapEmbedSrc: publicModel.mapEmbedSrc,
            }}
            programDetailsProps={{
                allDivisionOptionCount: divisionModel.allDivisionOptions.length,
                eligibleDivisionCount: divisionModel.divisionOptions.length,
                divisionGroups: divisionModel.publicDivisionGroups,
                registrationByDivisionType: divisionModel.registrationByDivisionType,
                selectedDivisionId: divisionModel.selectedDivisionOption?.id,
                selectedDivisionTypeKey: divisionModel.selectedDivisionOption?.divisionTypeKey,
                onDivisionSelect: divisionModel.handlePublicDivisionSelect,
                supportsScheduleDetails: publicModel.supportsScheduleDetails,
                scheduleDateChips: publicModel.scheduleDateChips,
                schedulePreviewItems: publicModel.schedulePreviewItems,
                eventType: currentEvent.eventType,
                canViewStaffSection: publicModel.canViewStaffSection,
                sportLabel: publicModel.sportLabel,
                hostedByLabel: publicModel.hostedByLabel,
                assistantHostNames: publicModel.assistantHostNames,
                officialNames: publicModel.officialNames,
                officialSchedulingMode: currentEvent.officialSchedulingMode,
                officialPositionsSummary: publicModel.officialPositionsSummary,
            }}
            summaryProps={{
                event: currentEvent,
                isTeamSignup,
                priceCents: divisionModel.selectedDivisionBilling.priceCents,
                eventMinAge: divisionModel.eventMinAge,
                eventMaxAge: divisionModel.eventMaxAge,
                divisionLabels: divisionModel.eventDivisionLabels,
                mapEmbedSrc: publicModel.mapEmbedSrc,
                mapLat: publicModel.mapLat,
                mapLng: publicModel.mapLng,
                participantCapacity: participantModel.participantCapacity,
                registrationCutoffSummary: publicModel.registrationCutoffSummary,
            }}
            showParticipantsSection={publicModel.showParticipantsSection}
            participantsProps={{
                isTeamSignup,
                participantCapacity: participantModel.participantCapacity,
                totalParticipants: participantModel.totalParticipants,
                freeAgentCount: participantModel.normalizedFreeAgentIds.length,
                waitlistCount: participantModel.normalizedWaitlistIds.length,
                spotsLeft: participantModel.spotsLeft,
                fillPercent: participantModel.eventFillPercent,
                divisionCapacityRows: divisionModel.participantDivisionCapacityRows,
                capacityBreakdownOpened: presentationController.capacityBreakdownOpened,
                players,
                teams,
                freeAgents,
                loading: isLoadingEvent,
                onToggleCapacityBreakdown: presentationController.toggleCapacityBreakdown,
                onOpenPlayers: presentationController.openPlayersDropdown,
                onOpenTeams: presentationController.openTeamsDropdown,
                onOpenFreeAgents: presentationController.openFreeAgentsDropdown,
            }}
            joinCardProps={{
                renderInline,
                mobileExpanded: presentationController.mobileJoinExpanded,
                registrationTypeLabel: publicModel.registrationTypeLabel,
                selectedDivisionOption: divisionModel.selectedDivisionOption,
                priceCents: divisionModel.selectedDivisionBilling.priceCents,
                eventPriceSummary: publicModel.eventPriceSummary,
                joinError,
                joinNotice,
                event: currentEvent,
                eventImageUrl,
                affiliateActionUrl: publicModel.affiliateActionUrl,
                isAffiliateEvent: publicModel.isAffiliateEvent,
                isWeeklyParentEvent: weeklyModel.isWeeklyParentEvent,
                selectedWeeklyOccurrenceOption: weeklyModel.selectedWeeklyOccurrenceOption,
                weeklySessionOptions: weeklyModel.weeklySessionOptions,
                weeklySelectionRequired: weeklyModel.weeklySelectionRequired,
                hasAgeLimits: divisionModel.hasAgeLimits,
                eventMinAge: divisionModel.eventMinAge,
                eventMaxAge: divisionModel.eventMaxAge,
                divisionOptionCount: divisionModel.divisionOptions.length,
                registrationCutoffSummary: publicModel.registrationCutoffSummary,
                refundSummary: publicModel.refundSummary,
                isDivisionSelectionMissing: divisionModel.isDivisionSelectionMissing,
                registrationByDivisionType: divisionModel.registrationByDivisionType,
                hasUser,
                isUserRegistered: Boolean(participantModel.isUserRegistered),
                totalParticipants: participantModel.totalParticipants,
                participantCapacity: participantModel.participantCapacity,
                canShowScheduleButton: publicModel.canShowScheduleButton,
                hostManageQrActions: (
                    <EventDetailHostManageActions
                        onOpenQrCode={presentationController.openQrCode}
                        onViewSchedule={navigationController.viewSchedule}
                        scheduleButtonLabel={publicModel.scheduleButtonLabel}
                    />
                ),
                isTournament: currentEvent.eventType === 'TOURNAMENT',
                registrationPanel,
                hasRefundTarget: participantModel.hasRefundTarget,
                activeChildren: participantModel.activeChildren,
                selectedWeeklyOccurrence: weeklyModel.selectedWeeklyOccurrence,
                eventStartDate: divisionModel.eventStartDate,
                showSecurePaymentNote: publicModel.showSecurePaymentNote,
                showPoweredByBracketIqNote: publicModel.showPoweredByBracketIqNote,
                onToggleMobile: presentationController.toggleMobileJoin,
                onAffiliateClick,
                onClearWeeklyOccurrence,
                onWeeklySessionSelect: (session) => {
                    void navigationController.selectWeeklySession(session);
                },
                onAuthenticate: navigationController.auth.open,
                onViewBracket: navigationController.viewBracket,
                onRefundSuccess,
            }}
            joinCardAnchorRef={joinCardDocking.anchorRef}
            joinCardRef={joinCardDocking.cardRef}
            joinCardDocked={joinCardDocking.layout.docked}
            joinCardHeight={joinCardDocking.layout.height}
            joinCardLeft={joinCardDocking.layout.left}
            joinCardWidth={joinCardDocking.layout.width}
        />
    );
};
