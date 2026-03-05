import type { UserData } from '@/types';

type OrganizationAccessLike = {
  ownerId?: string | null;
  hostIds?: string[] | null;
  refIds?: string[] | null;
  referees?: Array<Pick<UserData, '$id'> | null | undefined> | null;
} | null | undefined;

type AssignmentInput = {
  hostId?: string | null;
  assistantHostIds?: string[] | null;
  refereeIds?: string[] | null;
};

type AssignmentResult = {
  hostId: string | null;
  assistantHostIds: string[];
  refereeIds: string[];
};

export const normalizeEntityId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeUniqueIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => normalizeEntityId(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
};

export const collectOrganizationHostIds = (organization: OrganizationAccessLike): string[] => {
  const ids = new Set<string>();
  const ownerId = normalizeEntityId(organization?.ownerId);
  if (ownerId) {
    ids.add(ownerId);
  }
  normalizeUniqueIds(organization?.hostIds).forEach((id) => ids.add(id));
  return Array.from(ids);
};

export const collectOrganizationRefereeIds = (organization: OrganizationAccessLike): string[] => {
  const ids = new Set<string>();
  normalizeUniqueIds(organization?.refIds).forEach((id) => ids.add(id));
  (organization?.referees ?? []).forEach((referee) => {
    const refereeId = normalizeEntityId(referee?.$id);
    if (refereeId) {
      ids.add(refereeId);
    }
  });
  return Array.from(ids);
};

export const sanitizeOrganizationEventAssignments = (
  input: AssignmentInput,
  organization: OrganizationAccessLike,
): AssignmentResult => {
  const allowedHostIds = collectOrganizationHostIds(organization);
  const allowedHostIdSet = new Set(allowedHostIds);
  const requestedHostId = normalizeEntityId(input.hostId);
  const ownerId = normalizeEntityId(organization?.ownerId);
  const fallbackHostId = ownerId ?? allowedHostIds[0] ?? null;
  const hostId = (
    allowedHostIds.length > 0
      ? (
        requestedHostId && allowedHostIdSet.has(requestedHostId)
          ? requestedHostId
          : fallbackHostId
      )
      : requestedHostId
  );

  const assistantHostIds = normalizeUniqueIds(input.assistantHostIds).filter((id) => {
    if (hostId && id === hostId) {
      return false;
    }
    if (allowedHostIds.length === 0) {
      return true;
    }
    return allowedHostIdSet.has(id);
  });

  const allowedRefereeIdSet = new Set(collectOrganizationRefereeIds(organization));
  const refereeIds = normalizeUniqueIds(input.refereeIds).filter((id) => allowedRefereeIdSet.has(id));

  return {
    hostId,
    assistantHostIds,
    refereeIds,
  };
};

