import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import type {
    Dispatch,
    SetStateAction,
    UIEvent,
} from 'react';

import { createClientId } from '@/lib/clientId';
import {
    normalizeEntityId,
    sanitizeOrganizationEventAssignments,
} from '@/lib/organizationEventAccess';
import { userService } from '@/lib/userService';
import type {
    Event,
    EventOfficial,
    EventOfficialPosition,
    Field,
    Organization,
    Sport,
    StaffMemberType,
    UserData,
} from '@/types';

import { normalizeDirtyTrackedPendingStaffInvites } from '../dirtyDraft';
import type { EventFormValues } from '../formTypes';
import {
    buildAvailableOfficialFieldOptions,
    buildOfficialPositionsFromTemplates,
    buildOfficialStaffingCoverageError,
    countAssignedActiveOfficialsForStaffing,
    countRequiredOfficialSlotsPerMatch,
    getEventOfficialUserIds,
    normalizeEventOfficials,
    normalizeSportOfficialPositionTemplates,
} from '../officials';
import {
    buildAssignedHostCards,
    buildAssignedOfficialCards,
    buildAssignedStaffUserIds,
    buildAssignedUserIdsByRole,
    buildAssignedUserIdSetsByRole,
    buildAssistantHostValue,
    buildCurrentEventStaffInvites,
    buildExistingAssignedStaffUserIds,
    buildHostStaffUserIds,
    buildOrganizationOfficialsById,
    buildOrganizationStaffAssignmentIds,
    buildOrganizationStaffRosterEntries,
    buildOrganizationUsersById,
    buildStaffInviteByUserId,
    buildStaffInviteSubmissionPayload,
    buildUserDataById,
    createEmptyStaffInvite,
    filterOrganizationStaffRosterEntries,
    formatStaffRoleLabel,
    getUserEmail,
    mapInviteStaffTypeToRole,
    normalizeInviteEmail,
    normalizePendingStaffInvite,
    removePendingStaffInviteRoleByEmail,
    type PendingStaffInvite,
    type StaffAssignmentRole,
    type StaffRosterStatus,
} from '../staffInvites';
import { stringArraysEqual } from '../shared';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventFormGetValues = (name: string) => unknown;

type EventFormStateSetter<T> = (
    updater: SetStateAction<T>,
    options?: Record<string, unknown>,
) => void;

type UseStaffOfficialControllerParams = {
    eventData: EventFormValues;
    activeEditingEvent: Event | null;
    incomingEvent: Event | null | undefined;
    currentUser?: UserData | null;
    resolvedOrganization: Organization | null;
    isOrganizationHostedEvent: boolean;
    selectedSportForOfficials?: Sport | null;
    fields: Field[];
    selectedFieldIds: string[];
    setValue: EventFormSetValue;
    getValues: EventFormGetValues;
    setEventData: EventFormStateSetter<EventFormValues>;
    setPendingStaffInvites: EventFormStateSetter<PendingStaffInvite[]>;
};

const maybeExtendVisibleCountOnScroll = (
    event: UIEvent<HTMLDivElement>,
    total: number,
    setVisibleCount: Dispatch<SetStateAction<number>>,
) => {
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 24) {
        return;
    }
    setVisibleCount((prev) => (
        prev >= total ? prev : Math.min(prev + 5, total)
    ));
};

export const useStaffOfficialController = ({
    eventData,
    activeEditingEvent,
    incomingEvent,
    currentUser,
    resolvedOrganization,
    isOrganizationHostedEvent,
    selectedSportForOfficials,
    fields,
    selectedFieldIds,
    setValue,
    getValues,
    setEventData,
    setPendingStaffInvites,
}: UseStaffOfficialControllerParams) => {
    const [assistantHostUsers, setAssistantHostUsers] = useState<UserData[]>([]);
    const [staffInviteError, setStaffInviteError] = useState<string | null>(null);
    const [organizationStaffSearch, setOrganizationStaffSearch] = useState('');
    const [organizationStaffTypeFilter, setOrganizationStaffTypeFilter] = useState<'all' | StaffMemberType>('all');
    const [organizationStaffStatusFilter, setOrganizationStaffStatusFilter] = useState<'all' | StaffRosterStatus>('all');
    const [nonOrgStaffSearch, setNonOrgStaffSearch] = useState('');
    const [nonOrgStaffResults, setNonOrgStaffResults] = useState<UserData[]>([]);
    const [nonOrgStaffSearchLoading, setNonOrgStaffSearchLoading] = useState(false);
    const [nonOrgStaffError, setNonOrgStaffError] = useState<string | null>(null);
    const [newStaffInvite, setNewStaffInvite] = useState<PendingStaffInvite>(createEmptyStaffInvite());
    const [organizationStaffVisibleCount, setOrganizationStaffVisibleCount] = useState(5);
    const [officialCardVisibleCount, setOfficialCardVisibleCount] = useState(5);
    const [hostCardVisibleCount, setHostCardVisibleCount] = useState(5);

    const organizationStaffAssignmentIds = useMemo(
        () => buildOrganizationStaffAssignmentIds(resolvedOrganization),
        [resolvedOrganization],
    );
    const organizationAllowedHostIds = useMemo(
        () => organizationStaffAssignmentIds.hostUserIds,
        [organizationStaffAssignmentIds],
    );
    const organizationAllowedHostIdSet = useMemo(
        () => new Set(organizationAllowedHostIds),
        [organizationAllowedHostIds],
    );
    const organizationAllowedOfficialIds = useMemo(
        () => organizationStaffAssignmentIds.officialUserIds,
        [organizationStaffAssignmentIds],
    );
    const organizationAllowedOfficialIdSet = useMemo(
        () => new Set(organizationAllowedOfficialIds),
        [organizationAllowedOfficialIds],
    );
    const organizationUsersById = useMemo(() => buildOrganizationUsersById({
        owner: resolvedOrganization?.owner,
        hosts: resolvedOrganization?.hosts,
        currentUser,
    }), [currentUser, resolvedOrganization?.hosts, resolvedOrganization?.owner]);
    const organizationOfficialsById = useMemo(() => buildOrganizationOfficialsById({
        organizationOfficials: resolvedOrganization?.officials,
        eventOfficials: eventData.officials,
        allowedOfficialIds: organizationAllowedOfficialIdSet,
    }), [eventData.officials, resolvedOrganization?.officials, organizationAllowedOfficialIdSet]);
    const assistantHostValue = useMemo(
        () => buildAssistantHostValue(eventData.assistantHostIds, eventData.hostId),
        [eventData.assistantHostIds, eventData.hostId],
    );
    const hostStaffUserIds = useMemo(
        () => buildHostStaffUserIds(eventData.hostId, assistantHostValue),
        [assistantHostValue, eventData.hostId],
    );
    const assistantHostUsersById = useMemo(
        () => buildUserDataById(assistantHostUsers),
        [assistantHostUsers],
    );
    const currentEventStaffInvites = useMemo(
        () => buildCurrentEventStaffInvites({
            activeStaffInvites: activeEditingEvent?.staffInvites,
            incomingStaffInvites: incomingEvent?.staffInvites,
            eventId: activeEditingEvent?.$id ?? incomingEvent?.$id,
        }),
        [activeEditingEvent?.$id, activeEditingEvent?.staffInvites, incomingEvent?.$id, incomingEvent?.staffInvites],
    );
    const currentEventStaffInviteByUserId = useMemo(
        () => buildStaffInviteByUserId(currentEventStaffInvites),
        [currentEventStaffInvites],
    );
    const existingAssignedStaffUserIds = useMemo(() => {
        const source = activeEditingEvent ?? incomingEvent;
        return buildExistingAssignedStaffUserIds({
            preferredOfficialIds: getEventOfficialUserIds(source?.eventOfficials),
            fallbackOfficialIds: source?.officialIds,
            assistantHostIds: source?.assistantHostIds,
        });
    }, [activeEditingEvent, incomingEvent]);
    const organizationStaffRosterEntries = useMemo(
        () => buildOrganizationStaffRosterEntries(resolvedOrganization),
        [resolvedOrganization],
    );
    const filteredOrganizationStaffEntries = useMemo(
        () => filterOrganizationStaffRosterEntries(organizationStaffRosterEntries, {
            search: organizationStaffSearch,
            statusFilter: organizationStaffStatusFilter,
            typeFilter: organizationStaffTypeFilter,
        }),
        [
            organizationStaffRosterEntries,
            organizationStaffSearch,
            organizationStaffStatusFilter,
            organizationStaffTypeFilter,
        ],
    );

    useEffect(() => {
        if (!isOrganizationHostedEvent) {
            return;
        }
        const sanitized = sanitizeOrganizationEventAssignments(
            {
                hostId: eventData.hostId,
                assistantHostIds: eventData.assistantHostIds || [],
                officialIds: [],
            },
            {
                ownerId: resolvedOrganization?.ownerId,
                staffMembers: resolvedOrganization?.staffMembers,
                staffInvites: resolvedOrganization?.staffInvites,
            },
        );
        const normalizedCurrentHostId = normalizeEntityId(eventData.hostId) ?? null;
        const normalizedCurrentAssistantHostIds = Array.from(
            new Set(
                (eventData.assistantHostIds || [])
                    .map((id) => normalizeEntityId(id))
                    .filter((id): id is string => Boolean(id) && id !== normalizedCurrentHostId),
            ),
        );
        const nextHostId = sanitized.hostId;
        if (
            normalizedCurrentHostId === nextHostId
            && stringArraysEqual(normalizedCurrentAssistantHostIds, sanitized.assistantHostIds)
        ) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: nextHostId ?? prev.hostId,
            assistantHostIds: sanitized.assistantHostIds,
        }), { shouldDirty: false });
    }, [
        eventData.assistantHostIds,
        eventData.hostId,
        isOrganizationHostedEvent,
        resolvedOrganization?.ownerId,
        resolvedOrganization?.staffInvites,
        resolvedOrganization?.staffMembers,
        setEventData,
    ]);

    useEffect(() => {
        if (!isOrganizationHostedEvent) {
            return;
        }
        const nextEventOfficials = normalizeEventOfficials(
            (eventData.eventOfficials || []).filter((official) => organizationAllowedOfficialIdSet.has(official.userId)),
            [],
            eventData.officialPositions || [],
        );
        const nextOfficialIds = getEventOfficialUserIds(nextEventOfficials);
        const nextOfficials = nextOfficialIds
            .map((id) => organizationOfficialsById.get(id))
            .filter((candidate): candidate is UserData => Boolean(candidate));
        if (
            stringArraysEqual((eventData.officialIds || []).map((id) => String(id)).filter(Boolean), nextOfficialIds)
            && JSON.stringify(eventData.eventOfficials || []) === JSON.stringify(nextEventOfficials)
            && stringArraysEqual(
                (eventData.officials || []).map((official) => official?.$id).filter((id): id is string => Boolean(id)),
                nextOfficials.map((official) => official.$id),
            )
        ) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            officialIds: nextOfficialIds,
            eventOfficials: nextEventOfficials,
            officials: nextOfficials,
        }), { shouldDirty: false });
    }, [
        eventData.eventOfficials,
        eventData.officialPositions,
        eventData.officialIds,
        eventData.officials,
        isOrganizationHostedEvent,
        organizationAllowedOfficialIdSet,
        organizationOfficialsById,
        setEventData,
    ]);

    useEffect(() => {
        if (!hostStaffUserIds.length) {
            setAssistantHostUsers((prev) => (prev.length > 0 ? [] : prev));
            return;
        }
        const knownIds = new Set([
            ...assistantHostUsers.map((userEntry) => userEntry.$id).filter(Boolean),
            ...organizationUsersById.keys(),
        ]);
        const missingIds = hostStaffUserIds.filter((id) => !knownIds.has(id));
        if (!missingIds.length) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const fetched = await userService.getUsersByIds(missingIds);
                if (cancelled || !fetched.length) {
                    return;
                }
                setAssistantHostUsers((prev) => {
                    const byId = new Map(prev.map((entry) => [entry.$id, entry]));
                    fetched.forEach((entry) => {
                        if (entry?.$id) {
                            byId.set(entry.$id, entry);
                        }
                    });
                    return hostStaffUserIds
                        .map((id) => byId.get(id))
                        .filter((entry): entry is UserData => Boolean(entry));
                });
            } catch (error) {
                console.warn('Failed to hydrate host staff for event:', error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [assistantHostUsers, hostStaffUserIds, organizationUsersById]);

    useEffect(() => {
        if (isOrganizationHostedEvent) {
            setNonOrgStaffResults([]);
            setNonOrgStaffError(null);
            return;
        }
        const query = nonOrgStaffSearch.trim();
        if (query.length < 2) {
            setNonOrgStaffResults([]);
            setNonOrgStaffError(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setNonOrgStaffSearchLoading(true);
                setNonOrgStaffError(null);
                const results = await userService.searchUsers(query);
                if (!cancelled) {
                    setNonOrgStaffResults(results.filter((candidate) => Boolean(candidate?.$id)));
                }
            } catch (error) {
                console.error('Failed to search staff:', error);
                if (!cancelled) {
                    setNonOrgStaffError('Failed to search staff. Try again.');
                }
            } finally {
                if (!cancelled) {
                    setNonOrgStaffSearchLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOrganizationHostedEvent, nonOrgStaffSearch]);

    const handleHostChange = useCallback((value: string | null) => {
        if (!value) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(value)) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: value,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== value),
        }));
    }, [isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);

    const cacheAssistantHostUser = useCallback((assistantHost?: UserData | null) => {
        if (!assistantHost?.$id) {
            return;
        }
        setAssistantHostUsers((prev) => {
            if (prev.some((candidate) => candidate.$id === assistantHost.$id)) {
                return prev;
            }
            return [...prev, assistantHost];
        });
    }, []);

    const handleAddAssistantHost = useCallback((assistantHost: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const assistantHostId = normalizeEntityId(assistantHost.$id ?? assistantHost.userId);
        if (!assistantHostId) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(assistantHostId)) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            assistantHostIds: Array.from(
                new Set(
                    [...(prev.assistantHostIds || []), assistantHostId]
                        .map((id) => String(id).trim())
                        .filter((id) => id.length > 0 && id !== prev.hostId),
                ),
            ),
        }));
        cacheAssistantHostUser(assistantHost.$id ? (assistantHost as UserData) : null);
    }, [cacheAssistantHostUser, isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);

    const handleRemoveAssistantHost = useCallback((assistantHostId: string) => {
        setEventData((prev) => ({
            ...prev,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== assistantHostId),
        }));
    }, [setEventData]);

    const sportOfficialPositionTemplates = useMemo(
        () => normalizeSportOfficialPositionTemplates(selectedSportForOfficials?.officialPositionTemplates),
        [selectedSportForOfficials],
    );
    const availableOfficialFieldOptions = useMemo(
        () => buildAvailableOfficialFieldOptions(fields, selectedFieldIds),
        [fields, selectedFieldIds],
    );
    const eventOfficialByUserId = useMemo(
        () => new Map((eventData.eventOfficials || []).map((official) => [official.userId, official] as const)),
        [eventData.eventOfficials],
    );

    useEffect(() => {
        const normalized = normalizeEventOfficials(
            eventData.eventOfficials,
            Array.isArray(eventData.eventOfficials) ? [] : eventData.officialIds || [],
            eventData.officialPositions || [],
        );
        const normalizedOfficialIds = getEventOfficialUserIds(normalized);
        if (
            JSON.stringify(eventData.eventOfficials || []) === JSON.stringify(normalized)
            && stringArraysEqual((eventData.officialIds || []).map((id) => String(id)).filter(Boolean), normalizedOfficialIds)
        ) {
            return;
        }
        setValue('eventOfficials', normalized, { shouldDirty: false, shouldValidate: false });
        setValue('officialIds', normalizedOfficialIds, { shouldDirty: false, shouldValidate: false });
    }, [eventData.eventOfficials, eventData.officialIds, eventData.officialPositions, setValue]);

    const handleResetOfficialPositionsFromSport = useCallback(() => {
        const nextPositions = buildOfficialPositionsFromTemplates(sportOfficialPositionTemplates);
        setEventData((prev) => ({
            ...prev,
            officialPositions: nextPositions,
            eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
            officialIds: getEventOfficialUserIds(prev.eventOfficials),
        }));
    }, [setEventData, sportOfficialPositionTemplates]);

    const handleAddOfficialPosition = useCallback(() => {
        setEventData((prev) => {
            const nextPositions = [
                ...(prev.officialPositions || []),
                {
                    id: createClientId(),
                    name: '',
                    count: 1,
                    order: (prev.officialPositions || []).length,
                } satisfies EventOfficialPosition,
            ];
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateOfficialPosition = useCallback((
        positionId: string,
        updates: Partial<Pick<EventOfficialPosition, 'name' | 'count'>>,
    ) => {
        setEventData((prev) => {
            const nextPositions = (prev.officialPositions || []).map((position, index) => (
                position.id === positionId
                    ? {
                        ...position,
                        name: updates.name ?? position.name,
                        count: updates.count !== undefined
                            ? Math.max(1, Math.trunc(updates.count || 1))
                            : position.count,
                        order: index,
                    }
                    : { ...position, order: index }
            ));
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleRemoveOfficialPosition = useCallback((positionId: string) => {
        setEventData((prev) => {
            const nextPositions = (prev.officialPositions || [])
                .filter((position) => position.id !== positionId)
                .map((position, index) => ({ ...position, order: index }));
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateEventOfficialEligibility = useCallback((
        userId: string,
        updates: Partial<Pick<EventOfficial, 'positionIds' | 'fieldIds'>>,
    ) => {
        setEventData((prev) => {
            const nextPositions = prev.officialPositions || [];
            const nextOfficials = normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions).map((official) => {
                if (official.userId !== userId) {
                    return official;
                }
                return {
                    ...official,
                    positionIds: updates.positionIds !== undefined
                        ? Array.from(new Set(updates.positionIds.filter(Boolean)))
                        : official.positionIds,
                    fieldIds: updates.fieldIds !== undefined
                        ? Array.from(new Set(updates.fieldIds.filter(Boolean)))
                        : official.fieldIds,
                };
            });
            return {
                ...prev,
                eventOfficials: normalizeEventOfficials(nextOfficials, getEventOfficialUserIds(nextOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(nextOfficials),
            };
        });
    }, [setEventData]);

    const handleAddOfficial = useCallback((official: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const officialId = normalizeEntityId(official.$id ?? official.userId);
        if (!officialId) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedOfficialIdSet.has(officialId)) {
            return;
        }
        setEventData((prev) => {
            const nextPositions = prev.officialPositions || [];
            const existingOfficials = normalizeEventOfficials(
                prev.eventOfficials,
                getEventOfficialUserIds(prev.eventOfficials),
                nextPositions,
            );
            const nextEventOfficials = normalizeEventOfficials(
                existingOfficials.some((entry) => entry.userId === officialId)
                    ? existingOfficials
                    : [
                        ...existingOfficials,
                        {
                            id: createClientId(),
                            userId: officialId,
                            positionIds: nextPositions.map((position) => position.id),
                            fieldIds: [],
                            isActive: true,
                        } satisfies EventOfficial,
                    ],
                [],
                nextPositions,
            );
            const nextIds = getEventOfficialUserIds(nextEventOfficials);
            const nextRefs = official.$id && !(prev.officials || []).some((ref) => ref.$id === official.$id)
                ? [...(prev.officials || []), official as UserData]
                : prev.officials || [];
            return {
                ...prev,
                officialIds: nextIds,
                eventOfficials: nextEventOfficials,
                officials: nextRefs,
            };
        });
    }, [isOrganizationHostedEvent, organizationAllowedOfficialIdSet, setEventData]);

    const handleRemoveOfficial = useCallback((officialId: string) => {
        setEventData((prev) => ({
            ...prev,
            eventOfficials: normalizeEventOfficials(
                (prev.eventOfficials || []).filter((official) => official.userId !== officialId),
                [],
                prev.officialPositions || [],
            ),
            officialIds: getEventOfficialUserIds(
                (prev.eventOfficials || []).filter((official) => official.userId !== officialId),
            ),
            officials: (prev.officials || []).filter((ref) => ref.$id !== officialId),
        }));
    }, [setEventData]);

    const assignedUserIdsByRole = useMemo(
        () => buildAssignedUserIdsByRole({
            officialIds: getEventOfficialUserIds(eventData.eventOfficials),
            hostId: eventData.hostId,
            assistantHostIds: assistantHostValue,
        }),
        [assistantHostValue, eventData.eventOfficials, eventData.hostId],
    );
    const assignedUserIdSetByRole = useMemo(
        () => buildAssignedUserIdSetsByRole(assignedUserIdsByRole),
        [assignedUserIdsByRole],
    );
    const assignedStaffUserIds = useMemo(
        () => buildAssignedStaffUserIds(assignedUserIdsByRole),
        [assignedUserIdsByRole],
    );
    const requiredOfficialSlotsPerMatch = useMemo(
        () => countRequiredOfficialSlotsPerMatch(eventData.officialPositions),
        [eventData.officialPositions],
    );
    const assignedActiveOfficialsForStaffing = useMemo(
        () => countAssignedActiveOfficialsForStaffing(eventData.eventOfficials, eventData.officialPositions),
        [eventData.eventOfficials, eventData.officialPositions],
    );
    const officialStaffingCoverageError = useMemo(
        () => buildOfficialStaffingCoverageError({
            mode: eventData.officialSchedulingMode,
            requiredOfficialSlotsPerMatch,
            assignedActiveOfficialsForStaffing,
        }),
        [assignedActiveOfficialsForStaffing, eventData.officialSchedulingMode, requiredOfficialSlotsPerMatch],
    );

    const lookupPendingStaffInviteMembership = useCallback(async (pendingInvites: PendingStaffInvite[]) => {
        const pendingEmails = Array.from(new Set(
            pendingInvites
                .map((invite) => normalizeInviteEmail(invite.email))
                .filter((email) => email.length > 0),
        ));
        if (!pendingEmails.length || !assignedStaffUserIds.length) {
            return new Map<string, Set<string>>();
        }

        const eventId = normalizeEntityId(activeEditingEvent?.$id);
        const matches = await userService.lookupEmailMembership(
            pendingEmails,
            assignedStaffUserIds,
            eventId ? { eventId } : undefined,
        );
        const membershipByEmail = new Map<string, Set<string>>();
        matches.forEach((match) => {
            const email = normalizeInviteEmail(match.email);
            const userId = normalizeEntityId(match.userId);
            if (!email || !userId) {
                return;
            }
            const matchedUserIds = membershipByEmail.get(email) ?? new Set<string>();
            matchedUserIds.add(userId);
            membershipByEmail.set(email, matchedUserIds);
        });
        return membershipByEmail;
    }, [activeEditingEvent?.$id, assignedStaffUserIds]);

    const findPendingStaffInviteConflictMessage = useCallback((
        pendingInvites: PendingStaffInvite[],
        membershipByEmail: Map<string, Set<string>>,
    ): string | null => {
        for (const invite of pendingInvites) {
            const matchedUserIds = membershipByEmail.get(invite.email);
            if (!matchedUserIds || matchedUserIds.size === 0) {
                continue;
            }
            for (const role of invite.roles) {
                if (Array.from(matchedUserIds).some((userId) => assignedUserIdSetByRole[role].has(userId))) {
                    return `${invite.email} is already added as ${formatStaffRoleLabel(role).toLowerCase()} for this event.`;
                }
            }
        }
        return null;
    }, [assignedUserIdSetByRole]);

    const validatePendingStaffInvites = useCallback(async (pendingInvitesInput: PendingStaffInvite[]) => {
        if (isOrganizationHostedEvent) {
            setStaffInviteError(null);
            return new Map<string, Set<string>>();
        }

        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(pendingInvitesInput);
        for (const invite of pendingInvites) {
            if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email) || invite.roles.length === 0) {
                const message = 'Enter first name, last name, valid email, and at least one role for every email invite before saving.';
                setStaffInviteError(message);
                throw new Error(message);
            }
        }

        const membershipByEmail = await lookupPendingStaffInviteMembership(pendingInvites);
        const conflictMessage = findPendingStaffInviteConflictMessage(pendingInvites, membershipByEmail);
        if (conflictMessage) {
            setStaffInviteError(conflictMessage);
            throw new Error(conflictMessage);
        }

        setStaffInviteError(null);
        return membershipByEmail;
    }, [findPendingStaffInviteConflictMessage, isOrganizationHostedEvent, lookupPendingStaffInviteMembership]);

    const validatePendingStaffAssignments = useCallback(async () => {
        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(
            (getValues('pendingStaffInvites') as PendingStaffInvite[] | undefined) ?? [],
        );
        await validatePendingStaffInvites(pendingInvites);
    }, [getValues, validatePendingStaffInvites]);

    const handleInviteFieldChange = useCallback((field: 'firstName' | 'lastName' | 'email', value: string) => {
        setNewStaffInvite((prev) => ({ ...prev, [field]: value }));
    }, []);

    const handleInviteRoleToggle = useCallback((role: StaffAssignmentRole) => {
        setNewStaffInvite((prev) => ({
            ...prev,
            roles: prev.roles.includes(role)
                ? prev.roles.filter((existingRole) => existingRole !== role)
                : [...prev.roles, role],
        }));
    }, []);

    const handleStagePendingStaffInvite = useCallback(async () => {
        if (isOrganizationHostedEvent) {
            return;
        }

        const nextInvite = normalizePendingStaffInvite(newStaffInvite);
        if (!nextInvite.firstName || !nextInvite.lastName || !EMAIL_REGEX.test(nextInvite.email) || nextInvite.roles.length === 0) {
            setStaffInviteError('Enter first name, last name, valid email, and at least one role before adding an email invite.');
            return;
        }

        const membershipByEmail = await lookupPendingStaffInviteMembership([nextInvite]);
        const conflictMessage = findPendingStaffInviteConflictMessage([nextInvite], membershipByEmail);
        if (conflictMessage) {
            setStaffInviteError(conflictMessage);
            return;
        }

        setPendingStaffInvites((prev) => {
            const existingIndex = prev.findIndex((invite) => normalizeInviteEmail(invite.email) === nextInvite.email);
            if (existingIndex === -1) {
                return [...prev, nextInvite];
            }
            const updated = [...prev];
            updated[existingIndex] = normalizePendingStaffInvite({
                ...updated[existingIndex],
                firstName: nextInvite.firstName,
                lastName: nextInvite.lastName,
                email: nextInvite.email,
                roles: [...updated[existingIndex].roles, ...nextInvite.roles],
            });
            return updated;
        });
        setNewStaffInvite(createEmptyStaffInvite());
        setStaffInviteError(null);
    }, [findPendingStaffInviteConflictMessage, isOrganizationHostedEvent, lookupPendingStaffInviteMembership, newStaffInvite, setPendingStaffInvites]);

    const submitPendingStaffInvites = useCallback(async (eventId: string) => {
        if (isOrganizationHostedEvent) {
            return;
        }
        if (!currentUser?.$id) {
            const message = 'You must be signed in to manage staff invites.';
            setStaffInviteError(message);
            throw new Error(message);
        }

        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(
            (getValues('pendingStaffInvites') as PendingStaffInvite[] | undefined) ?? [],
        );
        const pendingInviteMembershipByEmail = await validatePendingStaffInvites(pendingInvites);
        const {
            payload,
            unresolvedEmailInvites,
        } = buildStaffInviteSubmissionPayload({
            eventId,
            officialIds: getEventOfficialUserIds(eventData.eventOfficials),
            assistantHostIds: assistantHostValue,
            pendingInvites,
            pendingInviteMembershipByEmail,
            currentEventStaffInviteByUserId,
            existingAssignedStaffUserIds,
        });

        const result = payload.length > 0
            ? await userService.inviteUsersByEmail(currentUser.$id, payload)
            : { sent: [], not_sent: [], failed: [] };
        if ((result.failed || []).length > 0) {
            const message = 'Failed to create one or more staff invites.';
            setStaffInviteError(message);
            throw new Error(message);
        }

        const resolvedUserIds = new Set<string>();
        const inviteRolesByEmail = new Map(unresolvedEmailInvites.map((invite) => [invite.email, invite.roles] as const));
        const fetchedInvites = [...(result.sent || []), ...(result.not_sent || [])];
        fetchedInvites.forEach((invite) => {
            if (invite.userId) {
                resolvedUserIds.add(invite.userId);
            }
        });

        if (resolvedUserIds.size > 0) {
            try {
                const fetchedUsers = await userService.getUsersByIds(Array.from(resolvedUserIds));
                setEventData((prev) => {
                    const nextPositions = prev.officialPositions || [];
                    let nextEventOfficials = normalizeEventOfficials(
                        prev.eventOfficials,
                        getEventOfficialUserIds(prev.eventOfficials),
                        nextPositions,
                    );
                    const nextAssistantHostIds = new Set(prev.assistantHostIds || []);
                    const nextOfficials = [...(prev.officials || [])];
                    fetchedUsers.forEach((userEntry) => {
                        const matchingInvite = fetchedInvites.find((invite) => invite.userId === userEntry.$id || normalizeInviteEmail(invite.email) === getUserEmail(userEntry));
                        const roles = matchingInvite
                            ? (matchingInvite.staffTypes || [])
                                .map(mapInviteStaffTypeToRole)
                                .filter((role): role is StaffAssignmentRole => Boolean(role))
                            : inviteRolesByEmail.get(getUserEmail(userEntry) ?? '') || [];
                        if (roles.includes('OFFICIAL')) {
                            nextEventOfficials = normalizeEventOfficials(
                                nextEventOfficials.some((official) => official.userId === userEntry.$id)
                                    ? nextEventOfficials
                                    : [
                                        ...nextEventOfficials,
                                        {
                                            id: createClientId(),
                                            userId: userEntry.$id,
                                            positionIds: nextPositions.map((position) => position.id),
                                            fieldIds: [],
                                            isActive: true,
                                        } satisfies EventOfficial,
                                    ],
                                [],
                                nextPositions,
                            );
                            if (!nextOfficials.some((official) => official.$id === userEntry.$id)) {
                                nextOfficials.push(userEntry);
                            }
                        }
                        if (roles.includes('ASSISTANT_HOST') && userEntry.$id !== prev.hostId) {
                            nextAssistantHostIds.add(userEntry.$id);
                            cacheAssistantHostUser(userEntry);
                        }
                    });
                    return {
                        ...prev,
                        officials: nextOfficials,
                        eventOfficials: nextEventOfficials,
                        officialIds: getEventOfficialUserIds(nextEventOfficials),
                        assistantHostIds: Array.from(nextAssistantHostIds),
                    };
                });
            } catch (error) {
                console.warn('Failed to hydrate staff invite users:', error);
            }
        }

        const finalTargetUserIds = new Set<string>([
            ...getEventOfficialUserIds(eventData.eventOfficials),
            ...assistantHostValue,
            ...Array.from(resolvedUserIds),
        ]);
        const invitesToDelete = currentEventStaffInvites.filter((invite) => invite.userId && !finalTargetUserIds.has(invite.userId));
        if (invitesToDelete.length > 0) {
            const inviteIdsToDelete = invitesToDelete
                .map((invite) => normalizeEntityId(invite.$id))
                .filter((inviteId): inviteId is string => Boolean(inviteId));
            await Promise.all(inviteIdsToDelete.map((inviteId) => userService.deleteInviteById(inviteId)));
        }

        setPendingStaffInvites([]);
        setStaffInviteError(null);
    }, [
        assistantHostValue,
        cacheAssistantHostUser,
        currentEventStaffInvites,
        currentUser,
        eventData.eventOfficials,
        getValues,
        isOrganizationHostedEvent,
        setEventData,
        setPendingStaffInvites,
        validatePendingStaffInvites,
        existingAssignedStaffUserIds,
        currentEventStaffInviteByUserId,
    ]);

    const assignedOfficialCards = useMemo(
        () => buildAssignedOfficialCards({
            officialIds: getEventOfficialUserIds(eventData.eventOfficials),
            assignedOfficials: eventData.officials || [],
            organizationOfficialsById,
            nonOrgStaffResults,
            currentEventStaffInviteByUserId,
            pendingStaffInvites: eventData.pendingStaffInvites || [],
        }),
        [currentEventStaffInviteByUserId, eventData.eventOfficials, eventData.pendingStaffInvites, eventData.officials, nonOrgStaffResults, organizationOfficialsById],
    );
    const assignedHostCards = useMemo(
        () => buildAssignedHostCards({
            hostId: eventData.hostId,
            assistantHostIds: assistantHostValue,
            assistantHostUsersById,
            organizationUsersById,
            currentEventStaffInviteByUserId,
            pendingStaffInvites: eventData.pendingStaffInvites || [],
        }),
        [assistantHostUsersById, assistantHostValue, currentEventStaffInviteByUserId, eventData.hostId, eventData.pendingStaffInvites, organizationUsersById],
    );

    useEffect(() => {
        setOrganizationStaffVisibleCount(5);
    }, [filteredOrganizationStaffEntries.length, organizationStaffSearch, organizationStaffStatusFilter, organizationStaffTypeFilter]);
    useEffect(() => {
        setOfficialCardVisibleCount(5);
    }, [assignedOfficialCards.length]);
    useEffect(() => {
        setHostCardVisibleCount(5);
    }, [assignedHostCards.length]);

    const handleOrganizationStaffScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        maybeExtendVisibleCountOnScroll(event, filteredOrganizationStaffEntries.length, setOrganizationStaffVisibleCount);
    }, [filteredOrganizationStaffEntries.length]);

    const handleAssignedOfficialsScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        maybeExtendVisibleCountOnScroll(event, assignedOfficialCards.length, setOfficialCardVisibleCount);
    }, [assignedOfficialCards.length]);

    const handleAssignedHostsScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        maybeExtendVisibleCountOnScroll(event, assignedHostCards.length, setHostCardVisibleCount);
    }, [assignedHostCards.length]);

    const handleRemovePendingStaffInviteRole = useCallback((email: string, role: StaffAssignmentRole) => {
        setPendingStaffInvites((prev) => removePendingStaffInviteRoleByEmail(prev, email, role));
    }, [setPendingStaffInvites]);

    return {
        assignedActiveOfficialsForStaffing,
        assignedHostCards,
        assignedOfficialCards,
        assignedUserIdSetByRole,
        assistantHostValue,
        availableOfficialFieldOptions,
        eventOfficialByUserId,
        filteredOrganizationStaffEntries,
        handleAddAssistantHost,
        handleAddOfficial,
        handleAddOfficialPosition,
        handleAssignedHostsScroll,
        handleAssignedOfficialsScroll,
        handleHostChange,
        handleInviteFieldChange,
        handleInviteRoleToggle,
        handleOrganizationStaffScroll,
        handleRemoveAssistantHost,
        handleRemoveOfficial,
        handleRemoveOfficialPosition,
        handleRemovePendingStaffInviteRole,
        handleResetOfficialPositionsFromSport,
        handleStagePendingStaffInvite,
        handleUpdateEventOfficialEligibility,
        handleUpdateOfficialPosition,
        hostCardVisibleCount,
        newStaffInvite,
        nonOrgStaffError,
        nonOrgStaffResults,
        nonOrgStaffSearch,
        nonOrgStaffSearchLoading,
        officialCardVisibleCount,
        officialStaffingCoverageError,
        organizationAllowedHostIds,
        organizationAllowedOfficialIds,
        organizationOfficialsById,
        organizationStaffSearch,
        organizationStaffStatusFilter,
        organizationStaffTypeFilter,
        organizationStaffVisibleCount,
        requiredOfficialSlotsPerMatch,
        setNonOrgStaffSearch,
        setOrganizationStaffSearch,
        setOrganizationStaffStatusFilter,
        setOrganizationStaffTypeFilter,
        sportOfficialPositionTemplates,
        staffInviteError,
        submitPendingStaffInvites,
        validatePendingStaffAssignments,
    };
};
