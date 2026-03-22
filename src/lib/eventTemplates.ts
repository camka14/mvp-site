import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import {
  buildEventDivisionId,
  extractDivisionTokenFromId,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';
import { createId } from '@/lib/id';
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
  const fields = sourceFields.map((field, idx) => {
    const nextId = idFactory();
    idMap.set(field.$id, nextId);
    return {
      ...field,
      $id: nextId,
      fieldNumber: Number.isFinite(field.fieldNumber) ? field.fieldNumber : idx + 1,
      // Ensure these don't carry over hydrated backrefs that can cause cycles or unintended coupling.
      matches: undefined,
      events: undefined,
      organization: undefined,
      rentalSlots: undefined,
    } as Field;
  });
  return { fields, idMap };
};

const cloneTimeSlots = (
  sourceSlots: TimeSlot[],
  params: {
    idFactory: () => string;
    scheduledFieldIdMap?: Map<string, string>;
    start: string;
    end: string;
  },
): TimeSlot[] => {
  const { idFactory, scheduledFieldIdMap, start, end } = params;
  return sourceSlots.map((slot) => {
    const scheduledFieldIds = Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
      ? slot.scheduledFieldIds
          .map((fieldId) => scheduledFieldIdMap?.get(fieldId) ?? fieldId)
      : slot.scheduledFieldId
      ? [scheduledFieldIdMap?.get(slot.scheduledFieldId) ?? slot.scheduledFieldId]
      : [];
    const scheduledFieldId = scheduledFieldIds[0] ?? slot.scheduledFieldId;

    return {
      ...slot,
      $id: idFactory(),
      scheduledFieldId,
      scheduledFieldIds,
      // Align with the new event window (EventForm will also re-stamp these on save for leagues).
      startDate: start,
      endDate: end,
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

const registerDivisionAlias = (
  divisionIdMap: Map<string, string>,
  targetEventId: string,
  value: unknown,
): void => {
  const normalized = normalizeDivisionIdentifier(value);
  if (!normalized) return;
  const token = resolveDivisionToken(normalized);
  if (!token) return;
  const scopedId = buildEventDivisionId(targetEventId, token);
  divisionIdMap.set(normalized, scopedId);
  divisionIdMap.set(token, scopedId);
};

const buildDivisionIdMap = (source: Event, targetEventId: string): Map<string, string> => {
  const divisionIdMap = new Map<string, string>();

  const registerDivisionDetail = (detail: unknown) => {
    if (!detail || typeof detail !== 'object') {
      return;
    }
    const row = detail as Record<string, unknown>;
    registerDivisionAlias(divisionIdMap, targetEventId, row.id);
    registerDivisionAlias(divisionIdMap, targetEventId, row.key);
    if (Array.isArray(row.playoffPlacementDivisionIds)) {
      row.playoffPlacementDivisionIds.forEach((divisionId) =>
        registerDivisionAlias(divisionIdMap, targetEventId, divisionId),
      );
    }
  };

  if (Array.isArray(source.divisions)) {
    source.divisions.forEach((entry) => {
      if (typeof entry === 'string') {
        registerDivisionAlias(divisionIdMap, targetEventId, entry);
        return;
      }
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const row = entry as Partial<Division>;
      registerDivisionAlias(divisionIdMap, targetEventId, row.id);
      registerDivisionAlias(divisionIdMap, targetEventId, row.key);
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
          registerDivisionAlias(divisionIdMap, targetEventId, divisionId),
        );
      }
    });
  }
  if (Array.isArray(source.fields)) {
    source.fields.forEach((field) => {
      const fieldDivisions = (field as Field & { divisions?: unknown[] }).divisions;
      if (Array.isArray(fieldDivisions)) {
        fieldDivisions.forEach((divisionId) =>
          registerDivisionAlias(divisionIdMap, targetEventId, divisionId),
        );
      }
    });
  }
  if (source.divisionFieldIds && typeof source.divisionFieldIds === 'object' && !Array.isArray(source.divisionFieldIds)) {
    Object.keys(source.divisionFieldIds).forEach((divisionId) => {
      registerDivisionAlias(divisionIdMap, targetEventId, divisionId);
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
  const hasLocalFields = !isOrganizationEvent && Array.isArray(source.fields) && source.fields.length > 0;
  const localFieldsClone = hasLocalFields ? cloneLocalFields(source.fields as Field[], idFactory) : null;
  const clonedFields = localFieldsClone?.fields ?? [];
  const fieldIdMap = localFieldsClone?.idMap ?? new Map<string, string>();

  const fieldIds = hasLocalFields
    ? clonedFields.map((field) => field.$id)
    : Array.isArray(source.fieldIds)
      ? source.fieldIds
      : Array.isArray(source.fields)
        ? (source.fields as Field[]).map((field) => field.$id)
        : [];

  const timeSlots = Array.isArray(source.timeSlots) && source.timeSlots.length > 0
    ? cloneTimeSlots(source.timeSlots as TimeSlot[], {
      idFactory,
      scheduledFieldIdMap: hasLocalFields ? fieldIdMap : undefined,
      start: source.start,
      end: source.end ?? source.start,
    })
    : [];

  const divisionRemapParams: DivisionRemapParams = {
    divisionIdMap: buildDivisionIdMap(source, templateId),
    targetEventId: templateId,
    fieldIdMap: hasLocalFields ? fieldIdMap : undefined,
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
    // Templates are a clean starting point: do not carry over assigned officials either.
    officials: [],
    officialIds: [],
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

  const isOrganizationTemplate = Boolean(template.organizationId);
  const hasLocalFields = !isOrganizationTemplate && Array.isArray(template.fields) && template.fields.length > 0;
  const localFieldsClone = hasLocalFields ? cloneLocalFields(template.fields as Field[], idFactory) : null;
  const clonedFields = localFieldsClone?.fields ?? [];
  const fieldIdMap = localFieldsClone?.idMap ?? new Map<string, string>();

  const fieldIds = hasLocalFields
    ? clonedFields.map((field) => field.$id)
    : Array.isArray(template.fieldIds)
      ? template.fieldIds
      : Array.isArray(template.fields)
        ? (template.fields as Field[]).map((field) => field.$id)
        : [];

  const timeSlots = Array.isArray(template.timeSlots) && template.timeSlots.length > 0
    ? cloneTimeSlots(template.timeSlots as TimeSlot[], {
      idFactory,
      scheduledFieldIdMap: hasLocalFields ? fieldIdMap : undefined,
      start: nextStartStr,
      end: nextEndStr,
    })
    : [];

  const divisionRemapParams: DivisionRemapParams = {
    divisionIdMap: buildDivisionIdMap(template, params.newEventId),
    targetEventId: params.newEventId,
    fieldIdMap: hasLocalFields ? fieldIdMap : undefined,
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
    officials: [],
    officialIds: [],
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
