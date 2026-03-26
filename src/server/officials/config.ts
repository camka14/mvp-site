export type OfficialSchedulingMode = 'STAFFING' | 'SCHEDULE' | 'OFF';
export type OfficialAssignmentHolderType = 'OFFICIAL' | 'PLAYER';

export type SportOfficialPositionTemplate = {
  name: string;
  count: number;
};

export type EventOfficialPosition = {
  id: string;
  name: string;
  count: number;
  order: number;
};

export type EventOfficialRecord = {
  id: string;
  userId: string;
  positionIds: string[];
  fieldIds: string[];
  isActive: boolean;
};

export type MatchOfficialAssignment = {
  positionId: string;
  slotIndex: number;
  holderType: OfficialAssignmentHolderType;
  userId: string;
  eventOfficialId?: string;
  checkedIn: boolean;
  hasConflict: boolean;
};

const SCHEDULING_MODES = new Set<OfficialSchedulingMode>(['STAFFING', 'SCHEDULE', 'OFF']);
const HOLDER_TYPES = new Set<OfficialAssignmentHolderType>(['OFFICIAL', 'PLAYER']);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const slugify = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
);

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(parsed));
};

export const ensureStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeString(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : []
);

export const normalizeOfficialSchedulingMode = (
  value: unknown,
  fallback: OfficialSchedulingMode = 'SCHEDULE',
): OfficialSchedulingMode => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const canonical = normalized === 'NONE' ? 'OFF' : normalized;
  return SCHEDULING_MODES.has(canonical as OfficialSchedulingMode)
    ? canonical as OfficialSchedulingMode
    : fallback;
};

export const normalizeSportOfficialPositionTemplates = (value: unknown): SportOfficialPositionTemplate[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const templates: SportOfficialPositionTemplate[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const name = normalizeString(row.name);
    if (!name) {
      continue;
    }
    templates.push({
      name,
      count: normalizePositiveInt(row.count, 1),
    });
  }
  return templates;
};

export const buildEventOfficialPositionId = (eventId: string, order: number, name: string): string => {
  const slug = slugify(name) || 'official';
  return `event_pos_${eventId}_${order}_${slug}`;
};

export const normalizeEventOfficialPositions = (
  value: unknown,
  eventId: string,
): EventOfficialPosition[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const positions: EventOfficialPosition[] = [];
  const seenIds = new Set<string>();
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const row = entry as Record<string, unknown>;
    const name = normalizeString(row.name);
    if (!name) {
      return;
    }
    const order = typeof row.order === 'number' && Number.isFinite(row.order)
      ? Math.max(0, Math.trunc(row.order))
      : index;
    const explicitId = normalizeString(row.id);
    const id = explicitId ?? buildEventOfficialPositionId(eventId, order, name);
    if (seenIds.has(id)) {
      return;
    }
    seenIds.add(id);
    positions.push({
      id,
      name,
      count: normalizePositiveInt(row.count, 1),
      order,
    });
  });
  positions.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  return positions.map((position, index) => ({ ...position, order: index }));
};

export const buildEventOfficialPositionsFromTemplates = (
  eventId: string,
  templates: SportOfficialPositionTemplate[],
): EventOfficialPosition[] => (
  templates.map((template, index) => ({
    id: buildEventOfficialPositionId(eventId, index, template.name),
    name: template.name,
    count: normalizePositiveInt(template.count, 1),
    order: index,
  }))
);

export const buildEventOfficialRecordId = (eventId: string, userId: string): string => (
  `event_official_${eventId}_${slugify(userId) || 'user'}`
);

export const normalizeEventOfficials = (
  value: unknown,
  options: {
    eventId: string;
    positionIds: string[];
    fieldIds: string[];
  },
): EventOfficialRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const validPositionIds = new Set(options.positionIds);
  const validFieldIds = new Set(options.fieldIds);
  const records: EventOfficialRecord[] = [];
  const seenUsers = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const userId = normalizeString(row.userId);
    if (!userId || seenUsers.has(userId)) {
      continue;
    }
    const positionIds = ensureStringArray(row.positionIds).filter((positionId) => validPositionIds.has(positionId));
    if (!positionIds.length) {
      throw new Error(`Event official ${userId} must reference at least one valid position.`);
    }
    const fieldIds = ensureStringArray(row.fieldIds).filter((fieldId) => validFieldIds.has(fieldId));
    const explicitId = normalizeString(row.id);
    records.push({
      id: explicitId ?? buildEventOfficialRecordId(options.eventId, userId),
      userId,
      positionIds,
      fieldIds,
      isActive: row.isActive !== false,
    });
    seenUsers.add(userId);
  }
  return records;
};

export const deriveEventOfficialsFromLegacyOfficialIds = (params: {
  eventId: string;
  officialIds: string[];
  positionIds: string[];
}): EventOfficialRecord[] => (
  Array.from(new Set(params.officialIds))
    .map((userId) => normalizeString(userId))
    .filter((userId): userId is string => Boolean(userId))
    .map((userId) => ({
      id: buildEventOfficialRecordId(params.eventId, userId),
      userId,
      positionIds: [...params.positionIds],
      fieldIds: [],
      isActive: true,
    }))
);

export const normalizeMatchOfficialAssignments = (
  value: unknown,
  options: {
    positionCountsById: Map<string, number>;
    eventOfficialsById: Map<string, EventOfficialRecord>;
  },
): MatchOfficialAssignment[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const assignments: MatchOfficialAssignment[] = [];
  const seenPositionSlots = new Set<string>();
  const seenUsers = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const positionId = normalizeString(row.positionId);
    const userId = normalizeString(row.userId);
    const holderType = typeof row.holderType === 'string'
      ? row.holderType.trim().toUpperCase()
      : '';
    const slotIndexRaw = typeof row.slotIndex === 'number' ? row.slotIndex : Number(row.slotIndex);
    const slotIndex = Number.isFinite(slotIndexRaw) ? Math.max(0, Math.trunc(slotIndexRaw)) : -1;
    if (!positionId || !userId || !HOLDER_TYPES.has(holderType as OfficialAssignmentHolderType)) {
      continue;
    }
    const slotCount = options.positionCountsById.get(positionId);
    if (!slotCount) {
      throw new Error(`Unknown official position ${positionId}.`);
    }
    if (slotIndex < 0 || slotIndex >= slotCount) {
      throw new Error(`Official assignment slot ${slotIndex} is invalid for position ${positionId}.`);
    }
    const slotKey = `${positionId}:${slotIndex}`;
    if (seenPositionSlots.has(slotKey)) {
      throw new Error(`Duplicate official assignment for position ${positionId} slot ${slotIndex}.`);
    }
    if (seenUsers.has(userId)) {
      throw new Error(`User ${userId} cannot be assigned to multiple official slots on the same match.`);
    }
    const eventOfficialId = normalizeString(row.eventOfficialId);
    if (holderType === 'OFFICIAL') {
      if (!eventOfficialId) {
        throw new Error(`Official assignment for ${userId} must reference an event official id.`);
      }
      const eventOfficial = options.eventOfficialsById.get(eventOfficialId);
      if (!eventOfficial || eventOfficial.userId !== userId) {
        throw new Error(`Official assignment ${eventOfficialId} does not match user ${userId}.`);
      }
      if (!eventOfficial.positionIds.includes(positionId)) {
        throw new Error(`Official ${userId} is not eligible for position ${positionId}.`);
      }
    } else if (eventOfficialId) {
      throw new Error(`Player assignment for ${userId} cannot include an event official id.`);
    }
    assignments.push({
      positionId,
      slotIndex,
      holderType: holderType as OfficialAssignmentHolderType,
      userId,
      ...(eventOfficialId ? { eventOfficialId } : {}),
      checkedIn: row.checkedIn === true,
      hasConflict: row.hasConflict === true,
    });
    seenPositionSlots.add(slotKey);
    seenUsers.add(userId);
  }
  return assignments.sort((left, right) => (
    left.positionId.localeCompare(right.positionId) || left.slotIndex - right.slotIndex
  ));
};

export const deriveLegacyOfficialIdFromAssignments = (assignments: MatchOfficialAssignment[]): string | null => {
  const primary = assignments.find((assignment) => assignment.holderType === 'OFFICIAL');
  return primary?.userId ?? null;
};

export const deriveLegacyOfficialCheckedInFromAssignments = (assignments: MatchOfficialAssignment[]): boolean => {
  const primary = assignments.find((assignment) => assignment.holderType === 'OFFICIAL');
  return primary?.checkedIn === true;
};

export const buildLegacyOfficialAssignment = (params: {
  eventId: string;
  officialId: string | null;
  officialCheckedIn: boolean;
  officialPositions: EventOfficialPosition[];
}): MatchOfficialAssignment[] => {
  const officialId = normalizeString(params.officialId);
  const primaryPosition = params.officialPositions[0];
  if (!officialId || !primaryPosition) {
    return [];
  }
  return [{
    positionId: primaryPosition.id,
    slotIndex: 0,
    holderType: 'OFFICIAL',
    userId: officialId,
    eventOfficialId: buildEventOfficialRecordId(params.eventId, officialId),
    checkedIn: params.officialCheckedIn,
    hasConflict: false,
  }];
};
