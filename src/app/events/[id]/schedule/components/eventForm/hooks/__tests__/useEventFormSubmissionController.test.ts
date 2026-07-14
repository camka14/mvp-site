import {
    createRef,
    useCallback,
    useRef,
} from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FieldErrors } from 'react-hook-form';
import { useForm } from 'react-hook-form';

import type { EventStaffSnapshot } from '@/lib/eventStaffService';
import type {
    Event,
    RegistrationQuestionDraft,
    UserData,
} from '@/types';

import { buildEventDraft } from '../../buildEventDraft';
import type { EventFormValues } from '../../formTypes';
import type { buildEventFormSchema } from '../../schema';
import type { EventFormHandle } from '../../types';
import { useEventFormSubmissionController } from '../useEventFormSubmissionController';

jest.mock('../../buildEventDraft', () => ({
    buildEventDraft: jest.fn(({ previousEventFieldLocation, source }) => ({
        $id: source.$id,
        name: source.name,
        location: previousEventFieldLocation,
    })),
}));

const mockedBuildEventDraft = buildEventDraft as jest.MockedFunction<typeof buildEventDraft>;

const CURRENT_USER = { $id: 'user_1' } as UserData;
const VALID_QUESTION: RegistrationQuestionDraft = {
    id: 'question_1',
    prompt: '  Emergency contact  ',
    answerType: 'TEXT',
    required: true,
    sortOrder: 4,
};

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    name: 'Summer Event',
    eventType: 'EVENT',
    officialSchedulingMode: 'SCHEDULE',
    pendingStaffInvites: [],
    assistantHostIds: [],
    officialPositions: [],
    eventOfficials: [],
    officialIds: [],
    ...overrides,
} as EventFormValues);

const successfulSchema = {
    safeParse: jest.fn(() => ({ success: true as const, data: buildEventData() })),
} as unknown as ReturnType<typeof buildEventFormSchema>;

type HarnessProps = {
    commitDirtyBaseline?: jest.Mock;
    errors?: FieldErrors<EventFormValues>;
    eventData?: EventFormValues;
    eventValidationSchema?: ReturnType<typeof buildEventFormSchema>;
    formRef: React.RefObject<EventFormHandle | null>;
    isAffiliateEvent?: boolean;
    officialStaffingCoverageError?: string | null;
    registrationQuestionDrafts?: RegistrationQuestionDraft[];
    trigger?: jest.Mock<Promise<boolean>>;
    validatePendingStaffAssignments?: jest.Mock<Promise<void>>;
};

const useSubmissionHarness = ({
    commitDirtyBaseline = jest.fn(),
    errors = {},
    eventData = buildEventData(),
    eventValidationSchema = successfulSchema,
    formRef,
    isAffiliateEvent = false,
    officialStaffingCoverageError = null,
    registrationQuestionDrafts = [VALID_QUESTION],
    trigger = jest.fn().mockResolvedValue(true),
    validatePendingStaffAssignments = jest.fn().mockResolvedValue(undefined),
}: HarnessProps) => {
    const form = useForm<EventFormValues>({ defaultValues: eventData });
    const formValues = form.watch();
    const previousEventFieldLocationRef = useRef('Previous Gym');
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
                    shouldValidate: (options.shouldValidate as boolean | undefined) ?? true,
                });
            }
        });
    }, [form]);
    const controller = useEventFormSubmissionController({
        activeEditingEvent: null,
        assignedActiveOfficialsForStaffing: 1,
        commitDirtyBaseline,
        currentUser: CURRENT_USER,
        errors,
        eventData: formValues,
        eventValidationSchema,
        fieldCount: 0,
        fields: [],
        fieldsReferencedInSlots: [],
        formRef,
        getValues: form.getValues,
        hasImmutableTimeSlots: false,
        hasRestrictedImmutableFields: false,
        hasStripeAccount: false,
        immutableFields: [],
        immutableTimeSlots: [],
        isAffiliateEvent,
        isEditMode: false,
        isOrganizationHostedEvent: false,
        isOrganizationManagedEvent: false,
        joinAsParticipant: false,
        officialStaffingCoverageError,
        organizationHostedEventId: '',
        organizationOfficialsById: new Map(),
        previousEventFieldLocationRef,
        registrationQuestionDrafts,
        rentalLockedSlotsForDraft: [],
        rentalPurchase: undefined,
        requiredOfficialSlotsPerMatch: 2,
        resolvedOrganization: null,
        selectedRentedFieldIds: [],
        setEventData,
        shouldManageLocalFields: false,
        shouldProvisionFields: false,
        sportsById: new Map(),
        trigger,
        validatePendingStaffAssignments,
    });
    return { ...controller, ...form, formValues };
};

describe('useEventFormSubmissionController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('preserves the exact imperative handle and builds normalized draft snapshots and questions', async () => {
        const formRef = createRef<EventFormHandle>();
        const commitDirtyBaseline = jest.fn();
        const validatePendingStaffAssignments = jest.fn().mockResolvedValue(undefined);
        const eventData = buildEventData({
            pendingStaffInvites: [{
                firstName: ' Casey ',
                lastName: ' Ref ',
                email: ' CASEY@EXAMPLE.COM ',
                roles: ['OFFICIAL', 'OFFICIAL'],
            }],
        });
        const { result } = renderHook(() => useSubmissionHarness({
            commitDirtyBaseline,
            eventData,
            formRef,
            registrationQuestionDrafts: [
                VALID_QUESTION,
                { id: 'blank', prompt: '   ', answerType: 'TEXT', required: false, sortOrder: 1 },
            ],
            validatePendingStaffAssignments,
        }));

        expect(Object.keys(formRef.current!).sort()).toEqual([
            'applyCanonicalStaffState',
            'commitDirtyBaseline',
            'getDraft',
            'getRegistrationQuestionDrafts',
            'getValidationErrors',
            'validate',
            'validatePendingStaffAssignments',
        ]);
        expect(formRef.current?.getDraft()).toEqual(expect.objectContaining({
            $id: 'event_1',
            name: 'Summer Event',
            location: 'Previous Gym',
            pendingStaffInvites: [{
                firstName: 'Casey',
                lastName: 'Ref',
                email: 'casey@example.com',
                roles: ['OFFICIAL'],
            }],
        }));
        expect(mockedBuildEventDraft).toHaveBeenLastCalledWith(expect.objectContaining({
            previousEventFieldLocation: 'Previous Gym',
            source: result.current.formValues,
        }));
        expect(formRef.current?.getRegistrationQuestionDrafts()).toEqual([{
            id: VALID_QUESTION.id,
            prompt: 'Emergency contact',
            answerType: 'TEXT',
            required: true,
            sortOrder: 4,
        }]);

        formRef.current?.commitDirtyBaseline();
        await formRef.current?.validatePendingStaffAssignments();
        expect(commitDirtyBaseline).toHaveBeenCalledTimes(1);
        expect(validatePendingStaffAssignments).toHaveBeenCalledTimes(1);
    });

    it('deduplicates schema and React Hook Form failures for the imperative validation report', async () => {
        const warningSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const formRef = createRef<EventFormHandle>();
        const eventValidationSchema = {
            safeParse: jest.fn(() => ({
                success: false as const,
                error: {
                    issues: [{ code: 'custom', path: ['name'], message: 'Name required' }],
                },
            })),
        } as unknown as ReturnType<typeof buildEventFormSchema>;
        renderHook(() => useSubmissionHarness({
            errors: {
                name: { type: 'manual', message: 'Name required' },
                location: { type: 'manual', message: 'Location required' },
            },
            eventValidationSchema,
            formRef,
            trigger: jest.fn().mockResolvedValue(false),
        }));

        let valid = true;
        await act(async () => {
            valid = await formRef.current!.validate();
        });

        expect(valid).toBe(false);
        expect(formRef.current?.getValidationErrors()).toEqual([
            { path: 'name', message: 'Name required' },
            { path: 'location', message: 'Location required' },
        ]);
        expect(warningSpy).toHaveBeenCalledWith('Event form validation failed.', {
            errorCount: 2,
            errors: formRef.current?.getValidationErrors(),
        });
        warningSpy.mockRestore();
    });

    it('blocks insufficient official staffing and clears the report after a valid rerender', async () => {
        const warningSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const formRef = createRef<EventFormHandle>();
        const baseProps: HarnessProps = {
            eventData: buildEventData({ officialSchedulingMode: 'STAFFING' }),
            formRef,
            officialStaffingCoverageError: 'Two officials are required.',
            trigger: jest.fn().mockResolvedValue(true),
        };
        const { rerender } = renderHook(
            (props: HarnessProps) => useSubmissionHarness(props),
            { initialProps: baseProps },
        );

        await expect(formRef.current!.validate()).resolves.toBe(false);
        expect(formRef.current?.getValidationErrors()).toEqual([{
            path: 'officialSchedulingMode',
            message: 'Two officials are required.',
        }]);

        rerender({ ...baseProps, officialStaffingCoverageError: null });
        await expect(formRef.current!.validate()).resolves.toBe(true);
        expect(formRef.current?.getValidationErrors()).toEqual([]);
        warningSpy.mockRestore();
    });

    it('skips affiliate-only submission data and pending staff validation', async () => {
        const formRef = createRef<EventFormHandle>();
        const validatePendingStaffAssignments = jest.fn().mockResolvedValue(undefined);
        renderHook(() => useSubmissionHarness({
            eventData: buildEventData({
                pendingStaffInvites: [{
                    firstName: 'Casey',
                    lastName: 'Ref',
                    email: 'casey@example.com',
                    roles: ['OFFICIAL'],
                }],
            }),
            formRef,
            isAffiliateEvent: true,
            registrationQuestionDrafts: [VALID_QUESTION],
            validatePendingStaffAssignments,
        }));

        expect(formRef.current?.getDraft().pendingStaffInvites).toEqual([]);
        expect(formRef.current?.getRegistrationQuestionDrafts()).toEqual([]);
        await formRef.current?.validatePendingStaffAssignments();
        expect(validatePendingStaffAssignments).not.toHaveBeenCalled();
    });

    it('applies a detached canonical staff snapshot through React Hook Form', async () => {
        const formRef = createRef<EventFormHandle>();
        const { result } = renderHook(() => useSubmissionHarness({
            eventData: buildEventData({
                pendingStaffInvites: [{
                    firstName: 'Pending',
                    lastName: 'Official',
                    email: 'pending@example.com',
                    roles: ['OFFICIAL'],
                }],
            }),
            formRef,
        }));
        const snapshot = {
            contractVersion: 1,
            eventId: 'event_1',
            revision: 'revision_1',
            assistantHostIds: ['assistant_1'],
            officialPositions: [{ id: 'position_1', name: 'Referee', count: 1, order: 0 }],
            eventOfficials: [{
                id: 'event_official_1',
                userId: 'official_1',
                positionIds: ['position_1'],
                fieldIds: ['field_1'],
                isActive: true,
            }],
            officialIds: ['official_1'],
            staffInvites: [],
        } satisfies EventStaffSnapshot;

        act(() => formRef.current?.applyCanonicalStaffState(snapshot));
        await waitFor(() => expect(result.current.formValues.officialIds).toEqual(['official_1']));
        expect(result.current.formValues).toEqual(expect.objectContaining({
            assistantHostIds: ['assistant_1'],
            officialPositions: [expect.objectContaining({ id: 'position_1' })],
            eventOfficials: [expect.objectContaining({
                userId: 'official_1',
                positionIds: ['position_1'],
                fieldIds: ['field_1'],
            })],
            pendingStaffInvites: [],
        }));

        snapshot.assistantHostIds.push('assistant_2');
        snapshot.eventOfficials[0].positionIds.push('position_2');
        expect(result.current.formValues.assistantHostIds).toEqual(['assistant_1']);
        expect(result.current.formValues.eventOfficials[0].positionIds).toEqual(['position_1']);
    });
});
