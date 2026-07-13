import { apiRequest } from '@/lib/apiClient';
import type {
  Event,
  EventOfficial,
  EventOfficialPosition,
  Field,
  Invite,
  InviteStatus,
  StaffMemberType,
} from '@/types';

export const EVENT_STAFF_CONTRACT_VERSION = 1 as const;

export type EventStaffRole = 'OFFICIAL' | 'ASSISTANT_HOST';

export type EventStaffPendingInviteInput = {
  email: string;
  firstName: string;
  lastName: string;
  roles: EventStaffRole[];
  resolvedUserId?: string;
};

export type EventStaffDraft = Partial<Event> & {
  pendingStaffInvites?: EventStaffPendingInviteInput[];
};

export type EventStaffSnapshot = {
  contractVersion: typeof EVENT_STAFF_CONTRACT_VERSION;
  eventId: string;
  revision: string;
  assistantHostIds: string[];
  officialPositions: EventOfficialPosition[];
  eventOfficials: EventOfficial[];
  officialIds: string[];
  staffInvites: Invite[];
};

export type EventStaffPutInput = {
  contractVersion: typeof EVENT_STAFF_CONTRACT_VERSION;
  expectedRevision: string;
  assistantHostIds: string[];
  eventOfficials: Array<{
    id?: string;
    userId: string;
    positionIds: string[];
    fieldIds: string[];
    isActive: boolean;
  }>;
  pendingInvites: EventStaffPendingInviteInput[];
};

type RawEventStaffSnapshot = Record<string, unknown>;

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map(normalizeId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
};

const normalizeName = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
);

const normalizeOfficialPositions = (value: unknown): EventOfficialPosition[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const id = normalizeId(row.id);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!id || !name) {
      return [];
    }
    const count = Number.isFinite(Number(row.count))
      ? Math.max(1, Math.trunc(Number(row.count)))
      : 1;
    const order = Number.isFinite(Number(row.order))
      ? Math.max(0, Math.trunc(Number(row.order)))
      : index;
    return [{ id, name, count, order }];
  });
};

const normalizeEventOfficials = (value: unknown): EventOfficial[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenUserIds = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const id = normalizeId(row.id);
    const userId = normalizeId(row.userId);
    if (!id || !userId || seenUserIds.has(userId)) {
      return [];
    }
    seenUserIds.add(userId);
    return [{
      id,
      userId,
      positionIds: normalizeIdList(row.positionIds),
      fieldIds: normalizeIdList(row.fieldIds),
      isActive: row.isActive !== false,
    }];
  });
};

const normalizeInviteStatus = (value: unknown): InviteStatus | undefined => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === 'PENDING' || normalized === 'DECLINED' || normalized === 'FAILED'
    ? normalized
    : undefined;
};

const normalizeStaffTypes = (value: unknown): StaffMemberType[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.flatMap((entry) => {
    const normalized = typeof entry === 'string' ? entry.trim().toUpperCase() : '';
    return normalized === 'HOST' || normalized === 'OFFICIAL' || normalized === 'STAFF'
      ? [normalized as StaffMemberType]
      : [];
  })));
};

const normalizeStaffInvites = (value: unknown): Invite[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const id = normalizeId(row.id) ?? normalizeId(row.$id);
    if (!id) {
      return [];
    }
    const status = normalizeInviteStatus(row.status);
    const createdAt = normalizeId(row.createdAt) ?? normalizeId(row.$createdAt);
    const updatedAt = normalizeId(row.updatedAt) ?? normalizeId(row.$updatedAt);
    return [{
      $id: id,
      type: 'STAFF',
      ...(normalizeId(row.email) ? { email: normalizeId(row.email) ?? undefined } : {}),
      ...(status ? { status } : {}),
      staffTypes: normalizeStaffTypes(row.staffTypes),
      userId: normalizeId(row.userId),
      eventId: normalizeId(row.eventId),
      organizationId: normalizeId(row.organizationId),
      teamId: normalizeId(row.teamId),
      createdBy: normalizeId(row.createdBy),
      ...(normalizeId(row.firstName) ? { firstName: normalizeId(row.firstName) ?? undefined } : {}),
      ...(normalizeId(row.lastName) ? { lastName: normalizeId(row.lastName) ?? undefined } : {}),
      ...(createdAt ? { $createdAt: createdAt } : {}),
      ...(updatedAt ? { $updatedAt: updatedAt } : {}),
    }];
  });
};

const normalizeSnapshot = (
  value: unknown,
  expectedEventId: string,
): EventStaffSnapshot => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid event staff response.');
  }
  const row = value as RawEventStaffSnapshot;
  const eventId = normalizeId(row.eventId);
  const revision = normalizeId(row.revision);
  if (
    row.contractVersion !== EVENT_STAFF_CONTRACT_VERSION
    || eventId !== expectedEventId
    || !revision
  ) {
    throw new Error('Invalid event staff response.');
  }
  const eventOfficials = normalizeEventOfficials(row.eventOfficials);
  return {
    contractVersion: EVENT_STAFF_CONTRACT_VERSION,
    eventId,
    revision,
    assistantHostIds: normalizeIdList(row.assistantHostIds),
    officialPositions: normalizeOfficialPositions(row.officialPositions),
    eventOfficials,
    officialIds: normalizeIdList(row.officialIds).length > 0
      ? normalizeIdList(row.officialIds)
      : eventOfficials.map((official) => official.userId),
    staffInvites: normalizeStaffInvites(row.staffInvites),
  };
};

const getFieldId = (field: Partial<Field> | null | undefined): string | null => (
  normalizeId(field?.$id) ?? normalizeId((field as { id?: unknown } | undefined)?.id)
);

const getFieldName = (field: Partial<Field> | null | undefined): string => (
  normalizeName(field?.name)
);

const normalizePendingInvites = (value: unknown): EventStaffPendingInviteInput[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const byEmail = new Map<string, EventStaffPendingInviteInput>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const row = entry as Record<string, unknown>;
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    const firstName = typeof row.firstName === 'string' ? row.firstName.trim() : '';
    const lastName = typeof row.lastName === 'string' ? row.lastName.trim() : '';
    const roles = Array.from(new Set(
      Array.isArray(row.roles)
        ? row.roles.filter((role): role is EventStaffRole => (
            role === 'OFFICIAL' || role === 'ASSISTANT_HOST'
          ))
        : [],
    ));
    if (!email || !firstName || !lastName || roles.length === 0) {
      return;
    }
    const existing = byEmail.get(email);
    byEmail.set(email, {
      email,
      firstName,
      lastName,
      roles: Array.from(new Set([...(existing?.roles ?? []), ...roles])),
      ...(normalizeId(row.resolvedUserId)
        ? { resolvedUserId: normalizeId(row.resolvedUserId) ?? undefined }
        : existing?.resolvedUserId
          ? { resolvedUserId: existing.resolvedUserId }
          : {}),
    });
  });
  return Array.from(byEmail.values());
};

export const buildEventStaffPutInput = ({
  desiredEvent,
  persistedEvent,
  snapshot,
  expectedRevision,
}: {
  desiredEvent: EventStaffDraft;
  persistedEvent: Partial<Event>;
  snapshot: EventStaffSnapshot;
  expectedRevision?: string | null;
}): EventStaffPutInput => {
  const hostId = normalizeId(persistedEvent.hostId) ?? normalizeId(desiredEvent.hostId);
  const assistantHostIds = normalizeIdList(desiredEvent.assistantHostIds)
    .filter((userId) => userId !== hostId);

  const canonicalPositionIds = new Set(snapshot.officialPositions.map((position) => position.id));
  const desiredPositionById = new Map(
    (Array.isArray(desiredEvent.officialPositions) ? desiredEvent.officialPositions : [])
      .map((position) => [normalizeId(position.id), position] as const)
      .filter((entry): entry is [string, EventOfficialPosition] => Boolean(entry[0])),
  );
  const canonicalPositionsByName = new Map<string, EventOfficialPosition[]>();
  snapshot.officialPositions.forEach((position) => {
    const key = normalizeName(position.name);
    canonicalPositionsByName.set(key, [...(canonicalPositionsByName.get(key) ?? []), position]);
  });
  const rebasePositionId = (positionId: string): string | null => {
    if (canonicalPositionIds.has(positionId)) {
      return positionId;
    }
    const desiredPosition = desiredPositionById.get(positionId);
    if (!desiredPosition) {
      return null;
    }
    const matches = canonicalPositionsByName.get(normalizeName(desiredPosition.name)) ?? [];
    return matches.find((position) => position.order === desiredPosition.order)?.id
      ?? matches[0]?.id
      ?? null;
  };

  const desiredFields = Array.isArray(desiredEvent.fields) ? desiredEvent.fields : [];
  const persistedFields = Array.isArray(persistedEvent.fields) ? persistedEvent.fields : [];
  const desiredFieldById = new Map(
    desiredFields
      .map((field) => [getFieldId(field), field] as const)
      .filter((entry): entry is [string, Field] => Boolean(entry[0])),
  );
  const persistedFieldByName = new Map<string, Field>();
  persistedFields.forEach((field) => {
    if (getFieldName(field)) {
      persistedFieldByName.set(getFieldName(field), field);
    }
  });
  const canonicalFieldIds = new Set([
    ...normalizeIdList(persistedEvent.fieldIds),
    ...persistedFields.map(getFieldId).filter((id): id is string => Boolean(id)),
    ...snapshot.eventOfficials.flatMap((official) => official.fieldIds),
  ]);
  const rebaseFieldId = (fieldId: string): string | null => {
    if (canonicalFieldIds.has(fieldId)) {
      return fieldId;
    }
    const desiredField = desiredFieldById.get(fieldId);
    const persistedField = desiredField
      ? persistedFieldByName.get(getFieldName(desiredField))
      : null;
    const persistedFieldId = getFieldId(persistedField);
    return persistedFieldId && canonicalFieldIds.has(persistedFieldId)
      ? persistedFieldId
      : null;
  };

  const desiredOfficials = Array.isArray(desiredEvent.eventOfficials)
    ? desiredEvent.eventOfficials
    : [];
  const desiredOfficialIds = normalizeIdList(desiredEvent.officialIds);
  const desiredOfficialByUserId = new Map<string, EventOfficial>();
  desiredOfficials.forEach((official) => {
    const userId = normalizeId(official?.userId);
    if (userId && !desiredOfficialByUserId.has(userId)) {
      desiredOfficialByUserId.set(userId, official);
    }
  });
  desiredOfficialIds.forEach((userId) => {
    if (!desiredOfficialByUserId.has(userId)) {
      desiredOfficialByUserId.set(userId, {
        id: '',
        userId,
        positionIds: snapshot.officialPositions.map((position) => position.id),
        fieldIds: [],
        isActive: true,
      });
    }
  });

  const eventOfficials = Array.from(desiredOfficialByUserId.values()).flatMap((official) => {
    const userId = normalizeId(official.userId);
    if (!userId) {
      return [];
    }
    const positionIds = Array.from(new Set(
      normalizeIdList(official.positionIds)
        .map(rebasePositionId)
        .filter((positionId): positionId is string => Boolean(positionId)),
    ));
    const resolvedPositionIds = positionIds.length > 0
      ? positionIds
      : snapshot.officialPositions.map((position) => position.id);
    const fieldIds = Array.from(new Set(
      normalizeIdList(official.fieldIds)
        .map(rebaseFieldId)
        .filter((fieldId): fieldId is string => Boolean(fieldId)),
    ));
    return [{
      ...(normalizeId(official.id) ? { id: normalizeId(official.id) ?? undefined } : {}),
      userId,
      positionIds: resolvedPositionIds,
      fieldIds,
      isActive: official.isActive !== false,
    }];
  });

  return {
    contractVersion: EVENT_STAFF_CONTRACT_VERSION,
    expectedRevision: normalizeId(expectedRevision) ?? snapshot.revision,
    assistantHostIds,
    eventOfficials,
    pendingInvites: normalizePendingInvites(desiredEvent.pendingStaffInvites),
  };
};

export const stripEventStaffAssignments = (event: EventStaffDraft): EventStaffDraft => {
  const stripped: EventStaffDraft = {
    ...event,
    assistantHostIds: [],
    officialIds: [],
    eventOfficials: [],
    staffInvites: [],
  };
  delete stripped.pendingStaffInvites;
  return stripped;
};

export const stripEventStaffAssignmentsFromPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const stripped = { ...payload };
  stripped.assistantHostIds = [];
  stripped.officialIds = [];
  stripped.eventOfficials = [];
  delete stripped.staffInvites;
  delete stripped.pendingStaffInvites;
  return stripped;
};

export const applyEventStaffSnapshot = (
  event: Event,
  snapshot: EventStaffSnapshot,
): Event => ({
  ...event,
  assistantHostIds: [...snapshot.assistantHostIds],
  officialPositions: snapshot.officialPositions.map((position) => ({ ...position })),
  eventOfficials: snapshot.eventOfficials.map((official) => ({
    ...official,
    positionIds: [...official.positionIds],
    fieldIds: [...official.fieldIds],
  })),
  officialIds: [...snapshot.officialIds],
  staffInvites: snapshot.staffInvites.map((invite) => ({ ...invite })),
});

export const eventStaffService = {
  async getEventStaffState(eventId: string): Promise<EventStaffSnapshot> {
    const normalizedEventId = normalizeId(eventId);
    if (!normalizedEventId) {
      throw new Error('Event ID is required to load staff.');
    }
    const response = await apiRequest<unknown>(`/api/events/${normalizedEventId}/staff`);
    return normalizeSnapshot(response, normalizedEventId);
  },

  async putEventStaffState(
    eventId: string,
    input: EventStaffPutInput,
  ): Promise<EventStaffSnapshot> {
    const normalizedEventId = normalizeId(eventId);
    if (!normalizedEventId) {
      throw new Error('Event ID is required to save staff.');
    }
    const response = await apiRequest<unknown>(`/api/events/${normalizedEventId}/staff`, {
      method: 'PUT',
      body: input,
    });
    return normalizeSnapshot(response, normalizedEventId);
  },
};
