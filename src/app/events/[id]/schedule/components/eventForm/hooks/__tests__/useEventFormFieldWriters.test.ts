import { act, renderHook } from '@testing-library/react';
import type { UseFormGetValues } from 'react-hook-form';

import type { LeagueConfig, TournamentConfig } from '@/types';

import type { EventFormValues } from '../../formTypes';
import { useEventFormFieldWriters } from '../useEventFormFieldWriters';

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    name: 'Summer League',
    joinAsParticipant: false,
    leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: false,
        usesSets: false,
        restTimeMinutes: 0,
    } as LeagueConfig,
    pendingStaffInvites: [],
    playoffData: { type: 'SINGLE_ELIMINATION' } as TournamentConfig,
    tournamentData: { type: 'ROUND_ROBIN' } as TournamentConfig,
    ...overrides,
} as EventFormValues);

const renderWriters = (eventData: EventFormValues = buildEventData()) => {
    const getValues = ((name?: keyof EventFormValues) => (
        name ? eventData[name] : eventData
    )) as UseFormGetValues<EventFormValues>;
    const setValue = jest.fn();
    const rendered = renderHook(() => useEventFormFieldWriters({ getValues, setValue }));

    return { ...rendered, setValue };
};

describe('useEventFormFieldWriters', () => {
    it('writes only changed event fields with the requested validation policy', () => {
        const { result, setValue } = renderWriters();

        act(() => result.current.setEventData((previous) => ({
            ...previous,
            name: 'Fall League',
        }), { shouldValidate: false }));

        expect(setValue).toHaveBeenCalledTimes(1);
        expect(setValue).toHaveBeenCalledWith('name', 'Fall League', {
            shouldDirty: true,
            shouldValidate: false,
        });
    });

    it('skips equivalent league writes but applies a changed league value', () => {
        const eventData = buildEventData();
        const { result, setValue } = renderWriters(eventData);

        act(() => result.current.setLeagueData({ ...eventData.leagueData }));
        expect(setValue).not.toHaveBeenCalled();

        act(() => result.current.setLeagueData((previous) => ({
            ...previous,
            includePlayoffs: true,
        })));
        expect(setValue).toHaveBeenCalledWith('leagueData', {
            ...eventData.leagueData,
            includePlayoffs: true,
        }, { shouldDirty: true, shouldValidate: true });
    });

    it('normalizes pending staff invites before writing them', () => {
        const { result, setValue } = renderWriters();

        act(() => result.current.setPendingStaffInvites([{
            firstName: ' Sam ',
            lastName: ' Official ',
            email: ' STAFF@TEST.COM ',
            roles: ['OFFICIAL', 'OFFICIAL'],
        }]));

        expect(setValue).toHaveBeenCalledWith('pendingStaffInvites', [{
            firstName: 'Sam',
            lastName: 'Official',
            email: 'staff@test.com',
            roles: ['OFFICIAL'],
        }], { shouldDirty: true, shouldValidate: false });
    });

    it('preserves reference-equality guards for nested configs and participant state', () => {
        const eventData = buildEventData();
        const { result, setValue } = renderWriters(eventData);

        act(() => {
            result.current.setTournamentData(eventData.tournamentData);
            result.current.setPlayoffData(eventData.playoffData);
            result.current.setJoinAsParticipant(false);
        });
        expect(setValue).not.toHaveBeenCalled();

        const nextPlayoffData = { ...eventData.playoffData, winnerSetCount: 2 };
        act(() => {
            result.current.setPlayoffData(nextPlayoffData, { shouldValidate: false });
            result.current.setJoinAsParticipant(true);
        });

        expect(setValue).toHaveBeenCalledWith('playoffData', nextPlayoffData, {
            shouldDirty: true,
            shouldValidate: false,
        });
        expect(setValue).toHaveBeenCalledWith('joinAsParticipant', true, {
            shouldDirty: true,
            shouldValidate: true,
        });
    });
});
