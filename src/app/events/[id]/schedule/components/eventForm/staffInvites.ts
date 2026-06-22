import type { Invite, Organization, StaffMemberType, UserData } from '@/types';
import { normalizeEntityId } from '@/lib/organizationEventAccess';

export type StaffAssignmentRole = 'OFFICIAL' | 'ASSISTANT_HOST';
export type EventInviteStaffType = 'OFFICIAL' | 'HOST';
export type StaffRosterStatus = 'active' | 'pending' | 'declined' | 'failed';

export type PendingStaffInvite = {
    firstName: string;
    lastName: string;
    email: string;
    roles: StaffAssignmentRole[];
};

export type StaffRosterEntry = {
    id: string;
    userId: string | null;
    fullName: string;
    userName: string | null;
    email?: string | null;
    user?: UserData | null;
    status: StaffRosterStatus;
    subtitle?: string | null;
    types: StaffMemberType[];
};

export type OrganizationStaffAssignmentIds = {
    hostUserIds: string[];
    officialUserIds: string[];
};

export type AssignedStaffCard = {
    key: string;
    role: 'OFFICIAL' | 'HOST' | 'ASSISTANT_HOST';
    userId: string | null;
    user?: UserData | null;
    email?: string | null;
    displayName: string;
    status: 'email_invite' | 'pending' | 'declined' | 'failed' | null;
    source: 'assigned' | 'draft';
};

export const createEmptyStaffInvite = (): PendingStaffInvite => ({
    firstName: '',
    lastName: '',
    email: '',
    roles: [],
});

export const buildOrganizationStaffAssignmentIds = (
    organization?: Organization | null,
): OrganizationStaffAssignmentIds => {
    const hostUserIds = new Set<string>();
    const officialUserIds = new Set<string>();
    const addByTypes = (userId: unknown, staffTypes: unknown, status: StaffRosterStatus) => {
        const normalizedUserId = normalizeEntityId(userId);
        if (!normalizedUserId || status !== 'active') {
            return;
        }
        const types = normalizeRosterStaffTypes(staffTypes);
        if (types.includes('HOST')) {
            hostUserIds.add(normalizedUserId);
        }
        if (types.includes('OFFICIAL')) {
            officialUserIds.add(normalizedUserId);
        }
    };

    if (organization?.ownerId) {
        hostUserIds.add(organization.ownerId);
    }
    (Array.isArray(organization?.staffMembers) ? organization.staffMembers : []).forEach((member) => {
        addByTypes(member.userId, member.types, normalizeInviteStatusToken(member.invite?.status));
    });
    (Array.isArray(organization?.staffInvites) ? organization.staffInvites : []).forEach((invite) => {
        addByTypes(invite.userId, invite.staffTypes, normalizeInviteStatusToken(invite.status));
    });

    return {
        hostUserIds: Array.from(hostUserIds),
        officialUserIds: Array.from(officialUserIds),
    };
};

export const buildOrganizationStaffRosterEntries = (
    organization?: Organization | null,
): StaffRosterEntry[] => {
    const entries: StaffRosterEntry[] = [];
    const seen = new Set<string>();
    const staffMembers = Array.isArray(organization?.staffMembers) ? organization.staffMembers : [];
    const staffInvites = Array.isArray(organization?.staffInvites) ? organization.staffInvites : [];

    if (organization?.ownerId) {
        entries.push({
            id: organization.ownerId,
            userId: organization.ownerId,
            fullName: toUserLabel(organization.owner, organization.ownerId),
            userName: organization.owner?.userName ?? null,
            email: organization.staffEmailsByUserId?.[organization.ownerId] ?? getUserEmail(organization.owner),
            user: organization.owner ?? null,
            status: 'active',
            subtitle: 'Owner',
            types: ['HOST'],
        });
        seen.add(organization.ownerId);
    }

    staffMembers.forEach((staffMember) => {
        if (!staffMember.userId || seen.has(staffMember.userId) || staffMember.userId === organization?.ownerId) {
            return;
        }
        entries.push({
            id: staffMember.$id,
            userId: staffMember.userId,
            fullName: toUserLabel(staffMember.user, staffMember.userId),
            userName: staffMember.user?.userName ?? null,
            email: organization?.staffEmailsByUserId?.[staffMember.userId] ?? getUserEmail(staffMember.user),
            user: staffMember.user ?? null,
            status: normalizeInviteStatusToken(staffMember.invite?.status),
            subtitle: null,
            types: normalizeRosterStaffTypes(staffMember.types),
        });
        seen.add(staffMember.userId);
    });

    staffInvites.forEach((invite) => {
        if (!invite.userId || seen.has(invite.userId) || invite.userId === organization?.ownerId) {
            return;
        }
        entries.push({
            id: invite.$id,
            userId: invite.userId,
            fullName: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email || invite.userId,
            userName: null,
            email: invite.email ?? null,
            user: null,
            status: normalizeInviteStatusToken(invite.status),
            subtitle: null,
            types: normalizeRosterStaffTypes(invite.staffTypes),
        });
        seen.add(invite.userId);
    });

    return entries;
};

type FilterOrganizationStaffRosterEntriesOptions = {
    search: string;
    statusFilter: 'all' | StaffRosterStatus;
    typeFilter: 'all' | StaffMemberType;
};

export const filterOrganizationStaffRosterEntries = (
    entries: StaffRosterEntry[],
    {
        search,
        statusFilter,
        typeFilter,
    }: FilterOrganizationStaffRosterEntriesOptions,
): StaffRosterEntry[] => entries.filter((entry) => {
    if (typeFilter !== 'all' && !entry.types.includes(typeFilter)) {
        return false;
    }
    if (statusFilter !== 'all' && entry.status !== statusFilter) {
        return false;
    }
    const query = search.trim().toLowerCase();
    if (!query.length) {
        return true;
    }
    return [
        entry.fullName,
        entry.userName ?? '',
        entry.email ?? '',
        entry.subtitle ?? '',
    ]
        .map((value) => value.toLowerCase())
        .some((value) => value.includes(query));
});

type BuildAssignedOfficialCardsOptions = {
    officialIds: string[];
    assignedOfficials?: UserData[];
    organizationOfficialsById: Map<string, UserData>;
    nonOrgStaffResults: UserData[];
    currentEventStaffInviteByUserId: Map<string, Invite>;
    pendingStaffInvites: PendingStaffInvite[];
};

export const buildAssignedOfficialCards = ({
    officialIds,
    assignedOfficials,
    organizationOfficialsById,
    nonOrgStaffResults,
    currentEventStaffInviteByUserId,
    pendingStaffInvites,
}: BuildAssignedOfficialCardsOptions): AssignedStaffCard[] => {
    const cards: AssignedStaffCard[] = officialIds.map((officialId) => {
        const official = (assignedOfficials || []).find((candidate) => candidate.$id === officialId)
            ?? organizationOfficialsById.get(officialId)
            ?? nonOrgStaffResults.find((candidate) => candidate.$id === officialId)
            ?? null;
        const invite = currentEventStaffInviteByUserId.get(officialId);
        const inviteStatus = invite?.staffTypes?.includes('OFFICIAL') ? normalizeInviteStatusToken(invite.status) : null;
        return {
            key: `official:${officialId}`,
            role: 'OFFICIAL',
            userId: officialId,
            user: official,
            email: getUserEmail(official),
            displayName: toUserLabel(official ?? undefined, officialId),
            status: inviteStatus && inviteStatus !== 'active' ? inviteStatus : null,
            source: 'assigned',
        };
    });
    pendingStaffInvites.forEach((invite) => {
        if (!invite.roles.includes('OFFICIAL')) {
            return;
        }
        cards.push({
            key: `draft-official:${invite.email}`,
            role: 'OFFICIAL',
            userId: null,
            user: null,
            email: invite.email,
            displayName: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email,
            status: 'email_invite',
            source: 'draft',
        });
    });
    return cards;
};

type BuildAssignedHostCardsOptions = {
    hostId?: string | null;
    assistantHostIds: string[];
    assistantHostUsersById: Map<string, UserData>;
    organizationUsersById: Map<string, Partial<UserData>>;
    currentEventStaffInviteByUserId: Map<string, Invite>;
    pendingStaffInvites: PendingStaffInvite[];
};

export const buildAssignedHostCards = ({
    hostId,
    assistantHostIds,
    assistantHostUsersById,
    organizationUsersById,
    currentEventStaffInviteByUserId,
    pendingStaffInvites,
}: BuildAssignedHostCardsOptions): AssignedStaffCard[] => {
    const cards: AssignedStaffCard[] = [];
    const primaryHostId = normalizeEntityId(hostId);
    if (primaryHostId) {
        const hostUser = assistantHostUsersById.get(primaryHostId) ?? organizationUsersById.get(primaryHostId) ?? null;
        cards.push({
            key: `host:${primaryHostId}`,
            role: 'HOST',
            userId: primaryHostId,
            user: (hostUser as UserData | null) ?? null,
            email: getUserEmail(hostUser),
            displayName: toUserLabel(hostUser ?? undefined, primaryHostId),
            status: null,
            source: 'assigned',
        });
    }
    assistantHostIds.forEach((assistantHostId) => {
        const assistantHost = assistantHostUsersById.get(assistantHostId) ?? organizationUsersById.get(assistantHostId) ?? null;
        const invite = currentEventStaffInviteByUserId.get(assistantHostId);
        const inviteStatus = invite?.staffTypes?.includes('HOST') ? normalizeInviteStatusToken(invite.status) : null;
        cards.push({
            key: `assistant-host:${assistantHostId}`,
            role: 'ASSISTANT_HOST',
            userId: assistantHostId,
            user: (assistantHost as UserData | null) ?? null,
            email: getUserEmail(assistantHost),
            displayName: toUserLabel(assistantHost ?? undefined, assistantHostId),
            status: inviteStatus && inviteStatus !== 'active' ? inviteStatus : null,
            source: 'assigned',
        });
    });
    pendingStaffInvites.forEach((invite) => {
        if (!invite.roles.includes('ASSISTANT_HOST')) {
            return;
        }
        cards.push({
            key: `draft-assistant:${invite.email}`,
            role: 'ASSISTANT_HOST',
            userId: null,
            user: null,
            email: invite.email,
            displayName: [invite.firstName, invite.lastName].filter(Boolean).join(' ').trim() || invite.email,
            status: 'email_invite',
            source: 'draft',
        });
    });
    return cards;
};

export const normalizeInviteEmail = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export const normalizePendingStaffInvite = (invite: PendingStaffInvite): PendingStaffInvite => ({
    firstName: invite.firstName.trim(),
    lastName: invite.lastName.trim(),
    email: normalizeInviteEmail(invite.email),
    roles: Array.from(new Set((invite.roles || []).filter((role): role is StaffAssignmentRole => (
        role === 'OFFICIAL' || role === 'ASSISTANT_HOST'
    )))),
});

export const mapRoleToInviteStaffType = (role: StaffAssignmentRole): EventInviteStaffType => (
    role === 'OFFICIAL' ? 'OFFICIAL' : 'HOST'
);

export const mapInviteStaffTypeToRole = (type: StaffMemberType): StaffAssignmentRole | null => {
    if (type === 'OFFICIAL') {
        return 'OFFICIAL';
    }
    if (type === 'HOST') {
        return 'ASSISTANT_HOST';
    }
    return null;
};

export const normalizeInviteStatusToken = (status: unknown): StaffRosterStatus => {
    if (typeof status === 'string') {
        const normalized = status.trim().toLowerCase();
        if (normalized === 'declined') {
            return 'declined';
        }
        if (normalized === 'failed') {
            return 'failed';
        }
        if (normalized === 'pending') {
            return 'pending';
        }
    }
    return 'active';
};

export const normalizeInviteStaffTypes = (staffTypes: unknown): EventInviteStaffType[] => (
    Array.isArray(staffTypes)
        ? Array.from(
            new Set(
                staffTypes
                    .map((type) => String(type).trim().toUpperCase())
                    .filter((type): type is EventInviteStaffType => type === 'HOST' || type === 'OFFICIAL'),
            ),
        ).sort()
        : []
);

export const normalizeRosterStaffTypes = (staffTypes: unknown): StaffMemberType[] => (
    Array.isArray(staffTypes)
        ? Array.from(
            new Set(
                staffTypes
                    .map((type) => String(type).trim().toUpperCase())
                    .filter((type): type is StaffMemberType => (
                        type === 'HOST' || type === 'OFFICIAL' || type === 'STAFF'
                    )),
            ),
        )
        : []
);

export const getUserEmail = (candidate?: Partial<UserData> | null): string | null => {
    const email = typeof (candidate as { email?: unknown } | undefined)?.email === 'string'
        ? String((candidate as { email?: string }).email).trim().toLowerCase()
        : '';
    return email.length > 0 ? email : null;
};

export const toUserLabel = (user: Partial<UserData> | undefined, fallbackId: string): string => {
    const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
    const lastName = typeof user?.lastName === 'string' ? user.lastName.trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) {
        return fullName;
    }
    if (typeof user?.userName === 'string' && user.userName.trim().length > 0) {
        return user.userName.trim();
    }
    return fallbackId;
};

export const userMatchesSearch = (candidate: Partial<UserData> | undefined, query: string): boolean => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery.length) {
        return true;
    }
    const tokens = [
        `${candidate?.firstName ?? ''} ${candidate?.lastName ?? ''}`.trim(),
        candidate?.userName ?? '',
        candidate?.fullName ?? '',
        candidate?.$id ?? '',
    ]
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
    return tokens.some((value) => value.includes(normalizedQuery));
};

export const formatStaffRoleLabel = (role: AssignedStaffCard['role'] | StaffAssignmentRole): string => {
    if (role === 'OFFICIAL') {
        return 'Official';
    }
    if (role === 'HOST') {
        return 'Host';
    }
    return 'Assistant Host';
};

export const formatStaffStatusLabel = (status: AssignedStaffCard['status'] | StaffRosterStatus): string => {
    if (status === 'email_invite') {
        return 'Email invite';
    }
    if (status === 'failed') {
        return 'Email failed';
    }
    if (status === 'declined') {
        return 'Declined';
    }
    if (status === 'pending') {
        return 'Pending';
    }
    return 'Active';
};

export const getStaffStatusColor = (status: AssignedStaffCard['status'] | StaffRosterStatus): 'gray' | 'blue' | 'teal' | 'red' => {
    if (status === 'failed') {
        return 'red';
    }
    if (status === 'declined') {
        return 'gray';
    }
    if (status === 'pending' || status === 'email_invite') {
        return 'blue';
    }
    return 'teal';
};
