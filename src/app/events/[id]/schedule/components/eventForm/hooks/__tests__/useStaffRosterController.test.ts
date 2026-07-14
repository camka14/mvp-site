import { useCallback } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { userService } from '@/lib/userService';
import type { Organization, UserData } from '@/types';

import type { EventFormValues } from '../../formTypes';
import { useStaffRosterController } from '../useStaffRosterController';

jest.mock('@/lib/userService', () => ({
    userService: {
        getUsersByIds: jest.fn(),
        searchUsers: jest.fn(),
    },
}));

const mockedGetUsersByIds = userService.getUsersByIds as jest.MockedFunction<typeof userService.getUsersByIds>;
const mockedSearchUsers = userService.searchUsers as jest.MockedFunction<typeof userService.searchUsers>;

const OWNER = {
    $id: 'owner_1',
    firstName: 'Harper',
    lastName: 'Host',
    email: 'harper@example.com',
} as UserData;
const HOST = {
    $id: 'host_2',
    firstName: 'Jordan',
    lastName: 'Host',
    email: 'jordan@example.com',
} as UserData;
const OFFICIAL = {
    $id: 'official_1',
    firstName: 'Riley',
    lastName: 'Official',
    email: 'riley@example.com',
} as UserData;

const buildOrganization = (): Organization => ({
    $id: 'org_1',
    ownerId: OWNER.$id,
    owner: OWNER,
    hosts: [OWNER, HOST],
    officials: [OFFICIAL],
    staffMembers: [
        {
            $id: 'staff_host_2',
            organizationId: 'org_1',
            userId: HOST.$id,
            types: ['HOST'],
            user: HOST,
            invite: { status: 'ACCEPTED' },
        },
        {
            $id: 'staff_official_1',
            organizationId: 'org_1',
            userId: OFFICIAL.$id,
            types: ['OFFICIAL'],
            user: OFFICIAL,
            invite: { status: 'ACCEPTED' },
        },
    ],
    staffInvites: [],
} as Organization);

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    hostId: OWNER.$id,
    assistantHostIds: [],
    officialIds: [],
    eventOfficials: [],
    officials: [],
    pendingStaffInvites: [],
    ...overrides,
} as EventFormValues);

type HarnessProps = {
    eventData: EventFormValues;
    isOrganizationHostedEvent?: boolean;
    organization?: Organization | null;
};

const useRosterHarness = ({
    eventData,
    isOrganizationHostedEvent = false,
    organization = null,
}: HarnessProps) => {
    const form = useForm<EventFormValues>({ defaultValues: eventData });
    // eslint-disable-next-line react-hooks/incompatible-library -- exercise the production React Hook Form subscription boundary.
    const formValues = form.watch();
    const setEventData = useCallback((
        updater: React.SetStateAction<EventFormValues>,
        options: Record<string, unknown> = {},
    ) => {
        const current = form.getValues();
        const next = typeof updater === 'function' ? updater(current) : updater;
        (Object.keys(next) as (keyof EventFormValues)[]).forEach((key) => {
            if (!Object.is(current[key], next[key])) {
                form.setValue(key, next[key], {
                    shouldDirty: (options.shouldDirty as boolean | undefined) ?? true,
                    shouldValidate: false,
                });
            }
        });
    }, [form]);
    const controller = useStaffRosterController({
        activeEditingEvent: null,
        currentUser: OWNER,
        eventData: formValues,
        incomingEvent: null,
        isOrganizationHostedEvent,
        resolvedOrganization: organization,
        setEventData,
    });
    return { ...controller, ...form, formValues };
};

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

describe('useStaffRosterController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedGetUsersByIds.mockResolvedValue([]);
        mockedSearchUsers.mockResolvedValue([]);
    });

    it('filters the organization roster and applies only allowed host transitions through React Hook Form', async () => {
        const organization = buildOrganization();
        const { result } = renderHook(() => useRosterHarness({
            eventData: buildEventData({ assistantHostIds: [HOST.$id] }),
            isOrganizationHostedEvent: true,
            organization,
        }));

        act(() => result.current.setOrganizationStaffSearch('Riley'));
        expect(result.current.filteredOrganizationStaffEntries.map((entry) => entry.userId)).toEqual([OFFICIAL.$id]);

        act(() => result.current.handleHostChange('outside_org'));
        expect(result.current.formValues.hostId).toBe(OWNER.$id);

        act(() => result.current.handleHostChange(HOST.$id));
        await waitFor(() => expect(result.current.formValues.hostId).toBe(HOST.$id));
        expect(result.current.formValues.assistantHostIds).toEqual([]);

        act(() => result.current.handleAddAssistantHost(OWNER));
        await waitFor(() => expect(result.current.formValues.assistantHostIds).toEqual([OWNER.$id]));

        act(() => result.current.handleRemoveAssistantHost(OWNER.$id));
        await waitFor(() => expect(result.current.formValues.assistantHostIds).toEqual([]));
    });

    it('ignores a stale non-organization search response after the query changes', async () => {
        const firstSearch = createDeferred<UserData[]>();
        const secondSearch = createDeferred<UserData[]>();
        mockedSearchUsers.mockImplementation((query) => (
            query === 'al' ? firstSearch.promise : secondSearch.promise
        ));
        const { result } = renderHook(() => useRosterHarness({ eventData: buildEventData({ hostId: '' }) }));

        act(() => result.current.setNonOrgStaffSearch('al'));
        await waitFor(() => expect(mockedSearchUsers).toHaveBeenCalledWith('al'));

        act(() => result.current.setNonOrgStaffSearch('alex'));
        await waitFor(() => expect(mockedSearchUsers).toHaveBeenCalledWith('alex'));

        await act(async () => {
            secondSearch.resolve([HOST]);
            await secondSearch.promise;
        });
        expect(result.current.nonOrgStaffResults).toEqual([HOST]);

        await act(async () => {
            firstSearch.resolve([OFFICIAL]);
            await firstSearch.promise;
        });
        expect(result.current.nonOrgStaffResults).toEqual([HOST]);
        expect(result.current.nonOrgStaffSearchLoading).toBe(false);
    });

    it('surfaces non-organization search failures without retaining stale results', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedSearchUsers.mockRejectedValue(new Error('search unavailable'));
        const { result } = renderHook(() => useRosterHarness({ eventData: buildEventData({ hostId: '' }) }));

        act(() => result.current.setNonOrgStaffSearch('alex'));

        await waitFor(() => expect(result.current.nonOrgStaffError).toBe('Failed to search staff. Try again.'));
        expect(result.current.nonOrgStaffResults).toEqual([]);
        expect(result.current.nonOrgStaffSearchLoading).toBe(false);
        errorSpy.mockRestore();
    });
});
