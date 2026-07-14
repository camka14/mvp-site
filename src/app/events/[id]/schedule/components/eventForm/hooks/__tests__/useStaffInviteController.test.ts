import { useCallback } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { userService } from '@/lib/userService';
import type { Event } from '@/types';

import type { EventFormValues } from '../../formTypes';
import {
    type AssignedStaffUserIdsByRole,
    type PendingStaffInvite,
} from '../../staffInvites';
import { useStaffInviteController } from '../useStaffInviteController';

jest.mock('@/lib/userService', () => ({
    userService: {
        lookupEmailMembership: jest.fn(),
    },
}));

const mockedLookupEmailMembership = userService.lookupEmailMembership as jest.MockedFunction<
    typeof userService.lookupEmailMembership
>;

const ASSIGNED_USER_IDS: AssignedStaffUserIdsByRole = {
    OFFICIAL: ['official_1'],
    ASSISTANT_HOST: ['host_1', 'assistant_1'],
};

const buildEventData = (pendingStaffInvites: PendingStaffInvite[] = []): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    pendingStaffInvites,
} as EventFormValues);

type HarnessProps = {
    assignedUserIdsByRole?: AssignedStaffUserIdsByRole;
    eventData?: EventFormValues;
    isOrganizationHostedEvent?: boolean;
};

const useInviteHarness = ({
    assignedUserIdsByRole = ASSIGNED_USER_IDS,
    eventData = buildEventData(),
    isOrganizationHostedEvent = false,
}: HarnessProps = {}) => {
    const form = useForm<EventFormValues>({ defaultValues: eventData });
    // eslint-disable-next-line react-hooks/incompatible-library -- exercise the production React Hook Form subscription boundary.
    const formValues = form.watch();
    const isDirty = form.formState.isDirty;
    const setPendingStaffInvites = useCallback((updater: React.SetStateAction<PendingStaffInvite[]>) => {
        const current = form.getValues('pendingStaffInvites') ?? [];
        const next = typeof updater === 'function' ? updater(current) : updater;
        form.setValue('pendingStaffInvites', next, { shouldDirty: true, shouldValidate: false });
    }, [form]);
    const controller = useStaffInviteController({
        activeEditingEvent: { $id: 'event_1' } as Event,
        assignedUserIdsByRole,
        getValues: form.getValues,
        isOrganizationHostedEvent,
        setPendingStaffInvites,
    });
    return { ...controller, ...form, formValues, isDirty };
};

const fillInvite = (
    result: { current: ReturnType<typeof useInviteHarness> },
    role: 'OFFICIAL' | 'ASSISTANT_HOST' = 'OFFICIAL',
) => {
    act(() => {
        result.current.handleInviteFieldChange('firstName', ' Casey ');
        result.current.handleInviteFieldChange('lastName', ' Ref ');
        result.current.handleInviteFieldChange('email', ' CASEY@EXAMPLE.COM ');
        result.current.handleInviteRoleToggle(role);
    });
};

describe('useStaffInviteController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedLookupEmailMembership.mockResolvedValue([]);
    });

    it('stages, normalizes, and removes invitation roles through the React Hook Form draft', async () => {
        const { result } = renderHook(() => useInviteHarness());
        fillInvite(result);

        await act(async () => {
            await result.current.handleStagePendingStaffInvite();
        });

        expect(result.current.formValues.pendingStaffInvites).toEqual([{
            firstName: 'Casey',
            lastName: 'Ref',
            email: 'casey@example.com',
            roles: ['OFFICIAL'],
        }]);
        expect(result.current.newStaffInvite).toEqual({
            firstName: '',
            lastName: '',
            email: '',
            roles: [],
        });
        expect(result.current.isDirty).toBe(true);

        act(() => result.current.handleRemovePendingStaffInviteRole('casey@example.com', 'OFFICIAL'));
        await waitFor(() => expect(result.current.formValues.pendingStaffInvites).toEqual([]));
    });

    it('blocks a staged invite when its email already belongs to the same assigned role', async () => {
        mockedLookupEmailMembership.mockResolvedValue([
            { email: 'casey@example.com', userId: 'official_1' },
        ]);
        const { result } = renderHook(() => useInviteHarness());
        fillInvite(result);

        await act(async () => {
            await result.current.handleStagePendingStaffInvite();
        });

        expect(result.current.staffInviteError).toBe(
            'casey@example.com is already added as official for this event.',
        );
        expect(result.current.formValues.pendingStaffInvites).toEqual([]);
        expect(mockedLookupEmailMembership).toHaveBeenCalledWith(
            ['casey@example.com'],
            expect.arrayContaining(['official_1', 'host_1', 'assistant_1']),
            { eventId: 'event_1' },
        );
    });

    it('rejects invalid persisted invitations during submit validation', async () => {
        const { result } = renderHook(() => useInviteHarness({
            eventData: buildEventData([{
                firstName: '',
                lastName: 'Ref',
                email: 'not-an-email',
                roles: ['OFFICIAL'],
            }]),
        }));

        let thrown: Error | null = null;
        await act(async () => {
            try {
                await result.current.validatePendingStaffAssignments();
            } catch (error) {
                thrown = error as Error;
            }
        });

        expect(thrown?.message).toBe(
            'Enter first name, last name, valid email, and at least one role for every email invite before saving.',
        );
        expect(result.current.staffInviteError).toBe(thrown?.message);
        expect(mockedLookupEmailMembership).not.toHaveBeenCalled();
    });
});
