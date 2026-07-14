import {
    useCallback,
    useState,
} from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type {
    LeagueConfig,
    TournamentConfig,
} from '@/types';

import {
    buildTournamentConfig,
    normalizeLeagueConfigForSetMode,
} from '../../configDefaults';
import type {
    DivisionDetailForm,
    DivisionEditorState,
    DivisionTypeOption,
    PlayoffDivisionDetailForm,
} from '../../divisionForm';
import type { EventFormValues } from '../../formTypes';
import { useDivisionCommitController } from '../useDivisionCommitController';

const DIVISION_TYPE_OPTIONS = [
    { id: 'open', name: 'Open', ratingType: 'SKILL', sportKey: 'generic' },
    { id: '18plus', name: '18+', ratingType: 'AGE', sportKey: 'generic' },
] as DivisionTypeOption[];

const LEAGUE_CONFIG = normalizeLeagueConfigForSetMode({
    gamesPerOpponent: 1,
    includePlayoffs: false,
    usesSets: false,
    restTimeMinutes: 0,
}, false);

const buildEditor = (overrides: Partial<DivisionEditorState> = {}): DivisionEditorState => ({
    editingId: null,
    divisionKind: 'LEAGUE',
    gender: 'C',
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: '18plus',
    name: 'Open 18+',
    price: 1500,
    maxParticipants: 8,
    playoffTeamCount: null,
    poolCount: null,
    playoffPlacementDivisionIds: [],
    leagueConfig: LEAGUE_CONFIG,
    playoffConfig: buildTournamentConfig(),
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    nameTouched: true,
    error: null,
    ...overrides,
});

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    singleDivision: false,
    teamSignup: true,
    splitLeaguePlayoffDivisions: false,
    sportId: '',
    sportConfig: null,
    start: '2026-07-20T09:00:00',
    price: 0,
    maxParticipants: 2,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    divisions: [],
    divisionDetails: [],
    playoffDivisionDetails: [],
    divisionFieldIds: {},
    leagueData: LEAGUE_CONFIG,
    ...overrides,
} as EventFormValues);

const buildExistingDivision = (overrides: Partial<DivisionDetailForm> = {}): DivisionDetailForm => ({
    id: 'division_existing',
    key: 'skill_open_age_18plus',
    kind: 'LEAGUE',
    name: 'Existing Division',
    divisionTypeId: 'skill_open_age_18plus',
    divisionTypeName: 'CoEd Open 18+',
    ratingType: 'SKILL',
    gender: 'C',
    skillDivisionTypeId: 'open',
    skillDivisionTypeName: 'Open',
    ageDivisionTypeId: '18plus',
    ageDivisionTypeName: '18+',
    price: 500,
    maxParticipants: 4,
    fieldIds: [],
    ...overrides,
});

type HarnessProps = {
    editor: DivisionEditorState;
    eventData: EventFormValues;
    isAffiliateEvent?: boolean;
};

const useDivisionCommitHarness = ({
    editor: initialEditor,
    eventData,
    isAffiliateEvent = false,
}: HarnessProps) => {
    const form = useForm<EventFormValues>({ defaultValues: eventData });
    // eslint-disable-next-line react-hooks/incompatible-library -- exercise the production React Hook Form subscription boundary.
    const formValues = form.watch();
    const [divisionEditor, setDivisionEditor] = useState(initialEditor);
    const resetDivisionEditor = useCallback(() => {
        setDivisionEditor(buildEditor({
            gender: '',
            name: '',
            nameTouched: false,
        }));
    }, []);
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
        form.setValue('leagueData', next, {
            shouldDirty: (options.shouldDirty as boolean | undefined) ?? true,
            shouldValidate: (options.shouldValidate as boolean | undefined) ?? true,
        });
    }, [form]);
    const createNextPlayoffDivision = useCallback((
        _existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ): PlayoffDivisionDetailForm => ({
        id: 'playoff_new',
        key: 'playoff_new',
        kind: 'PLAYOFF',
        name: 'Playoff Division',
        maxParticipants: 2,
        playoffConfig: buildTournamentConfig(configTemplate),
    }), []);
    const controller = useDivisionCommitController({
        createNextPlayoffDivision,
        currentSportRequiresSets: false,
        defaultDivisionTypeSelections: {
            skillDivisionTypeId: 'open',
            ageDivisionTypeId: '18plus',
        },
        divisionEditor,
        divisionTypeOptions: DIVISION_TYPE_OPTIONS,
        eventData: formValues,
        getValues: form.getValues,
        isAffiliateEvent,
        leagueData: formValues.leagueData,
        resetDivisionEditor,
        setDivisionEditor,
        setLeagueData,
        setValue,
    });
    return { ...controller, ...form, divisionEditor, formValues };
};

describe('useDivisionCommitController', () => {
    it('commits a multi-division league editor transaction and remaps its resource assignment', async () => {
        const existing = buildExistingDivision();
        const eventData = buildEventData({
            eventType: 'LEAGUE',
            divisionDetails: [existing],
            divisions: [existing.id],
            divisionFieldIds: {
                [existing.id]: ['field_1'],
                stale_division: ['field_stale'],
            },
            leagueData: { ...LEAGUE_CONFIG, includePlayoffs: true },
        });
        const editor = buildEditor({
            editingId: existing.id,
            name: 'Championship Division',
            price: 1800,
            maxParticipants: 8,
            playoffTeamCount: 4,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [600, 1200],
            installmentDueDates: ['2026-07-20', '2026-08-20'],
            playoffConfig: buildTournamentConfig({ winnerSetCount: 3 }),
        });
        const { result } = renderHook(() => useDivisionCommitHarness({ editor, eventData }));

        act(() => result.current.handleSaveDivisionDetail());

        await waitFor(() => expect(result.current.formValues.divisionDetails[0].name).toBe('Championship Division'));
        expect(result.current.formValues.divisionDetails[0]).toEqual(expect.objectContaining({
            id: existing.id,
            price: 1800,
            maxParticipants: 8,
            playoffTeamCount: 4,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [600, 1200],
            installmentDueDates: ['2026-07-20', '2026-08-20'],
            playoffConfig: expect.any(Object),
        }));
        expect(result.current.formValues.divisionFieldIds).toEqual({
            [existing.id]: ['field_1'],
        });
        expect(result.current.formValues).toEqual(expect.objectContaining({
            divisions: [existing.id],
            price: 1800,
            maxParticipants: 8,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [600, 1200],
        }));
        expect(result.current.formValues.leagueData.playoffTeamCount).toBe(4);
        expect(result.current.divisionEditor).toEqual(expect.objectContaining({
            editingId: null,
            gender: '',
            error: null,
        }));
    });

    it('uses event-level price, capacity, and installments for a single-division tournament', async () => {
        const eventData = buildEventData({
            eventType: 'TOURNAMENT',
            singleDivision: true,
            price: 2500,
            maxParticipants: 12,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [1000, 1500],
            installmentDueDates: ['2026-07-20', '2026-08-20'],
            leagueData: { ...LEAGUE_CONFIG, includePlayoffs: true },
        });
        const editor = buildEditor({
            price: 999,
            maxParticipants: 4,
            playoffTeamCount: 4,
            poolCount: 2,
            allowPaymentPlans: false,
            playoffConfig: buildTournamentConfig({ doubleElimination: true, winnerSetCount: 5 }),
        });
        const { result } = renderHook(() => useDivisionCommitHarness({ editor, eventData }));

        act(() => result.current.handleSaveDivisionDetail());

        await waitFor(() => expect(result.current.formValues.divisionDetails).toHaveLength(1));
        expect(result.current.formValues.divisionDetails[0]).toEqual(expect.objectContaining({
            price: 2500,
            maxParticipants: 12,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [1000, 1500],
            installmentDueDates: ['2026-07-20', '2026-08-20'],
            playoffTeamCount: 4,
            poolCount: 2,
            poolTeamCount: 6,
        }));
        expect(result.current.formValues.divisionDetails[0].playoffConfig).toBeUndefined();
        expect(result.current.formValues.price).toBe(2500);
        expect(result.current.formValues.maxParticipants).toBe(12);
    });

    it('validates required league editor selections before mutating the RHF draft', () => {
        const eventData = buildEventData();
        const editor = buildEditor({ gender: '', name: '' });
        const { result } = renderHook(() => useDivisionCommitHarness({ editor, eventData }));

        act(() => result.current.handleSaveDivisionDetail());

        expect(result.current.divisionEditor.error).toBe(
            'Select gender, skill division, and age division before adding.',
        );
        expect(result.current.formValues.divisionDetails).toEqual([]);
        expect(result.current.formValues.divisions).toEqual([]);
    });

    it('commits a playoff division and resets the transient editor', async () => {
        const eventData = buildEventData({
            eventType: 'LEAGUE',
            playoffDivisionDetails: [],
        });
        const editor = buildEditor({
            divisionKind: 'PLAYOFF',
            name: 'Gold Bracket',
            maxParticipants: 6,
            playoffConfig: buildTournamentConfig({ doubleElimination: true }),
        });
        const { result } = renderHook(() => useDivisionCommitHarness({ editor, eventData }));

        act(() => result.current.handleSaveDivisionDetail());

        await waitFor(() => expect(result.current.formValues.playoffDivisionDetails).toEqual([
            expect.objectContaining({
                id: 'playoff_new',
                name: 'Gold Bracket',
                maxParticipants: 6,
                playoffConfig: expect.objectContaining({ doubleElimination: true }),
            }),
        ]));
        expect(result.current.divisionEditor).toEqual(expect.objectContaining({
            divisionKind: 'LEAGUE',
            name: '',
            error: null,
        }));
    });
});
