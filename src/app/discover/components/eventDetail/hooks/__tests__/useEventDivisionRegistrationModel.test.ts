import { act, renderHook } from '@testing-library/react';

import { buildEvent, buildTeam, buildUser } from '../../../../../../../test/factories';
import { useEventDivisionRegistrationModel } from '../useEventDivisionRegistrationModel';

const futureStart = '2099-08-01T19:00:00.000Z';

function renderModel({
    event = buildEvent({
        start: futureStart,
        divisions: ['division-open'],
        divisionDetails: [{
            id: 'division-open',
            key: 'c_skill_open_age_18plus',
            name: 'Open 18+',
        }],
    }),
    user = buildUser({ dateOfBirth: '1990-01-01' }),
    selectedDivisionId = 'division-open',
    selectedDivisionTypeKey = '',
    selectedWeeklyOccurrence,
}: {
    event?: ReturnType<typeof buildEvent>;
    user?: ReturnType<typeof buildUser> | null;
    selectedDivisionId?: string;
    selectedDivisionTypeKey?: string;
    selectedWeeklyOccurrence?: { slotId: string; occurrenceDate: string };
} = {}) {
    const saveRegistrationProgress = jest.fn();
    const onSelectedDivisionIdChange = jest.fn();
    const onSelectedDivisionTypeKeyChange = jest.fn();
    const hook = renderHook(() => useEventDivisionRegistrationModel({
        event,
        user,
        children: [],
        teams: [buildTeam({ $id: 'team-one', division: 'division-open' })],
        selectedChildId: '',
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedWeeklyOccurrence,
        selectedWeeklyOccurrenceOption: null,
        isWeeklyParentEvent: false,
        saveRegistrationProgress,
        onSelectedDivisionIdChange,
        onSelectedDivisionTypeKeyChange,
    }));
    return {
        ...hook,
        saveRegistrationProgress,
        onSelectedDivisionIdChange,
        onSelectedDivisionTypeKeyChange,
    };
}

describe('useEventDivisionRegistrationModel', () => {
    it('derives the selected division, labels, and registration payload', () => {
        const { result } = renderModel({
            selectedWeeklyOccurrence: {
                slotId: 'slot-weekly',
                occurrenceDate: '2099-08-04',
            },
        });

        expect(result.current.selectedDivisionOption).toMatchObject({
            id: 'division-open',
            name: 'Open 18+',
        });
        expect(result.current.eventDivisionLabels).toEqual(['Open 18+']);
        expect(result.current.resolvedDivisionSelectionPayload).toMatchObject({
            divisionId: 'division-open',
            slotId: 'slot-weekly',
            occurrenceDate: '2099-08-04',
        });
        expect(result.current.isDivisionSelectionMissing).toBe(false);
    });

    it('persists public division selection through the provided state boundary', () => {
        const { result, onSelectedDivisionIdChange, saveRegistrationProgress } = renderModel({
            selectedDivisionId: '',
        });

        act(() => {
            result.current.handlePublicDivisionSelect(result.current.allDivisionOptions[0]!);
        });

        expect(onSelectedDivisionIdChange).toHaveBeenCalledWith('division-open');
        expect(saveRegistrationProgress).toHaveBeenCalledWith({
            selectedDivisionId: 'division-open',
        });
    });

    it('applies division billing overrides to checkout and installment previews', () => {
        const event = buildEvent({
            start: futureStart,
            price: 1000,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [500, 500],
            installmentDueDates: ['2099-07-01', '2099-07-15'],
            divisions: ['division-premier'],
            divisionDetails: [{
                id: 'division-premier',
                key: 'c_skill_premier_age_18plus',
                name: 'Premier',
                price: 2400,
                installmentCount: 3,
                installmentAmounts: [800, 800, 800],
                installmentDueDates: ['2099-06-01', '2099-07-01', '2099-07-15'],
            }],
        });
        const { result } = renderModel({ event, selectedDivisionId: 'division-premier' });

        expect(result.current.selectedDivisionBilling).toMatchObject({
            priceCents: 2400,
            installmentCount: 3,
            installmentAmounts: [800, 800, 800],
        });
        expect(result.current.checkoutEvent.price).toBe(2400);
        expect(result.current.paymentPlanPreviewRows).toHaveLength(3);
    });

    it('reports age and start-time registration blocks without mutating draft state', () => {
        const ageRestricted = buildEvent({
            start: futureStart,
            minAge: 21,
            divisions: [],
            divisionDetails: [],
        });
        const underage = renderModel({
            event: ageRestricted,
            user: buildUser({ dateOfBirth: '2085-01-01' }),
            selectedDivisionId: '',
        });

        expect(underage.result.current.selfRegistrationBlockedReason).toContain('limited to ages 21+');
        expect(underage.result.current.canRegisterChild).toBe(false);

        const started = renderModel({
            event: buildEvent({
                start: '2020-01-01T00:00:00.000Z',
                divisions: [],
                divisionDetails: [],
            }),
            selectedDivisionId: '',
        });
        expect(started.result.current.selfRegistrationBlockedReason).toBe(
            'This event has already started. Joining is closed.',
        );
    });
});
