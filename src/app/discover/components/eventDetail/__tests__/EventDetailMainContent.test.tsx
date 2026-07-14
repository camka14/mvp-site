import { createRef, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import type { Event } from '@/types';

import { EventDetailMainContent } from '../EventDetailMainContent';

jest.mock('../EventDetailContent', () => ({
    EventDetailContent: ({
        joinCardDocked,
        joinCardProps,
        overviewProps,
        participantsProps,
    }: {
        joinCardDocked: boolean;
        joinCardProps: {
            onAffiliateClick: () => void;
            onAuthenticate: () => void;
            onClearWeeklyOccurrence?: () => void;
            onWeeklySessionSelect: (session: never) => void;
        };
        overviewProps: {
            registrationStatusClassName: string;
            registrationStatusLabel: string;
        };
        participantsProps: {
            freeAgentCount: number;
            waitlistCount: number;
        };
    }) => (
        <div>
            <div>Status: {overviewProps.registrationStatusLabel}</div>
            <div>Status class: {overviewProps.registrationStatusClassName}</div>
            <div>Free agents: {participantsProps.freeAgentCount}</div>
            <div>Waitlist: {participantsProps.waitlistCount}</div>
            <div>Docked: {String(joinCardDocked)}</div>
            <button type="button" onClick={joinCardProps.onAffiliateClick}>Affiliate</button>
            <button type="button" onClick={joinCardProps.onAuthenticate}>Authenticate</button>
            <button type="button" onClick={joinCardProps.onClearWeeklyOccurrence}>Clear weekly</button>
            <button
                type="button"
                onClick={() => joinCardProps.onWeeklySessionSelect({
                    slotId: 'slot_1',
                    occurrenceDate: '2026-07-21',
                } as never)}
            >
                Select weekly
            </button>
        </div>
    ),
}));
jest.mock('../EventDetailRegistrationPanels', () => ({
    EventDetailHostManageActions: () => <div>Host actions</div>,
}));

type MainContentProps = ComponentProps<typeof EventDetailMainContent>;

const buildProps = (
    overrides: Partial<MainContentProps> = {},
): MainContentProps => ({
    currentEvent: {
        $id: 'event_1',
        eventType: 'LEAGUE',
        name: 'Summer League',
        teamSignup: false,
    } as Event,
    divisionModel: {
        allDivisionOptions: [],
        divisionOptions: [],
        eventDivisionLabels: [],
        eventHasStarted: false,
        eventMaxAge: null,
        eventMinAge: null,
        eventStartDate: new Date('2026-07-21T18:00:00.000Z'),
        handlePublicDivisionSelect: jest.fn(),
        hasAgeLimits: false,
        isDivisionSelectionMissing: false,
        participantDivisionCapacityRows: [],
        publicDivisionGroups: [],
        registrationByDivisionType: false,
        selectedDivisionAtCapacity: false,
        selectedDivisionBilling: { priceCents: 0 },
        selectedDivisionOption: null,
    } as unknown as MainContentProps['divisionModel'],
    eventImageFallbackUrl: '/fallback.png',
    eventImageUrl: '/event.png',
    freeAgents: [],
    hasUser: true,
    hostUser: null,
    isLoadingEvent: false,
    joinCardDocking: {
        anchorRef: createRef<HTMLDivElement>(),
        cardRef: createRef<HTMLDivElement>(),
        layout: { docked: true, height: 240, left: 80, width: 360 },
    } as MainContentProps['joinCardDocking'],
    joinError: null,
    joinNotice: null,
    navigationController: {
        auth: { open: jest.fn() },
        selectWeeklySession: jest.fn(),
        viewBracket: jest.fn(),
        viewSchedule: jest.fn(),
    } as unknown as MainContentProps['navigationController'],
    onAffiliateClick: jest.fn(),
    onClearWeeklyOccurrence: jest.fn(),
    onClose: jest.fn(),
    onRefundSuccess: jest.fn(),
    participantModel: {
        activeChildren: [],
        eventAtCapacity: true,
        eventFillPercent: 50,
        hasRefundTarget: false,
        isUserRegistered: false,
        normalizedFreeAgentIds: ['user_1', 'user_2'],
        normalizedWaitlistIds: ['user_3'],
        participantCapacity: 12,
        spotsLeft: 6,
        totalParticipants: 6,
    } as unknown as MainContentProps['participantModel'],
    players: [],
    presentationController: {
        capacityBreakdownOpened: false,
        mobileJoinExpanded: false,
        openFreeAgentsDropdown: jest.fn(),
        openPlayersDropdown: jest.fn(),
        openQrCode: jest.fn(),
        openTeamsDropdown: jest.fn(),
        toggleCapacityBreakdown: jest.fn(),
        toggleMobileJoin: jest.fn(),
    } as unknown as MainContentProps['presentationController'],
    publicModel: {
        affiliateActionUrl: 'https://example.test/register',
        assistantHostNames: [],
        canShowScheduleButton: true,
        canViewStaffSection: false,
        endDateValue: null,
        eventAddress: null,
        eventDisplayTimeZone: 'America/Los_Angeles',
        eventLocationSummary: 'River City Sports Club',
        eventPriceSummary: 'Free',
        eventScheduleDisplayText: 'July 21 at 6:00 PM',
        eventTypeLabel: 'League',
        hostedByHandle: null,
        hostedByHref: null,
        hostedByLabel: 'River City Sports Club',
        isAffiliateEvent: false,
        isEvergreenProgram: false,
        mapEmbedSrc: null,
        mapLat: null,
        mapLng: null,
        officialNames: [],
        officialPositionsSummary: null,
        organization: null,
        refundSummary: null,
        registrationCutoffSummary: null,
        registrationTypeLabel: 'Individual registration',
        scheduleButtonLabel: 'View schedule',
        scheduleDateChips: [],
        schedulePreviewItems: [],
        sharesSingleDayWindow: true,
        shouldShowHostedByHeroLabel: true,
        showParticipantsSection: true,
        showPoweredByBracketIqNote: false,
        showSecurePaymentNote: false,
        spotsSummary: '6 spots left',
        sportLabel: 'Volleyball',
        startDateValue: new Date('2026-07-21T18:00:00.000Z'),
        supportsScheduleDetails: true,
    } as unknown as MainContentProps['publicModel'],
    registrationPanel: <div>Registration panel</div>,
    renderInline: true,
    sheetPopoverZIndex: 1800,
    teams: [],
    weeklyModel: {
        isWeeklyParentEvent: true,
        selectedWeeklyOccurrence: null,
        selectedWeeklyOccurrenceOption: null,
        weeklySelectionRequired: true,
        weeklySessionOptions: [],
    } as unknown as MainContentProps['weeklyModel'],
    ...overrides,
});

describe('EventDetailMainContent', () => {
    it('composes capacity state, participant counts, layout, and navigation actions', () => {
        const props = buildProps();
        render(<EventDetailMainContent {...props} />);

        expect(screen.getByText('Status: Waitlist available')).toBeInTheDocument();
        expect(screen.getByText('Status class: border-amber-200 bg-amber-50 text-amber-900')).toBeInTheDocument();
        expect(screen.getByText('Free agents: 2')).toBeInTheDocument();
        expect(screen.getByText('Waitlist: 1')).toBeInTheDocument();
        expect(screen.getByText('Docked: true')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Affiliate' }));
        fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear weekly' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select weekly' }));

        expect(props.onAffiliateClick).toHaveBeenCalledTimes(1);
        expect(props.navigationController.auth.open).toHaveBeenCalledTimes(1);
        expect(props.onClearWeeklyOccurrence).toHaveBeenCalledTimes(1);
        expect(props.navigationController.selectWeeklySession).toHaveBeenCalledWith({
            slotId: 'slot_1',
            occurrenceDate: '2026-07-21',
        });
    });

    it('gives a started event precedence over capacity state', () => {
        const props = buildProps({
            divisionModel: {
                ...buildProps().divisionModel,
                eventHasStarted: true,
            },
        });

        render(<EventDetailMainContent {...props} />);

        expect(screen.getByText('Status: Registration closed')).toBeInTheDocument();
        expect(screen.getByText('Status class: border-slate-200 bg-slate-100 text-slate-700')).toBeInTheDocument();
    });
});
