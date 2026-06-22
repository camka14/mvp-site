import type { StaffMemberType, UserData } from '@/types';

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
