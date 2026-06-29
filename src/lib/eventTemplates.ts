import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import {
  buildEventDivisionId,
  extractDivisionTokenFromId,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';
import { createId } from '@/lib/id';
import {
  buildTemplateRentalResourceHintFromField,
  buildTemplateRentalResourceSourceType,
} from '@/lib/templateRentalResources';
import type { Division, Event, Field, TimeSlot } from '@/types';

const TEMPLATE_SUFFIX_RE = /\s*\(TEMPLATE\)\s*$/i;

export const addEventTemplateSuffix = (name: string): string => {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return '(TEMPLATE)';
  }
  if (TEMPLATE_SUFFIX_RE.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} (TEMPLATE)`;
};

export const stripEventTemplateSuffix = (name: string): string => {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(TEMPLATE_SUFFIX_RE, '').trim();
};

const cloneLocalFields = (
  sourceFields: Field[],
  idFactory: () => string,
): { fields: Field[]; idMap: Map<string, string> } => {
  const idMap = new Map<string, string>();
  const fields = sourceFields.map((field) => {
    const nextId = idFactory();
    idMap.set(field.$id, nextId);
    return {
      ...field,
      $id: nextId,
      // Ensure these don't carry over hydrated backrefs that can cause cycles or unintended coupling.
      matches: undefined,
      events: undefined,
      organization: undefined,
      organizationId: undefined,
      rentalSlots: undefined,
    } as Field;
  });
  return { fields, idMap };
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const getTemplateFieldOrganizationId = (field?: Field | null): string | null => {
  if (!field) {
    return null;
  }
  const organization = (field as any).organization;
  const organizationIdFromString = normalizeId(organization);
  if (organizationIdFromString) {
    return organizationIdFromString;
  }
  if (organization && typeof organization === 'object') {
    const organizationIdFromObject = normalizeId((organization as { $id?: unknown }).$id)
      ?? normalizeId((organization as { id?: unknown }).id);
    if (organizationIdFromObject) {
      return organizationIdFromObject;
    }
  }
  return normalizeId((field as any).organizationId);
};

const splitTemplateFields = (
  sourceFields: Field[],
  idFactory: () => string,
): { clonedFields: Field[]; fieldIdMap: Map<string, string> } => {
  const localFields = sourceFields.filter((field) => !getTemplateFieldOrganizationId(field));
  const localFieldsClone = localFields.length ? cloneLocalFields(localFields, idFactory) : null;
  return {
    clonedFields: localFieldsClone?.fields ?? [],
    fieldIdMap: localFieldsClone?.idMap ?? new Map<string, string>(),
  };
};

const normalizeFieldIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0),
    ),
  );
};

const resolveTemplateFieldIds = (
  source: Event,
  fieldIdMap: Map<string, string>,
  excludedSourceFieldIds?: Set<string>,
): string[] => {
  const sourceFieldIds = normalizeFieldIds(source.fieldIds);
  const fallbackFieldIds = Array.isArray(source.fields)
    ? normalizeFieldIds((source.fields as Field[]).map((field) => field.$id))
    : [];
  return (sourceFieldIds.length ? sourceFieldIds : fallbackFieldIds)
    .filter((fieldId) => !excludedSourceFieldIds?.has(fieldId))
    .map((fieldId) => fieldIdMap.get(fieldId) ?? fieldId);
};

const shiftLocalDateTime = (
  value: string | null | undefined,
  sourceStart: Date,
  targetStart: Date,
): string | null | undefined => {
  if (value === null) {
    return null;
  }
  const parsed = value ? parseLocalDateTime(value) : null;
  if (!parsed) {
    return value;
  }
  const shifted = new Date(parsed.getTime() + (targetStart.getTime() - sourceStart.getTime()));
  return formatLocalDateTime(shifted);
};

const mondayDayIndex = (date: Date): TimeSlot['dayOfWeek'] =>
  ((date.getDay() + 6) % 7) as TimeSlot['dayOfWeek'];

const shiftDayIndex = (
  value: number,
  sourceStart: Date,
  targetStart: Date,
): TimeSlot['dayOfWeek'] => {
  const dayOffset = Math.round((targetStart.getTime() - sourceStart.getTime()) / (24 * 60 * 60 * 1000));
  return (((value + dayOffset) % 7 + 7) % 7) as TimeSlot['dayOfWeek'];
};

const isRentalBackedTimeSlot = (slot: TimeSlot): boolean =>
  slot.rentalLocked === true
  || Boolean(normalizeId(slot.rentalBookingId))
  || Boolean(normalizeId(slot.rentalBookingItemId))
  || normalizeId(slot.sourceType)?.toUpperCase() === 'RENTAL_BOOKING';

const getSlotFieldIds = (slot: TimeSlot): string[] => normalizeFieldIds(
  Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
    ? slot.scheduledFieldIds
    : slot.scheduledFieldId
      ? [slot.scheduledFieldId]
      : [],
);

const getRentalOnlyFieldIds = (slots: TimeSlot[]): Set<string> => {
  const rentalFieldIds = new Set<string>();
  const nonRentalFieldIds = new Set<string>();
  slots.forEach((slot) => {
    getSlotFieldIds(slot).forEach((fieldId) => {
      if (isRentalBackedTimeSlot(slot)) {
        rentalFieldIds.add(fieldId);
      } else {
        nonRentalFieldIds.add(fieldId);
      }
    });
  });
  return new Set(
    Array.from(rentalFieldIds).filter((fieldId) => !nonRentalFieldIds.has(fieldId)),
  );
};

const cloneTimeSlots = (
  sourceSlots: TimeSlot[],
  params: {
    idFactory: () => string;
    scheduledFieldIdMap?: Map<string, string>;
    sourceStart: Date;
    targetStart: Date;
    fallbackEnd: string;
    rentalSourceFieldIds?: Set<string>;
    sourceFieldById?: Map<string, Field>;
    sourceEvent?: Event;
  },
): TimeSlot[] => {
  const {
    idFactory,
    scheduledFieldIdMap,
    sourceStart,
    targetStart,
    fallbackEnd,
    rentalSourceFieldIds,
    sourceFieldById,
    sourceEvent,
  } = params;
  return sourceSlots.map((slot) => {
    const slotFieldIds = getSlotFieldIds(slot);
    const rentalBacked = isRentalBackedTimeSlot(slot)
      && slotFieldIds.some((fieldId) => rentalSourceFieldIds?.has(fieldId));
    const scheduledFieldIds = rentalBacked
      ? []
      : slotFieldIds
          .map((fieldId) => scheduledFieldIdMap?.get(fieldId) ?? fieldId)
          .filter((fieldId) => !rentalSourceFieldIds?.has(fieldId));
    const scheduledFieldId = !rentalBacked && slot.scheduledFieldId
      ? scheduledFieldIdMap?.get(slot.scheduledFieldId) ?? slot.scheduledFieldId
      : scheduledFieldIds[0];
    const shiftedStartDate = shiftLocalDateTime(slot.startDate, sourceStart, targetStart);
    const shiftedEndDate = shiftLocalDateTime(slot.endDate, sourceStart, targetStart);
    const parsedShiftedStartDate = shiftedStartDate ? parseLocalDateTime(shiftedStartDate) : null;
    const shiftedDaysOfWeek = Array.isArray(slot.daysOfWeek)
      ? Array.from(new Set(slot.daysOfWeek.map((day) => shiftDayIndex(day, sourceStart, targetStart)))).sort()
      : undefined;
    const shiftedDayOfWeek = parsedShiftedStartDate
      ? mondayDayIndex(parsedShiftedStartDate)
      : typeof slot.dayOfWeek === 'number'
        ? shiftDayIndex(slot.dayOfWeek, sourceStart, targetStart)
        : shiftedDaysOfWeek?.[0];
    const rentalHint = rentalBacked && sourceEvent
      ? buildTemplateRentalResourceHintFromField(sourceFieldById?.get(slotFieldIds[0]), sourceEvent)
      : null;

    return {
      ...slot,
      $id: idFactory(),
      scheduledFieldId,
      scheduledFieldIds,
      dayOfWeek: shiftedDayOfWeek,
      daysOfWeek: shiftedDaysOfWeek ?? (shiftedDayOfWeek !== undefined ? [shiftedDayOfWeek] : slot.daysOfWeek),
      startDate: shiftedStartDate ?? formatLocalDateTime(targetStart),
      endDate: slot.endDate === null ? null : shiftedEndDate ?? fallbackEnd,
      sourceType: rentalHint
        ? buildTemplateRentalResourceSourceType(rentalHint)
        : slot.sourceType,
      rentalBookingId: rentalHint ? null : slot.rentalBookingId,
      rentalBookingItemId: rentalHint ? null : slot.rentalBookingItemId,
      rentalLocked: rentalHint ? false : slot.rentalLocked,
      price: rentalHint ? undefined : slot.price,
      event: undefined,
      eventId: undefined,
      field: undefined,
    } as TimeSlot;
  });
};

const clearParticipants = (event: Partial<Event>): Partial<Event> => ({
  ...event,
  teamIds: [],
  userIds: [],
  waitListIds: [],
  freeAgentIds: [],
  teams: [],
  players: [],
  attendees: 0,
});

type DivisionRemapParams = {
  divisionIdMap: Map<string, string>;
  targetEventId: string;
  fieldIdMap?: Map<string, string>;
};

const normalizeDivisionIdentifier = (value: unknown): string | null => normalizeDivisionIdToken(value);

const resolveDivisionToken = (value: unknown): string | null => {
  const normalized = normalizeDivisionIdentifier(value);
  if (!normalized) return null;
  return extractDivisionTokenFromId(normalized) ?? normalized;
};

const isScopedDivisionIdentifier = (value: string): boolean => value.includes('__division__');

const buildTargetDivisionId = (
  targetEventId: string,
  token: string,
  duplicateIndex: number,
): string => buildEventDivisionId(
  duplicateIndex === 0 ? targetEventId : `${targetEventId}_${duplicateIndex + 1}`,
  token,
);

const buildDivisionIdMap = (source: Event, targetEventId: string): Map<string, string> => {
  const divisionIdMap = new Map<string, string>();
  const targetIds = new Set<string>();
  const tokenCounts = new Map<string, number>();

  const allocateTargetId = (token: string): string => {
    let duplicateIndex = tokenCounts.get(token) ?? 0;
    let targetId = buildTargetDivisionId(targetEventId, token, duplicateIndex);
    while (targetIds.has(targetId)) {
      duplicateIndex += 1;
      targetId = buildTargetDivisionId(targetEventId, token, duplicateIndex);
    }
    tokenCounts.set(token, duplicateIndex + 1);
    targetIds.add(targetId);
    return targetId;
  };

  const registerDivisionAliases = (values: unknown[]): void => {
    const aliases = Array.from(new Set(
      values
        .map((value) => normalizeDivisionIdentifier(value))
        .filter((value): value is string => Boolean(value)),
    ));
    if (aliases.length === 0) {
      return;
    }

    const scopedAlias = aliases.find(isScopedDivisionIdentifier);
    const existingTarget = scopedAlias
      ? divisionIdMap.get(scopedAlias)
      : aliases.map((alias) => divisionIdMap.get(alias)).find((value): value is string => Boolean(value));
    const token = resolveDivisionToken(scopedAlias ?? aliases[0]);
    if (!token) {
      return;
    }
    const targetId = existingTarget ?? allocateTargetId(token);

    aliases.forEach((alias) => {
      if (!divisionIdMap.has(alias)) {
        divisionIdMap.set(alias, targetId);
      }
      const aliasToken = resolveDivisionToken(alias);
      if (aliasToken && !divisionIdMap.has(aliasToken)) {
        divisionIdMap.set(aliasToken, targetId);
      }
    });
  };

  const registerDivisionDetail = (detail: unknown) => {
    if (!detail || typeof detail !== 'object') {
      return;
    }
    const row = detail as Record<string, unknown>;
    registerDivisionAliases([row.id, row.key]);
    if (Array.isArray(row.playoffPlacementDivisionIds)) {
      row.playoffPlacementDivisionIds.forEach((divisionId) =>
        registerDivisionAliases([divisionId]),
      );
    }
  };

  if (Array.isArray(source.divisions)) {
    source.divisions.forEach((entry) => {
      if (typeof entry === 'string') {
        registerDivisionAliases([entry]);
        return;
      }
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const row = entry as Partial<Division>;
      registerDivisionAliases([row.id, row.key]);
    });
  }

  if (Array.isArray(source.divisionDetails)) {
    source.divisionDetails.forEach(registerDivisionDetail);
  }
  if (Array.isArray(source.playoffDivisionDetails)) {
    source.playoffDivisionDetails.forEach(registerDivisionDetail);
  }
  if (Array.isArray(source.timeSlots)) {
    source.timeSlots.forEach((slot) => {
      if (Array.isArray(slot.divisions)) {
        slot.divisions.forEach((divisionId) =>
          registerDivisionAliases([divisionId]),
        );
      }
    });
  }
  if (Array.isArray(source.fields)) {
    source.fields.forEach((field) => {
      const fieldDivisions = (field as Field & { divisions?: unknown[] }).divisions;
      if (Array.isArray(fieldDivisions)) {
        fieldDivisions.forEach((divisionId) =>
          registerDivisionAliases([divisionId]),
        );
      }
    });
  }
  if (source.divisionFieldIds && typeof source.divisionFieldIds === 'object' && !Array.isArray(source.divisionFieldIds)) {
    Object.keys(source.divisionFieldIds).forEach((divisionId) => {
      registerDivisionAliases([divisionId]);
    });
  }

  return divisionIdMap;
};

const remapDivisionIdentifier = (
  value: unknown,
  params: DivisionRemapParams,
): string | null => {
  const normalized = normalizeDivisionIdentifier(value);
  if (!normalized) return null;
  const token = resolveDivisionToken(normalized);
  if (!token) return null;
  return params.divisionIdMap.get(normalized)
    ?? params.divisionIdMap.get(token)
    ?? buildEventDivisionId(params.targetEventId, token);
};

const remapDivisionIdentifierList = (
  value: unknown,
  params: DivisionRemapParams,
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const next: string[] = [];
  value.forEach((entry) => {
    const remapped = remapDivisionIdentifier(entry, params);
    if (!remapped || seen.has(remapped)) {
      return;
    }
    seen.add(remapped);
    next.push(remapped);
  });
  return next;
};

const remapPlacementDivisionIds = (
  value: unknown,
  params: DivisionRemapParams,
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (typeof entry === 'string' && entry.trim().length === 0) {
      return '';
    }
    return remapDivisionIdentifier(entry, params) ?? '';
  });
};

const remapDivisionDetails = (
  details: Event['divisionDetails'],
  params: DivisionRemapParams,
): Event['divisionDetails'] => {
  if (!Array.isArray(details)) {
    return undefined;
  }
  return details.map((detail) => {
    const token = resolveDivisionToken(detail.id ?? detail.key) ?? 'open';
    const id = remapDivisionIdentifier(detail.id ?? detail.key ?? token, params)
      ?? buildEventDivisionId(params.targetEventId, token);
    return {
      ...detail,
      id,
      key: typeof detail.key === 'string' && detail.key.trim().length > 0 ? detail.key : token,
      playoffPlacementDivisionIds: Array.isArray(detail.playoffPlacementDivisionIds)
        ? remapPlacementDivisionIds(detail.playoffPlacementDivisionIds, params)
        : detail.playoffPlacementDivisionIds,
    };
  });
};

const remapEventDivisionIds = (
  source: Event,
  remappedDivisionDetails: Event['divisionDetails'],
  params: DivisionRemapParams,
): string[] => {
  const sourceDivisionIds = Array.isArray(source.divisions)
    ? source.divisions.flatMap((entry) => {
      if (typeof entry === 'string') {
        return [entry];
      }
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const row = entry as Partial<Division>;
      return [row.id ?? '', row.key ?? ''];
    })
    : [];
  const remappedIds = remapDivisionIdentifierList(sourceDivisionIds, params);
  if (remappedIds.length > 0) {
    return remappedIds;
  }
  if (Array.isArray(remappedDivisionDetails) && remappedDivisionDetails.length > 0) {
    return remappedDivisionDetails.map((detail) => detail.id);
  }
  return [];
};

const remapDivisionFieldIds = (
  value: Event['divisionFieldIds'],
  params: DivisionRemapParams,
): Event['divisionFieldIds'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const next: Record<string, string[]> = {};
  Object.entries(value).forEach(([divisionId, fieldIds]) => {
    const remappedDivisionId = remapDivisionIdentifier(divisionId, params);
    if (!remappedDivisionId) {
      return;
    }
    const normalizedFieldIds = Array.isArray(fieldIds)
      ? fieldIds
          .map((fieldId) => String(fieldId))
          .filter((fieldId) => fieldId.length > 0)
          .map((fieldId) => params.fieldIdMap?.get(fieldId) ?? fieldId)
      : [];
    next[remappedDivisionId] = Array.from(new Set(normalizedFieldIds));
  });
  return next;
};

const remapFieldDivisionLists = (
  fields: Field[],
  params: DivisionRemapParams,
): Field[] => fields.map((field) => {
  const fieldDivisions = (field as Field & { divisions?: unknown[] }).divisions;
  if (!Array.isArray(fieldDivisions)) {
    return field;
  }
  return {
    ...field,
    divisions: remapDivisionIdentifierList(fieldDivisions, params),
  } as Field;
});

const remapTimeSlotDivisionLists = (
  slots: TimeSlot[],
  params: DivisionRemapParams,
): TimeSlot[] => slots.map((slot) => {
  if (!Array.isArray(slot.divisions)) {
    return slot;
  }
  return {
    ...slot,
    divisions: remapDivisionIdentifierList(slot.divisions, params),
  } as TimeSlot;
});

export const cloneEventAsTemplate = (
  source: Event,
  options?: { templateId?: string; idFactory?: () => string },
): Event => {
  const templateId = options?.templateId ?? createId();
  const idFactory = options?.idFactory ?? createId;

  const isOrganizationEvent = Boolean(source.organizationId);
  const sourceFields = Array.isArray(source.fields) ? source.fields as Field[] : [];
  const sourceSlots = Array.isArray(source.timeSlots) ? source.timeSlots as TimeSlot[] : [];
  const rentalOnlyFieldIds = getRentalOnlyFieldIds(sourceSlots);
  const templateSourceFields = sourceFields.filter((field) => !rentalOnlyFieldIds.has(field.$id));
  const sourceFieldById = new Map(sourceFields.map((field) => [field.$id, field]));
  const { clonedFields, fieldIdMap } = splitTemplateFields(templateSourceFields, idFactory);
  const hasLocalFields = clonedFields.length > 0;
  const fieldIds = resolveTemplateFieldIds(source, fieldIdMap, rentalOnlyFieldIds);
  const sourceStart = parseLocalDateTime(source.start) ?? new Date();
  const sourceEnd = parseLocalDateTime(source.end) ?? sourceStart;

  const timeSlots = sourceSlots.length > 0
    ? cloneTimeSlots(sourceSlots, {
      idFactory,
      scheduledFieldIdMap: fieldIdMap,
      sourceStart,
      targetStart: sourceStart,
      fallbackEnd: formatLocalDateTime(sourceEnd),
      rentalSourceFieldIds: rentalOnlyFieldIds,
      sourceFieldById,
      sourceEvent: source,
    })
    : [];

  const divisionRemapParams: DivisionRemapParams = {
    divisionIdMap: buildDivisionIdMap(source, templateId),
    targetEventId: templateId,
    fieldIdMap,
  };
  const remappedDivisionDetails = remapDivisionDetails(source.divisionDetails, divisionRemapParams);
  const remappedPlayoffDivisionDetails = remapDivisionDetails(source.playoffDivisionDetails, divisionRemapParams);
  const remappedDivisions = remapEventDivisionIds(source, remappedDivisionDetails, divisionRemapParams);
  const remappedTimeSlots = remapTimeSlotDivisionLists(timeSlots, divisionRemapParams);
  const remappedFields = hasLocalFields
    ? remapFieldDivisionLists(clonedFields, divisionRemapParams)
    : undefined;
  const remappedDivisionFieldIds = remapDivisionFieldIds(source.divisionFieldIds, divisionRemapParams);

  const template: Event = {
    ...(clearParticipants(source) as Event),
    $id: templateId,
    name: addEventTemplateSuffix(source.name),
    state: 'TEMPLATE',
    matches: [],
    divisions: remappedDivisions,
    divisionDetails: remappedDivisionDetails,
    playoffDivisionDetails: remappedPlayoffDivisionDetails,
    divisionFieldIds: remappedDivisionFieldIds,
    timeSlots: remappedTimeSlots,
    timeSlotIds: remappedTimeSlots.map((slot) => slot.$id),
    fieldIds,
    fields: remappedFields,
    // Org templates are shared across org managers; host gets chosen when instantiating an event.
    hostId: isOrganizationEvent ? '' : source.hostId,
    $createdAt: '',
    $updatedAt: '',
  };

  return template;
};

export const seedEventFromTemplate = (
  template: Event,
  params: {
    newEventId: string;
    newStartDate: Date;
    hostId?: string;
    idFactory?: () => string;
  },
): Event => {
  const idFactory = params.idFactory ?? createId;

  const templateStart = parseLocalDateTime(template.start) ?? new Date();
  const templateEnd = parseLocalDateTime(template.end) ?? templateStart;
  const durationMs = Math.max(templateEnd.getTime() - templateStart.getTime(), 0);

  const nextStart = new Date(params.newStartDate);
  nextStart.setHours(templateStart.getHours(), templateStart.getMinutes(), templateStart.getSeconds(), 0);
  const nextEnd = new Date(nextStart.getTime() + durationMs);

  const nextStartStr = formatLocalDateTime(nextStart);
  const nextEndStr = formatLocalDateTime(nextEnd);

  const templateFields = Array.isArray(template.fields) ? template.fields as Field[] : [];
  const { clonedFields, fieldIdMap } = splitTemplateFields(templateFields, idFactory);
  const hasLocalFields = clonedFields.length > 0;
  const fieldIds = resolveTemplateFieldIds(template, fieldIdMap);

  const timeSlots = Array.isArray(template.timeSlots) && template.timeSlots.length > 0
    ? cloneTimeSlots(template.timeSlots as TimeSlot[], {
      idFactory,
      scheduledFieldIdMap: fieldIdMap,
      sourceStart: templateStart,
      targetStart: nextStart,
      fallbackEnd: nextEndStr,
    })
    : [];

  const divisionRemapParams: DivisionRemapParams = {
    divisionIdMap: buildDivisionIdMap(template, params.newEventId),
    targetEventId: params.newEventId,
    fieldIdMap,
  };
  const remappedDivisionDetails = remapDivisionDetails(template.divisionDetails, divisionRemapParams);
  const remappedPlayoffDivisionDetails = remapDivisionDetails(template.playoffDivisionDetails, divisionRemapParams);
  const remappedDivisions = remapEventDivisionIds(template, remappedDivisionDetails, divisionRemapParams);
  const remappedTimeSlots = remapTimeSlotDivisionLists(timeSlots, divisionRemapParams);
  const remappedFields = hasLocalFields
    ? remapFieldDivisionLists(clonedFields, divisionRemapParams)
    : undefined;
  const remappedDivisionFieldIds = remapDivisionFieldIds(template.divisionFieldIds, divisionRemapParams);

  const seeded: Event = {
    ...(clearParticipants(template) as Event),
    $id: params.newEventId,
    name: stripEventTemplateSuffix(template.name),
    state: 'DRAFT',
    hostId: params.hostId ?? template.hostId,
    start: nextStartStr,
    end: nextEndStr,
    matches: [],
    divisions: remappedDivisions,
    divisionDetails: remappedDivisionDetails,
    playoffDivisionDetails: remappedPlayoffDivisionDetails,
    divisionFieldIds: remappedDivisionFieldIds,
    timeSlots: remappedTimeSlots,
    timeSlotIds: remappedTimeSlots.map((slot) => slot.$id),
    fieldIds,
    fields: remappedFields,
    $createdAt: '',
    $updatedAt: '',
    attendees: 0,
  };

  return seeded;
};
