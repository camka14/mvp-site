import { buildDivisionName } from '@/lib/divisionTypes';
import { normalizePriceCents } from '@/lib/priceUtils';
import type { LeagueConfig, TournamentConfig } from '@/types';

import {
    buildDivisionLeagueConfig,
    buildTournamentConfig,
    normalizeLeagueConfigForSetMode,
} from './configDefaults';
import {
    type DivisionDetailForm,
    type DivisionEditorState,
    type PlayoffDivisionDetailForm,
    getDefaultDivisionTypeSelectionsForSport,
    normalizePlacementDivisionIds,
    normalizePlayoffDivisionParticipantCount,
    parseCompositeDivisionTypeId,
    resolveSportInput,
} from './divisionForm';
import type { EventFormValues } from './formTypes';
import {
    normalizeInstallmentAmounts,
    normalizeInstallmentRelativeDays,
    sumInstallmentAmounts,
} from './paymentPlanHelpers';

export type DivisionTypeSelections = {
    skillDivisionTypeId: string;
    ageDivisionTypeId: string;
};

type DivisionEditorEventValues = Pick<EventFormValues,
    | 'allowPaymentPlans'
    | 'eventType'
    | 'installmentAmounts'
    | 'installmentCount'
    | 'installmentDueDates'
    | 'installmentDueRelativeDays'
    | 'maxParticipants'
    | 'price'
    | 'sportConfig'
    | 'sportId'
>;

type BuildResetDivisionEditorStateOptions = {
    currentSportRequiresSets: boolean;
    defaultDivisionTypeSelections: DivisionTypeSelections;
    eventData: DivisionEditorEventValues;
    firstDivisionDetailForDefaults?: DivisionDetailForm;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
};

export const buildInitialDivisionEditorState = ({
    eventPrice,
    eventMaxParticipants,
    leagueData,
    sportUsesPointsPerSetWin,
}: {
    eventPrice: number;
    eventMaxParticipants: number | null;
    leagueData: LeagueConfig;
    sportUsesPointsPerSetWin: boolean;
}): DivisionEditorState => ({
    editingId: null,
    divisionKind: 'LEAGUE',
    gender: '',
    skillDivisionTypeId: '',
    ageDivisionTypeId: '',
    name: '',
    price: Math.max(0, eventPrice || 0),
    maxParticipants: Math.max(2, Math.trunc(eventMaxParticipants || 2)),
    playoffTeamCount: Math.max(
        2,
        Math.trunc(
            typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventMaxParticipants || 2,
        ),
    ),
    poolCount: null,
    playoffPlacementDivisionIds: [],
    leagueConfig: normalizeLeagueConfigForSetMode(leagueData, sportUsesPointsPerSetWin),
    playoffConfig: buildTournamentConfig(),
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    nameTouched: false,
    error: null,
});

export const buildResetDivisionEditorState = ({
    currentSportRequiresSets,
    defaultDivisionTypeSelections,
    eventData,
    firstDivisionDetailForDefaults,
    leagueData,
    playoffData,
}: BuildResetDivisionEditorStateOptions): DivisionEditorState => {
    const defaultInstallmentAmounts = eventData.allowPaymentPlans
        ? normalizeInstallmentAmounts(eventData.installmentAmounts)
        : [];
    const defaultInstallmentDueDates = eventData.allowPaymentPlans
        ? [...(eventData.installmentDueDates || [])]
        : [];
    const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
        ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
        : [];

    return {
        editingId: null,
        divisionKind: 'LEAGUE',
        gender: '',
        skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
        ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
        name: '',
        price: Math.max(0, eventData.price || 0),
        maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
        playoffTeamCount: Math.max(
            2,
            Math.trunc(
                eventData.eventType === 'TOURNAMENT'
                    && leagueData.includePlayoffs
                    && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                    ? firstDivisionDetailForDefaults.playoffTeamCount
                    : typeof leagueData.playoffTeamCount === 'number'
                        ? leagueData.playoffTeamCount
                        : eventData.maxParticipants || 2,
            ),
        ),
        poolCount: eventData.eventType === 'TOURNAMENT'
            && leagueData.includePlayoffs
            && typeof firstDivisionDetailForDefaults?.poolCount === 'number'
            ? Math.max(1, Math.trunc(firstDivisionDetailForDefaults.poolCount))
            : null,
        playoffPlacementDivisionIds: [],
        leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
        playoffConfig: buildTournamentConfig(playoffData),
        allowPaymentPlans: Boolean(eventData.allowPaymentPlans),
        installmentCount: eventData.allowPaymentPlans
            ? (eventData.installmentCount || defaultInstallmentAmounts.length || 0)
            : 0,
        installmentDueDates: defaultInstallmentDueDates,
        installmentDueRelativeDays: defaultInstallmentDueRelativeDays,
        installmentAmounts: defaultInstallmentAmounts,
        nameTouched: false,
        error: null,
    };
};

export const buildLeagueDivisionEditorState = ({
    currentSportRequiresSets,
    detail,
    eventData,
    leagueData,
    playoffData,
}: {
    currentSportRequiresSets: boolean;
    detail: DivisionDetailForm;
    eventData: DivisionEditorEventValues;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
}): DivisionEditorState => {
    const composite = parseCompositeDivisionTypeId(detail.divisionTypeId);
    const fallbackSelections = getDefaultDivisionTypeSelectionsForSport(
        resolveSportInput(eventData.sportConfig ?? eventData.sportId),
    );
    const defaultInstallmentAmounts = eventData.allowPaymentPlans
        ? normalizeInstallmentAmounts(eventData.installmentAmounts)
        : [];
    const defaultInstallmentDueDates = eventData.allowPaymentPlans
        ? [...(eventData.installmentDueDates || [])]
        : [];
    const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
        ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
        : [];
    const detailAllowPaymentPlans = typeof detail.allowPaymentPlans === 'boolean'
        ? detail.allowPaymentPlans
        : Boolean(eventData.allowPaymentPlans);
    const detailInstallmentAmounts = detailAllowPaymentPlans
        ? ((detail.installmentAmounts?.length
            ? detail.installmentAmounts
            : defaultInstallmentAmounts).map((value) => normalizePriceCents(value)))
        : [];
    const detailInstallmentDueDates = detailAllowPaymentPlans
        ? (detail.installmentDueDates?.length
            ? [...detail.installmentDueDates]
            : defaultInstallmentDueDates)
        : [];
    const detailInstallmentDueRelativeDays = detailAllowPaymentPlans
        ? (detail.installmentDueRelativeDays?.length
            ? normalizeInstallmentRelativeDays(detail.installmentDueRelativeDays)
            : defaultInstallmentDueRelativeDays)
        : [];

    return {
        editingId: detail.id,
        divisionKind: 'LEAGUE',
        gender: detail.gender,
        skillDivisionTypeId: detail.skillDivisionTypeId
            || composite?.skillDivisionTypeId
            || (detail.ratingType === 'SKILL' ? detail.divisionTypeId : fallbackSelections.skillDivisionTypeId),
        ageDivisionTypeId: detail.ageDivisionTypeId
            || composite?.ageDivisionTypeId
            || (detail.ratingType === 'AGE' ? detail.divisionTypeId : fallbackSelections.ageDivisionTypeId),
        name: detail.name,
        price: Math.max(0, detail.price || 0),
        maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
        playoffTeamCount: Math.max(
            2,
            Math.trunc(
                detail.playoffTeamCount
                    || detail.maxParticipants
                    || eventData.maxParticipants
                    || 2,
            ),
        ),
        poolCount: typeof detail.poolCount === 'number'
            ? Math.max(1, Math.trunc(detail.poolCount))
            : null,
        playoffPlacementDivisionIds: normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds),
        leagueConfig: buildDivisionLeagueConfig(detail, leagueData, currentSportRequiresSets),
        playoffConfig: buildTournamentConfig(detail.playoffConfig ?? playoffData),
        allowPaymentPlans: detailAllowPaymentPlans,
        installmentCount: detailAllowPaymentPlans
            ? (detail.installmentCount || detailInstallmentAmounts.length || 0)
            : 0,
        installmentDueDates: detailInstallmentDueDates,
        installmentDueRelativeDays: detailInstallmentDueRelativeDays,
        installmentAmounts: detailInstallmentAmounts,
        nameTouched: true,
        error: null,
    };
};

export const buildPlayoffDivisionEditorState = ({
    currentSportRequiresSets,
    defaultDivisionTypeSelections,
    detail,
    editing,
    leagueData,
}: {
    currentSportRequiresSets: boolean;
    defaultDivisionTypeSelections: DivisionTypeSelections;
    detail: PlayoffDivisionDetailForm;
    editing: boolean;
    leagueData: LeagueConfig;
}): DivisionEditorState => ({
    editingId: editing ? detail.id : null,
    divisionKind: 'PLAYOFF',
    gender: '',
    skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
    ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
    name: detail.name,
    price: 0,
    maxParticipants: editing
        ? normalizePlayoffDivisionParticipantCount(detail.maxParticipants)
        : detail.maxParticipants,
    playoffTeamCount: null,
    poolCount: null,
    playoffPlacementDivisionIds: [],
    leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
    playoffConfig: buildTournamentConfig(detail.playoffConfig),
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    nameTouched: true,
    error: null,
});

export const syncDivisionInstallmentCountState = (
    state: DivisionEditorState,
    count: number,
    eventStart: string,
    useRelativeDueDates: boolean,
): DivisionEditorState => {
    const safeCount = Math.max(1, Math.floor(Number(count) || 0));
    const amounts = [...(state.installmentAmounts || [])];
    const dueDates = [...(state.installmentDueDates || [])];
    const relativeDueDays = [...(state.installmentDueRelativeDays || [])];
    const price = Math.max(0, Number(state.price) || 0);
    while (amounts.length < safeCount) {
        amounts.push(amounts.length === 0 ? price : 0);
        dueDates.push(eventStart);
        relativeDueDays.push(0);
    }
    while (amounts.length > safeCount) {
        amounts.pop();
        dueDates.pop();
        relativeDueDays.pop();
    }
    return {
        ...state,
        installmentCount: safeCount,
        installmentAmounts: amounts,
        price: state.allowPaymentPlans ? sumInstallmentAmounts(amounts) : state.price,
        installmentDueDates: useRelativeDueDates ? [] : dueDates,
        installmentDueRelativeDays: useRelativeDueDates ? relativeDueDays : [],
        error: null,
    };
};

export const setDivisionInstallmentAmountState = (
    state: DivisionEditorState,
    index: number,
    value: number,
): DivisionEditorState => {
    const amounts = [...(state.installmentAmounts || [])];
    if (index < 0 || index >= amounts.length) {
        return state;
    }
    amounts[index] = normalizePriceCents(value);
    return {
        ...state,
        installmentAmounts: amounts,
        price: state.allowPaymentPlans ? sumInstallmentAmounts(amounts) : state.price,
        error: null,
    };
};

export const setDivisionInstallmentDueDateState = (
    state: DivisionEditorState,
    index: number,
    value: Date | string | null,
): DivisionEditorState => {
    const dueDates = [...(state.installmentDueDates || [])];
    if (index < 0 || index >= dueDates.length) {
        return state;
    }
    dueDates[index] = value instanceof Date
        ? value.toISOString()
        : typeof value === 'string'
            ? value
            : '';
    return { ...state, installmentDueDates: dueDates, error: null };
};

export const setDivisionInstallmentDueRelativeDayState = (
    state: DivisionEditorState,
    index: number,
    value: number | string,
): DivisionEditorState => {
    const amounts = state.installmentAmounts || [];
    if (index < 0 || index >= amounts.length) {
        return state;
    }
    const relativeDueDays = [...(state.installmentDueRelativeDays || [])];
    while (relativeDueDays.length < amounts.length) {
        relativeDueDays.push(0);
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    relativeDueDays[index] = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
    return {
        ...state,
        installmentDueRelativeDays: relativeDueDays,
        installmentDueDates: [],
        error: null,
    };
};

export const removeDivisionInstallmentState = (
    state: DivisionEditorState,
    index: number,
): DivisionEditorState => {
    const amounts = [...(state.installmentAmounts || [])];
    const dueDates = [...(state.installmentDueDates || [])];
    const relativeDueDays = [...(state.installmentDueRelativeDays || [])];
    if (amounts.length <= 1 || index < 0 || index >= amounts.length) {
        return state;
    }
    amounts.splice(index, 1);
    dueDates.splice(index, 1);
    relativeDueDays.splice(index, 1);
    return {
        ...state,
        installmentAmounts: amounts,
        price: state.allowPaymentPlans ? sumInstallmentAmounts(amounts) : state.price,
        installmentDueDates: dueDates,
        installmentDueRelativeDays: relativeDueDays,
        installmentCount: amounts.length,
        error: null,
    };
};

export const clearDivisionEditorPaidSettings = (state: DivisionEditorState): DivisionEditorState => {
    const hasEditorPaidSettings = state.price !== 0
        || state.allowPaymentPlans
        || (state.installmentCount || 0) !== 0
        || (state.installmentAmounts?.length || 0) > 0
        || (state.installmentDueDates?.length || 0) > 0
        || (state.installmentDueRelativeDays?.length || 0) > 0;
    return hasEditorPaidSettings
        ? {
            ...state,
            price: 0,
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentAmounts: [],
            installmentDueDates: [],
            installmentDueRelativeDays: [],
            error: null,
        }
        : state;
};

export const updateDivisionEditorSelectionState = (
    state: DivisionEditorState,
    updates: Partial<Pick<DivisionEditorState, 'gender' | 'skillDivisionTypeId' | 'ageDivisionTypeId'>>,
    sportInput: string,
): DivisionEditorState => {
    const next = { ...state, ...updates, error: null };
    if (Object.prototype.hasOwnProperty.call(updates, 'skillDivisionTypeId') && !updates.skillDivisionTypeId) {
        next.skillDivisionTypeId = '';
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'ageDivisionTypeId') && !updates.ageDivisionTypeId) {
        next.ageDivisionTypeId = '';
    }
    if (!next.gender || !next.skillDivisionTypeId || !next.ageDivisionTypeId) {
        next.name = '';
        next.nameTouched = false;
        return next;
    }
    next.name = buildDivisionName({
        gender: next.gender as 'M' | 'F' | 'C',
        sportInput,
        skillDivisionTypeId: next.skillDivisionTypeId,
        ageDivisionTypeId: next.ageDivisionTypeId,
    });
    next.nameTouched = false;
    return next;
};
