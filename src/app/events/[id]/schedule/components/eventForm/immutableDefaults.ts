import { createLeagueScoringConfig } from '@/types/defaults';
import {
    buildDivisionName,
    buildDivisionToken,
    getDivisionTypeById,
    inferDivisionDetails,
} from '@/lib/divisionTypes';
import {
    getSystemTimeZone,
    normalizeTimeZone,
} from '@/lib/dateUtils';
import { normalizePriceCents } from '@/lib/priceUtils';
import type {
    Event,
    Field,
    LeagueScoringConfig,
    Sport,
    TimeSlot,
} from '@/types';

import { sanitizeFieldsForForm } from './fieldDefaults';
import {
    applyDivisionAgeCutoff,
    buildCompositeDivisionTypeId,
    divisionIdFromValue,
    type DivisionDetailForm,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionDetailEntry,
    normalizePlayoffDivisionDetailEntry,
    type PlayoffDivisionDetailForm,
    parseCompositeDivisionTypeId,
    resolveSportInput,
} from './divisionForm';
import type { EventFormState } from './formTypes';
import {
    getEventOfficialUserIds,
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeOfficialSchedulingMode,
} from './officials';
import { sanitizeMatchRulesOverrideForEditor } from './matchRulesHelpers';
import {
    normalizeInstallmentAmounts,
    normalizeInstallmentRelativeDays,
} from './paymentPlanHelpers';
import {
    formatEventDateTimeForForm,
    parseDateValue,
} from './dateHelpers';
import { normalizeSlotFieldIds } from './slotForm';

type ApplyImmutableEventDefaultsOptions = {
    state: EventFormState;
    defaults?: Partial<Event>;
    sportsById: Map<string, Sport>;
};

export const normalizeImmutableFields = (fields?: Partial<Event>['fields']): Field[] => {
    if (!Array.isArray(fields)) {
        return [];
    }
    return sanitizeFieldsForForm(
        (fields as Field[]).filter((field): field is Field => Boolean(field && field.$id)),
    );
};

export const normalizeImmutableTimeSlots = (
    timeSlots: Partial<Event>['timeSlots'] | undefined,
    immutableFields: Field[],
): TimeSlot[] => {
    if (!Array.isArray(timeSlots)) {
        return [];
    }
    const fallbackFieldId = immutableFields[0]?.$id;
    return (timeSlots as TimeSlot[])
        .map((slot) => {
            if (!slot) {
                return null;
            }
            const { event: _ignoredEvent, ...rest } = slot;
            const normalized: TimeSlot = {
                ...rest,
                scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                scheduledFieldIds: normalizeSlotFieldIds({
                    scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                    scheduledFieldIds: rest.scheduledFieldIds,
                }),
            };
            return normalized;
        })
        .filter((slot): slot is TimeSlot => Boolean(slot));
};

export const applyImmutableEventDefaults = ({
    state,
    defaults: immutableDefaults,
    sportsById,
}: ApplyImmutableEventDefaultsOptions): EventFormState => {
    const defaults = immutableDefaults ?? {};
    if (Object.keys(defaults).length === 0) {
        return state;
    }

    const next = { ...state };

    if (defaults.name !== undefined) next.name = defaults.name ?? '';
    if (defaults.description !== undefined) next.description = defaults.description ?? '';
    if (defaults.location !== undefined) next.location = defaults.location ?? '';
    if (defaults.address !== undefined) next.address = defaults.address ?? '';
    if (Array.isArray(defaults.coordinates) && defaults.coordinates.length === 2) {
        next.coordinates = defaults.coordinates as [number, number];
    }
    if (defaults.timeZone !== undefined) {
        next.timeZone = normalizeTimeZone(defaults.timeZone, next.timeZone || getSystemTimeZone());
    }
    const defaultsTimeZone = normalizeTimeZone(next.timeZone, getSystemTimeZone());
    if (defaults.start !== undefined) next.start = formatEventDateTimeForForm(defaults.start, defaultsTimeZone);
    if (defaults.end !== undefined) next.end = formatEventDateTimeForForm(defaults.end, defaultsTimeZone);
    if (defaults.eventType !== undefined) next.eventType = defaults.eventType as EventFormState['eventType'];
    if (defaults.sport !== undefined) {
        if (typeof defaults.sport === 'string') {
            const sportId = defaults.sport ?? '';
            next.sportId = sportId;
            next.sportConfig = sportsById.get(sportId) ?? null;
        } else if (defaults.sport && typeof defaults.sport === 'object') {
            const sport = defaults.sport as Sport;
            const sportId = sport.$id ?? sport.name ?? '';
            next.sportId = sportId;
            next.sportConfig = sportsById.get(sportId) ?? { ...sport };
        } else {
            next.sportId = '';
            next.sportConfig = null;
        }
    }
    if (defaults.leagueScoringConfig && typeof defaults.leagueScoringConfig === 'object') {
        next.leagueScoringConfig = createLeagueScoringConfig(defaults.leagueScoringConfig as Partial<LeagueScoringConfig>);
    }
    if (typeof defaults.price === 'number') next.price = normalizePriceCents(defaults.price);
    if (typeof defaults.minAge === 'number') next.minAge = defaults.minAge;
    if (typeof defaults.maxAge === 'number') next.maxAge = defaults.maxAge;
    if (typeof defaults.maxParticipants === 'number') next.maxParticipants = defaults.maxParticipants;
    if (typeof defaults.teamSizeLimit === 'number') next.teamSizeLimit = defaults.teamSizeLimit;
    if (typeof defaults.teamSignup === 'boolean') next.teamSignup = defaults.teamSignup;
    if (typeof defaults.singleDivision === 'boolean') next.singleDivision = defaults.singleDivision;
    if (typeof (defaults as any).splitLeaguePlayoffDivisions === 'boolean') {
        next.splitLeaguePlayoffDivisions = Boolean((defaults as any).splitLeaguePlayoffDivisions);
    }
    if (typeof (defaults as any).noFixedEndDateTime === 'boolean') {
        next.noFixedEndDateTime = (defaults as any).noFixedEndDateTime;
    }
    if (typeof defaults.registrationByDivisionType === 'boolean') {
        next.registrationByDivisionType = defaults.registrationByDivisionType;
    }
    if (typeof (defaults as any).doTeamsOfficiate === 'boolean') {
        next.doTeamsOfficiate = Boolean((defaults as any).doTeamsOfficiate);
    }
    if (typeof (defaults as any).teamOfficialsMaySwap === 'boolean') {
        next.teamOfficialsMaySwap = next.doTeamsOfficiate ? Boolean((defaults as any).teamOfficialsMaySwap) : false;
    }
    if (typeof (defaults as any).teamCheckInMode === 'string') {
        const normalized = (defaults as any).teamCheckInMode.trim().toUpperCase();
        next.teamCheckInMode = next.teamSignup && (normalized === 'EVENT' || normalized === 'MATCH')
            ? normalized
            : 'OFF';
    }
    if (typeof (defaults as any).teamCheckInOpenMinutesBefore === 'number') {
        next.teamCheckInOpenMinutesBefore = Math.max(0, Math.trunc((defaults as any).teamCheckInOpenMinutesBefore));
    }
    if (typeof (defaults as any).allowMatchRosterEdits === 'boolean') {
        next.allowMatchRosterEdits = next.teamSignup ? Boolean((defaults as any).allowMatchRosterEdits) : false;
    }
    if (typeof (defaults as any).allowTemporaryMatchPlayers === 'boolean') {
        next.allowTemporaryMatchPlayers = next.allowMatchRosterEdits
            ? Boolean((defaults as any).allowTemporaryMatchPlayers)
            : false;
    }
    if ((defaults as any).matchRulesOverride && typeof (defaults as any).matchRulesOverride === 'object') {
        next.matchRulesOverride = sanitizeMatchRulesOverrideForEditor((defaults as any).matchRulesOverride);
    } else if ((defaults as any).matchRulesOverride === null) {
        next.matchRulesOverride = null;
    }
    if (typeof (defaults as any).autoCreatePointMatchIncidents === 'boolean') {
        next.autoCreatePointMatchIncidents = Boolean((defaults as any).autoCreatePointMatchIncidents);
    }
    if ((defaults as any).officialSchedulingMode !== undefined) {
        next.officialSchedulingMode = normalizeOfficialSchedulingMode((defaults as any).officialSchedulingMode);
        if (next.officialSchedulingMode === 'TEAM_STAFFING') {
            next.doTeamsOfficiate = true;
        }
    }
    if (Array.isArray((defaults as any).officialPositions)) {
        next.officialPositions = normalizeEventOfficialPositions((defaults as any).officialPositions);
    }
    if (Array.isArray((defaults as any).eventOfficials) || Array.isArray((defaults as any).officialIds)) {
        next.eventOfficials = normalizeEventOfficials(
            (defaults as any).eventOfficials,
            !Array.isArray((defaults as any).eventOfficials) && Array.isArray((defaults as any).officialIds)
                ? (defaults as any).officialIds.map((id: unknown) => String(id).trim()).filter(Boolean)
                : [],
            next.officialPositions,
        );
        next.officialIds = getEventOfficialUserIds(next.eventOfficials);
    }
    if (Array.isArray((defaults as any).divisionDetails)) {
        const referenceDate = parseDateValue(next.start ?? null);
        next.divisionDetails = (defaults as any).divisionDetails
            .map((entry: unknown) => normalizeDivisionDetailEntry(
                entry,
                next.$id,
                resolveSportInput(next.sportConfig ?? next.sportId),
                referenceDate,
            ))
            .filter((entry: DivisionDetailForm | null): entry is DivisionDetailForm => Boolean(entry));
    }
    if (Array.isArray((defaults as any).playoffDivisionDetails)) {
        next.playoffDivisionDetails = (defaults as any).playoffDivisionDetails
            .map((entry: unknown) => normalizePlayoffDivisionDetailEntry(entry, next.$id))
            .filter((entry: PlayoffDivisionDetailForm | null): entry is PlayoffDivisionDetailForm => Boolean(entry));
    }
    if (defaults.divisions !== undefined) {
        next.divisions = Array.isArray(defaults.divisions)
            ? defaults.divisions.map(divisionIdFromValue).filter((divisionId) => divisionId.length > 0)
            : [];
    }
    if (!next.divisionDetails.length && next.divisions.length) {
        next.divisionDetails = next.divisions.map((divisionId) => {
            const sportInput = resolveSportInput(next.sportConfig ?? next.sportId);
            const inferred = inferDivisionDetails({
                identifier: divisionId,
                sportInput,
            });
            const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(sportInput);
            const composite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
            const skillDivisionTypeId = composite?.skillDivisionTypeId
                ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
            const ageDivisionTypeId = composite?.ageDivisionTypeId
                ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
            const skillDivisionTypeName = getDivisionTypeById(
                sportInput,
                skillDivisionTypeId,
                'SKILL',
            )?.name ?? defaultsForSport.skillDivisionTypeName;
            const ageDivisionTypeName = getDivisionTypeById(
                sportInput,
                ageDivisionTypeId,
                'AGE',
            )?.name ?? defaultsForSport.ageDivisionTypeName;
            const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
            const divisionTypeName = buildDivisionName({
                gender: inferred.gender,
                sportInput,
                skillDivisionTypeId,
                ageDivisionTypeId,
            });
            const token = buildDivisionToken({
                gender: inferred.gender,
                ratingType: 'SKILL',
                divisionTypeId,
            });
            return applyDivisionAgeCutoff({
                id: divisionId,
                key: token,
                kind: 'LEAGUE',
                name: divisionTypeName,
                divisionTypeId,
                divisionTypeName,
                ratingType: 'SKILL',
                gender: inferred.gender,
                skillDivisionTypeId,
                skillDivisionTypeName,
                ageDivisionTypeId,
                ageDivisionTypeName,
                price: Math.max(0, next.price || 0),
                maxParticipants: Math.max(2, Math.trunc(next.maxParticipants || 2)),
                playoffTeamCount: Number.isFinite((defaults as any).playoffTeamCount)
                    ? Math.max(2, Math.trunc((defaults as any).playoffTeamCount))
                    : undefined,
                playoffPlacementDivisionIds: [],
                allowPaymentPlans: Boolean((defaults as any).allowPaymentPlans),
                installmentCount: Number.isFinite((defaults as any).installmentCount)
                    ? Math.max(0, Math.trunc((defaults as any).installmentCount))
                    : normalizeInstallmentAmounts((defaults as any).installmentAmounts).length,
                installmentDueDates: Array.isArray((defaults as any).installmentDueDates)
                    ? (defaults as any).installmentDueDates.map((value: unknown) => String(value))
                    : [],
                installmentDueRelativeDays: normalizeInstallmentRelativeDays((defaults as any).installmentDueRelativeDays),
                installmentAmounts: normalizeInstallmentAmounts((defaults as any).installmentAmounts),
                sportId: sportInput || undefined,
                fieldIds: [],
            }, sportInput, parseDateValue(next.start ?? null));
        });
    }
    if (!next.divisions.length && next.divisionDetails.length) {
        next.divisions = next.divisionDetails.map((detail) => detail.id);
    }
    if (defaults.divisionFieldIds && typeof defaults.divisionFieldIds === 'object') {
        next.divisionFieldIds = Object.fromEntries(
            Object.entries(defaults.divisionFieldIds).map(([divisionKey, fieldIds]) => [
                String(divisionKey).toLowerCase(),
                Array.isArray(fieldIds)
                    ? Array.from(new Set(fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
                    : [],
            ]),
        );
    }
    if (Array.isArray(defaults.fieldIds)) {
        next.selectedFieldIds = Array.from(new Set(defaults.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)));
    }
    if ('cancellationRefundHours' in defaults) {
        next.cancellationRefundHours = typeof defaults.cancellationRefundHours === 'number'
            ? defaults.cancellationRefundHours
            : null;
    }
    if (typeof defaults.registrationCutoffHours === 'number') {
        next.registrationCutoffHours = defaults.registrationCutoffHours;
    }
    if (Array.isArray(defaults.requiredTemplateIds)) {
        next.requiredTemplateIds = [...defaults.requiredTemplateIds];
    }
    if (defaults.imageId !== undefined) next.imageId = defaults.imageId ?? '';
    if (typeof defaults.seedColor === 'number') next.seedColor = defaults.seedColor;
    if (Array.isArray(defaults.waitListIds)) next.waitList = [...defaults.waitListIds];
    if (Array.isArray(defaults.freeAgentIds)) next.freeAgents = [...defaults.freeAgentIds];
    if (Array.isArray(defaults.players)) next.players = [...defaults.players];
    if (Array.isArray(defaults.teams)) next.teams = [...defaults.teams];

    return next;
};
