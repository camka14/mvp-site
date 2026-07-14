import { useCallback } from 'react';
import type { SetStateAction } from 'react';
import type { UseFormGetValues } from 'react-hook-form';

import type { LeagueConfig, TournamentConfig } from '@/types';

import { leagueConfigEqual } from '../formEquality';
import type { EventFormValues } from '../formTypes';
import {
    normalizePendingStaffInvite,
    type PendingStaffInvite,
} from '../staffInvites';

type WriteOptions = {
    shouldDirty?: boolean;
    shouldValidate?: boolean;
};

type SetFormValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type UseEventFormFieldWritersParams = {
    getValues: UseFormGetValues<EventFormValues>;
    setValue: SetFormValue;
};

export const useEventFormFieldWriters = ({
    getValues,
    setValue,
}: UseEventFormFieldWritersParams) => {
    const setEventData = useCallback((
        updater: SetStateAction<EventFormValues>,
        options: WriteOptions = {},
    ) => {
        const current = getValues();
        const next = typeof updater === 'function'
            ? (updater as (previous: EventFormValues) => EventFormValues)(current)
            : updater;
        if (next === current) {
            return;
        }
        const shouldDirty = options.shouldDirty ?? true;
        const shouldValidate = options.shouldValidate ?? true;
        (Object.keys(next) as (keyof EventFormValues)[]).forEach((key) => {
            if (Object.is(current[key], next[key])) {
                return;
            }
            setValue(key, next[key], { shouldDirty, shouldValidate });
        });
    }, [getValues, setValue]);

    const setLeagueData = useCallback((
        updater: SetStateAction<LeagueConfig>,
        options: WriteOptions = {},
    ) => {
        const current = getValues('leagueData');
        const next = typeof updater === 'function'
            ? (updater as (previous: LeagueConfig) => LeagueConfig)(current)
            : updater;
        if (leagueConfigEqual(current, next)) {
            return;
        }
        setValue('leagueData', next, {
            shouldDirty: options.shouldDirty ?? true,
            shouldValidate: options.shouldValidate ?? true,
        });
    }, [getValues, setValue]);

    const setPendingStaffInvites = useCallback((
        updater: SetStateAction<PendingStaffInvite[]>,
    ) => {
        const current = getValues('pendingStaffInvites') ?? [];
        const next = typeof updater === 'function'
            ? (updater as (previous: PendingStaffInvite[]) => PendingStaffInvite[])(current)
            : updater;
        setValue(
            'pendingStaffInvites',
            next.map(normalizePendingStaffInvite),
            { shouldDirty: true, shouldValidate: false },
        );
    }, [getValues, setValue]);

    const setTournamentData = useCallback((updater: SetStateAction<TournamentConfig>) => {
        const current = getValues('tournamentData');
        const next = typeof updater === 'function'
            ? (updater as (previous: TournamentConfig) => TournamentConfig)(current)
            : updater;
        if (!Object.is(current, next)) {
            setValue('tournamentData', next, { shouldDirty: true, shouldValidate: true });
        }
    }, [getValues, setValue]);

    const setPlayoffData = useCallback((
        updater: SetStateAction<TournamentConfig>,
        options: WriteOptions = {},
    ) => {
        const current = getValues('playoffData');
        const next = typeof updater === 'function'
            ? (updater as (previous: TournamentConfig) => TournamentConfig)(current)
            : updater;
        if (Object.is(current, next)) {
            return;
        }
        setValue('playoffData', next, {
            shouldDirty: options.shouldDirty ?? true,
            shouldValidate: options.shouldValidate ?? true,
        });
    }, [getValues, setValue]);

    const setJoinAsParticipant = useCallback((value: boolean) => {
        if (!Object.is(getValues('joinAsParticipant'), value)) {
            setValue('joinAsParticipant', value, { shouldDirty: true, shouldValidate: true });
        }
    }, [getValues, setValue]);

    return {
        setEventData,
        setJoinAsParticipant,
        setLeagueData,
        setPendingStaffInvites,
        setPlayoffData,
        setTournamentData,
    };
};
