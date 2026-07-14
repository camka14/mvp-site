import {
    useCallback,
    useState,
} from 'react';
import {
    renderHook,
    waitFor,
} from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type {
    LeagueConfig,
    Sport,
    TournamentConfig,
} from '@/types';

import {
    buildTournamentConfig,
    normalizeLeagueConfigForSetMode,
} from '../../configDefaults';
import { buildInitialDivisionEditorState } from '../../divisionEditorDraftState';
import type {
    DivisionDetailForm,
    PlayoffDivisionDetailForm,
} from '../../divisionForm';
import { leagueConfigEqual } from '../../formEquality';
import type { EventFormValues } from '../../formTypes';
import { useEventDivisionNormalization } from '../useEventDivisionNormalization';

const EMPTY_SPORTS_BY_ID = new Map<string, Sport>();

const buildLeagueData = (overrides: Partial<LeagueConfig> = {}): LeagueConfig => (
    normalizeLeagueConfigForSetMode({
        gamesPerOpponent: 1,
        includePlayoffs: false,
        usesSets: false,
        restTimeMinutes: 0,
        ...overrides,
    }, Boolean(overrides.usesSets))
);

const buildDivision = (overrides: Partial<DivisionDetailForm> = {}): DivisionDetailForm => ({
    id: 'division_1',
    key: 'division_1',
    kind: 'LEAGUE',
    name: 'Open',
    divisionTypeId: 'open',
    divisionTypeName: 'Open',
    ratingType: 'SKILL',
    gender: 'C',
    skillDivisionTypeId: 'open',
    skillDivisionTypeName: 'Open',
    ageDivisionTypeId: '',
    ageDivisionTypeName: '',
    price: 0,
    maxParticipants: 4,
    fieldIds: [],
    ...overrides,
});

const buildPlayoffDivision = (
    overrides: Partial<PlayoffDivisionDetailForm> = {},
): PlayoffDivisionDetailForm => ({
    id: 'playoff_1',
    key: 'playoff_1',
    kind: 'PLAYOFF',
    name: 'Championship',
    maxParticipants: 4,
    playoffConfig: buildTournamentConfig(),
    ...overrides,
});

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => {
    const leagueData = overrides.leagueData ?? buildLeagueData();
    return {
        $id: 'event_1',
        eventType: 'EVENT',
        singleDivision: false,
        teamSignup: true,
        splitLeaguePlayoffDivisions: false,
        sportId: '',
        sportConfig: null,
        start: '2026-07-20T09:00:00',
        price: 0,
        maxParticipants: 8,
        divisions: [],
        divisionDetails: [],
        playoffDivisionDetails: [],
        leagueData,
        playoffData: buildTournamentConfig(),
        ...overrides,
    } as EventFormValues;
};

type HarnessProps = {
    currentSportRequiresSets?: boolean;
    eventData: EventFormValues;
    hasExternalRentalField?: boolean;
    sportsById?: Map<string, Sport>;
    sportsLoading?: boolean;
};

const useEventDivisionNormalizationHarness = ({
    currentSportRequiresSets = false,
    eventData,
    hasExternalRentalField = false,
    sportsById = EMPTY_SPORTS_BY_ID,
    sportsLoading = false,
}: HarnessProps) => {
    const form = useForm<EventFormValues>({ defaultValues: eventData });
    // eslint-disable-next-line react-hooks/incompatible-library -- exercise the production React Hook Form subscription boundary.
    const formValues = form.watch();
    const [divisionEditor, setDivisionEditor] = useState(() => buildInitialDivisionEditorState({
        eventPrice: eventData.price,
        eventMaxParticipants: eventData.maxParticipants,
        leagueData: eventData.leagueData,
        sportUsesPointsPerSetWin: true,
    }));
    const setValue = useCallback((
        name: string,
        value: unknown,
        options?: Record<string, unknown>,
    ) => {
        form.setValue(name as keyof EventFormValues, value as never, {
            shouldDirty: options?.shouldDirty as boolean | undefined,
            shouldValidate: options?.shouldValidate as boolean | undefined,
        });
    }, [form]);
    const setLeagueData = useCallback((
        updater: React.SetStateAction<LeagueConfig>,
        options: Record<string, unknown> = {},
    ) => {
        const current = form.getValues('leagueData');
        const next = typeof updater === 'function' ? updater(current) : updater;
        if (leagueConfigEqual(current, next)) {
            return;
        }
        form.setValue('leagueData', next, {
            shouldDirty: (options.shouldDirty as boolean | undefined) ?? true,
            shouldValidate: (options.shouldValidate as boolean | undefined) ?? true,
        });
    }, [form]);
    const setPlayoffData = useCallback((
        updater: React.SetStateAction<TournamentConfig>,
        options: Record<string, unknown> = {},
    ) => {
        const current = form.getValues('playoffData');
        const next = typeof updater === 'function' ? updater(current) : updater;
        form.setValue('playoffData', next, {
            shouldDirty: (options.shouldDirty as boolean | undefined) ?? true,
            shouldValidate: (options.shouldValidate as boolean | undefined) ?? true,
        });
    }, [form]);

    useEventDivisionNormalization({
        currentSportRequiresSets,
        eventData: formValues,
        getValues: form.getValues,
        hasExternalRentalField,
        leagueData: formValues.leagueData,
        playoffData: formValues.playoffData,
        setDivisionEditor,
        setLeagueData,
        setPlayoffData,
        setValue,
        sportsById,
        sportsLoading,
    });

    return {
        ...form,
        divisionEditor,
        formValues,
        isDirty: form.formState.isDirty,
    };
};

describe('useEventDivisionNormalization', () => {
    it('reconciles catalog sport data and mirrors division detail ids without dirtying RHF', async () => {
        const sport = {
            $id: 'sport_1',
            name: 'Soccer',
            usePointsPerSetWin: false,
        } as Sport;
        const sportsById = new Map([[sport.$id, sport]]);
        const division = buildDivision();
        const { result } = renderHook(() => useEventDivisionNormalizationHarness({
            eventData: buildEventData({
                sportId: sport.$id,
                sportConfig: null,
                divisions: ['stale_division'],
                divisionDetails: [division],
            }),
            sportsById,
        }));

        await waitFor(() => {
            expect(result.current.formValues.sportConfig?.$id).toBe(sport.$id);
            expect(result.current.formValues.divisions).toEqual([division.id]);
        });
        expect(result.current.isDirty).toBe(false);
    });

    it('clears league-only split playoff state for non-league events', async () => {
        const { result } = renderHook(() => useEventDivisionNormalizationHarness({
            eventData: buildEventData({
                eventType: 'TOURNAMENT',
                splitLeaguePlayoffDivisions: true,
                playoffDivisionDetails: [buildPlayoffDivision()],
            }),
        }));

        await waitFor(() => {
            expect(result.current.formValues.splitLeaguePlayoffDivisions).toBe(false);
            expect(result.current.formValues.playoffDivisionDetails).toEqual([]);
        });
    });

    it('defaults multi-division playoff counts and sizes placement mappings', async () => {
        const leagueData = buildLeagueData({ includePlayoffs: true });
        const { result } = renderHook(() => useEventDivisionNormalizationHarness({
            eventData: buildEventData({
                eventType: 'LEAGUE',
                leagueData,
                singleDivision: false,
                splitLeaguePlayoffDivisions: true,
                divisionDetails: [buildDivision({
                    maxParticipants: 4,
                    playoffTeamCount: undefined,
                    playoffPlacementDivisionIds: ['stale_playoff'],
                })],
            }),
        }));

        await waitFor(() => {
            expect(result.current.formValues.divisionDetails[0]?.playoffTeamCount).toBe(4);
            expect(result.current.formValues.divisionDetails[0]?.playoffPlacementDivisionIds).toEqual([
                'stale_playoff',
                '',
                '',
                '',
            ]);
        });
    });

    it('keeps single-division playoff count ownership in leagueData and disables split mode', async () => {
        const leagueData = buildLeagueData({ includePlayoffs: true });
        const { result } = renderHook(() => useEventDivisionNormalizationHarness({
            eventData: buildEventData({
                eventType: 'LEAGUE',
                leagueData,
                singleDivision: true,
                splitLeaguePlayoffDivisions: true,
                divisionDetails: [buildDivision({
                    maxParticipants: 6,
                    playoffTeamCount: undefined,
                })],
            }),
        }));

        await waitFor(() => {
            expect(result.current.formValues.leagueData.playoffTeamCount).toBe(6);
            expect(result.current.formValues.splitLeaguePlayoffDivisions).toBe(false);
        });
        expect(result.current.formValues.divisionDetails[0]?.playoffTeamCount).toBeUndefined();
    });

    it('normalizes league, editor, and playoff configs when the sport does not use sets', async () => {
        const sport = {
            $id: 'sport_no_sets',
            name: 'Soccer',
            usePointsPerSetWin: false,
        } as Sport;
        const sportsById = new Map([[sport.$id, sport]]);
        const setLeagueData = buildLeagueData({
            usesSets: true,
            setsPerMatch: 3,
            setDurationMinutes: 20,
            pointsToVictory: [21, 21, 15],
        });
        const setPlayoffData = buildTournamentConfig({
            usesSets: true,
            winnerSetCount: 3,
            loserSetCount: 3,
            winnerBracketPointsToVictory: [21, 21, 15],
            loserBracketPointsToVictory: [21, 21, 15],
            setDurationMinutes: 20,
        });
        const { result } = renderHook(() => useEventDivisionNormalizationHarness({
            currentSportRequiresSets: false,
            eventData: buildEventData({
                eventType: 'LEAGUE',
                sportId: sport.$id,
                sportConfig: sport,
                leagueData: setLeagueData,
                playoffData: setPlayoffData,
                divisionDetails: [buildDivision({ playoffConfig: setPlayoffData })],
                playoffDivisionDetails: [buildPlayoffDivision({ playoffConfig: setPlayoffData })],
            }),
            sportsById,
        }));

        await waitFor(() => {
            expect(result.current.formValues.leagueData.usesSets).toBe(false);
            expect(result.current.formValues.playoffData.usesSets).toBe(false);
            expect(result.current.formValues.playoffData.winnerSetCount).toBe(1);
            expect(result.current.formValues.divisionDetails[0]?.playoffConfig?.usesSets).toBe(false);
            expect(result.current.formValues.playoffDivisionDetails[0]?.playoffConfig.usesSets).toBe(false);
            expect(result.current.divisionEditor.leagueConfig.usesSets).toBe(false);
        });
    });
});
