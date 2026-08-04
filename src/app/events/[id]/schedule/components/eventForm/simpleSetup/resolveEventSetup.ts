import { organizationHasFeature } from '@/lib/organizationFeatures';

import { resolveSimpleSetupValidationPage } from '../errorOwnership';
import {
    EVENT_SETUP_PAGE_IDS,
    type EventSetupCapabilities,
    type EventSetupPage,
    type EventSetupPageId,
    type EventSetupResolverInput,
    type EventSetupTransitionImpact,
} from './types';

const PAGE_LABELS: Record<EventSetupPageId, string> = {
    format: 'Format',
    basics: 'Basics',
    'participation-plan': 'Participation Plan',
    divisions: 'Divisions',
    'schedule-plan': 'Schedule Plan',
    'schedule-location': 'Schedule & Location',
    'registration-plan': 'Registration Plan',
    'pricing-registration': 'Pricing & Registration',
    'documents-questions': 'Documents & Questions',
    'operations-plan': 'Operations Plan',
    'staff-operations': 'Staff & Operations',
    'review-publish': 'Review & Publish',
};

const PAGE_CONTROLLER: Partial<Record<EventSetupPageId, EventSetupPageId>> = {
    divisions: 'participation-plan',
    'schedule-location': 'schedule-plan',
    'pricing-registration': 'registration-plan',
    'documents-questions': 'registration-plan',
    'staff-operations': 'operations-plan',
};

export const resolveEventSetupCapabilities = (
    input: EventSetupResolverInput,
): EventSetupCapabilities => {
    const isExternal = input.isExternalRegistration;
    const isTryout = input.eventType === 'TRYOUT';
    const isLeague = input.eventType === 'LEAGUE';
    const isTournament = input.eventType === 'TOURNAMENT';
    const isWeekly = input.eventType === 'WEEKLY_EVENT';
    const isManaged = !isExternal;
    const isTeamRegistration = isManaged && (isLeague || isTournament || input.teamSignup) && !isTryout;
    const usesOperationsPlanning = isManaged && !isTryout;

    return {
        isExternal,
        isManaged,
        isTryout,
        isLeague,
        isTournament,
        isWeekly,
        isTeamRegistration,
        divisionMode: isTryout || !input.singleDivision ? 'SPLIT' : 'SHARED',
        canChooseTeamRegistration: isManaged && !isTryout && !isLeague && !isTournament,
        canChooseDivisionMode: !isTryout,
        canUseRegistrationByDivisionType: isManaged && !isTryout && !input.singleDivision,
        canUseLeaguePlayoffs: isManaged && isLeague,
        canSplitLeaguePlayoffDivisions: isManaged
            && isLeague
            && input.includePlayoffs
            && !input.singleDivision
            && !input.hasImmutableRentalResources,
        canUsePoolPlay: isManaged && isTournament,
        usesInternalSchedule: isManaged,
        usesCompetition: isManaged && (isLeague || isTournament),
        usesInternalRegistration: isManaged,
        usesDocumentsAndQuestions: isManaged
            && (input.choices.useRequiredDocuments || input.choices.useRegistrationQuestions),
        usesOperationsPlanning,
        usesStaffAndOperations: usesOperationsPlanning && (
            input.choices.useStaffAssignments
            || input.choices.useDedicatedOfficials
            || input.choices.useTeamCheckInAndRosterOperations
        ),
        supportsTryoutType: organizationHasFeature(input.organizationFeatures, 'CLUB_TEAMS') || isTryout,
    };
};

const resolvePageUsage = (
    pageId: EventSetupPageId,
    capabilities: EventSetupCapabilities,
): { used: boolean; reason?: string } => {
    if (pageId === 'documents-questions') {
        return capabilities.usesDocumentsAndQuestions
            ? { used: true }
            : { used: false, reason: capabilities.isExternal
                ? 'External registration handles requirements on the linked website.'
                : 'Enable documents or questions on Registration Plan.' };
    }
    if (pageId === 'operations-plan') {
        return capabilities.usesOperationsPlanning
            ? { used: true }
            : { used: false, reason: capabilities.isExternal
                ? 'External listings do not use BracketIQ event operations.'
                : 'Tryouts do not use staff operations under the current event contract.' };
    }
    if (pageId === 'staff-operations') {
        return capabilities.usesStaffAndOperations
            ? { used: true }
            : { used: false, reason: capabilities.usesOperationsPlanning
                ? 'Enable staff, officials, or team operations on Operations Plan.'
                : 'This event path does not use BracketIQ staff operations.' };
    }
    return { used: true };
};

export const resolveEventSetupPages = (
    input: EventSetupResolverInput,
): EventSetupPage[] => {
    const capabilities = resolveEventSetupCapabilities(input);
    const completePageIds = new Set(input.completePageIds ?? []);
    let earliestIncompleteUsedPage: EventSetupPageId | undefined;

    return EVENT_SETUP_PAGE_IDS.map((pageId) => {
        const usage = resolvePageUsage(pageId, capabilities);
        const controlledByPageId = PAGE_CONTROLLER[pageId];

        if (!usage.used) {
            return {
                id: pageId,
                label: PAGE_LABELS[pageId],
                status: 'not-used',
                used: false,
                controlledByPageId,
                unavailableReason: usage.reason,
            };
        }

        const prerequisitePageId = earliestIncompleteUsedPage;
        let status: EventSetupPage['status'];
        if (pageId === input.currentPageId) {
            status = 'current';
        } else if (completePageIds.has(pageId)) {
            status = 'complete';
        } else if (prerequisitePageId) {
            status = 'locked';
        } else {
            status = 'available';
        }

        if (!completePageIds.has(pageId) && !earliestIncompleteUsedPage) {
            earliestIncompleteUsedPage = pageId;
        }

        return {
            id: pageId,
            label: PAGE_LABELS[pageId],
            status,
            used: true,
            prerequisitePageId,
            controlledByPageId,
        };
    });
};

export const resolveValidationPage = resolveSimpleSetupValidationPage;

export const describeEventSetupTransition = (
    previous: EventSetupResolverInput,
    next: EventSetupResolverInput,
): EventSetupTransitionImpact => {
    const pageIds = new Set<EventSetupPageId>();
    const categories = new Set<string>();

    if (previous.eventType !== next.eventType) {
        ['participation-plan', 'divisions', 'schedule-plan', 'schedule-location']
            .forEach((pageId) => pageIds.add(pageId as EventSetupPageId));
        categories.add('participant and division settings');
        categories.add('schedule configuration');
        categories.add('competition configuration');
    }
    if (!previous.isExternalRegistration && next.isExternalRegistration) {
        ['divisions', 'registration-plan', 'pricing-registration', 'documents-questions', 'operations-plan', 'staff-operations']
            .forEach((pageId) => pageIds.add(pageId as EventSetupPageId));
        categories.add('BracketIQ payments and registration requirements');
        categories.add('match, scoring, staff, and official settings');
    }
    if (previous.singleDivision !== next.singleDivision) {
        ['divisions', 'schedule-location', 'pricing-registration']
            .forEach((pageId) => pageIds.add(pageId as EventSetupPageId));
        categories.add('division-owned capacity, price, schedule, and competition settings');
    }
    if (previous.includePlayoffs !== next.includePlayoffs
        || previous.includePoolPlay !== next.includePoolPlay
        || previous.splitLeaguePlayoffDivisions !== next.splitLeaguePlayoffDivisions) {
        ['divisions']
            .forEach((pageId) => pageIds.add(pageId as EventSetupPageId));
        categories.add('playoff, pool, and bracket settings');
    }

    return {
        pageIds: EVENT_SETUP_PAGE_IDS.filter((pageId) => pageIds.has(pageId)),
        categories: Array.from(categories),
    };
};
