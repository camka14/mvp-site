import {
    useCallback,
    useMemo,
    useState,
} from 'react';

import { normalizeEntityId } from '@/lib/organizationEventAccess';
import { userService } from '@/lib/userService';

import { normalizeDirtyTrackedPendingStaffInvites } from '../dirtyDraft';
import {
    buildAssignedStaffUserIds,
    buildAssignedUserIdSetsByRole,
    createEmptyStaffInvite,
    formatStaffRoleLabel,
    normalizeInviteEmail,
    normalizePendingStaffInvite,
    removePendingStaffInviteRoleByEmail,
    type AssignedStaffUserIdsByRole,
    type PendingStaffInvite,
    type StaffAssignmentRole,
} from '../staffInvites';
import type { UseStaffOfficialControllerParams } from './staffOfficialControllerTypes';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UseStaffInviteControllerParams = Pick<
    UseStaffOfficialControllerParams,
    | 'activeEditingEvent'
    | 'getValues'
    | 'isOrganizationHostedEvent'
    | 'setPendingStaffInvites'
> & {
    assignedUserIdsByRole: AssignedStaffUserIdsByRole;
};

export const useStaffInviteController = ({
    activeEditingEvent,
    assignedUserIdsByRole,
    getValues,
    isOrganizationHostedEvent,
    setPendingStaffInvites,
}: UseStaffInviteControllerParams) => {
    const [staffInviteError, setStaffInviteError] = useState<string | null>(null);
    const [newStaffInvite, setNewStaffInvite] = useState<PendingStaffInvite>(createEmptyStaffInvite());

    const assignedUserIdSetByRole = useMemo(
        () => buildAssignedUserIdSetsByRole(assignedUserIdsByRole),
        [assignedUserIdsByRole],
    );
    const assignedStaffUserIds = useMemo(
        () => buildAssignedStaffUserIds(assignedUserIdsByRole),
        [assignedUserIdsByRole],
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
        setNewStaffInvite((previous) => ({ ...previous, [field]: value }));
    }, []);

    const handleInviteRoleToggle = useCallback((role: StaffAssignmentRole) => {
        setNewStaffInvite((previous) => ({
            ...previous,
            roles: previous.roles.includes(role)
                ? previous.roles.filter((existingRole) => existingRole !== role)
                : [...previous.roles, role],
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

        setPendingStaffInvites((previous) => {
            const existingIndex = previous.findIndex((invite) => normalizeInviteEmail(invite.email) === nextInvite.email);
            if (existingIndex === -1) {
                return [...previous, nextInvite];
            }
            const updated = [...previous];
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

    const handleRemovePendingStaffInviteRole = useCallback((email: string, role: StaffAssignmentRole) => {
        setPendingStaffInvites((previous) => removePendingStaffInviteRoleByEmail(previous, email, role));
    }, [setPendingStaffInvites]);

    return {
        handleInviteFieldChange,
        handleInviteRoleToggle,
        handleRemovePendingStaffInviteRole,
        handleStagePendingStaffInvite,
        newStaffInvite,
        staffInviteError,
        validatePendingStaffAssignments,
    };
};
