import {
    useEffect,
    type Dispatch,
    type SetStateAction,
} from 'react';

import type {
    LeagueConfig,
    Sport,
    TournamentConfig,
} from '@/types';

import {
    buildTournamentConfig,
    normalizeLeagueConfigForSetMode,
    normalizeTournamentConfigForSetMode,
} from '../configDefaults';
import { parseDateValue } from '../dateHelpers';
import {
    applyDivisionAgeCutoff,
    normalizeDivisionKeys,
    resolveSportInput,
    type DivisionEditorState,
} from '../divisionForm';
import {
    leagueConfigEqual,
    tournamentConfigEqual,
} from '../formEquality';
import type { EventFormValues } from '../formTypes';
import { stringArraysEqual } from '../shared';

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventFormGetValues = (name: string) => unknown;

type LeagueDataSetter = (
    updater: SetStateAction<LeagueConfig>,
    options?: Record<string, unknown>,
) => void;

type PlayoffDataSetter = (
    updater: SetStateAction<TournamentConfig>,
    options?: Record<string, unknown>,
) => void;

type UseEventDivisionNormalizationParams = {
    currentSportRequiresSets: boolean;
    eventData: EventFormValues;
    getValues: EventFormGetValues;
    hasExternalRentalField: boolean;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    setDivisionEditor: Dispatch<SetStateAction<DivisionEditorState>>;
    setLeagueData: LeagueDataSetter;
    setPlayoffData: PlayoffDataSetter;
    setValue: EventFormSetValue;
    sportsById: Map<string, Sport>;
    sportsLoading: boolean;
};

export const useEventDivisionNormalization = ({
    currentSportRequiresSets,
    eventData,
    getValues,
    hasExternalRentalField,
    leagueData,
    playoffData,
    setDivisionEditor,
    setLeagueData,
    setPlayoffData,
    setValue,
    sportsById,
    sportsLoading,
}: UseEventDivisionNormalizationParams): void => {
    useEffect(() => {
        if (sportsLoading) {
            return;
        }
        const selectedSportId = String(getValues('sportId') ?? '').trim();
        const currentSportConfig = getValues('sportConfig') as Sport | null | undefined;
        const currentSportConfigId = currentSportConfig && typeof currentSportConfig === 'object'
            ? String((currentSportConfig as any).$id ?? '')
            : '';

        if (!selectedSportId) {
            if (currentSportConfig) {
                setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
            }
            return;
        }

        const selected = sportsById.get(selectedSportId) ?? null;
        if (selected && currentSportConfigId !== selected.$id) {
            setValue('sportConfig', selected, { shouldDirty: false, shouldValidate: false });
            return;
        }
        if (!selected && currentSportConfig) {
            setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
        }
    }, [eventData.sportId, getValues, setValue, sportsLoading, sportsById]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            const currentDivisionIds = normalizeDivisionKeys(getValues('divisions'));
            if (currentDivisionIds.length) {
                setValue('divisions', [], { shouldDirty: false, shouldValidate: true });
            }
            return;
        }

        const idsFromDetails = normalizeDivisionKeys(currentDetails.map((detail) => detail.id));
        const currentDivisionIds = normalizeDivisionKeys(getValues('divisions'));
        if (!stringArraysEqual(idsFromDetails, currentDivisionIds)) {
            setValue('divisions', idsFromDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [eventData.$id, eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, getValues, setValue]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        const referenceDate = parseDateValue(eventData.start ?? null);
        const nextDetails = currentDetails.map((detail) => applyDivisionAgeCutoff({
            ...detail,
            sportId: detail.sportId ?? (sportInput || undefined),
        }, sportInput, referenceDate));

        const changed = nextDetails.some((detail, index) => {
            const current = currentDetails[index];
            if (!current) {
                return true;
            }
            return detail.ageCutoffDate !== current.ageCutoffDate
                || detail.ageCutoffLabel !== current.ageCutoffLabel
                || detail.ageCutoffSource !== current.ageCutoffSource
                || detail.sportId !== current.sportId;
        });

        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: false });
        }
    }, [eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, setValue]);

    useEffect(() => {
        if (eventData.eventType === 'LEAGUE') {
            return;
        }

        if (eventData.splitLeaguePlayoffDivisions) {
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: false, shouldValidate: true });
        }
        if ((eventData.playoffDivisionDetails || []).length > 0) {
            setValue('playoffDivisionDetails', [], { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        setValue,
    ]);

    useEffect(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                : 0;
            if (playoffTeamCount <= 0) {
                if (!Array.isArray(detail.playoffPlacementDivisionIds) || detail.playoffPlacementDivisionIds.length === 0) {
                    return detail;
                }
                changed = true;
                return {
                    ...detail,
                    playoffPlacementDivisionIds: [],
                };
            }
            const currentMapping = Array.isArray(detail.playoffPlacementDivisionIds)
                ? detail.playoffPlacementDivisionIds
                : [];
            const nextMapping = currentMapping.slice(0, playoffTeamCount);
            while (nextMapping.length < playoffTeamCount) {
                nextMapping.push('');
            }
            if (stringArraysEqual(currentMapping, nextMapping)) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || !eventData.singleDivision) {
            return;
        }
        if (typeof leagueData.playoffTeamCount === 'number' && leagueData.playoffTeamCount >= 2) {
            return;
        }
        const fallbackFromDivision = eventData.divisionDetails?.[0]?.playoffTeamCount
            ?? eventData.divisionDetails?.[0]?.maxParticipants
            ?? eventData.maxParticipants
            ?? 2;
        setLeagueData((previous) => ({
            ...previous,
            playoffTeamCount: Math.max(2, Math.trunc(fallbackFromDivision)),
        }), { shouldDirty: false });
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        setLeagueData,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || eventData.singleDivision) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            if (typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffTeamCount: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
        setLeagueData((previous) => {
            const normalized = normalizeLeagueConfigForSetMode(previous, requiresSets);
            return leagueConfigEqual(previous, normalized) ? previous : normalized;
        }, { shouldDirty: false });
    }, [eventData.sportConfig, eventData.sportId, setLeagueData, sportsById]);

    useEffect(() => {
        setDivisionEditor((previous) => {
            if (previous.divisionKind !== 'LEAGUE') {
                return previous;
            }
            const normalized = normalizeLeagueConfigForSetMode(previous.leagueConfig, currentSportRequiresSets);
            if (leagueConfigEqual(previous.leagueConfig, normalized)) {
                return previous;
            }
            return {
                ...previous,
                leagueConfig: normalized,
            };
        });
    }, [currentSportRequiresSets, setDivisionEditor]);

    useEffect(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
        if (requiresSets) {
            return;
        }

        const normalizedPlayoff = normalizeTournamentConfigForSetMode(playoffData, false);
        if (!tournamentConfigEqual(playoffData, normalizedPlayoff)) {
            setPlayoffData(normalizedPlayoff, { shouldDirty: false });
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        if (!currentPlayoffDivisions.length) {
            const currentLeagueDivisions = Array.isArray(eventData.divisionDetails)
                ? eventData.divisionDetails
                : [];
            let leagueChanged = false;
            const nextLeagueDivisions = currentLeagueDivisions.map((division) => {
                if (!division.playoffConfig) {
                    return division;
                }
                const previousConfig = buildTournamentConfig(division.playoffConfig);
                const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
                if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                    return division;
                }
                leagueChanged = true;
                return {
                    ...division,
                    playoffConfig: normalizedConfig,
                };
            });

            if (leagueChanged) {
                setValue('divisionDetails', nextLeagueDivisions, { shouldDirty: false, shouldValidate: true });
            }
            return;
        }

        let changed = false;
        const nextPlayoffDivisions = currentPlayoffDivisions.map((division) => {
            const previousConfig = buildTournamentConfig(division.playoffConfig);
            const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
            if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                return division;
            }
            changed = true;
            return {
                ...division,
                playoffConfig: normalizedConfig,
            };
        });

        if (changed) {
            setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: false, shouldValidate: true });
        }

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails)
            ? eventData.divisionDetails
            : [];
        let leagueChanged = false;
        const nextLeagueDivisions = currentLeagueDivisions.map((division) => {
            if (!division.playoffConfig) {
                return division;
            }
            const previousConfig = buildTournamentConfig(division.playoffConfig);
            const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
            if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                return division;
            }
            leagueChanged = true;
            return {
                ...division,
                playoffConfig: normalizedConfig,
            };
        });

        if (leagueChanged) {
            setValue('divisionDetails', nextLeagueDivisions, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.playoffDivisionDetails,
        eventData.sportConfig,
        eventData.sportId,
        playoffData,
        setPlayoffData,
        setValue,
        sportsById,
    ]);

    useEffect(() => {
        if (!eventData.singleDivision || hasExternalRentalField) {
            return;
        }
        if (!eventData.splitLeaguePlayoffDivisions) {
            return;
        }
        setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: false, shouldValidate: true });
    }, [eventData.singleDivision, eventData.splitLeaguePlayoffDivisions, hasExternalRentalField, setValue]);
};
