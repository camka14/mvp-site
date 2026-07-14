import {
    useCallback,
    type SetStateAction,
} from 'react';

import {
    formatLocalDateTime,
    parseLocalDateTime,
} from '@/lib/dateUtils';
import type {
    Event,
    LeagueConfig,
    LeagueScoringConfig,
    MatchRulesConfig,
    Sport,
    TournamentConfig,
} from '@/types';

import { normalizeNumber } from '../configDefaults';
import { syncEventTypeTagsForEventType } from '../eventTypeTags';
import type { EventFormValues } from '../formTypes';
import { applyLeagueScoringConfigFieldChange } from '../../leagueScoringConfigForm';
import { sanitizeMatchRulesOverrideForEditor } from '../matchRulesHelpers';

type EventFormGetValues = <Key extends keyof EventFormValues>(
    name: Key,
) => EventFormValues[Key];

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventDataSetter = (
    updater: SetStateAction<EventFormValues>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type LeagueDataSetter = (
    updater: SetStateAction<LeagueConfig>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type TournamentDataSetter = (
    updater: SetStateAction<TournamentConfig>,
) => void;

type UseEventFormConfigurationActionsParams = {
    clearLeagueSlotErrors: () => void;
    eventData: EventFormValues;
    getValues: EventFormGetValues;
    isAffiliateEvent: boolean;
    leagueData: LeagueConfig;
    selectedSport: Sport | null | undefined;
    setEventData: EventDataSetter;
    setLeagueData: LeagueDataSetter;
    setTournamentData: TournamentDataSetter;
    setValue: EventFormSetValue;
    tournamentData: TournamentConfig;
};

export const useEventFormConfigurationActions = ({
    clearLeagueSlotErrors,
    eventData,
    getValues,
    isAffiliateEvent,
    leagueData,
    selectedSport,
    setEventData,
    setLeagueData,
    setTournamentData,
    setValue,
    tournamentData,
}: UseEventFormConfigurationActionsParams) => {
    const handleLeagueScoringConfigChange = useCallback((
        key: keyof LeagueScoringConfig,
        value: LeagueScoringConfig[keyof LeagueScoringConfig],
    ) => {
        const currentConfig = getValues('leagueScoringConfig') ?? eventData.leagueScoringConfig;
        const nextConfig = applyLeagueScoringConfigFieldChange(
            currentConfig,
            key,
            value,
            (config) => setValue('leagueScoringConfig', config, {
                shouldDirty: true,
                shouldValidate: false,
            }),
        );
        setEventData((previous) => ({
            ...previous,
            leagueScoringConfig: nextConfig,
        }));
    }, [eventData.leagueScoringConfig, getValues, setEventData, setValue]);

    const handleMatchRulesOverrideChange = useCallback((nextValue: MatchRulesConfig | null) => {
        const sanitized = sanitizeMatchRulesOverrideForEditor(nextValue);
        setValue('matchRulesOverride', sanitized, { shouldDirty: true, shouldValidate: false });
        const template = (selectedSport?.matchRulesTemplate ?? null) as MatchRulesConfig | null;
        const templateTimekeeping = template?.timekeeping ?? null;
        const overrideTimekeeping = sanitized?.timekeeping ?? null;
        const timerMode = overrideTimekeeping?.timerMode ?? templateTimekeeping?.timerMode;
        const segmentDuration = normalizeNumber(
            overrideTimekeeping?.segmentDurationMinutes
            ?? templateTimekeeping?.segmentDurationMinutes,
        );
        const segmentCount = normalizeNumber(template?.segmentCount)
            ?? (eventData.eventType === 'TOURNAMENT'
                ? normalizeNumber(tournamentData.winnerSetCount)
                : normalizeNumber(leagueData.setsPerMatch))
            ?? 1;
        if (timerMode !== 'COUNT_UP' || !segmentDuration || segmentCount <= 0) {
            return;
        }
        const totalMatchDuration = Math.max(1, Math.trunc(segmentDuration * segmentCount));
        if (eventData.eventType === 'LEAGUE') {
            setLeagueData((previous) => ({
                ...previous,
                usesSets: false,
                matchDurationMinutes: totalMatchDuration,
                setDurationMinutes: undefined,
            }));
        } else if (eventData.eventType === 'TOURNAMENT') {
            setTournamentData((previous) => ({
                ...previous,
                matchDurationMinutes: totalMatchDuration,
                setDurationMinutes: undefined,
            }));
        }
    }, [
        eventData.eventType,
        leagueData.setsPerMatch,
        selectedSport,
        setLeagueData,
        setTournamentData,
        setValue,
        tournamentData.winnerSetCount,
    ]);

    const handleIncludePlayoffsToggle = useCallback((checked: boolean) => {
        if (!checked) {
            setLeagueData((previous) => ({
                ...previous,
                includePlayoffs: false,
                playoffTeamCount: undefined,
            }));
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: true, shouldValidate: true });
            return;
        }

        const fallback = typeof leagueData.playoffTeamCount === 'number'
            ? leagueData.playoffTeamCount
            : eventData.maxParticipants || 2;
        setLeagueData((previous) => ({
            ...previous,
            includePlayoffs: true,
            playoffTeamCount: typeof previous.playoffTeamCount === 'number'
                ? Math.max(2, Math.trunc(previous.playoffTeamCount))
                : Math.max(2, Math.trunc(fallback)),
        }));
    }, [eventData.maxParticipants, leagueData.playoffTeamCount, setLeagueData, setValue]);

    const handleEventTypeChange = useCallback((
        nextType: Event['eventType'],
        applyValue: (eventType: Event['eventType']) => void,
    ) => {
        clearLeagueSlotErrors();
        const enforcingTeamSettings = !isAffiliateEvent
            && (nextType === 'LEAGUE' || nextType === 'TOURNAMENT');
        applyValue(nextType);
        setValue(
            'tags',
            syncEventTypeTagsForEventType(getValues('tags'), nextType),
            { shouldDirty: true, shouldValidate: true },
        );
        if (enforcingTeamSettings) {
            setValue('teamSignup', true, { shouldDirty: true });
            setValue('singleDivision', true, { shouldDirty: true, shouldValidate: true });
            setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
            return;
        }

        setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
        const parsedStart = parseLocalDateTime(getValues('start'));
        const parsedEnd = parseLocalDateTime(getValues('end'));
        if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
            const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
            setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
        }
    }, [clearLeagueSlotErrors, getValues, isAffiliateEvent, setValue]);

    const handleAffiliateEventChange = useCallback((
        checked: boolean,
        applyValue: (value: boolean) => void,
    ) => {
        applyValue(checked);
        setValue('isAffiliateEvent', checked, { shouldDirty: true, shouldValidate: true });
        if (!checked) {
            setValue('affiliateUrl', '', { shouldDirty: true, shouldValidate: true });
            return;
        }
        const resetValues: Array<[string, unknown]> = [
            ['teamSignup', false],
            ['registrationByDivisionType', false],
            ['splitLeaguePlayoffDivisions', false],
            ['allowPaymentPlans', false],
            ['installmentCount', 0],
            ['installmentAmounts', []],
            ['installmentDueDates', []],
            ['installmentDueRelativeDays', []],
            ['allowTeamSplitDefault', false],
            ['requiredTemplateIds', []],
            ['playoffDivisionDetails', []],
            ['assistantHostIds', []],
            ['officialIds', []],
            ['eventOfficials', []],
            ['pendingStaffInvites', []],
            ['doTeamsOfficiate', false],
            ['teamOfficialsMaySwap', false],
            ['officialSchedulingMode', 'OFF'],
            ['officialPositions', []],
            ['matchRulesOverride', null],
            ['autoCreatePointMatchIncidents', false],
            ['noFixedEndDateTime', false],
        ];
        resetValues.forEach(([name, value]) => {
            setValue(name, value, { shouldDirty: true, shouldValidate: true });
        });
    }, [setValue]);

    const handleIncludePoolPlayChange = useCallback((checked: boolean) => {
        setLeagueData((previous) => ({
            ...previous,
            includePlayoffs: checked,
            playoffTeamCount: checked ? previous.playoffTeamCount : undefined,
        }));
        if (checked) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails)
            ? eventData.divisionDetails
            : [];
        setValue('divisionDetails', currentDetails.map((detail) => ({
            ...detail,
            playoffTeamCount: undefined,
            poolCount: undefined,
            poolTeamCount: undefined,
        })), { shouldDirty: true, shouldValidate: true });
    }, [eventData.divisionDetails, setLeagueData, setValue]);

    const handleStartChange = useCallback((value: Date) => {
        setValue('start', formatLocalDateTime(value), { shouldDirty: true, shouldValidate: true });
    }, [setValue]);

    const handleEndChange = useCallback((value: Date) => {
        setValue('end', formatLocalDateTime(value), { shouldDirty: true, shouldValidate: true });
    }, [setValue]);

    const handleNoFixedEndDateTimeChange = useCallback((checked: boolean) => {
        setValue('noFixedEndDateTime', checked, { shouldDirty: true, shouldValidate: true });
        if (checked) {
            return;
        }
        const parsedStart = parseLocalDateTime(getValues('start'));
        const parsedEnd = parseLocalDateTime(getValues('end'));
        if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
            const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
            setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
        }
    }, [getValues, setValue]);

    const handleSelectedAddressChange = useCallback((
        coordinates: [number, number],
        address: string,
    ) => {
        setValue('coordinates', coordinates, { shouldDirty: true, shouldValidate: true });
        setValue('address', address, { shouldDirty: true, shouldValidate: true });
    }, [setValue]);

    return {
        handleAffiliateEventChange,
        handleEndChange,
        handleEventTypeChange,
        handleIncludePlayoffsToggle,
        handleIncludePoolPlayChange,
        handleLeagueScoringConfigChange,
        handleMatchRulesOverrideChange,
        handleNoFixedEndDateTimeChange,
        handleSelectedAddressChange,
        handleStartChange,
    };
};
