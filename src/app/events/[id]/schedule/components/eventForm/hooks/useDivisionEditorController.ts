import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from 'react';

import { buildEventDivisionId } from '@/lib/divisionTypes';
import type { LeagueConfig, TournamentConfig } from '@/types';

import { applyEventDefaultsToDivisionDetails } from '../../divisionDefaults';
import {
    buildTournamentConfig,
    derivePoolTeamCount,
} from '../configDefaults';
import {
    type DivisionEditorState,
    type PlayoffDivisionDetailForm,
    deriveSingleDivisionPoolPlayDefaults,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionKeys,
    resolveSportInput,
} from '../divisionForm';
import type { EventFormValues } from '../formTypes';
import { stringArraysEqual } from '../shared';
import { useDivisionEditorDraft } from './useDivisionEditorDraft';

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventFormGetValues = (name: string) => unknown;

type UseDivisionEditorControllerParams = {
    eventData: EventFormValues;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    currentSportRequiresSets: boolean;
    hasStripeAccount: boolean;
    isCreateMode: boolean;
    setValue: EventFormSetValue;
    getValues: EventFormGetValues;
};

export const useDivisionEditorController = ({
    eventData,
    leagueData,
    playoffData,
    currentSportRequiresSets,
    hasStripeAccount,
    isCreateMode,
    setValue,
    getValues,
}: UseDivisionEditorControllerParams) => {
    const defaultDivisionTypeSelections = useMemo(
        () => getDefaultDivisionTypeSelectionsForSport(resolveSportInput(eventData.sportConfig ?? eventData.sportId)),
        [eventData.sportConfig, eventData.sportId],
    );
    const firstDivisionDetailForDefaults = useMemo(
        () => (Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails[0] : undefined),
        [eventData.divisionDetails],
    );
    const splitDivisionEditorEnabled = Boolean(
        eventData.eventType === 'LEAGUE'
        && leagueData.includePlayoffs
        && eventData.splitLeaguePlayoffDivisions
        && !eventData.singleDivision,
    );

    const createNextPlayoffDivision = useCallback((
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ): PlayoffDivisionDetailForm => {
        let index = Math.max(1, existing.length + 1);
        while (index < 500) {
            const key = `playoff_${index}`;
            const id = buildEventDivisionId(eventData.$id, key);
            if (!existing.some((division) => division.id === id || division.key === key)) {
                return {
                    id,
                    key,
                    kind: 'PLAYOFF',
                    name: `Playoff Division ${index}`,
                    maxParticipants: 2,
                    playoffConfig: buildTournamentConfig(configTemplate),
                };
            }
            index += 1;
        }
        const fallbackKey = `playoff_${Date.now()}`;
        return {
            id: buildEventDivisionId(eventData.$id, fallbackKey),
            key: fallbackKey,
            kind: 'PLAYOFF',
            name: 'Playoff Division',
            maxParticipants: 2,
            playoffConfig: buildTournamentConfig(configTemplate),
        };
    }, [eventData.$id]);

    const {
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
    } = useDivisionEditorDraft({
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
    });

    const singleDivisionPoolPlayDefaults = useMemo(() => deriveSingleDivisionPoolPlayDefaults({
        firstDivisionDetail: firstDivisionDetailForDefaults,
        editorPlayoffTeamCount: divisionEditor.playoffTeamCount,
        editorPoolCount: divisionEditor.poolCount,
        maxParticipants: eventData.maxParticipants,
    }), [
        divisionEditor.playoffTeamCount,
        divisionEditor.poolCount,
        eventData.maxParticipants,
        firstDivisionDetailForDefaults,
    ]);
    const previousSingleDivisionRef = useRef<boolean | null>(null);

    const handleRemovePlayoffDivision = useCallback((playoffDivisionId: string) => {
        const normalizedPlayoffDivisionId = normalizeDivisionKeys([playoffDivisionId])[0];
        if (!normalizedPlayoffDivisionId) {
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivisions = currentPlayoffDivisions.filter((division) => (
            normalizeDivisionKeys([division.id])[0] !== normalizedPlayoffDivisionId
        ));
        setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const remappedLeagueDivisions = currentLeagueDivisions.map((division) => {
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            const nextMapping = mapping.map((entry) => (
                normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId ? '' : entry
            ));
            return stringArraysEqual(mapping, nextMapping)
                ? division
                : { ...division, playoffPlacementDivisionIds: nextMapping };
        });
        setValue('divisionDetails', remappedLeagueDivisions, { shouldDirty: true, shouldValidate: true });
        setDivisionEditor((previous) => {
            if (previous.editingId === normalizedPlayoffDivisionId && previous.divisionKind === 'PLAYOFF') {
                return { ...previous, editingId: null, divisionKind: 'LEAGUE', error: null };
            }
            if (!previous.playoffPlacementDivisionIds.some((entry) => (
                normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId
            ))) {
                return previous;
            }
            return {
                ...previous,
                playoffPlacementDivisionIds: previous.playoffPlacementDivisionIds.map((entry) => (
                    normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId ? '' : entry
                )),
                error: null,
            };
        });
    }, [eventData.divisionDetails, eventData.playoffDivisionDetails, setDivisionEditor, setValue]);

    const updateSingleDivisionTournamentPoolDefaults = useCallback((
        updates: Partial<Pick<DivisionEditorState, 'playoffTeamCount' | 'poolCount'>>,
    ) => {
        setDivisionEditor((previous) => ({ ...previous, ...updates, error: null }));
        if (!eventData.singleDivision || eventData.eventType !== 'TOURNAMENT' || !leagueData.includePlayoffs) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }

        const nextPlayoffTeamCount = Object.prototype.hasOwnProperty.call(updates, 'playoffTeamCount')
            ? updates.playoffTeamCount
            : singleDivisionPoolPlayDefaults.bracketTeams;
        const nextPoolCount = Object.prototype.hasOwnProperty.call(updates, 'poolCount')
            ? updates.poolCount
            : singleDivisionPoolPlayDefaults.poolCount;
        const normalizedMaxParticipants = Math.max(2, Math.trunc(eventData.maxParticipants || 2));
        const normalizedPlayoffTeamCount = typeof nextPlayoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(nextPlayoffTeamCount))
            : undefined;
        const normalizedPoolCount = typeof nextPoolCount === 'number'
            ? Math.max(1, Math.trunc(nextPoolCount))
            : undefined;
        const normalizedPoolTeamCount = derivePoolTeamCount(normalizedMaxParticipants, normalizedPoolCount);
        const nextDetails = currentDetails.map((detail) => ({
            ...detail,
            maxParticipants: normalizedMaxParticipants,
            playoffTeamCount: normalizedPlayoffTeamCount,
            poolCount: normalizedPoolCount,
            poolTeamCount: normalizedPoolTeamCount,
        }));
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setDivisionEditor,
        setValue,
        singleDivisionPoolPlayDefaults.bracketTeams,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

    useEffect(() => {
        const isSingleDivision = Boolean(eventData.singleDivision);
        if (previousSingleDivisionRef.current === null) {
            previousSingleDivisionRef.current = isSingleDivision;
            return;
        }
        const wasSingleDivision = previousSingleDivisionRef.current;
        previousSingleDivisionRef.current = isSingleDivision;
        if (!wasSingleDivision || isSingleDivision) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            resetDivisionEditor();
            return;
        }
        const { details: nextDetails, changed } = applyEventDefaultsToDivisionDetails({
            details: currentDetails,
            defaultPrice: Number(eventData.price) || 0,
            defaultMaxParticipants: Number(eventData.maxParticipants) || 2,
            includePlayoffs: eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs,
            defaultPlayoffTeamCount: typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.eventType === 'TOURNAMENT'
                    && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                    ? firstDivisionDetailForDefaults.playoffTeamCount
                    : typeof eventData.maxParticipants === 'number'
                        ? eventData.maxParticipants
                        : undefined,
            includeTournamentPoolPlay: eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs,
            defaultPoolCount: eventData.eventType === 'TOURNAMENT'
                ? firstDivisionDetailForDefaults?.poolCount ?? singleDivisionPoolPlayDefaults.poolCount
                : undefined,
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
        }
        resetDivisionEditor();
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.price,
        eventData.singleDivision,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        resetDivisionEditor,
        setValue,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

    const handleRemoveDivisionDetail = useCallback((divisionId: string) => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDetails = currentDetails.filter((detail) => detail.id !== divisionId);
        const nextDivisionIds = nextDetails.map((detail) => detail.id);
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const cleanedFieldMap = Object.fromEntries(
            Object.entries(currentFieldMap as Record<string, unknown>)
                .filter(([divisionKey]) => nextDivisionIds.includes(divisionKey)),
        );
        setValue('divisionFieldIds', cleanedFieldMap, { shouldDirty: true, shouldValidate: true });
        if (divisionEditor.editingId === divisionId) {
            resetDivisionEditor();
        }
    }, [divisionEditor.editingId, eventData.divisionDetails, getValues, resetDivisionEditor, setValue]);

    return {
        createNextPlayoffDivision,
        defaultDivisionTypeSelections,
        divisionEditor,
        divisionEditorReady,
        divisionMaxParticipantsWarning,
        handleDivisionEditorKindChange,
        handleEditDivisionDetail,
        handleEditPlayoffDivisionDetail,
        handleRemoveDivisionDetail,
        handleRemovePlayoffDivision,
        removeDivisionInstallment,
        resetDivisionEditor,
        setDivisionEditor,
        setDivisionEditorLeagueConfig,
        setDivisionEditorPlayoffConfig,
        setDivisionInstallmentAmount,
        setDivisionInstallmentDueDate,
        setDivisionInstallmentDueRelativeDay,
        singleDivisionPoolPlayDefaults,
        splitDivisionEditorEnabled,
        syncDivisionInstallmentCount,
        updateDivisionEditorSelection,
        updateSingleDivisionTournamentPoolDefaults,
    };
};
