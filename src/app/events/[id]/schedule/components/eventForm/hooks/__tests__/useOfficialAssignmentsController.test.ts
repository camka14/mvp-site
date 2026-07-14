import { useCallback } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type {
    Field,
    Sport,
    UserData,
} from '@/types';

import type { EventFormValues } from '../../formTypes';
import { useOfficialAssignmentsController } from '../useOfficialAssignmentsController';

let clientIdSequence = 0;
jest.mock('@/lib/clientId', () => ({
    createClientId: jest.fn(() => `official_client_${++clientIdSequence}`),
}));

const FIELD = { $id: 'field_1', name: 'Court 1' } as Field;
const OFFICIAL_ONE = {
    $id: 'official_1',
    firstName: 'Riley',
    lastName: 'Official',
} as UserData;
const OFFICIAL_TWO = {
    $id: 'official_2',
    firstName: 'Casey',
    lastName: 'Official',
} as UserData;
const REFEREE_POSITION = {
    id: 'position_referee',
    name: 'Referee',
    count: 2,
    order: 0,
};

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    officialSchedulingMode: 'STAFFING',
    officialPositions: [REFEREE_POSITION],
    officialIds: [],
    eventOfficials: [],
    officials: [],
    ...overrides,
} as EventFormValues);

type HarnessProps = {
    allowedOfficials?: UserData[];
    eventData: EventFormValues;
    isOrganizationHostedEvent?: boolean;
    sport?: Sport | null;
};

const useOfficialHarness = ({
    allowedOfficials = [],
    eventData,
    isOrganizationHostedEvent = false,
    sport = null,
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
    const allowedOfficialMap = new Map(allowedOfficials.map((official) => [official.$id, official]));
    const controller = useOfficialAssignmentsController({
        eventData: formValues,
        fields: [FIELD],
        isOrganizationHostedEvent,
        organizationAllowedOfficialIdSet: new Set(allowedOfficialMap.keys()),
        organizationOfficialsById: allowedOfficialMap,
        selectedFieldIds: [FIELD.$id],
        selectedSportForOfficials: sport,
        setEventData,
        setValue: form.setValue as unknown as (
            name: string,
            value: unknown,
            options?: Record<string, unknown>,
        ) => void,
    });
    return { ...controller, ...form, formValues };
};

describe('useOfficialAssignmentsController', () => {
    beforeEach(() => {
        clientIdSequence = 0;
    });

    it('adds, updates, and removes officials while deriving staffing coverage from the RHF draft', async () => {
        const { result } = renderHook(() => useOfficialHarness({ eventData: buildEventData() }));

        expect(result.current.requiredOfficialSlotsPerMatch).toBe(2);
        expect(result.current.assignedActiveOfficialsForStaffing).toBe(0);
        expect(result.current.officialStaffingCoverageError).toMatch(/requires at least 2 officials/i);

        act(() => result.current.handleAddOfficial(OFFICIAL_ONE));
        await waitFor(() => expect(result.current.formValues.officialIds).toEqual([OFFICIAL_ONE.$id]));
        expect(result.current.formValues.eventOfficials).toEqual([
            expect.objectContaining({
                userId: OFFICIAL_ONE.$id,
                positionIds: [REFEREE_POSITION.id],
                fieldIds: [],
                isActive: true,
            }),
        ]);

        act(() => result.current.handleUpdateEventOfficialEligibility(OFFICIAL_ONE.$id, {
            positionIds: [REFEREE_POSITION.id, REFEREE_POSITION.id],
            fieldIds: [FIELD.$id, FIELD.$id],
        }));
        await waitFor(() => expect(result.current.formValues.eventOfficials[0]).toEqual(expect.objectContaining({
            positionIds: [REFEREE_POSITION.id],
            fieldIds: [FIELD.$id],
        })));

        act(() => result.current.handleAddOfficial(OFFICIAL_TWO));
        await waitFor(() => expect(result.current.assignedActiveOfficialsForStaffing).toBe(2));
        expect(result.current.officialStaffingCoverageError).toBeNull();

        act(() => result.current.handleRemoveOfficial(OFFICIAL_ONE.$id));
        await waitFor(() => expect(result.current.formValues.officialIds).toEqual([OFFICIAL_TWO.$id]));
        expect(result.current.formValues.officials).toEqual([OFFICIAL_TWO]);
    });

    it('owns position add, update, remove, and sport-template reset transitions', async () => {
        const sport = {
            $id: 'sport_1',
            officialPositionTemplates: [
                { name: 'Head Referee', count: 1 },
                { name: 'Line Judge', count: 2 },
            ],
        } as Sport;
        const { result } = renderHook(() => useOfficialHarness({
            eventData: buildEventData(),
            sport,
        }));

        act(() => result.current.handleAddOfficialPosition());
        await waitFor(() => expect(result.current.formValues.officialPositions).toHaveLength(2));
        const addedPositionId = result.current.formValues.officialPositions[1].id;

        act(() => result.current.handleUpdateOfficialPosition(addedPositionId, {
            name: 'Scorekeeper',
            count: 0,
        }));
        await waitFor(() => expect(result.current.formValues.officialPositions[1]).toEqual(expect.objectContaining({
            id: addedPositionId,
            name: 'Scorekeeper',
            count: 1,
            order: 1,
        })));

        act(() => result.current.handleRemoveOfficialPosition(REFEREE_POSITION.id));
        await waitFor(() => expect(result.current.formValues.officialPositions).toEqual([
            expect.objectContaining({ id: addedPositionId, order: 0 }),
        ]));

        act(() => result.current.handleResetOfficialPositionsFromSport());
        await waitFor(() => expect(result.current.formValues.officialPositions).toEqual([
            expect.objectContaining({ name: 'Head Referee', count: 1, order: 0 }),
            expect.objectContaining({ name: 'Line Judge', count: 2, order: 1 }),
        ]));
    });

    it('sanitizes organization officials and rejects assignments outside the allowed roster', async () => {
        const eventData = buildEventData({
            officialIds: [OFFICIAL_ONE.$id, OFFICIAL_TWO.$id],
            officials: [OFFICIAL_ONE, OFFICIAL_TWO],
            eventOfficials: [
                {
                    id: 'event_official_1',
                    userId: OFFICIAL_ONE.$id,
                    positionIds: [REFEREE_POSITION.id],
                    fieldIds: [],
                    isActive: true,
                },
                {
                    id: 'event_official_2',
                    userId: OFFICIAL_TWO.$id,
                    positionIds: [REFEREE_POSITION.id],
                    fieldIds: [],
                    isActive: true,
                },
            ],
        });
        const { result } = renderHook(() => useOfficialHarness({
            allowedOfficials: [OFFICIAL_ONE],
            eventData,
            isOrganizationHostedEvent: true,
        }));

        await waitFor(() => expect(result.current.formValues.officialIds).toEqual([OFFICIAL_ONE.$id]));
        expect(result.current.formValues.eventOfficials.map((official) => official.userId)).toEqual([OFFICIAL_ONE.$id]);
        expect(result.current.formValues.officials).toEqual([OFFICIAL_ONE]);

        act(() => result.current.handleAddOfficial(OFFICIAL_TWO));
        expect(result.current.formValues.officialIds).toEqual([OFFICIAL_ONE.$id]);
    });
});
