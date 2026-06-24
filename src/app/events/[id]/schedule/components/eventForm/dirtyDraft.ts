import { normalizeEntityId } from '@/lib/organizationEventAccess';

import type { PendingStaffInvite } from './staffInvites';

export const normalizeDirtyTrackedIdList = (values: unknown[]): string[] => Array.from(
    new Set(
        values
            .map((value) => normalizeEntityId(value))
            .filter((value): value is string => Boolean(value)),
    ),
).sort();

export const normalizeDirtyTrackedPendingStaffInvites = (invites: PendingStaffInvite[]): PendingStaffInvite[] => invites
    .map((invite) => ({
        firstName: invite.firstName.trim(),
        lastName: invite.lastName.trim(),
        email: invite.email.trim(),
        roles: Array.from(new Set(invite.roles)).sort(),
    }))
    .filter((invite) => (
        invite.email.length > 0
        || invite.firstName.length > 0
        || invite.lastName.length > 0
        || invite.roles.length > 0
    ));
