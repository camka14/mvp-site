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

import {
    normalizeEntityId,
    sanitizeOrganizationEventAssignments,
} from '@/lib/organizationEventAccess';
import { userService } from '@/lib/userService';
import type {
    StaffMemberType,
    UserData,
} from '@/types';

import { getEventOfficialUserIds } from '../officials';
import {
    buildAssignedHostCards,
    buildAssignedOfficialCards,
    buildAssignedUserIdsByRole,
    buildAssignedUserIdSetsByRole,
    buildAssistantHostValue,
    buildCurrentEventStaffInvites,
    buildHostStaffUserIds,
    buildOrganizationOfficialsById,
    buildOrganizationStaffAssignmentIds,
    buildOrganizationStaffRosterEntries,
    buildOrganizationUsersById,
    buildStaffInviteByUserId,
    buildUserDataById,
    filterOrganizationStaffRosterEntries,
    type StaffRosterStatus,
} from '../staffInvites';
import { stringArraysEqual } from '../shared';
import type { UseStaffOfficialControllerParams } from './staffOfficialControllerTypes';

type UseStaffRosterControllerParams = Pick<
    UseStaffOfficialControllerParams,
    | 'activeEditingEvent'
    | 'currentUser'
    | 'eventData'
    | 'incomingEvent'
    | 'isOrganizationHostedEvent'
    | 'resolvedOrganization'
    | 'setEventData'
>;

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
    setVisibleCount((previous) => (
        previous >= total ? previous : Math.min(previous + 5, total)
    ));
};

export const useStaffRosterController = ({
    activeEditingEvent,
    currentUser,
    eventData,
    incomingEvent,
    isOrganizationHostedEvent,
    resolvedOrganization,
    setEventData,
}: UseStaffRosterControllerParams) => {
    const [assistantHostUsers, setAssistantHostUsers] = useState<UserData[]>([]);
    const [organizationStaffSearch, setOrganizationStaffSearch] = useState('');
    const [organizationStaffTypeFilter, setOrganizationStaffTypeFilter] = useState<'all' | StaffMemberType>('all');
    const [organizationStaffStatusFilter, setOrganizationStaffStatusFilter] = useState<'all' | StaffRosterStatus>('all');
    const [nonOrgStaffSearch, setNonOrgStaffSearch] = useState('');
    const [nonOrgStaffResults, setNonOrgStaffResults] = useState<UserData[]>([]);
    const [nonOrgStaffSearchLoading, setNonOrgStaffSearchLoading] = useState(false);
    const [nonOrgStaffError, setNonOrgStaffError] = useState<string | null>(null);
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
        if (
            normalizedCurrentHostId === sanitized.hostId
            && stringArraysEqual(normalizedCurrentAssistantHostIds, sanitized.assistantHostIds)
        ) {
            return;
        }
        setEventData((previous) => ({
            ...previous,
            hostId: sanitized.hostId ?? previous.hostId,
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
        if (!hostStaffUserIds.length) {
            setAssistantHostUsers((previous) => (previous.length > 0 ? [] : previous));
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
                setAssistantHostUsers((previous) => {
                    const byId = new Map(previous.map((entry) => [entry.$id, entry]));
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
        if (!value || (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(value))) {
            return;
        }
        setEventData((previous) => ({
            ...previous,
            hostId: value,
            assistantHostIds: (previous.assistantHostIds || []).filter((id) => id !== value),
        }));
    }, [isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);

    const cacheAssistantHostUser = useCallback((assistantHost?: UserData | null) => {
        if (!assistantHost?.$id) {
            return;
        }
        setAssistantHostUsers((previous) => (
            previous.some((candidate) => candidate.$id === assistantHost.$id)
                ? previous
                : [...previous, assistantHost]
        ));
    }, []);

    const handleAddAssistantHost = useCallback((assistantHost: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const assistantHostId = normalizeEntityId(assistantHost.$id ?? assistantHost.userId);
        if (!assistantHostId || (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(assistantHostId))) {
            return;
        }
        setEventData((previous) => ({
            ...previous,
            assistantHostIds: Array.from(
                new Set(
                    [...(previous.assistantHostIds || []), assistantHostId]
                        .map((id) => String(id).trim())
                        .filter((id) => id.length > 0 && id !== previous.hostId),
                ),
            ),
        }));
        cacheAssistantHostUser(assistantHost.$id ? (assistantHost as UserData) : null);
    }, [cacheAssistantHostUser, isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);

    const handleRemoveAssistantHost = useCallback((assistantHostId: string) => {
        setEventData((previous) => ({
            ...previous,
            assistantHostIds: (previous.assistantHostIds || []).filter((id) => id !== assistantHostId),
        }));
    }, [setEventData]);

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

    return {
        assignedHostCards,
        assignedOfficialCards,
        assignedUserIdsByRole,
        assignedUserIdSetByRole,
        assistantHostValue,
        filteredOrganizationStaffEntries,
        handleAddAssistantHost,
        handleAssignedHostsScroll,
        handleAssignedOfficialsScroll,
        handleHostChange,
        handleOrganizationStaffScroll,
        handleRemoveAssistantHost,
        hostCardVisibleCount,
        nonOrgStaffError,
        nonOrgStaffResults,
        nonOrgStaffSearch,
        nonOrgStaffSearchLoading,
        officialCardVisibleCount,
        organizationAllowedHostIds,
        organizationAllowedOfficialIds,
        organizationAllowedOfficialIdSet,
        organizationOfficialsById,
        organizationStaffSearch,
        organizationStaffStatusFilter,
        organizationStaffTypeFilter,
        organizationStaffVisibleCount,
        setNonOrgStaffSearch,
        setOrganizationStaffSearch,
        setOrganizationStaffStatusFilter,
        setOrganizationStaffTypeFilter,
    };
};
