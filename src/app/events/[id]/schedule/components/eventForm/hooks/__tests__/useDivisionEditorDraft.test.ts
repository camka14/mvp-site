import { act, renderHook, waitFor } from '@testing-library/react';

import type { LeagueConfig, TournamentConfig } from '@/types';

import { buildTournamentConfig } from '../../configDefaults';
import type {
    DivisionDetailForm,
    PlayoffDivisionDetailForm,
} from '../../divisionForm';
import type { EventFormValues } from '../../formTypes';
import { useDivisionEditorDraft } from '../useDivisionEditorDraft';

const LEAGUE_DATA: LeagueConfig = {
    gamesPerOpponent: 1,
    includePlayoffs: true,
    playoffTeamCount: 4,
    usesSets: true,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
    setsPerMatch: 3,
    pointsToVictory: [21, 21, 15],
};
const PLAYOFF_DATA = buildTournamentConfig({
    doubleElimination: false,
    usesSets: true,
    winnerSetCount: 3,
    loserSetCount: 1,
});
const DEFAULT_SELECTIONS = {
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: 'adult',
};

const buildDivisionDetail = (overrides: Partial<DivisionDetailForm> = {}): DivisionDetailForm => ({
    id: 'division_open',
    name: 'Open Division',
    gender: 'C',
    divisionTypeId: 'skill_open_age_adult',
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: 'adult',
    ratingType: 'SKILL',
    price: 3_000,
    maxParticipants: 8,
    playoffTeamCount: 4,
    poolCount: 2,
    playoffPlacementDivisionIds: [],
    allowPaymentPlans: true,
    installmentCount: 2,
    installmentAmounts: [1_000, 2_000],
    installmentDueDates: ['2026-08-01', '2026-08-15'],
    installmentDueRelativeDays: [],
    playoffConfig: buildTournamentConfig({
        doubleElimination: true,
        usesSets: true,
        winnerSetCount: 5,
        loserSetCount: 3,
    }),
    ...overrides,
});

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'LEAGUE',
    parentEvent: undefined,
    start: '2026-08-01T18:00:00',
    sportId: 'volleyball',
    sportConfig: null,
    price: 3_000,
    maxParticipants: 8,
    singleDivision: false,
    splitLeaguePlayoffDivisions: true,
    teamSignup: true,
    allowPaymentPlans: true,
    installmentCount: 2,
    installmentAmounts: [1_500, 1_500],
    installmentDueDates: ['2026-08-01', '2026-08-15'],
    installmentDueRelativeDays: [],
    divisionDetails: [buildDivisionDetail()],
    playoffDivisionDetails: [],
    ...overrides,
} as EventFormValues);

type DraftProps = {
    eventData: EventFormValues;
    hasStripeAccount?: boolean;
    isCreateMode?: boolean;
};

const useDraftHarness = ({
    eventData,
    hasStripeAccount = true,
    isCreateMode = false,
}: DraftProps) => useDivisionEditorDraft({
    createNextPlayoffDivision: (
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ) => ({
        id: `playoff_${existing.length + 1}`,
        key: `playoff_${existing.length + 1}`,
        kind: 'PLAYOFF',
        name: `Playoff Division ${existing.length + 1}`,
        maxParticipants: 2,
        playoffConfig: buildTournamentConfig(configTemplate),
    }),
    currentSportRequiresSets: true,
    defaultDivisionTypeSelections: DEFAULT_SELECTIONS,
    eventData,
    firstDivisionDetailForDefaults: eventData.divisionDetails[0],
    hasStripeAccount,
    isCreateMode,
    leagueData: LEAGUE_DATA,
    playoffData: PLAYOFF_DATA,
    splitDivisionEditorEnabled: true,
});

describe('useDivisionEditorDraft', () => {
    it('owns transient selection and reset state without mutating the event draft', () => {
        const eventData = buildEventData();
        const originalDetails = eventData.divisionDetails;
        const { result } = renderHook(() => useDraftHarness({ eventData }));

        act(() => {
            result.current.updateDivisionEditorSelection({ gender: 'M' });
            result.current.updateDivisionEditorSelection({ skillDivisionTypeId: 'open' });
            result.current.updateDivisionEditorSelection({ ageDivisionTypeId: 'adult' });
        });
        expect(result.current.divisionEditorReady).toBe(true);
        expect(result.current.divisionEditor.name).not.toBe('');
        expect(eventData.divisionDetails).toBe(originalDetails);

        act(() => result.current.resetDivisionEditor());
        expect(result.current.divisionEditor).toEqual(expect.objectContaining({
            editingId: null,
            divisionKind: 'LEAGUE',
            skillDivisionTypeId: 'open',
            ageDivisionTypeId: 'adult',
            price: 3_000,
            maxParticipants: 8,
        }));
        expect(result.current.divisionEditor.playoffConfig).toEqual(expect.objectContaining({
            doubleElimination: false,
            winnerSetCount: 3,
            loserSetCount: 1,
        }));
    });

    it('loads division-owned playoff and payment values into the transient editor', () => {
        const detail = buildDivisionDetail();
        const eventData = buildEventData({ divisionDetails: [detail] });
        const { result } = renderHook(() => useDraftHarness({ eventData }));

        act(() => result.current.handleEditDivisionDetail(detail.id));

        expect(result.current.divisionEditor).toEqual(expect.objectContaining({
            editingId: detail.id,
            name: 'Open Division',
            price: 3_000,
            installmentCount: 2,
            installmentAmounts: [1_000, 2_000],
        }));
        expect(result.current.divisionEditor.playoffConfig).toEqual(expect.objectContaining({
            doubleElimination: true,
            winnerSetCount: 5,
            loserSetCount: 3,
        }));
    });

    it('normalizes installment commands and clears paid settings when Stripe becomes unavailable', async () => {
        const eventData = buildEventData();
        const initialProps: DraftProps = { eventData, hasStripeAccount: true, isCreateMode: true };
        const { result, rerender } = renderHook(
            (props: DraftProps) => useDraftHarness(props),
            { initialProps },
        );

        act(() => result.current.resetDivisionEditor());
        act(() => result.current.syncDivisionInstallmentCount(3));
        expect(result.current.divisionEditor.installmentAmounts).toEqual([1_500, 1_500, 0]);

        act(() => result.current.setDivisionInstallmentAmount(2, 500.8));
        expect(result.current.divisionEditor.installmentAmounts).toEqual([1_500, 1_500, 500]);
        expect(result.current.divisionEditor.price).toBe(3_500);

        act(() => result.current.removeDivisionInstallment(0));
        expect(result.current.divisionEditor).toEqual(expect.objectContaining({
            installmentCount: 2,
            installmentAmounts: [1_500, 500],
            price: 2_000,
        }));

        rerender({ ...initialProps, hasStripeAccount: false });
        await waitFor(() => expect(result.current.divisionEditor).toEqual(expect.objectContaining({
            price: 0,
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentAmounts: [],
            installmentDueDates: [],
            installmentDueRelativeDays: [],
        })));
    });
});
