import {
    describeEventSetupTransition,
    resolveEventSetupCapabilities,
    resolveEventSetupPages,
    resolveValidationPage,
} from '../resolveEventSetup';
import type { EventSetupResolverInput } from '../types';

const input = (overrides: Partial<EventSetupResolverInput> = {}): EventSetupResolverInput => ({
    eventType: 'EVENT',
    isExternalRegistration: false,
    singleDivision: true,
    teamSignup: false,
    includePlayoffs: false,
    includePoolPlay: false,
    splitLeaguePlayoffDivisions: false,
    hasImmutableRentalResources: false,
    organizationFeatures: [],
    choices: {
        scheduleStyle: 'FIXED_WINDOW',
        paidRegistration: false,
        useRequiredDocuments: false,
        useRegistrationQuestions: false,
        useStaffAssignments: false,
        useDedicatedOfficials: false,
        useCustomOfficialPositions: false,
        useTeamCheckInAndRosterOperations: false,
    },
    ...overrides,
});

describe('resolveEventSetupCapabilities', () => {
    it('forces tryouts into managed individual split-division behavior', () => {
        const capabilities = resolveEventSetupCapabilities(input({
            eventType: 'TRYOUT',
            singleDivision: true,
            teamSignup: true,
            organizationFeatures: ['CLUB_TEAMS'],
        }));

        expect(capabilities.isTryout).toBe(true);
        expect(capabilities.isTeamRegistration).toBe(false);
        expect(capabilities.divisionMode).toBe('SPLIT');
        expect(capabilities.canChooseDivisionMode).toBe(false);
        expect(capabilities.usesCompetition).toBe(false);
        expect(capabilities.usesOperationsPlanning).toBe(false);
    });

    it('keeps external leagues split-capable while disabling internal competition', () => {
        const capabilities = resolveEventSetupCapabilities(input({
            eventType: 'LEAGUE',
            isExternalRegistration: true,
            singleDivision: false,
            teamSignup: true,
        }));

        expect(capabilities.divisionMode).toBe('SPLIT');
        expect(capabilities.canChooseDivisionMode).toBe(true);
        expect(capabilities.usesCompetition).toBe(false);
        expect(capabilities.usesInternalRegistration).toBe(false);
    });

    it.each([
        ['EVENT', false, false, true, true],
        ['WEEKLY_EVENT', false, false, true, true],
        ['LEAGUE', false, true, true, true],
        ['TOURNAMENT', false, true, true, true],
        ['TRYOUT', false, false, true, false],
        ['EVENT', true, false, false, false],
        ['LEAGUE', true, false, false, false],
        ['TOURNAMENT', true, false, false, false],
        ['TRYOUT', true, false, false, false],
    ] as const)(
        'resolves the %s external=%s capability path',
        (eventType, isExternalRegistration, usesCompetition, usesInternalRegistration, usesOperationsPlanning) => {
            const capabilities = resolveEventSetupCapabilities(input({
                eventType,
                isExternalRegistration,
                organizationFeatures: eventType === 'TRYOUT' ? ['CLUB_TEAMS'] : [],
            }));

            expect(capabilities.usesCompetition).toBe(usesCompetition);
            expect(capabilities.usesInternalRegistration).toBe(usesInternalRegistration);
            expect(capabilities.usesOperationsPlanning).toBe(usesOperationsPlanning);
        },
    );
});

describe('resolveEventSetupPages', () => {
    it('marks dependent pages locked behind the first incomplete used page', () => {
        const pages = resolveEventSetupPages(input({ currentPageId: 'format' }));

        expect(pages[0].status).toBe('current');
        expect(pages.find((page) => page.id === 'basics')?.status).toBe('locked');
        expect(pages.map((page) => page.id)).not.toContain('competition-plan');
        expect(pages.map((page) => page.id)).not.toContain('competition-rules');
    });

    it('makes enabled document and staff pages available in order', () => {
        const setup = input({
            eventType: 'LEAGUE',
            teamSignup: true,
            choices: {
                ...input().choices,
                useRequiredDocuments: true,
                useStaffAssignments: true,
            },
            completePageIds: [
                'format',
                'basics',
                'participation-plan',
                'divisions',
                'schedule-plan',
                'schedule-location',
                'registration-plan',
                'pricing-registration',
            ],
        });
        const pages = resolveEventSetupPages(setup);

        expect(pages.find((page) => page.id === 'documents-questions')?.status).toBe('available');
        expect(pages.find((page) => page.id === 'operations-plan')?.status).toBe('locked');
        expect(pages.find((page) => page.id === 'staff-operations')?.used).toBe(true);
    });

    it('uses the Staff and Operations page only for explicit operations choices', () => {
        const teamEventWithoutOperations = resolveEventSetupPages(input({
            eventType: 'LEAGUE',
            teamSignup: true,
        }));
        expect(teamEventWithoutOperations.find((page) => page.id === 'staff-operations')?.used).toBe(false);

        const teamEventWithOperations = resolveEventSetupPages(input({
            eventType: 'LEAGUE',
            teamSignup: true,
            choices: {
                ...input().choices,
                useTeamCheckInAndRosterOperations: true,
            },
        }));
        expect(teamEventWithOperations.find((page) => page.id === 'staff-operations')?.used).toBe(true);
    });

    it.each([
        ['EVENT', false, true],
        ['WEEKLY_EVENT', false, true],
        ['LEAGUE', false, true],
        ['TOURNAMENT', false, true],
        ['TRYOUT', false, false],
        ['LEAGUE', true, false],
    ] as const)(
        'uses the expected optional pages for %s external=%s',
        (eventType, isExternalRegistration, operationsUsed) => {
            const pages = resolveEventSetupPages(input({
                eventType,
                isExternalRegistration,
                organizationFeatures: eventType === 'TRYOUT' ? ['CLUB_TEAMS'] : [],
            }));

            expect(pages.map((page) => page.id)).not.toContain('competition-plan');
            expect(pages.map((page) => page.id)).not.toContain('competition-rules');
            expect(pages.find((page) => page.id === 'operations-plan')?.used).toBe(operationsUsed);
        },
    );
});

describe('resolveValidationPage', () => {
    it.each([
        ['sportId', 'basics'],
        ['divisionDetails.0.maxParticipants', 'divisions'],
        ['divisionDetails.0.price', 'pricing-registration'],
        ['divisionDetails[1].installmentAmounts[0]', 'pricing-registration'],
        ['leagueSlots[0].scheduledFieldIds', 'schedule-location'],
        ['tournamentData.winnerSetCount', 'divisions'],
        ['installmentAmounts.1', 'pricing-registration'],
        ['officialPositions.0.name', 'staff-operations'],
    ])('maps %s to %s', (fieldPath, pageId) => {
        expect(resolveValidationPage(fieldPath)).toBe(pageId);
    });
});

describe('describeEventSetupTransition', () => {
    it('describes data affected by enabling external registration', () => {
        const impact = describeEventSetupTransition(
            input({ eventType: 'LEAGUE' }),
            input({ eventType: 'LEAGUE', isExternalRegistration: true }),
        );

        expect(impact.pageIds).toContain('divisions');
        expect(impact.pageIds).toContain('staff-operations');
        expect(impact.categories).toContain('BracketIQ payments and registration requirements');
    });

    it('invalidates downstream division-owned pages when division mode changes', () => {
        const impact = describeEventSetupTransition(
            input({ singleDivision: true }),
            input({ singleDivision: false }),
        );

        expect(impact.pageIds).toEqual([
            'divisions',
            'schedule-location',
            'pricing-registration',
        ]);
        expect(impact.categories).toContain('division-owned capacity, price, schedule, and competition settings');
    });
});
