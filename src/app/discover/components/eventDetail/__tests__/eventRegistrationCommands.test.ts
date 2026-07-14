import { boldsignService, type SignStep } from '@/lib/boldsignService';
import { billService } from '@/lib/billService';
import type { Event, UserData } from '@/types';

import {
    createEventRegistrationBill,
    dedupeSignSteps,
    getJoinIntentRegistrationType,
    loadRequiredEventSignLinks,
} from '../eventRegistrationCommands';

jest.mock('@/lib/boldsignService', () => ({
    boldsignService: {
        createSignLinks: jest.fn(),
    },
}));

jest.mock('@/lib/billService', () => ({
    billService: {
        createBill: jest.fn(),
    },
}));

const mockedCreateSignLinks = boldsignService.createSignLinks as jest.MockedFunction<
    typeof boldsignService.createSignLinks
>;
const mockedCreateBill = billService.createBill as jest.MockedFunction<
    typeof billService.createBill
>;

const user = { $id: 'user_1' } as UserData;
const event = {
    $id: 'event_1',
    eventType: 'TOURNAMENT',
    organizationId: 'org_1',
    start: '2026-07-20T18:00:00.000Z',
    allowTeamSplitDefault: true,
} as Event;
const billing = {
    priceCents: 2_000,
    allowPaymentPlans: true,
    installmentAmounts: [1_000, 1_000],
    installmentDueDates: ['2026-07-15', '2026-07-20'],
    installmentDueRelativeDays: [],
};

describe('event registration commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('classifies every registration intent for analytics', () => {
        expect(getJoinIntentRegistrationType({ mode: 'user' })).toBe('self');
        expect(getJoinIntentRegistrationType({ mode: 'team' })).toBe('team');
        expect(getJoinIntentRegistrationType({ mode: 'child' })).toBe('child');
        expect(getJoinIntentRegistrationType({ mode: 'user_waitlist' })).toBe('waitlist');
        expect(getJoinIntentRegistrationType({ mode: 'child_waitlist' })).toBe('waitlist');
        expect(getJoinIntentRegistrationType({ mode: 'team_waitlist' })).toBe('team_waitlist');
        expect(getJoinIntentRegistrationType({ mode: 'child_free_agent' })).toBe('free_agent');
    });

    it('deduplicates identical signing steps without merging signer contexts', () => {
        const step = { templateId: 'template_1', documentId: 'document_1', type: 'TEXT' } as SignStep;
        expect(dedupeSignSteps([step, step], 'participant')).toHaveLength(1);
        expect(dedupeSignSteps([
            { ...step, signerContext: 'parent_guardian' },
            { ...step, signerContext: 'child' },
        ], 'participant')).toHaveLength(2);
    });

    it('creates a canonical team payment-plan bill with absolute due dates', async () => {
        mockedCreateBill.mockResolvedValue({ $id: 'bill_1' } as never);

        await createEventRegistrationBill({
            ownerType: 'TEAM',
            ownerId: 'team_1',
            event,
            billing,
            user,
            timeoutMs: 5_000,
        });

        expect(mockedCreateBill).toHaveBeenCalledWith(expect.objectContaining({
            ownerType: 'TEAM',
            ownerId: 'team_1',
            totalAmountCents: 2_000,
            eventId: 'event_1',
            organizationId: 'org_1',
            installmentAmounts: [1_000, 1_000],
            installmentDueDates: [
                expect.stringMatching(/^2026-07-15T/),
                expect.stringMatching(/^2026-07-20T/),
            ],
            installmentDueRelativeDays: [],
            allowSplit: true,
            paymentPlanEnabled: true,
            timeoutMs: 5_000,
            user,
        }));
    });

    it('requires a selected weekly occurrence and aligned relative due dates', async () => {
        const weeklyEvent = {
            ...event,
            eventType: 'WEEKLY_EVENT',
            parentEvent: null,
        } as Event;
        await expect(createEventRegistrationBill({
            ownerType: 'USER',
            ownerId: 'user_1',
            event: weeklyEvent,
            billing: { ...billing, installmentDueRelativeDays: [0, 7] },
            user,
            timeoutMs: 5_000,
        })).rejects.toThrow('Select a weekly session');
        await expect(createEventRegistrationBill({
            ownerType: 'USER',
            ownerId: 'user_1',
            event: weeklyEvent,
            billing: { ...billing, installmentDueRelativeDays: [0] },
            occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-21' },
            user,
            timeoutMs: 5_000,
        })).rejects.toThrow('due date offset for each installment');
        expect(mockedCreateBill).not.toHaveBeenCalled();
    });

    it('uses slot-scoped relative due dates for a weekly bill', async () => {
        mockedCreateBill.mockResolvedValue({ $id: 'bill_1' } as never);
        await createEventRegistrationBill({
            ownerType: 'USER',
            ownerId: 'user_1',
            event: { ...event, eventType: 'WEEKLY_EVENT', parentEvent: null } as Event,
            billing: { ...billing, installmentDueRelativeDays: [0, 7] },
            occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-21' },
            user,
            timeoutMs: 5_000,
        });

        expect(mockedCreateBill).toHaveBeenCalledWith(expect.objectContaining({
            slotId: 'slot_1',
            occurrenceDate: '2026-07-21',
            installmentDueDates: [],
            installmentDueRelativeDays: [0, 7],
        }));
    });

    it('loads and deduplicates participant signing links once', async () => {
        const step = { templateId: 'template_1', documentId: 'document_1', type: 'TEXT' } as SignStep;
        mockedCreateSignLinks.mockResolvedValue([step, step]);

        const result = await loadRequiredEventSignLinks({
            intent: { mode: 'user' },
            event,
            user,
            userEmail: 'player@test.com',
            timeoutMs: 5_000,
        });

        expect(result).toEqual([step]);
        expect(mockedCreateSignLinks).toHaveBeenCalledTimes(1);
        expect(mockedCreateSignLinks).toHaveBeenCalledWith(expect.objectContaining({
            signerContext: 'participant',
        }));
    });

    it('loads both parent and child signing links when they share the sign-in email', async () => {
        const step = { templateId: 'template_1', documentId: 'document_1', type: 'TEXT' } as SignStep;
        mockedCreateSignLinks
            .mockResolvedValueOnce([{ ...step, signerContext: 'parent_guardian' }])
            .mockResolvedValueOnce([{ ...step, signerContext: 'child' }]);

        const result = await loadRequiredEventSignLinks({
            intent: {
                mode: 'child',
                childId: 'child_1',
                childEmail: ' Child@Test.com ',
            },
            event,
            user,
            userEmail: 'child@test.com',
            timeoutMs: 5_000,
        });

        expect(result).toHaveLength(2);
        expect(mockedCreateSignLinks).toHaveBeenCalledTimes(2);
        expect(mockedCreateSignLinks).toHaveBeenLastCalledWith(expect.objectContaining({
            signerContext: 'child',
            childUserId: 'child_1',
        }));
    });
});
