import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { calculateTimedMatchDurationMinutes } from '@/lib/divisionPhaseSettings';
import { getManualPaymentProviderLabel } from '@/lib/manualRegistrationPayments';
import type {
    DivisionCompetitionPhase,
    Field,
    RegistrationQuestionDraft,
} from '@/types';
import { formatBillAmount } from '@/types';

import type { DivisionDetailForm, PlayoffDivisionDetailForm } from '../divisionForm';
import type { EventFormErrorIndex } from '../errorOwnership';
import type { EventFormValues } from '../formTypes';
import type { AssignedStaffCard } from '../staffInvites';
import type {
    EventSetupChoices,
    EventSetupPageId,
    EventSetupScheduleStyle,
} from './types';

export type SimpleSetupReviewRow = {
    label: string;
    value: string;
};

export type SimpleSetupReviewGroup = {
    title?: string;
    rows: SimpleSetupReviewRow[];
    badges?: string[];
};

export type SimpleSetupReviewSection = {
    id: string;
    title: string;
    ownerPageId: EventSetupPageId;
    rows: SimpleSetupReviewRow[];
    groups?: SimpleSetupReviewGroup[];
    badges?: string[];
    warnings: string[];
    imageUrl?: string;
};

export type SimpleSetupReviewModel = {
    sections: SimpleSetupReviewSection[];
};

export type BuildSimpleSetupReviewModelInput = {
    eventData: EventFormValues;
    choices: EventSetupChoices;
    eventTypeOptions: Array<{ value: string; label: string }>;
    selectedImageUrl?: string;
    fields: Field[];
    resourceOptions?: Array<{ value: string; label: string }>;
    templateOptions: Array<{ value: string; label: string }>;
    registrationQuestions: RegistrationQuestionDraft[];
    assignedHostCards: AssignedStaffCard[];
    assignedOfficialCards: AssignedStaffCard[];
    validationErrorIndex?: EventFormErrorIndex;
};

const SCHEDULE_STYLE_LABELS: Record<EventSetupScheduleStyle, string> = {
    FIXED_WINDOW: 'Fixed event window',
    WEEKLY_SLOTS: 'Weekly repeating timeslots',
    FIXED_SLOTS: 'Fixed one-time timeslots',
    MIXED_SLOTS: 'Mixed repeating and fixed timeslots',
};

const PHASE_LABELS: Record<DivisionCompetitionPhase, string> = {
    LEAGUE: 'League',
    POOL: 'Pool play',
    BRACKET: 'Tournament bracket',
    PLAYOFF: 'League playoffs',
};

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const unique = (values: Array<string | null | undefined>): string[] => Array.from(new Set(
    values.map((value) => String(value ?? '').trim()).filter(Boolean),
));

const joinOrNone = (values: Array<string | null | undefined>, fallback = 'None'): string => {
    const normalized = unique(values);
    return normalized.length > 0 ? normalized.join(', ') : fallback;
};

const yesNo = (value: unknown): string => (value ? 'Yes' : 'No');

const formatLocalDateTime = (value: string | null | undefined): string => {
    if (!value?.trim()) return 'Not specified';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(parsed);
};

const formatMinutes = (minutes: number | null | undefined): string => {
    const numeric = Number(minutes);
    if (!Number.isFinite(numeric) || numeric < 0) return 'Not specified';
    const normalized = Math.trunc(numeric);
    if (normalized < 60) return `${normalized} minutes`;
    const hours = Math.floor(normalized / 60);
    const remainder = normalized % 60;
    return remainder > 0
        ? `${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainder} minutes`
        : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

const formatClockMinutes = (minutes: number | null | undefined): string => {
    const numeric = Number(minutes);
    if (!Number.isFinite(numeric)) return 'Time not specified';
    const normalized = ((Math.trunc(numeric) % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const formatHoursBefore = (hours: number | null | undefined): string => {
    const numeric = Number(hours);
    if (!Number.isFinite(numeric) || numeric < 0) return 'Not specified';
    if (numeric === 0) return 'At event start';
    if (numeric % 24 === 0) {
        const days = numeric / 24;
        return `${days} ${days === 1 ? 'day' : 'days'} before event start`;
    }
    return `${numeric} ${numeric === 1 ? 'hour' : 'hours'} before event start`;
};

const formatPrice = (value: number | null | undefined): string => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 'Free';
    return formatBillAmount(Math.trunc(numeric));
};

const divisionClassification = (division: DivisionDetailForm | PlayoffDivisionDetailForm): string => joinOrNone([
    division.skillDivisionTypeName,
    division.ageDivisionTypeName,
    division.gender === 'M' ? 'Mens' : division.gender === 'F' ? 'Womens' : division.gender === 'C' ? 'CoEd' : null,
], 'Open');

const getResourceNames = (
    eventData: EventFormValues,
    fields: Field[],
    resourceOptions: Array<{ value: string; label: string }>,
): string[] => {
    const byId = new Map<string, string>();
    fields.forEach((field) => byId.set(field.$id, field.name));
    resourceOptions.forEach((option) => byId.set(option.value, option.label));
    const selectedIds = unique([
        ...(eventData.selectedFieldIds ?? []),
        ...(eventData.fields ?? []).map((field) => field.$id),
        ...(eventData.leagueSlots ?? []).flatMap((slot) => [
            slot.scheduledFieldId,
            ...(slot.scheduledFieldIds ?? []),
        ]),
    ]);
    return unique(selectedIds.map((id) => byId.get(id) ?? id));
};

const describeSlot = (
    slot: LeagueSlotForm,
    resourceNamesById: Map<string, string>,
    divisionNamesByKey: Map<string, string>,
): SimpleSetupReviewGroup => {
    const resourceNames = unique([
        slot.scheduledFieldId,
        ...(slot.scheduledFieldIds ?? []),
    ].map((id) => id ? resourceNamesById.get(id) ?? id : null));
    const rows: SimpleSetupReviewRow[] = [];
    if (slot.repeating) {
        const days = unique((slot.daysOfWeek?.length ? slot.daysOfWeek : [slot.dayOfWeek])
            .map((day) => typeof day === 'number' ? DAY_LABELS[day] : null));
        rows.push({ label: 'Repeats', value: joinOrNone(days, 'Days not specified') });
        rows.push({
            label: 'Time',
            value: `${formatClockMinutes(slot.startTimeMinutes)} to ${formatClockMinutes(slot.endTimeMinutes)}`,
        });
        rows.push({
            label: 'Date range',
            value: slot.startDate || slot.endDate
                ? `${formatLocalDateTime(slot.startDate)} to ${formatLocalDateTime(slot.endDate)}`
                : 'Uses the event date range',
        });
    } else {
        rows.push({ label: 'Starts', value: formatLocalDateTime(slot.startDate) });
        rows.push({ label: 'Ends', value: formatLocalDateTime(slot.endDate) });
    }
    rows.push({ label: 'Resources', value: joinOrNone(resourceNames, 'Not assigned') });
    rows.push({
        label: 'Divisions',
        value: joinOrNone(
            (slot.divisions ?? []).map((key) => divisionNamesByKey.get(String(key).toLowerCase()) ?? key),
            'All divisions',
        ),
    });
    return {
        title: slot.repeating ? 'Weekly timeslot' : 'One-time timeslot',
        rows,
        badges: slot.rentalLocked ? ['Rental locked'] : undefined,
    };
};

const phasesForEvent = (eventData: EventFormValues): DivisionCompetitionPhase[] => {
    if (eventData.eventType === 'LEAGUE') {
        return eventData.leagueData.includePlayoffs ? ['LEAGUE', 'PLAYOFF'] : ['LEAGUE'];
    }
    if (eventData.eventType === 'TOURNAMENT') {
        return eventData.leagueData.includePlayoffs ? ['POOL', 'BRACKET'] : ['BRACKET'];
    }
    return [];
};

const phaseFormat = (
    eventData: EventFormValues,
    division: DivisionDetailForm,
    phase: DivisionCompetitionPhase,
): { usesSets: boolean; duration: string; details: string } => {
    const isPostseason = phase === 'BRACKET' || phase === 'PLAYOFF';
    const tournamentConfig = phase === 'PLAYOFF'
        ? division.playoffConfig ?? eventData.playoffData
        : division.playoffConfig ?? eventData.tournamentData;
    const usesSets = isPostseason
        ? Boolean(tournamentConfig.usesSets)
        : Boolean(division.usesSets ?? eventData.leagueData.usesSets);
    if (usesSets) {
        const setCount = isPostseason
            ? Math.max(tournamentConfig.winnerSetCount || 0, tournamentConfig.loserSetCount || 0)
            : division.setsPerMatch ?? eventData.leagueData.setsPerMatch;
        const setDuration = isPostseason
            ? tournamentConfig.setDurationMinutes
            : division.setDurationMinutes ?? eventData.leagueData.setDurationMinutes;
        return {
            usesSets,
            duration: setDuration && setCount
                ? `${setCount} sets at ${formatMinutes(setDuration)} each`
                : setCount ? `${setCount} sets` : 'Set-based match',
            details: isPostseason
                ? `${tournamentConfig.doubleElimination ? 'Double' : 'Single'} elimination`
                : `${division.gamesPerOpponent ?? eventData.leagueData.gamesPerOpponent ?? 1} games per opponent`,
        };
    }

    const settings = division.phaseSettings?.[phase];
    const rules = settings?.matchRulesOverride
        ?? eventData.matchRulesOverride
        ?? eventData.sportConfig?.matchRulesTemplate
        ?? null;
    const segmentCount = rules?.segmentCount ?? 1;
    const segmentLength = settings?.segmentLengthMinutes
        ?? rules?.timekeeping?.segmentDurationMinutes
        ?? null;
    const segmentBreak = settings?.segmentBreakMinutes ?? 0;
    const calculatedDuration = calculateTimedMatchDurationMinutes({
        segmentCount,
        segmentLengthMinutes: segmentLength,
        segmentBreakMinutes: segmentBreak,
    });
    const fallbackDuration = isPostseason
        ? tournamentConfig.matchDurationMinutes
        : division.matchDurationMinutes ?? eventData.leagueData.matchDurationMinutes;
    const duration = calculatedDuration ?? fallbackDuration ?? null;
    return {
        usesSets,
        duration: duration ? formatMinutes(duration) : 'Not specified',
        details: segmentLength
            ? `${segmentCount} ${rules?.segmentLabel ?? 'segments'}, ${formatMinutes(segmentLength)} each, ${formatMinutes(segmentBreak)} between`
            : isPostseason
                ? `${tournamentConfig.doubleElimination ? 'Double' : 'Single'} elimination`
                : `${division.gamesPerOpponent ?? eventData.leagueData.gamesPerOpponent ?? 1} games per opponent`,
    };
};

const buildRuleGroups = (eventData: EventFormValues): SimpleSetupReviewGroup[] => {
    const phases = phasesForEvent(eventData);
    if (phases.length === 0) return [];
    const divisions = eventData.divisionDetails.length > 0
        ? eventData.divisionDetails
        : [{
            id: 'shared',
            key: 'open',
            name: 'Shared division',
            divisionTypeId: 'open',
            divisionTypeName: 'Open',
            ratingType: 'SKILL' as const,
            gender: 'C' as const,
            skillDivisionTypeId: 'open',
            skillDivisionTypeName: 'Open',
            ageDivisionTypeId: 'open',
            ageDivisionTypeName: 'All ages',
            price: eventData.price,
            maxParticipants: eventData.maxParticipants ?? 0,
            phaseSettings: {},
            allowPaymentPlans: eventData.allowPaymentPlans,
            installmentDueDates: eventData.installmentDueDates,
            installmentDueRelativeDays: eventData.installmentDueRelativeDays,
            installmentAmounts: eventData.installmentAmounts,
        } satisfies DivisionDetailForm];

    return divisions.flatMap((division) => phases.map((phase) => {
        const settings = division.phaseSettings?.[phase];
        const format = phaseFormat(eventData, division, phase);
        return {
            title: `${division.name} — ${PHASE_LABELS[phase]}`,
            badges: [format.usesSets ? 'Set-based' : 'Timed'],
            rows: [
                { label: 'Format', value: format.details },
                { label: 'Regulation duration', value: format.duration },
                { label: 'Match rules', value: settings?.matchRulesOverride ? 'Customized for this phase' : 'Sport or event defaults' },
                {
                    label: 'Point incidents',
                    value: settings?.autoCreatePointMatchIncidents === undefined
                        ? yesNo(eventData.autoCreatePointMatchIncidents)
                        : yesNo(settings.autoCreatePointMatchIncidents),
                },
            ],
        };
    }));
};

const buildDivisionGroups = (eventData: EventFormValues, resourceNameById: Map<string, string>): SimpleSetupReviewGroup[] => {
    const showsBracketTeams = eventData.eventType === 'TOURNAMENT'
        || (eventData.eventType === 'LEAGUE' && eventData.leagueData.includePlayoffs);
    const primaryGroups = eventData.divisionDetails.map((division) => ({
        title: division.name || 'Unnamed division',
        badges: unique([
            division.kind === 'PLAYOFF' ? 'Playoff' : 'Primary',
            division.ratingType === 'AGE' ? 'Age division' : 'Skill division',
        ]),
        rows: [
            { label: 'Classification', value: divisionClassification(division) },
            { label: 'Capacity', value: division.maxParticipants > 0 ? String(division.maxParticipants) : 'Not specified' },
            ...(division.poolCount ? [{ label: 'Pools', value: String(division.poolCount) }] : []),
            ...(showsBracketTeams && division.playoffTeamCount !== undefined
                ? [{ label: 'Bracket teams', value: division.playoffTeamCount ? String(division.playoffTeamCount) : 'Not specified' }]
                : []),
            { label: 'Resources', value: joinOrNone((division.fieldIds ?? []).map((id) => resourceNameById.get(id) ?? id), 'Shared event resources') },
        ],
    }));
    const playoffGroups = eventData.playoffDivisionDetails.map((division) => ({
        title: division.name || 'Unnamed playoff division',
        badges: ['Playoff division'],
        rows: [
            { label: 'Classification', value: divisionClassification(division) },
            { label: 'Capacity', value: division.maxParticipants ? String(division.maxParticipants) : 'Not specified' },
            { label: 'Elimination', value: division.playoffConfig.doubleElimination ? 'Double' : 'Single' },
        ],
    }));
    if (primaryGroups.length + playoffGroups.length > 0) return [...primaryGroups, ...playoffGroups];
    return [{
        title: 'Shared division',
        badges: ['Shared configuration'],
        rows: [
            { label: 'Capacity', value: eventData.maxParticipants ? String(eventData.maxParticipants) : 'Not specified' },
            { label: 'Selected divisions', value: joinOrNone(eventData.divisions, 'Open') },
        ],
    }];
};

const paymentPlanSummary = (input: {
    allowPaymentPlans?: boolean;
    installmentCount?: number;
    installmentAmounts?: number[];
}): string => {
    if (!input.allowPaymentPlans) return 'Not offered';
    const count = input.installmentCount ?? input.installmentAmounts?.length ?? 0;
    const amounts = (input.installmentAmounts ?? []).map(formatPrice);
    return amounts.length > 0
        ? `${count} installments: ${amounts.join(', ')}`
        : `${count || 'Multiple'} installments`;
};

const warningsForPage = (
    errorIndex: EventFormErrorIndex | undefined,
    pageId: EventSetupPageId,
): string[] => unique((errorIndex?.bySimplePage[pageId] ?? []).map((error) => error.message));

export const buildSimpleSetupReviewModel = ({
    eventData,
    choices,
    eventTypeOptions,
    selectedImageUrl,
    fields,
    resourceOptions = [],
    templateOptions,
    registrationQuestions,
    assignedHostCards,
    assignedOfficialCards,
    validationErrorIndex,
}: BuildSimpleSetupReviewModelInput): SimpleSetupReviewModel => {
    const eventTypeLabel = eventTypeOptions.find((option) => option.value === eventData.eventType)?.label
        ?? eventData.eventType;
    const resourceNameById = new Map<string, string>();
    fields.forEach((field) => resourceNameById.set(field.$id, field.name));
    resourceOptions.forEach((option) => resourceNameById.set(option.value, option.label));
    const resourceNames = getResourceNames(eventData, fields, resourceOptions);
    const documentNameById = new Map(templateOptions.map((option) => [option.value, option.label]));
    const phases = phasesForEvent(eventData);
    const divisionGroups = buildDivisionGroups(eventData, resourceNameById);
    const divisionNameByKey = new Map<string, string>();
    [...eventData.divisionDetails, ...eventData.playoffDivisionDetails].forEach((division) => {
        [division.id, division.key].forEach((key) => {
            if (key) divisionNameByKey.set(String(key).toLowerCase(), division.name || key);
        });
    });
    const reviewedScheduleSlots = choices.scheduleStyle === 'FIXED_WINDOW'
        ? []
        : eventData.leagueSlots;
    const configuredTimeslotCount = choices.scheduleStyle === 'FIXED_WINDOW'
        ? 1
        : reviewedScheduleSlots.length;
    const priceGroups = eventData.singleDivision
        ? []
        : eventData.divisionDetails.map((division) => ({
            title: division.name || 'Unnamed division',
            rows: [
                { label: 'Registration price', value: formatPrice(division.price) },
                { label: 'Payment plan', value: paymentPlanSummary(division) },
            ],
        }));
    const enabledOperations = [
        choices.useStaffAssignments ? 'Staff assignments' : null,
        choices.useDedicatedOfficials ? 'Dedicated officials' : null,
        choices.useCustomOfficialPositions ? 'Custom official positions' : null,
        choices.useTeamCheckInAndRosterOperations ? 'Team check-in and roster operations' : null,
    ];
    const sections: SimpleSetupReviewSection[] = [
        {
            id: 'format',
            title: 'Format',
            ownerPageId: 'format',
            badges: [eventTypeLabel, eventData.isAffiliateEvent ? 'External registration' : 'BracketIQ registration'],
            rows: [
                { label: 'Event type', value: eventTypeLabel },
                { label: 'Registration destination', value: eventData.isAffiliateEvent ? 'External website' : 'BracketIQ' },
                ...(eventData.isAffiliateEvent ? [{ label: 'External registration link', value: eventData.affiliateUrl?.trim() ? 'Provided' : 'Not provided' }] : []),
            ],
            warnings: warningsForPage(validationErrorIndex, 'format'),
        },
        {
            id: 'basics',
            title: 'Basics',
            ownerPageId: 'basics',
            imageUrl: selectedImageUrl || undefined,
            rows: [
                { label: 'Event name', value: eventData.name?.trim() || 'Not specified' },
                { label: 'Sports', value: eventData.sportConfig?.name ?? (eventData.sportIds.join(', ') || 'Not specified') },
                { label: 'Tags', value: joinOrNone(eventData.tags.map((tag) => tag.name)) },
                { label: 'Description', value: eventData.description?.trim() || 'None' },
            ],
            warnings: warningsForPage(validationErrorIndex, 'basics'),
        },
        {
            id: 'participation',
            title: 'Participation',
            ownerPageId: 'format',
            rows: [
                { label: 'Registration unit', value: eventData.teamSignup ? 'Teams' : 'Individuals' },
                ...(eventData.teamSignup ? [{ label: 'Team size', value: eventData.teamSizeLimit ? String(eventData.teamSizeLimit) : 'Not specified' }] : []),
                { label: 'Division configuration', value: eventData.singleDivision ? 'Shared configuration' : 'Split divisions' },
                { label: 'Register by division type', value: yesNo(eventData.registrationByDivisionType) },
                ...(eventData.eventType === 'LEAGUE' ? [{ label: 'League playoffs', value: yesNo(eventData.leagueData.includePlayoffs) }] : []),
                ...(eventData.eventType === 'TOURNAMENT' ? [{ label: 'Pool play', value: yesNo(eventData.leagueData.includePlayoffs) }] : []),
            ],
            warnings: warningsForPage(validationErrorIndex, 'format'),
        },
        {
            id: 'divisions',
            title: 'Divisions',
            ownerPageId: 'divisions',
            rows: [
                { label: 'Configuration', value: eventData.singleDivision ? 'One shared configuration' : `${divisionGroups.length} divisions` },
            ],
            groups: divisionGroups,
            warnings: warningsForPage(validationErrorIndex, 'divisions'),
        },
        {
            id: 'schedule-structure',
            title: 'Schedule Structure',
            ownerPageId: 'format',
            rows: [
                { label: 'Schedule style', value: SCHEDULE_STYLE_LABELS[choices.scheduleStyle] },
                { label: 'Configured timeslots', value: String(configuredTimeslotCount) },
            ],
            warnings: warningsForPage(validationErrorIndex, 'format'),
        },
        {
            id: 'schedule-location',
            title: 'Schedule and Location',
            ownerPageId: 'schedule-location',
            rows: [
                { label: 'Starts', value: formatLocalDateTime(eventData.start) },
                { label: 'Ends', value: eventData.noFixedEndDateTime ? 'Set during match generation' : formatLocalDateTime(eventData.end) },
                { label: 'Time zone', value: eventData.timeZone || 'Not specified' },
                { label: 'Location', value: eventData.location?.trim() || 'Not specified' },
                { label: 'Address', value: eventData.address?.trim() || 'Not specified' },
                { label: 'Resources', value: joinOrNone(resourceNames, 'Not assigned') },
            ],
            groups: reviewedScheduleSlots.map((slot) => describeSlot(slot, resourceNameById, divisionNameByKey)),
            warnings: warningsForPage(validationErrorIndex, 'schedule-location'),
        },
        ...(phases.length > 0 ? [{
            id: 'rules-scoring',
            title: 'Division Rules and Scoring',
            ownerPageId: 'divisions' as const,
            rows: [
                {
                    label: 'League scoring',
                    value: eventData.eventType === 'LEAGUE'
                        ? `${eventData.leagueScoringConfig.pointsForWin} win, ${eventData.leagueScoringConfig.pointsForDraw} draw, ${eventData.leagueScoringConfig.pointsForLoss} loss`
                        : 'Not applicable',
                },
            ],
            groups: buildRuleGroups(eventData),
            warnings: warningsForPage(validationErrorIndex, 'divisions'),
        }] : []),
        {
            id: 'pricing-registration',
            title: 'Pricing and Registration',
            ownerPageId: 'pricing-registration',
            badges: [eventData.isAffiliateEvent
                ? 'External payment'
                : eventData.registrationPaymentMode === 'MANUAL'
                    ? 'Self-managed payment'
                    : 'BracketIQ online checkout'],
            rows: [
                { label: 'Paid registration', value: yesNo(choices.paidRegistration) },
                ...(eventData.singleDivision ? [{ label: 'Registration price', value: formatPrice(eventData.price) }] : []),
                ...(eventData.singleDivision ? [{ label: 'Payment plan', value: paymentPlanSummary(eventData) }] : []),
                { label: 'Registration cutoff', value: formatHoursBefore(eventData.registrationCutoffHours) },
                { label: 'Minimum age', value: eventData.minAge === undefined ? 'None' : String(eventData.minAge) },
                { label: 'Maximum age', value: eventData.maxAge === undefined ? 'None' : String(eventData.maxAge) },
                ...(eventData.registrationPaymentMode === 'MANUAL' && !eventData.isAffiliateEvent ? [
                    {
                        label: 'Payment providers',
                        value: joinOrNone((eventData.manualPaymentLinks ?? []).map((link) => (
                            link.label?.trim() || getManualPaymentProviderLabel(link.provider)
                        )), 'No destinations added'),
                    },
                    { label: 'Payment instructions', value: eventData.manualPaymentInstructions?.trim() ? 'Provided' : 'Not provided' },
                ] : []),
                ...(eventData.registrationPaymentMode === 'ONLINE' && eventData.cancellationRefundHours !== null ? [{
                    label: 'Automatic refund cutoff',
                    value: formatHoursBefore(eventData.cancellationRefundHours),
                }] : []),
            ],
            groups: priceGroups,
            warnings: warningsForPage(validationErrorIndex, 'pricing-registration'),
        },
        ...((choices.useRequiredDocuments || choices.useRegistrationQuestions) ? [{
            id: 'documents-questions',
            title: 'Documents and Questions',
            ownerPageId: 'documents-questions' as const,
            rows: [
                {
                    label: 'Required documents',
                    value: choices.useRequiredDocuments
                        ? joinOrNone(eventData.requiredTemplateIds.map((id) => documentNameById.get(id) ?? id), 'None selected')
                        : 'Not used',
                },
                {
                    label: 'Registration questions',
                    value: choices.useRegistrationQuestions ? String(registrationQuestions.length) : 'Not used',
                },
            ],
            groups: choices.useRegistrationQuestions
                ? registrationQuestions.map((question, index) => ({
                    title: `Question ${index + 1}`,
                    badges: [question.required ? 'Required' : 'Optional'],
                    rows: [{ label: 'Prompt', value: question.prompt?.trim() || 'Not specified' }],
                }))
                : [],
            warnings: warningsForPage(validationErrorIndex, 'documents-questions'),
        }] : []),
        ...((enabledOperations.some(Boolean)) ? [{
            id: 'operations-plan',
            title: 'Operations Plan',
            ownerPageId: 'format' as const,
            rows: [{ label: 'Enabled tools', value: joinOrNone(enabledOperations) }],
            warnings: warningsForPage(validationErrorIndex, 'format'),
        }] : []),
        ...((enabledOperations.some(Boolean)) ? [{
            id: 'staff-operations',
            title: 'Staff and Operations',
            ownerPageId: 'staff-operations' as const,
            rows: [
                ...(choices.useStaffAssignments ? [
                    { label: 'Hosts', value: joinOrNone(assignedHostCards.map((card) => card.displayName), 'None assigned') },
                ] : []),
                ...(choices.useDedicatedOfficials ? [
                    { label: 'Officials', value: joinOrNone(assignedOfficialCards.map((card) => card.displayName), 'None assigned') },
                    { label: 'Official scheduling', value: eventData.officialSchedulingMode.replace(/_/g, ' ').toLowerCase() },
                    { label: 'Teams officiate', value: yesNo(eventData.doTeamsOfficiate) },
                ] : []),
                ...(choices.useCustomOfficialPositions ? [{
                    label: 'Official positions',
                    value: joinOrNone(eventData.officialPositions.map((position) => `${position.name} (${position.count})`), 'None configured'),
                }] : []),
                ...(choices.useTeamCheckInAndRosterOperations ? [
                    { label: 'Team check-in', value: eventData.teamCheckInMode.replace(/_/g, ' ').toLowerCase() },
                    { label: 'Roster edits', value: yesNo(eventData.allowMatchRosterEdits) },
                    { label: 'Temporary players', value: yesNo(eventData.allowTemporaryMatchPlayers) },
                ] : []),
            ],
            warnings: warningsForPage(validationErrorIndex, 'staff-operations'),
        }] : []),
    ];

    return { sections };
};
