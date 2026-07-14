import {
    useCallback,
    useState,
} from 'react';
import {
    act,
    renderHook,
    waitFor,
} from '@testing-library/react';

import type {
    Event,
    LeagueConfig,
    MatchRulesConfig,
    TournamentConfig,
} from '@/types';

import { buildTournamentConfig } from '../../configDefaults';
import type { EventFormValues } from '../../formTypes';
import { useEventFormConfigurationActions } from '../useEventFormConfigurationActions';

const buildLeagueData = (overrides: Partial<LeagueConfig> = {}): LeagueConfig => ({
    gamesPerOpponent: 1,
    includePlayoffs: false,
    usesSets: false,
    restTimeMinutes: 0,
    ...overrides,
} as LeagueConfig);

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    isAffiliateEvent: false,
    affiliateUrl: '',
    tags: [],
    start: '2026-07-20T09:00',
    end: '2026-07-20T08:00',
    noFixedEndDateTime: false,
    teamSignup: false,
    singleDivision: false,
    registrationByDivisionType: false,
    splitLeaguePlayoffDivisions: false,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentAmounts: [],
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    allowTeamSplitDefault: false,
    requiredTemplateIds: [],
    divisionDetails: [],
    playoffDivisionDetails: [],
    assistantHostIds: [],
    officialIds: [],
    eventOfficials: [],
    pendingStaffInvites: [],
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    officialSchedulingMode: 'OFF',
    officialPositions: [],
    matchRulesOverride: null,
    autoCreatePointMatchIncidents: false,
    leagueScoringConfig: {},
    maxParticipants: 8,
    coordinates: [0, 0],
    address: '',
    leagueData: buildLeagueData(),
    tournamentData: buildTournamentConfig(),
    ...overrides,
} as EventFormValues);

const useConfigurationActionsHarness = (
    initialEventData: EventFormValues,
    clearLeagueSlotErrors: () => void,
) => {
    const [eventData, setEventDataState] = useState(initialEventData);
    const setValue = useCallback((name: string, value: unknown) => {
        setEventDataState((previous) => ({ ...previous, [name]: value }));
    }, []);
    const getValues = useCallback(<Key extends keyof EventFormValues>(name: Key) => (
        eventData[name]
    ), [eventData]);
    const setEventData = useCallback((updater: React.SetStateAction<EventFormValues>) => {
        setEventDataState((previous) => (
            typeof updater === 'function' ? updater(previous) : updater
        ));
    }, []);
    const setLeagueData = useCallback((updater: React.SetStateAction<LeagueConfig>) => {
        setEventDataState((previous) => ({
            ...previous,
            leagueData: typeof updater === 'function' ? updater(previous.leagueData) : updater,
        }));
    }, []);
    const setTournamentData = useCallback((updater: React.SetStateAction<TournamentConfig>) => {
        setEventDataState((previous) => ({
            ...previous,
            tournamentData: typeof updater === 'function'
                ? updater(previous.tournamentData)
                : updater,
        }));
    }, []);
    const actions = useEventFormConfigurationActions({
        clearLeagueSlotErrors,
        eventData,
        getValues,
        isAffiliateEvent: Boolean(eventData.isAffiliateEvent),
        leagueData: eventData.leagueData,
        selectedSport: eventData.sportConfig,
        setEventData,
        setLeagueData,
        setTournamentData,
        setValue,
        tournamentData: eventData.tournamentData,
    });

    return {
        actions,
        applyAffiliateValue: (value: boolean) => setValue('isAffiliateEvent', value),
        applyEventType: (value: Event['eventType']) => setValue('eventType', value),
        eventData,
    };
};

describe('useEventFormConfigurationActions', () => {
    it('applies league event-type invariants as one action', async () => {
        const clearLeagueSlotErrors = jest.fn();
        const { result } = renderHook(() => useConfigurationActionsHarness(
            buildEventData(),
            clearLeagueSlotErrors,
        ));

        act(() => result.current.actions.handleEventTypeChange(
            'LEAGUE',
            result.current.applyEventType,
        ));

        await waitFor(() => {
            expect(result.current.eventData.eventType).toBe('LEAGUE');
            expect(result.current.eventData.teamSignup).toBe(true);
            expect(result.current.eventData.singleDivision).toBe(true);
            expect(result.current.eventData.noFixedEndDateTime).toBe(true);
        });
        expect(clearLeagueSlotErrors).toHaveBeenCalledTimes(1);
    });

    it('repairs the end time when a non-team event type requires a fixed end', async () => {
        const { result } = renderHook(() => useConfigurationActionsHarness(
            buildEventData({ noFixedEndDateTime: true }),
            jest.fn(),
        ));

        act(() => result.current.actions.handleEventTypeChange(
            'EVENT',
            result.current.applyEventType,
        ));

        await waitFor(() => {
            expect(result.current.eventData.noFixedEndDateTime).toBe(false);
            expect(result.current.eventData.end).toBe('2026-07-20T10:00:00');
        });
    });

    it('derives count-up match duration from the configured segment policy', async () => {
        const override = {
            timekeeping: {
                timerMode: 'COUNT_UP',
                segmentDurationMinutes: 12,
            },
        } as MatchRulesConfig;
        const { result } = renderHook(() => useConfigurationActionsHarness(buildEventData({
            eventType: 'LEAGUE',
            leagueData: buildLeagueData({ usesSets: true, setsPerMatch: 3 }),
        }), jest.fn()));

        act(() => result.current.actions.handleMatchRulesOverrideChange(override));

        await waitFor(() => {
            expect(result.current.eventData.matchRulesOverride).toEqual(override);
            expect(result.current.eventData.leagueData.usesSets).toBe(false);
            expect(result.current.eventData.leagueData.matchDurationMinutes).toBe(36);
        });
    });

    it('clears incompatible configuration when affiliate mode is enabled', async () => {
        const { result } = renderHook(() => useConfigurationActionsHarness(buildEventData({
            teamSignup: true,
            registrationByDivisionType: true,
            allowPaymentPlans: true,
            officialIds: ['official_1'],
            noFixedEndDateTime: true,
        }), jest.fn()));

        act(() => result.current.actions.handleAffiliateEventChange(
            true,
            result.current.applyAffiliateValue,
        ));

        await waitFor(() => {
            expect(result.current.eventData.isAffiliateEvent).toBe(true);
            expect(result.current.eventData.teamSignup).toBe(false);
            expect(result.current.eventData.registrationByDivisionType).toBe(false);
            expect(result.current.eventData.allowPaymentPlans).toBe(false);
            expect(result.current.eventData.officialIds).toEqual([]);
            expect(result.current.eventData.noFixedEndDateTime).toBe(false);
        });
    });

    it('removes pool sizing from every division when pool play is disabled', async () => {
        const { result } = renderHook(() => useConfigurationActionsHarness(buildEventData({
            divisionDetails: [{
                id: 'division_1',
                playoffTeamCount: 4,
                poolCount: 2,
                poolTeamCount: 4,
            }] as EventFormValues['divisionDetails'],
            leagueData: buildLeagueData({ includePlayoffs: true, playoffTeamCount: 4 }),
        }), jest.fn()));

        act(() => result.current.actions.handleIncludePoolPlayChange(false));

        await waitFor(() => {
            expect(result.current.eventData.leagueData.includePlayoffs).toBe(false);
            expect(result.current.eventData.leagueData.playoffTeamCount).toBeUndefined();
            expect(result.current.eventData.divisionDetails[0]).toEqual(expect.objectContaining({
                playoffTeamCount: undefined,
                poolCount: undefined,
                poolTeamCount: undefined,
            }));
        });
    });
});
