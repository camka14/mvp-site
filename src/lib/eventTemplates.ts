import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { createId } from '@/lib/id';
import type { Event, Field, TimeSlot } from '@/types';

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
      end: source.end,
    })
    : [];

  const template: Event = {
    ...(clearParticipants(source) as Event),
    $id: templateId,
    name: addEventTemplateSuffix(source.name),
    state: 'TEMPLATE',
    // Templates are a clean starting point: do not carry over assigned referees either.
    referees: [],
    refereeIds: [],
    matches: [],
    timeSlots,
    timeSlotIds: timeSlots.map((slot) => slot.$id),
    fieldIds,
    fields: hasLocalFields ? clonedFields : undefined,
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

  const seeded: Event = {
    ...(clearParticipants(template) as Event),
    $id: params.newEventId,
    name: stripEventTemplateSuffix(template.name),
    state: 'DRAFT',
    hostId: params.hostId ?? template.hostId,
    start: nextStartStr,
    end: nextEndStr,
    referees: [],
    refereeIds: [],
    matches: [],
    timeSlots,
    timeSlotIds: timeSlots.map((slot) => slot.$id),
    fieldIds,
    fields: hasLocalFields ? clonedFields : undefined,
    $createdAt: '',
    $updatedAt: '',
    attendees: 0,
  };

  return seeded;
};
