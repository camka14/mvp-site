import type { EventSetupPageId } from './simpleSetup/types';
import type { FlattenedFormError } from './validationErrors';

export type EventFormAdvancedSectionId =
    | 'section-basic-information'
    | 'section-event-details'
    | 'section-manual-payments'
    | 'section-match-rules'
    | 'section-officials'
    | 'section-division-settings'
    | 'section-league-scoring-config'
    | 'section-schedule-config';

export type EventFormErrorLocation = FlattenedFormError & {
    simplePageId: EventSetupPageId;
    advancedSectionId: EventFormAdvancedSectionId;
    focusFieldName: string;
};

export type EventFormErrorIndex = {
    ordered: EventFormErrorLocation[];
    bySimplePage: Partial<Record<EventSetupPageId, EventFormErrorLocation[]>>;
    byAdvancedSection: Partial<Record<EventFormAdvancedSectionId, EventFormErrorLocation[]>>;
};

type ErrorOwnership = Pick<EventFormErrorLocation, 'simplePageId' | 'advancedSectionId'>;

const OWNERSHIP_BY_PREFIX: Record<string, ErrorOwnership> = {
    $id: { simplePageId: 'review-publish', advancedSectionId: 'section-basic-information' },
    name: { simplePageId: 'basics', advancedSectionId: 'section-basic-information' },
    description: { simplePageId: 'basics', advancedSectionId: 'section-basic-information' },
    imageId: { simplePageId: 'basics', advancedSectionId: 'section-basic-information' },
    sportId: { simplePageId: 'basics', advancedSectionId: 'section-basic-information' },
    sportConfig: { simplePageId: 'basics', advancedSectionId: 'section-basic-information' },
    tags: { simplePageId: 'basics', advancedSectionId: 'section-basic-information' },
    eventType: { simplePageId: 'format', advancedSectionId: 'section-event-details' },
    isAffiliateEvent: { simplePageId: 'format', advancedSectionId: 'section-event-details' },
    affiliateUrl: { simplePageId: 'basics', advancedSectionId: 'section-event-details' },
    location: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    address: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    coordinates: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    start: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    end: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    timeZone: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    noFixedEndDateTime: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    parentEvent: { simplePageId: 'format', advancedSectionId: 'section-event-details' },
    state: { simplePageId: 'review-publish', advancedSectionId: 'section-event-details' },
    minAge: { simplePageId: 'pricing-registration', advancedSectionId: 'section-event-details' },
    maxAge: { simplePageId: 'pricing-registration', advancedSectionId: 'section-event-details' },
    registrationPaymentMode: { simplePageId: 'pricing-registration', advancedSectionId: 'section-event-details' },
    registrationCutoffHours: { simplePageId: 'pricing-registration', advancedSectionId: 'section-event-details' },
    cancellationRefundHours: { simplePageId: 'pricing-registration', advancedSectionId: 'section-event-details' },
    requiredTemplateIds: { simplePageId: 'documents-questions', advancedSectionId: 'section-event-details' },
    organizationId: { simplePageId: 'format', advancedSectionId: 'section-event-details' },
    selectedFieldIds: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    fields: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    fieldCount: { simplePageId: 'schedule-location', advancedSectionId: 'section-event-details' },
    teamSignup: { simplePageId: 'format', advancedSectionId: 'section-event-details' },
    teamSizeLimit: { simplePageId: 'format', advancedSectionId: 'section-event-details' },
    manualPaymentLinks: { simplePageId: 'pricing-registration', advancedSectionId: 'section-manual-payments' },
    manualPaymentInstructions: { simplePageId: 'pricing-registration', advancedSectionId: 'section-manual-payments' },
    matchRulesOverride: { simplePageId: 'divisions', advancedSectionId: 'section-match-rules' },
    autoCreatePointMatchIncidents: { simplePageId: 'divisions', advancedSectionId: 'section-match-rules' },
    hostId: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    assistantHostIds: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    officialIds: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    officials: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    officialSchedulingMode: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    officialPositions: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    eventOfficials: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    pendingStaffInvites: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    doTeamsOfficiate: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    teamOfficialsMaySwap: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    teamCheckInMode: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    teamCheckInOpenMinutesBefore: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    allowMatchRosterEdits: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    allowTemporaryMatchPlayers: { simplePageId: 'staff-operations', advancedSectionId: 'section-officials' },
    singleDivision: { simplePageId: 'format', advancedSectionId: 'section-division-settings' },
    splitLeaguePlayoffDivisions: { simplePageId: 'format', advancedSectionId: 'section-division-settings' },
    registrationByDivisionType: { simplePageId: 'format', advancedSectionId: 'section-division-settings' },
    divisions: { simplePageId: 'divisions', advancedSectionId: 'section-division-settings' },
    divisionDetails: { simplePageId: 'divisions', advancedSectionId: 'section-division-settings' },
    playoffDivisionDetails: { simplePageId: 'divisions', advancedSectionId: 'section-division-settings' },
    divisionFieldIds: { simplePageId: 'schedule-location', advancedSectionId: 'section-division-settings' },
    maxParticipants: { simplePageId: 'divisions', advancedSectionId: 'section-division-settings' },
    price: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    taxHandling: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    organizerManualTaxRateBps: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    allowPaymentPlans: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    installmentCount: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    installmentAmounts: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    installmentDueDates: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    installmentDueRelativeDays: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    allowTeamSplitDefault: { simplePageId: 'pricing-registration', advancedSectionId: 'section-division-settings' },
    leagueData: { simplePageId: 'divisions', advancedSectionId: 'section-division-settings' },
    playoffData: { simplePageId: 'divisions', advancedSectionId: 'section-division-settings' },
    tournamentData: { simplePageId: 'divisions', advancedSectionId: 'section-division-settings' },
    leagueScoringConfig: { simplePageId: 'divisions', advancedSectionId: 'section-league-scoring-config' },
    leagueSlots: { simplePageId: 'schedule-location', advancedSectionId: 'section-schedule-config' },
    seedColor: { simplePageId: 'review-publish', advancedSectionId: 'section-event-details' },
    waitList: { simplePageId: 'review-publish', advancedSectionId: 'section-event-details' },
    freeAgents: { simplePageId: 'review-publish', advancedSectionId: 'section-event-details' },
    players: { simplePageId: 'review-publish', advancedSectionId: 'section-event-details' },
    teams: { simplePageId: 'review-publish', advancedSectionId: 'section-event-details' },
    joinAsParticipant: { simplePageId: 'format', advancedSectionId: 'section-event-details' },
};

const DEFAULT_OWNERSHIP: ErrorOwnership = {
    simplePageId: 'review-publish',
    advancedSectionId: 'section-event-details',
};

const normalizeFieldPath = (path: string): string => path
    .trim()
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\.+|\.+$/g, '');

const isDivisionPricingPath = (path: string): boolean => (
    /^divisionDetails\.\d+\.(?:price|allowPaymentPlans|installmentCount|installmentAmounts|installmentDueDates|installmentDueRelativeDays)(?:\.|$)/.test(path)
);

export const resolveEventFormErrorOwnership = (fieldPath: string): ErrorOwnership => {
    const normalizedPath = normalizeFieldPath(fieldPath);
    if (isDivisionPricingPath(normalizedPath)) {
        return {
            simplePageId: 'pricing-registration',
            advancedSectionId: 'section-division-settings',
        };
    }
    const prefix = normalizedPath.split('.')[0];
    return OWNERSHIP_BY_PREFIX[prefix] ?? DEFAULT_OWNERSHIP;
};

export const resolveSimpleSetupValidationPage = (fieldPath: string): EventSetupPageId => (
    resolveEventFormErrorOwnership(fieldPath).simplePageId
);

export const buildEventFormErrorIndex = (
    errors: FlattenedFormError[],
): EventFormErrorIndex => {
    const index: EventFormErrorIndex = {
        ordered: [],
        bySimplePage: {},
        byAdvancedSection: {},
    };
    const seen = new Set<string>();

    errors.forEach((error) => {
        const path = normalizeFieldPath(error.path) || 'form';
        const message = error.message.trim();
        const key = `${path}::${message}`;
        if (!message || seen.has(key)) return;
        seen.add(key);
        const ownership = resolveEventFormErrorOwnership(path);
        const location: EventFormErrorLocation = {
            path,
            message,
            ...ownership,
            focusFieldName: path === 'form' ? '' : path,
        };
        index.ordered.push(location);
        (index.bySimplePage[location.simplePageId] ??= []).push(location);
        (index.byAdvancedSection[location.advancedSectionId] ??= []).push(location);
    });

    return index;
};
