import type { Event, Field, Sport } from '@/types';
import {
    getSystemTimeZone,
    normalizeTimeZone,
} from '@/lib/dateUtils';

import {
    buildDefaultLeagueData,
    buildDefaultPlayoffData,
    buildDefaultTournamentData,
} from './configDefaults';
import {
    normalizeDivisionFieldIds,
    normalizeDivisionKeys,
    buildSlotDivisionLookup,
} from './divisionForm';
import { buildDefaultFieldState } from './fieldDefaults';
import type {
    EventFormState,
    EventFormValues,
} from './formTypes';
import { coordinatesAreSet } from './locationHelpers';
import { mapEventToFormState } from './eventStateMapping';
import { normalizeInstallmentRelativeDays } from './paymentPlanHelpers';
import {
    buildDefaultSlotForms,
    createLeagueSlotForm,
} from './slotForm';
import { normalizeSlotState } from './slotValidation';

type DefaultLocation = {
    location?: string;
    address?: string;
    coordinates?: [number, number];
};

type BuildEventFormDefaultValuesOptions = {
    activeEditingEvent: Event;
    applyImmutableDefaults: (state: EventFormState) => EventFormState;
    defaultLocation?: DefaultLocation;
    hasImmutableFields: boolean;
    immutableDefaults?: Partial<Event>;
    immutableFields: Field[];
    isCreateMode: boolean;
    resolvedOrganizationFields?: Field[] | null;
    resolvedOrganizationId: string;
    sportsById: Map<string, Sport>;
};

export const buildEventFormDefaultValues = ({
    activeEditingEvent,
    applyImmutableDefaults,
    defaultLocation,
    hasImmutableFields,
    immutableDefaults,
    immutableFields,
    isCreateMode,
    resolvedOrganizationFields,
    resolvedOrganizationId,
    sportsById,
}: BuildEventFormDefaultValuesOptions): EventFormValues => {
    const defaultLocationLabel = (defaultLocation?.location ?? '').trim();
    const defaultLocationAddress = (defaultLocation?.address ?? '').trim();
    const defaultLocationCoordinates = defaultLocation?.coordinates;

    const base = (() => {
        const initial = applyImmutableDefaults(mapEventToFormState(activeEditingEvent));
        const normalizedSportId = typeof initial.sportId === 'string' ? initial.sportId.trim() : '';
        if (normalizedSportId) {
            initial.sportId = normalizedSportId;
            const hydratedSport = sportsById.get(normalizedSportId);
            if (hydratedSport) {
                initial.sportConfig = hydratedSport;
            }
        }
        if (!initial.location && defaultLocationLabel) {
            initial.location = defaultLocationLabel;
        }
        if (!initial.address && defaultLocationAddress) {
            initial.address = defaultLocationAddress;
        }
        if (!coordinatesAreSet(initial.coordinates) && defaultLocationCoordinates) {
            initial.coordinates = defaultLocationCoordinates;
        }
        return initial;
    })();

    base.timeZone = normalizeTimeZone(base.timeZone, getSystemTimeZone());
    base.allowPaymentPlans = Boolean(base.allowPaymentPlans);
    base.installmentAmounts = Array.isArray(base.installmentAmounts) ? base.installmentAmounts : [];
    base.installmentDueDates = Array.isArray(base.installmentDueDates) ? base.installmentDueDates : [];
    base.installmentDueRelativeDays = normalizeInstallmentRelativeDays(base.installmentDueRelativeDays);
    base.requiredTemplateIds = Array.isArray(base.requiredTemplateIds)
        ? base.requiredTemplateIds
        : [];
    const normalizedInstallmentCount = Number.isFinite(base.installmentCount)
        ? Number(base.installmentCount)
        : base.installmentAmounts.length;
    base.installmentCount = normalizedInstallmentCount || 0;
    base.allowTeamSplitDefault = Boolean(base.allowTeamSplitDefault);
    base.teamCheckInMode = base.teamSignup ? base.teamCheckInMode ?? 'OFF' : 'OFF';
    base.teamCheckInOpenMinutesBefore = Number.isFinite(Number(base.teamCheckInOpenMinutesBefore))
        ? Math.max(0, Math.trunc(Number(base.teamCheckInOpenMinutesBefore)))
        : 60;
    base.allowMatchRosterEdits = base.teamSignup ? Boolean(base.allowMatchRosterEdits) : false;
    base.allowTemporaryMatchPlayers = base.allowMatchRosterEdits ? Boolean(base.allowTemporaryMatchPlayers) : false;
    if (!base.organizationId && resolvedOrganizationId) {
        base.organizationId = resolvedOrganizationId;
    }
    const defaults = immutableDefaults ?? {};
    const {
        defaultFields,
        defaultFieldCount,
        defaultSelectedFieldIds,
        allDefaultFieldIds,
    } = buildDefaultFieldState({
        base,
        activeEditingEvent,
        immutableDefaults: defaults,
        immutableFields,
        hasImmutableFields,
        resolvedOrganizationFields: Array.isArray(resolvedOrganizationFields)
            ? resolvedOrganizationFields
            : [],
        resolvedOrganizationId,
        isCreateMode,
    });
    const availableFieldIdsForDivisions = defaultSelectedFieldIds.length
        ? defaultSelectedFieldIds
        : allDefaultFieldIds;
    const defaultDivisionDetails = (() => {
        const normalized = Array.isArray(base.divisionDetails)
            ? base.divisionDetails.filter((detail) => detail && detail.id)
            : [];
        if (normalized.length) {
            return normalized;
        }
        return [];
    })();
    const baseLeagueIncludesPlayoffs = Boolean(
        base.eventType === 'LEAGUE'
        && (
            (immutableDefaults && typeof (immutableDefaults as any).includePlayoffs === 'boolean'
                ? Boolean((immutableDefaults as any).includePlayoffs)
                : undefined)
            ?? (immutableDefaults && typeof (immutableDefaults as any).leagueData?.includePlayoffs === 'boolean'
                ? Boolean((immutableDefaults as any).leagueData.includePlayoffs)
                : undefined)
            ??
            activeEditingEvent?.leagueConfig?.includePlayoffs
            ?? activeEditingEvent?.includePlayoffs
            ?? false
        ),
    );
    const defaultSlotDivisionKeys = buildSlotDivisionLookup(
        defaultDivisionDetails,
        base.eventType === 'LEAGUE' && baseLeagueIncludesPlayoffs && base.splitLeaguePlayoffDivisions
            ? (base.playoffDivisionDetails || [])
            : [],
    ).keys;
    const defaultDivisionKeys = (() => {
        const normalizedFromDetails = normalizeDivisionKeys(defaultDivisionDetails.map((detail) => detail.id));
        if (normalizedFromDetails.length) {
            return normalizedFromDetails;
        }
        const normalized = normalizeDivisionKeys(base.divisions);
        if (normalized.length) {
            return normalized;
        }
        return [];
    })();
    const defaultDivisionFieldIds = normalizeDivisionFieldIds(
        base.divisionFieldIds,
        defaultDivisionKeys,
        availableFieldIdsForDivisions,
    );

    const defaultSlots = buildDefaultSlotForms({
        base,
        activeEditingEvent,
        immutableDefaults: defaults,
        defaultSlotDivisionKeys,
        createSlotForm: createLeagueSlotForm,
    });

    const defaultLeagueData = buildDefaultLeagueData({
        base,
        activeEditingEvent,
        defaultDivisionDetails,
        sportsById,
    });
    const defaultTournamentData = buildDefaultTournamentData(activeEditingEvent);
    const defaultPlayoffData = buildDefaultPlayoffData(activeEditingEvent);

    return {
        ...base,
        divisions: defaultDivisionKeys,
        divisionDetails: defaultDivisionDetails,
        divisionFieldIds: defaultDivisionFieldIds,
        selectedFieldIds: defaultSelectedFieldIds,
        leagueSlots: normalizeSlotState(defaultSlots, base.eventType, base.parentEvent),
        leagueData: defaultLeagueData,
        playoffData: defaultPlayoffData,
        tournamentData: defaultTournamentData,
        fields: defaultFields,
        fieldCount: defaultFieldCount,
        joinAsParticipant: false,
    };
};
