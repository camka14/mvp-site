import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { billService } from '@/lib/billService';
import { eventService } from '@/lib/eventService';
import { paymentService } from '@/lib/paymentService';
import { registrationService } from '@/lib/registrationService';
import type { Bill, Event, Team, UserData } from '@/types';

import { createEventRegistrationBill } from '../../eventRegistrationCommands';
import { submitManualPaymentProof } from '../../manualPaymentProof';
import { useEventJoinFinalizationController } from '../useEventJoinFinalizationController';

jest.mock('@/lib/analytics/eventAnalytics', () => ({
    trackEventRegistrationStarted: jest.fn(),
}));

jest.mock('@/lib/billService', () => ({
    billService: {
        getBill: jest.fn(),
    },
}));

jest.mock('@/lib/eventService', () => ({
    eventService: {
        addFreeAgent: jest.fn(),
        addToWaitlist: jest.fn(),
    },
}));

jest.mock('@/lib/paymentService', () => ({
    paymentService: {
        joinEvent: jest.fn(),
        leaveEvent: jest.fn(),
    },
}));

jest.mock('@/lib/registrationService', () => ({
    registrationService: {
        registerChildForEvent: jest.fn(),
        registerSelfForEvent: jest.fn(),
    },
}));

jest.mock('../../eventRegistrationCommands', () => ({
    createEventRegistrationBill: jest.fn(),
    getJoinIntentRegistrationType: jest.fn(() => 'self'),
}));

jest.mock('../../manualPaymentProof', () => ({
    submitManualPaymentProof: jest.fn(),
}));

const mockedGetBill = billService.getBill as jest.MockedFunction<typeof billService.getBill>;
const mockedAddFreeAgent = eventService.addFreeAgent as jest.MockedFunction<typeof eventService.addFreeAgent>;
const mockedAddToWaitlist = eventService.addToWaitlist as jest.MockedFunction<typeof eventService.addToWaitlist>;
const mockedJoinEvent = paymentService.joinEvent as jest.MockedFunction<typeof paymentService.joinEvent>;
const mockedLeaveEvent = paymentService.leaveEvent as jest.MockedFunction<typeof paymentService.leaveEvent>;
const mockedRegisterChild = registrationService.registerChildForEvent as jest.MockedFunction<
    typeof registrationService.registerChildForEvent
>;
const mockedRegisterSelf = registrationService.registerSelfForEvent as jest.MockedFunction<
    typeof registrationService.registerSelfForEvent
>;
const mockedCreateBill = createEventRegistrationBill as jest.MockedFunction<
    typeof createEventRegistrationBill
>;
const mockedSubmitProof = submitManualPaymentProof as jest.MockedFunction<
    typeof submitManualPaymentProof
>;

const user = { $id: 'user_1' } as UserData;
const event = {
    $id: 'event_1',
    teamSignup: false,
    maxParticipants: 10,
    divisionDetails: [],
    registrationPaymentMode: 'ONLINE',
} as Event;
const fullBill = { $id: 'bill_1', totalAmountCents: 2_500 } as Bill;

type HarnessOptions = {
    activeEvent?: Event;
    weeklySelectionRequired?: boolean;
    isDivisionSelectionMissing?: boolean;
    registrationByDivisionType?: boolean;
    selectedDivisionAtCapacity?: boolean;
    isFreeForUser?: boolean;
    selectedTeamId?: string;
    userTeams?: Team[];
    playerCount?: number;
    teamCount?: number;
    priceCents?: number;
    allowPaymentPlans?: boolean;
};

const prepareCheckout = jest.fn();
const reload = jest.fn();
const navigateToCompletion = jest.fn();
const clearProgress = jest.fn();

function useHarness(options: HarnessOptions = {}) {
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [manualPaymentOpened, setManualPaymentOpened] = useState(false);
    const controller = useEventJoinFinalizationController({
        event: options.activeEvent ?? event,
        checkoutEvent: options.activeEvent ?? event,
        user,
        billing: {
            priceCents: options.priceCents ?? 0,
            allowPaymentPlans: options.allowPaymentPlans ?? false,
            installmentAmounts: options.allowPaymentPlans ? [1_250, 1_250] : [],
            installmentDueDates: [],
            installmentDueRelativeDays: [],
        },
        occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        selection: { divisionId: 'division_1', divisionTypeId: 'type_1' },
        weeklySelectionRequired: options.weeklySelectionRequired ?? false,
        isDivisionSelectionMissing: options.isDivisionSelectionMissing ?? false,
        registrationByDivisionType: options.registrationByDivisionType ?? false,
        selectedDivisionAtCapacity: options.selectedDivisionAtCapacity ?? false,
        isFreeForUser: options.isFreeForUser ?? true,
        selectedTeamId: options.selectedTeamId ?? '',
        userTeams: options.userTeams ?? [],
        playerCount: options.playerCount ?? 0,
        teamCount: options.teamCount ?? 0,
        timeoutMs: 5_000,
        prepareCheckout,
        reload,
        navigateToCompletion,
        clearProgress,
        setJoinError,
        setJoinNotice,
        setManualPaymentOpened,
    });
    return { controller, joinError, joinNotice, manualPaymentOpened };
}

describe('useEventJoinFinalizationController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedAddFreeAgent.mockResolvedValue(undefined);
        mockedAddToWaitlist.mockResolvedValue(undefined);
        mockedJoinEvent.mockResolvedValue({});
        mockedLeaveEvent.mockResolvedValue(undefined);
        mockedRegisterSelf.mockResolvedValue({
            registration: { id: 'registration_1', status: 'active' },
        });
        mockedCreateBill.mockResolvedValue(fullBill);
        mockedSubmitProof.mockResolvedValue({ success: true });
        reload.mockResolvedValue(undefined);
        prepareCheckout.mockResolvedValue(undefined);
    });

    it('blocks finalization until a required weekly occurrence is selected', async () => {
        const { result } = renderHook(() => useHarness({ weeklySelectionRequired: true }));

        await act(async () => {
            await result.current.controller.finalizeJoin({ mode: 'user' });
        });

        expect(result.current.joinError).toBe('Select a weekly session before continuing.');
        expect(mockedRegisterSelf).not.toHaveBeenCalled();
        expect(mockedJoinEvent).not.toHaveBeenCalled();
    });

    it('registers a child, exposes consent state, and completes active registrations', async () => {
        mockedRegisterChild.mockResolvedValue({
            registration: { id: 'registration_child', status: 'active' },
            consent: { status: 'completed', parentSignLink: '/parent-sign' },
            warnings: ['Saved for the selected session.'],
        });
        const { result } = renderHook(() => useHarness());

        await act(async () => {
            await result.current.controller.finalizeJoin({ mode: 'child', childId: 'child_1' });
        });

        expect(mockedRegisterChild).toHaveBeenCalledWith(
            'event_1',
            'child_1',
            expect.objectContaining({
                divisionId: 'division_1',
                slotId: 'slot_1',
                occurrenceDate: '2026-07-15',
            }),
            undefined,
        );
        expect(result.current.controller.childRegistration?.status).toBe('active');
        expect(result.current.controller.childConsent?.status).toBe('completed');
        expect(result.current.controller.childRegistrationChildId).toBe('child_1');
        expect(result.current.controller.registeringChild).toBe(false);
        expect(result.current.joinNotice).toBe(
            'Child registration completed. Saved for the selected session.',
        );
        expect(reload).toHaveBeenCalledTimes(1);
        expect(navigateToCompletion).toHaveBeenCalledTimes(1);
    });

    it('routes a full event registration to the waitlist', async () => {
        const fullEvent = { ...event, maxParticipants: 1 } as Event;
        const { result } = renderHook(() => useHarness({
            activeEvent: fullEvent,
            playerCount: 1,
        }));

        await act(async () => {
            await result.current.controller.finalizeJoin({ mode: 'user' });
        });

        expect(mockedAddToWaitlist).toHaveBeenCalledWith(
            'event_1',
            'user_1',
            'user',
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(result.current.joinNotice).toBe('Added to waitlist.');
        expect(mockedRegisterSelf).not.toHaveBeenCalled();
    });

    it('loads a manual-payment bill and submits proof through the retained bill context', async () => {
        const manualEvent = { ...event, registrationPaymentMode: 'MANUAL' } as Event;
        mockedJoinEvent.mockResolvedValue({ bill: { $id: 'bill_1' } as Bill });
        mockedGetBill.mockResolvedValue(fullBill);
        const { result } = renderHook(() => useHarness({
            activeEvent: manualEvent,
            priceCents: 2_500,
            isFreeForUser: false,
        }));

        await act(async () => {
            await result.current.controller.finalizeJoin({ mode: 'user' });
        });

        expect(mockedGetBill).toHaveBeenCalledWith('bill_1');
        expect(result.current.controller.manualPaymentBill).toEqual(fullBill);
        expect(result.current.manualPaymentOpened).toBe(true);

        const proof = new File(['proof'], 'proof.png', { type: 'image/png' });
        await act(async () => {
            await result.current.controller.submitManualProof(proof);
        });

        expect(mockedSubmitProof).toHaveBeenCalledWith({
            event: manualEvent,
            bill: fullBill,
            proofFile: proof,
        });
        expect(result.current.controller.manualPaymentBill).toBeNull();
        expect(result.current.manualPaymentOpened).toBe(false);
        expect(clearProgress).toHaveBeenCalledTimes(1);
    });

    it('creates a missing payment-plan bill and navigates after reloading', async () => {
        const { result } = renderHook(() => useHarness({
            priceCents: 2_500,
            allowPaymentPlans: true,
            isFreeForUser: false,
        }));

        await act(async () => {
            await result.current.controller.finalizeJoin({ mode: 'user' });
        });

        expect(mockedRegisterSelf).toHaveBeenCalledTimes(1);
        expect(mockedJoinEvent).toHaveBeenCalledTimes(1);
        expect(mockedCreateBill).toHaveBeenCalledWith(expect.objectContaining({
            ownerType: 'USER',
            ownerId: 'user_1',
            timeoutMs: 5_000,
        }));
        expect(result.current.joinNotice).toContain('Payment plan started');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(navigateToCompletion).toHaveBeenCalledTimes(1);
    });

    it('rolls back a payment-plan join when bill creation fails', async () => {
        mockedCreateBill.mockRejectedValue(new Error('Billing provider unavailable.'));
        const { result } = renderHook(() => useHarness({
            priceCents: 2_500,
            allowPaymentPlans: true,
            isFreeForUser: false,
        }));

        await act(async () => {
            await expect(result.current.controller.finalizeJoin({ mode: 'user' })).rejects.toThrow(
                'Billing provider unavailable.',
            );
        });

        expect(mockedLeaveEvent).toHaveBeenCalledWith(
            user,
            event,
            undefined,
            undefined,
            undefined,
            5_000,
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(navigateToCompletion).not.toHaveBeenCalled();
    });

    it('hands a paid registration without a plan to checkout', async () => {
        const { result } = renderHook(() => useHarness({
            priceCents: 2_500,
            isFreeForUser: false,
        }));

        await act(async () => {
            await result.current.controller.finalizeJoin({ mode: 'user' });
        });

        expect(prepareCheckout).toHaveBeenCalledWith({
            event,
            team: undefined,
            selection: { divisionId: 'division_1', divisionTypeId: 'type_1' },
            answers: undefined,
        });
        expect(mockedJoinEvent).not.toHaveBeenCalled();
    });

    it('adds a child free agent without requiring a division selection', async () => {
        const { result } = renderHook(() => useHarness({ isDivisionSelectionMissing: true }));

        await act(async () => {
            await result.current.controller.finalizeJoin({
                mode: 'child_free_agent',
                childId: 'child_1',
            });
        });

        expect(mockedAddFreeAgent).toHaveBeenCalledWith(
            'event_1',
            'child_1',
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(result.current.joinNotice).toBe('Child added to free agent list.');
    });
});
