import type { Event, OrganizationFeature } from '@/types';

export type EventSetupMode = 'SIMPLE' | 'ADVANCED';

export const EVENT_SETUP_PAGE_IDS = [
    'format',
    'basics',
    'participation-plan',
    'divisions',
    'schedule-plan',
    'schedule-location',
    'competition-plan',
    'competition-rules',
    'registration-plan',
    'pricing-registration',
    'documents-questions',
    'operations-plan',
    'staff-operations',
    'review-publish',
] as const;

export type EventSetupPageId = typeof EVENT_SETUP_PAGE_IDS[number];

export type EventSetupPageStatus =
    | 'current'
    | 'complete'
    | 'available'
    | 'locked'
    | 'not-used';

export type DivisionConfigurationMode = 'SHARED' | 'SPLIT';

export type EventSetupScheduleStyle =
    | 'FIXED_WINDOW'
    | 'WEEKLY_SLOTS'
    | 'FIXED_SLOTS'
    | 'MIXED_SLOTS';

export type EventSetupResourceSource =
    | 'ORGANIZATION'
    | 'CUSTOM'
    | 'RENTAL_LOCKED'
    | 'LOCATION_ONLY';

export interface EventSetupChoices {
    scheduleStyle: EventSetupScheduleStyle;
    resourceSource: EventSetupResourceSource;
    customizeMatchRules: boolean;
    customizeScoring: boolean;
    paidRegistration: boolean;
    useRequiredDocuments: boolean;
    useRegistrationQuestions: boolean;
    useStaffAssignments: boolean;
    useDedicatedOfficials: boolean;
    useCustomOfficialPositions: boolean;
}

export interface EventSetupResolverInput {
    eventType: Event['eventType'];
    isExternalRegistration: boolean;
    singleDivision: boolean;
    teamSignup: boolean;
    includePlayoffs: boolean;
    includePoolPlay: boolean;
    splitLeaguePlayoffDivisions: boolean;
    hasImmutableRentalResources: boolean;
    organizationFeatures?: OrganizationFeature[] | null;
    choices: EventSetupChoices;
    currentPageId?: EventSetupPageId;
    completePageIds?: Iterable<EventSetupPageId>;
}

export interface EventSetupCapabilities {
    isExternal: boolean;
    isManaged: boolean;
    isTryout: boolean;
    isLeague: boolean;
    isTournament: boolean;
    isWeekly: boolean;
    isTeamRegistration: boolean;
    divisionMode: DivisionConfigurationMode;
    canChooseTeamRegistration: boolean;
    canChooseDivisionMode: boolean;
    canUseRegistrationByDivisionType: boolean;
    canUseLeaguePlayoffs: boolean;
    canSplitLeaguePlayoffDivisions: boolean;
    canUsePoolPlay: boolean;
    usesInternalSchedule: boolean;
    usesCompetition: boolean;
    usesInternalRegistration: boolean;
    usesDocumentsAndQuestions: boolean;
    usesOperationsPlanning: boolean;
    usesStaffAndOperations: boolean;
    supportsTryoutType: boolean;
}

export interface EventSetupPage {
    id: EventSetupPageId;
    label: string;
    status: EventSetupPageStatus;
    used: boolean;
    prerequisitePageId?: EventSetupPageId;
    controlledByPageId?: EventSetupPageId;
    unavailableReason?: string;
}

export interface EventSetupTransitionImpact {
    pageIds: EventSetupPageId[];
    categories: string[];
}
