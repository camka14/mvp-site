import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import type { LeagueConfig, TournamentConfig } from '@/types';

import {
    buildTournamentConfig,
    normalizeLeagueConfigForSetMode,
} from '../configDefaults';
import {
    buildInitialDivisionEditorState,
    buildLeagueDivisionEditorState,
    buildPlayoffDivisionEditorState,
    buildResetDivisionEditorState,
    clearDivisionEditorPaidSettings,
    removeDivisionInstallmentState,
    setDivisionInstallmentAmountState,
    setDivisionInstallmentDueDateState,
    setDivisionInstallmentDueRelativeDayState,
    syncDivisionInstallmentCountState,
    updateDivisionEditorSelectionState,
    type DivisionTypeSelections,
} from '../divisionEditorDraftState';
import {
    type DivisionDetailForm,
    type DivisionEditorKind,
    type DivisionEditorState,
    type PlayoffDivisionDetailForm,
    resolveSportInput,
} from '../divisionForm';
import { leagueConfigEqual } from '../formEquality';
import type { EventFormValues } from '../formTypes';

type UseDivisionEditorDraftParams = {
    createNextPlayoffDivision: (
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ) => PlayoffDivisionDetailForm;
    currentSportRequiresSets: boolean;
    defaultDivisionTypeSelections: DivisionTypeSelections;
    eventData: EventFormValues;
    firstDivisionDetailForDefaults?: DivisionDetailForm;
    hasStripeAccount: boolean;
    isCreateMode: boolean;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    splitDivisionEditorEnabled: boolean;
};

export const useDivisionEditorDraft = ({
    createNextPlayoffDivision,
    currentSportRequiresSets,
    defaultDivisionTypeSelections,
    eventData,
    firstDivisionDetailForDefaults,
    hasStripeAccount,
    isCreateMode,
    leagueData,
    playoffData,
    splitDivisionEditorEnabled,
}: UseDivisionEditorDraftParams) => {
    const divisionEditorEventValues = useMemo(() => ({
        allowPaymentPlans: eventData.allowPaymentPlans,
        eventType: eventData.eventType,
        installmentAmounts: eventData.installmentAmounts,
        installmentCount: eventData.installmentCount,
        installmentDueDates: eventData.installmentDueDates,
        installmentDueRelativeDays: eventData.installmentDueRelativeDays,
        maxParticipants: eventData.maxParticipants,
        price: eventData.price,
        sportConfig: eventData.sportConfig,
        sportId: eventData.sportId,
    }), [
        eventData.allowPaymentPlans,
        eventData.eventType,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.price,
        eventData.sportConfig,
        eventData.sportId,
    ]);
    const [divisionEditor, setDivisionEditor] = useState<DivisionEditorState>(() => (
        buildInitialDivisionEditorState({
            eventPrice: eventData.price,
            eventMaxParticipants: eventData.maxParticipants,
            leagueData,
            sportUsesPointsPerSetWin: Boolean(eventData.sportConfig?.usePointsPerSetWin),
        })
    ));

    const syncDivisionInstallmentCount = useCallback((count: number) => {
        setDivisionEditor((previous) => syncDivisionInstallmentCountState(
            previous,
            count,
            eventData.start,
            eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent,
        ));
    }, [eventData.eventType, eventData.parentEvent, eventData.start]);

    const setDivisionInstallmentAmount = useCallback((index: number, value: number) => {
        setDivisionEditor((previous) => setDivisionInstallmentAmountState(previous, index, value));
    }, []);

    const setDivisionInstallmentDueDate = useCallback((index: number, value: Date | string | null) => {
        setDivisionEditor((previous) => setDivisionInstallmentDueDateState(previous, index, value));
    }, []);

    const setDivisionInstallmentDueRelativeDay = useCallback((index: number, value: number | string) => {
        setDivisionEditor((previous) => setDivisionInstallmentDueRelativeDayState(previous, index, value));
    }, []);

    const removeDivisionInstallment = useCallback((index: number) => {
        setDivisionEditor((previous) => removeDivisionInstallmentState(previous, index));
    }, []);

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount) {
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- billing eligibility invalidates transient editor-only payment inputs.
        setDivisionEditor(clearDivisionEditorPaidSettings);
    }, [hasStripeAccount, isCreateMode]);

    const resetDivisionEditor = useCallback(() => {
        setDivisionEditor(buildResetDivisionEditorState({
            currentSportRequiresSets,
            defaultDivisionTypeSelections,
            eventData: divisionEditorEventValues,
            firstDivisionDetailForDefaults,
            leagueData,
            playoffData,
        }));
    }, [
        currentSportRequiresSets,
        defaultDivisionTypeSelections,
        divisionEditorEventValues,
        firstDivisionDetailForDefaults,
        leagueData,
        playoffData,
    ]);

    const handleDivisionEditorKindChange = useCallback((value: string | null) => {
        const nextKind: DivisionEditorKind = value === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE';
        if (nextKind === 'LEAGUE') {
            resetDivisionEditor();
            return;
        }
        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivision = createNextPlayoffDivision(currentPlayoffDivisions, playoffData);
        setDivisionEditor(buildPlayoffDivisionEditorState({
            currentSportRequiresSets,
            defaultDivisionTypeSelections,
            detail: nextPlayoffDivision,
            editing: false,
            leagueData,
        }));
    }, [
        createNextPlayoffDivision,
        currentSportRequiresSets,
        defaultDivisionTypeSelections,
        eventData.playoffDivisionDetails,
        leagueData,
        playoffData,
        resetDivisionEditor,
    ]);

    const setDivisionEditorPlayoffConfig = useCallback((updater: React.SetStateAction<TournamentConfig>) => {
        setDivisionEditor((previous) => {
            const previousConfig = buildTournamentConfig(previous.playoffConfig);
            const resolved = typeof updater === 'function'
                ? (updater as (config: TournamentConfig) => TournamentConfig)(previousConfig)
                : updater;
            return {
                ...previous,
                playoffConfig: buildTournamentConfig(resolved),
                error: null,
            };
        });
    }, []);

    const setDivisionEditorLeagueConfig = useCallback((updates: Partial<LeagueConfig>) => {
        setDivisionEditor((previous) => ({
            ...previous,
            leagueConfig: normalizeLeagueConfigForSetMode(
                {
                    ...previous.leagueConfig,
                    ...updates,
                    includePlayoffs: previous.leagueConfig.includePlayoffs,
                    playoffTeamCount: previous.leagueConfig.playoffTeamCount,
                },
                currentSportRequiresSets,
            ),
            error: null,
        }));
    }, [currentSportRequiresSets]);

    useEffect(() => {
        if (splitDivisionEditorEnabled || divisionEditor.divisionKind !== 'PLAYOFF') {
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- a disabled playoff editor mode must return to the league draft.
        resetDivisionEditor();
    }, [divisionEditor.divisionKind, resetDivisionEditor, splitDivisionEditorEnabled]);

    const updateDivisionEditorSelection = useCallback((
        updates: Partial<Pick<DivisionEditorState, 'gender' | 'skillDivisionTypeId' | 'ageDivisionTypeId'>>,
    ) => {
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        setDivisionEditor((previous) => updateDivisionEditorSelectionState(previous, updates, sportInput));
    }, [eventData.sportConfig, eventData.sportId]);

    const handleEditDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.divisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        setDivisionEditor(buildLeagueDivisionEditorState({
            currentSportRequiresSets,
            detail,
            eventData: divisionEditorEventValues,
            leagueData,
            playoffData,
        }));
    }, [
        currentSportRequiresSets,
        divisionEditorEventValues,
        eventData.divisionDetails,
        leagueData,
        playoffData,
    ]);

    const handleEditPlayoffDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.playoffDivisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        setDivisionEditor(buildPlayoffDivisionEditorState({
            currentSportRequiresSets,
            defaultDivisionTypeSelections,
            detail,
            editing: true,
            leagueData,
        }));
    }, [
        currentSportRequiresSets,
        defaultDivisionTypeSelections,
        eventData.playoffDivisionDetails,
        leagueData,
    ]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sport format changes normalize the transient editor config in place.
        setDivisionEditor((previous) => {
            if (previous.divisionKind !== 'LEAGUE') {
                return previous;
            }
            const normalized = normalizeLeagueConfigForSetMode(previous.leagueConfig, currentSportRequiresSets);
            if (leagueConfigEqual(previous.leagueConfig, normalized)) {
                return previous;
            }
            return { ...previous, leagueConfig: normalized };
        });
    }, [currentSportRequiresSets]);

    const divisionEditorReady = Boolean(
        divisionEditor.gender
        && divisionEditor.skillDivisionTypeId
        && divisionEditor.ageDivisionTypeId,
    );
    const divisionMaxParticipantsWarning = !eventData.singleDivision
        && typeof divisionEditor.maxParticipants === 'number'
        && divisionEditor.maxParticipants < 2
        ? (eventData.teamSignup
            ? 'Warning: make division max teams at least 2.'
            : 'Warning: make division max participants at least 2.')
        : null;

    return {
        divisionEditor,
        divisionEditorReady,
        divisionMaxParticipantsWarning,
        handleDivisionEditorKindChange,
        handleEditDivisionDetail,
        handleEditPlayoffDivisionDetail,
        removeDivisionInstallment,
        resetDivisionEditor,
        setDivisionEditor,
        setDivisionEditorLeagueConfig,
        setDivisionEditorPlayoffConfig,
        setDivisionInstallmentAmount,
        setDivisionInstallmentDueDate,
        setDivisionInstallmentDueRelativeDay,
        syncDivisionInstallmentCount,
        updateDivisionEditorSelection,
    };
};
