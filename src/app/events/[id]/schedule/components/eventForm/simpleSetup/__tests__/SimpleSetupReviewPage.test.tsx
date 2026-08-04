import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';
import type { EventFormValues } from '../../formTypes';
import { SimpleSetupReviewPage } from '../SimpleSetupReviewPage';
import { buildSimpleSetupReviewModel, type SimpleSetupReviewModel } from '../reviewModel';
import type { EventSetupChoices } from '../types';

const choices: EventSetupChoices = {
    scheduleStyle: 'WEEKLY_SLOTS',
    paidRegistration: true,
    useRequiredDocuments: true,
    useRegistrationQuestions: true,
    useStaffAssignments: true,
    useDedicatedOfficials: true,
    useCustomOfficialPositions: true,
    useTeamCheckInAndRosterOperations: true,
};

const buildEventData = (name = 'Summer League'): EventFormValues => ({
    name,
    description: 'A community soccer league.',
    eventType: 'LEAGUE',
    isAffiliateEvent: false,
    affiliateUrl: '',
    registrationPaymentMode: 'MANUAL',
    manualPaymentLinks: [{
        id: 'cash',
        provider: 'CASH_APP',
        label: 'League Cash App',
        url: '$privateHandle',
        avatarUrl: '',
    }],
    manualPaymentInstructions: 'Include the team name.',
    tags: [{ id: 'outdoor', name: 'Outdoor' }],
    sportId: 'soccer',
    sportConfig: {
        $id: 'soccer',
        name: 'Soccer',
        matchRulesTemplate: {
            segmentCount: 2,
            segmentLabel: 'halves',
            timekeeping: { segmentDurationMinutes: 45 },
        },
    } as EventFormValues['sportConfig'],
    teamSignup: true,
    teamSizeLimit: 14,
    singleDivision: false,
    registrationByDivisionType: true,
    splitLeaguePlayoffDivisions: false,
    divisions: ['open'],
    divisionDetails: [{
        id: 'open',
        key: 'open',
        name: 'Open',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        skillDivisionTypeId: 'open',
        skillDivisionTypeName: 'Open',
        ageDivisionTypeId: '18plus',
        ageDivisionTypeName: '18+',
        price: 12500,
        maxParticipants: 12,
        playoffTeamCount: 4,
        phaseSettings: {
            LEAGUE: { segmentLengthMinutes: 40, segmentBreakMinutes: 10 },
        },
        gamesPerOpponent: 2,
        usesSets: false,
        allowPaymentPlans: false,
        installmentDueDates: [],
        installmentDueRelativeDays: [],
        installmentAmounts: [],
        fieldIds: ['field-1'],
    }],
    playoffDivisionDetails: [],
    maxParticipants: 12,
    price: 12500,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    leagueData: {
        gamesPerOpponent: 2,
        includePlayoffs: true,
        playoffTeamCount: 4,
        usesSets: false,
        matchDurationMinutes: 90,
        restTimeMinutes: 15,
        setDurationMinutes: null,
        setsPerMatch: 0,
        pointsToVictory: [],
    },
    tournamentData: {
        doubleElimination: false,
        winnerSetCount: 0,
        loserSetCount: 0,
        winnerBracketPointsToVictory: [],
        loserBracketPointsToVictory: [],
        prize: '',
        fieldCount: 1,
        restTimeMinutes: 15,
        usesSets: false,
        matchDurationMinutes: 90,
        setDurationMinutes: null,
    },
    playoffData: {
        doubleElimination: false,
        winnerSetCount: 0,
        loserSetCount: 0,
        winnerBracketPointsToVictory: [],
        loserBracketPointsToVictory: [],
        prize: '',
        fieldCount: 1,
        restTimeMinutes: 15,
        usesSets: false,
        matchDurationMinutes: 90,
        setDurationMinutes: null,
    },
    leagueScoringConfig: {
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
        pointsPerSetWin: 0,
        pointsPerSetLoss: 0,
        pointsPerGameWin: 0,
        pointsPerGameLoss: 0,
        pointsPerGoalScored: 0,
        pointsPerGoalConceded: 0,
        $createdAt: '',
        $updatedAt: '',
    },
    start: '2026-08-10T18:00:00',
    end: '2026-10-12T20:00:00',
    noFixedEndDateTime: false,
    timeZone: 'America/Los_Angeles',
    location: 'Riverside Fields',
    address: '100 River Road',
    coordinates: [-122, 45],
    selectedFieldIds: ['field-1'],
    fields: [{ $id: 'field-1', name: 'Field 1', location: '', lat: 0, long: 0 }],
    leagueSlots: [{
        key: 'weekly-1',
        repeating: true,
        daysOfWeek: [1],
        startDate: '2026-08-10T00:00:00',
        endDate: '2026-10-12T00:00:00',
        startTimeMinutes: 1080,
        endTimeMinutes: 1200,
        scheduledFieldIds: ['field-1'],
        divisions: ['open'],
        conflicts: [],
        checking: false,
    }],
    registrationCutoffHours: 24,
    minAge: 18,
    maxAge: 40,
    cancellationRefundHours: null,
    requiredTemplateIds: ['waiver'],
    hostId: 'host-1',
    assistantHostIds: [],
    officialSchedulingMode: 'SCHEDULE',
    officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    teamCheckInMode: 'EVENT',
    teamCheckInOpenMinutesBefore: 30,
    allowMatchRosterEdits: true,
    allowTemporaryMatchPlayers: false,
    matchRulesOverride: null,
    autoCreatePointMatchIncidents: true,
} as EventFormValues);

const buildModel = (name = 'Summer League') => buildSimpleSetupReviewModel({
    eventData: buildEventData(name),
    choices,
    eventTypeOptions: [{ value: 'LEAGUE', label: 'League' }],
    selectedImageUrl: '/event.jpg',
    fields: buildEventData().fields,
    resourceOptions: [{ value: 'field-1', label: 'Field 1' }],
    templateOptions: [{ value: 'waiver', label: 'Participant waiver' }],
    registrationQuestions: [{ prompt: 'What is your team color?', required: true }],
    assignedHostCards: [{
        key: 'host',
        role: 'HOST',
        userId: 'host-1',
        displayName: 'Alex Morgan',
        status: null,
        source: 'assigned',
    }],
    assignedOfficialCards: [{
        key: 'official',
        role: 'OFFICIAL',
        userId: 'official-1',
        displayName: 'Jordan Lee',
        status: null,
        source: 'assigned',
    }],
    validationErrorIndex: {
        ordered: [{
            path: 'divisionDetails.0.playoffTeamCount',
            message: 'At least 2 teams need to be in the bracket.',
            simplePageId: 'divisions',
            advancedSectionId: 'section-division-settings',
            focusFieldName: 'divisionDetails.0.playoffTeamCount',
        }],
        bySimplePage: {
            divisions: [{
                path: 'divisionDetails.0.playoffTeamCount',
                message: 'At least 2 teams need to be in the bracket.',
                simplePageId: 'divisions',
                advancedSectionId: 'section-division-settings',
                focusFieldName: 'divisionDetails.0.playoffTeamCount',
            }],
        },
        byAdvancedSection: {},
    },
});

describe('buildSimpleSetupReviewModel', () => {
    it('builds complete human-readable sections without exposing payment destinations', () => {
        const model = buildModel();
        const titles = model.sections.map((section) => section.title);

        expect(titles).toEqual(expect.arrayContaining([
            'Format',
            'Basics',
            'Participation',
            'Divisions',
            'Schedule Structure',
            'Schedule and Location',
            'Division Rules and Scoring',
            'Pricing and Registration',
            'Documents and Questions',
            'Operations Plan',
            'Staff and Operations',
        ]));
        expect(JSON.stringify(model)).toContain('League Cash App');
        expect(JSON.stringify(model)).not.toContain('$privateHandle');
        expect(JSON.stringify(model)).toContain('Participant waiver');
        expect(JSON.stringify(model)).toContain('What is your team color?');
        expect(model.sections.find((section) => section.id === 'divisions')?.warnings)
            .toContain('At least 2 teams need to be in the bracket.');
    });

    it('reflects the current form values every time the model is rebuilt', () => {
        expect(JSON.stringify(buildModel('Updated League'))).toContain('Updated League');
        expect(JSON.stringify(buildModel('Updated League'))).not.toContain('Summer League');
    });

    it('summarizes a fixed event window without showing a stale weekly timeslot', () => {
        const eventData = buildEventData('Fixed Window Clinic');
        eventData.eventType = 'EVENT';
        const model = buildSimpleSetupReviewModel({
            eventData,
            choices: { ...choices, scheduleStyle: 'FIXED_WINDOW' },
            eventTypeOptions: [{ value: 'EVENT', label: 'Event' }],
            fields: eventData.fields,
            templateOptions: [],
            registrationQuestions: [],
            assignedHostCards: [],
            assignedOfficialCards: [],
        });
        const scheduleStructure = model.sections.find((section) => section.id === 'schedule-structure');
        const scheduleLocation = model.sections.find((section) => section.id === 'schedule-location');

        expect(scheduleStructure?.rows).toContainEqual({ label: 'Configured timeslots', value: '1' });
        expect(scheduleLocation?.groups).toEqual([]);
        expect(JSON.stringify(scheduleLocation)).not.toContain('Weekly timeslot');
    });

    it('hides bracket teams when the event format does not use a bracket', () => {
        const eventData = buildEventData('Weekly Clinic');
        eventData.eventType = 'WEEKLY_EVENT';
        eventData.leagueData.includePlayoffs = false;
        const model = buildSimpleSetupReviewModel({
            eventData,
            choices,
            eventTypeOptions: [{ value: 'WEEKLY_EVENT', label: 'Weekly Event' }],
            fields: eventData.fields,
            templateOptions: [],
            registrationQuestions: [],
            assignedHostCards: [],
            assignedOfficialCards: [],
        });

        expect(JSON.stringify(model.sections.find((section) => section.id === 'divisions')))
            .not.toContain('Bracket teams');
    });

    it('uses Monday-based weekday labels and friendly division names for weekly slots', () => {
        const eventData = buildEventData('Weekly League');
        eventData.leagueSlots[0] = {
            ...eventData.leagueSlots[0],
            daysOfWeek: [1, 3],
            startDate: undefined,
            endDate: undefined,
        };
        const model = buildSimpleSetupReviewModel({
            eventData,
            choices,
            eventTypeOptions: [{ value: 'LEAGUE', label: 'League' }],
            fields: eventData.fields,
            templateOptions: [],
            registrationQuestions: [],
            assignedHostCards: [],
            assignedOfficialCards: [],
        });
        const scheduleLocation = model.sections.find((section) => section.id === 'schedule-location');

        expect(scheduleLocation?.groups?.[0]?.rows).toEqual(expect.arrayContaining([
            { label: 'Repeats', value: 'Tuesday, Thursday' },
            { label: 'Date range', value: 'Uses the event date range' },
            { label: 'Divisions', value: 'Open' },
        ]));
    });
});

describe('SimpleSetupReviewPage', () => {
    it('renders read-only values and routes each Edit action to the section owner', () => {
        const onEditPage = jest.fn();
        const model: SimpleSetupReviewModel = {
            sections: [
                {
                    id: 'format',
                    title: 'Format',
                    ownerPageId: 'format',
                    rows: [{ label: 'Event type', value: 'League' }],
                    warnings: [],
                },
                {
                    id: 'pricing-registration',
                    title: 'Pricing and Registration',
                    ownerPageId: 'pricing-registration',
                    rows: [{ label: 'Registration price', value: '$125.00' }],
                    warnings: ['Payment destination needs attention.'],
                },
            ],
        };
        const { container } = renderWithMantine(
            <SimpleSetupReviewPage model={model} onEditPage={onEditPage} />,
        );

        expect(screen.getByText('$125.00')).toBeInTheDocument();
        expect(screen.getByText('Payment destination needs attention.')).toBeInTheDocument();
        expect(container.querySelector('input, select, textarea')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Edit Pricing and Registration' }));
        expect(onEditPage).toHaveBeenCalledWith('pricing-registration');
    });
});
