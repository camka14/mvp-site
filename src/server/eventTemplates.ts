import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  buildTemplateRentalResourceHintFromField,
  buildTemplateRentalResourceSourceType,
} from '@/lib/templateRentalResources';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { stripEventTemplateSuffix } from '@/lib/eventTemplates';
import type { Event, Field, TimeSlot } from '@/types';

type PrismaClientLike = typeof prisma;

type TemplateBundle = {
  template: any;
  resources: any[];
  timeSlots: any[];
  rentalHints: any[];
  leagueScoringConfig: any | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean),
    ),
  );
};

const normalizeNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry));
};

const normalizeDateArray = (value: unknown): Date[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (entry instanceof Date) return entry;
      if (typeof entry === 'string' || typeof entry === 'number') return new Date(entry);
      return null;
    })
    .filter((entry): entry is Date => Boolean(entry && !Number.isNaN(entry.getTime())));
};

const toIsoDateArray = (value: unknown): string[] => normalizeDateArray(value).map((date) => date.toISOString());

const getId = (value: unknown): string | null => {
  if (typeof value === 'string') return normalizeId(value);
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return normalizeId(row.id) ?? normalizeId(row.$id);
};

const getArrayValues = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value as Record<string, T>);
  return [];
};

const getEventFields = (event: Partial<Event>): Field[] => getArrayValues<Field>((event as any).fields)
  .filter((field) => Boolean(getId(field)));

const getEventTimeSlots = (event: Partial<Event>): TimeSlot[] => getArrayValues<TimeSlot>((event as any).timeSlots)
  .filter((slot) => Boolean(getId(slot)));

const getSlotResourceIds = (slot: TimeSlot): string[] => {
  if (Array.isArray((slot as any).scheduledFieldIds) && (slot as any).scheduledFieldIds.length) {
    return normalizeStringArray((slot as any).scheduledFieldIds);
  }
  if (slot.scheduledFieldId) {
    return normalizeStringArray([slot.scheduledFieldId]);
  }
  if (Array.isArray((slot as any).fieldIds) && (slot as any).fieldIds.length) {
    return normalizeStringArray((slot as any).fieldIds);
  }
  if ((slot as any).field) {
    return normalizeStringArray([(slot as any).field]);
  }
  return [];
};

const getSlotDivisionIds = (slot: TimeSlot): string[] => {
  if (!Array.isArray(slot.divisions)) {
    return [];
  }
  return Array.from(
    new Set(
      slot.divisions
        .map((division) => getId(division))
        .filter((divisionId): divisionId is string => Boolean(divisionId)),
    ),
  );
};

const isRentalBackedTimeSlot = (slot: TimeSlot): boolean => (
  slot.rentalLocked === true
  || Boolean(normalizeId(slot.rentalBookingId))
  || Boolean(normalizeId(slot.rentalBookingItemId))
  || normalizeId(slot.sourceType)?.toUpperCase() === 'RENTAL_BOOKING'
);

const getRentalOnlyResourceIds = (slots: TimeSlot[]): Set<string> => {
  const rentalResourceIds = new Set<string>();
  const nonRentalResourceIds = new Set<string>();
  slots.forEach((slot) => {
    getSlotResourceIds(slot).forEach((resourceId) => {
      if (isRentalBackedTimeSlot(slot)) {
        rentalResourceIds.add(resourceId);
      } else {
        nonRentalResourceIds.add(resourceId);
      }
    });
  });
  return new Set(Array.from(rentalResourceIds).filter((resourceId) => !nonRentalResourceIds.has(resourceId)));
};

const coerceDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsedLocal = parseLocalDateTime(value);
    if (parsedLocal) return parsedLocal;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const offsetMinutes = (value: unknown, base: Date): number | null => {
  const date = coerceDate(value);
  if (!date) return null;
  return Math.round((date.getTime() - base.getTime()) / 60000);
};

const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60000);

const getCoordinates = (value: unknown): [number, number] => {
  if (!Array.isArray(value)) return [0, 0];
  const numbers = value.filter((entry): entry is number => typeof entry === 'number');
  if (numbers.length >= 2) return [numbers[0], numbers[1]];
  return [0, 0];
};

const getTemplateEventType = (value: unknown): Event['eventType'] => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT', 'TRYOUT', 'AFFILIATE'].includes(normalized)) {
    return normalized as Event['eventType'];
  }
  return 'EVENT';
};

const getRegistrationPaymentMode = (value: unknown): 'ONLINE' | 'MANUAL' => (
  typeof value === 'string' && value.toUpperCase() === 'MANUAL' ? 'MANUAL' : 'ONLINE'
);

const buildTemplateRentalHintKey = (sourceResourceId: string, slotId: string): string =>
  `${slotId}:${sourceResourceId}`;

export const mapSourceEventToTemplateBundle = (
  source: Event,
  params: {
    templateId: string;
    createdByUserId: string;
  },
): TemplateBundle => {
  const sourceStart = coerceDate(source.start) ?? new Date();
  const sourceEndOffset = source.end ? offsetMinutes(source.end, sourceStart) : null;
  const fields = getEventFields(source);
  const slots = getEventTimeSlots(source);
  const fieldById = new Map<string, Field>();
  fields.forEach((field) => {
    const fieldId = getId(field);
    if (fieldId) {
      fieldById.set(fieldId, field);
    }
  });
  const rentalOnlyResourceIds = getRentalOnlyResourceIds(slots);
  const resourceIdBySourceId = new Map<string, string>();

  const resources = fields
    .filter((field) => {
      const sourceResourceId = getId(field);
      return Boolean(sourceResourceId && !rentalOnlyResourceIds.has(sourceResourceId));
    })
    .map((field, index) => {
      const sourceResourceId = getId(field) ?? '';
      const templateResourceId = createId();
      resourceIdBySourceId.set(sourceResourceId, templateResourceId);
      const facility = typeof (field as any).facility === 'object' && (field as any).facility
        ? (field as any).facility as Record<string, unknown>
        : null;
      return {
        id: templateResourceId,
        templateId: params.templateId,
        sourceResourceId,
        name: normalizeString(field.name) ?? null,
        resourceType: normalizeString((field as any).resourceType) ?? 'FIELD',
        location: normalizeString(field.location) ?? null,
        organizationId: normalizeId((field as any).organizationId) ?? getId((field as any).organization),
        facilityId: normalizeId((field as any).facilityId) ?? getId((field as any).facility),
        facilityName: normalizeString(facility?.name) ?? normalizeString((field as any).facilityName) ?? null,
        lat: typeof field.lat === 'number' ? field.lat : null,
        long: typeof field.long === 'number' ? field.long : null,
        heading: typeof field.heading === 'number' ? field.heading : null,
        sortOrder: index,
      };
    });

  const rentalHints: any[] = [];
  const rentalHintIdByKey = new Map<string, string>();
  const ensureRentalHint = (sourceResourceId: string, slotId: string): string => {
    const key = buildTemplateRentalHintKey(sourceResourceId, slotId);
    const existing = rentalHintIdByKey.get(key);
    if (existing) return existing;

    const field = fieldById.get(sourceResourceId);
    const hint = buildTemplateRentalResourceHintFromField(field, source);
    const id = createId();
    rentalHintIdByKey.set(key, id);
    rentalHints.push({
      id,
      templateId: params.templateId,
      sourceResourceId,
      sourceOrganizationId: hint.organizationId ?? null,
      name: hint.fieldName ?? null,
      facilityName: hint.facilityName ?? null,
      location: hint.location ?? null,
      resourceType: normalizeString((field as any)?.resourceType) ?? 'FIELD',
      notes: hint.organizationSlug
        ? JSON.stringify({ organizationSlug: hint.organizationSlug })
        : null,
    });
    return id;
  };

  const timeSlots = slots.map((slot, index) => {
    const slotId = getId(slot) ?? '';
    const sourceResourceIds = getSlotResourceIds(slot);
    const rentalBacked = isRentalBackedTimeSlot(slot);
    const rentalResourceHintIds = rentalBacked
      ? sourceResourceIds.map((resourceId) => ensureRentalHint(resourceId, slotId))
      : [];
    const templateResourceIds = rentalBacked
      ? []
      : sourceResourceIds
          .map((resourceId) => resourceIdBySourceId.get(resourceId))
          .filter((resourceId): resourceId is string => Boolean(resourceId));
    const startOffset = offsetMinutes(slot.startDate, sourceStart) ?? 0;
    const endOffset = offsetMinutes(slot.endDate, sourceStart) ?? startOffset;
    return {
      id: createId(),
      templateId: params.templateId,
      sourceTimeSlotId: slotId || null,
      dayOffsetFromEventStart: Math.trunc(startOffset / 1440),
      startOffsetMinutesFromEventStart: startOffset,
      endOffsetMinutesFromEventStart: endOffset,
      startTimeMinutes: typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null,
      endTimeMinutes: typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null,
      daysOfWeek: Array.isArray(slot.daysOfWeek)
        ? slot.daysOfWeek.map((day) => Number(day)).filter((day) => Number.isInteger(day))
        : typeof slot.dayOfWeek === 'number'
          ? [slot.dayOfWeek]
          : [],
      divisions: getSlotDivisionIds(slot),
      templateResourceIds,
      rentalResourceHintIds,
      requiredTemplateIds: normalizeStringArray(slot.requiredTemplateIds),
      hostRequiredTemplateIds: normalizeStringArray(slot.hostRequiredTemplateIds),
      price: rentalBacked ? null : typeof slot.price === 'number' ? slot.price : null,
      sortOrder: index,
    };
  });

  const leagueScoringConfig = source.leagueScoringConfig
    ? {
        id: createId(),
        eventTemplateId: params.templateId,
        pointsForWin: source.leagueScoringConfig.pointsForWin ?? null,
        pointsForDraw: source.leagueScoringConfig.pointsForDraw ?? null,
        pointsForLoss: source.leagueScoringConfig.pointsForLoss ?? null,
        pointsPerSetWin: source.leagueScoringConfig.pointsPerSetWin ?? null,
        pointsPerSetLoss: source.leagueScoringConfig.pointsPerSetLoss ?? null,
        pointsPerGameWin: source.leagueScoringConfig.pointsPerGameWin ?? null,
        pointsPerGameLoss: source.leagueScoringConfig.pointsPerGameLoss ?? null,
        pointsPerGoalScored: source.leagueScoringConfig.pointsPerGoalScored ?? null,
        pointsPerGoalConceded: source.leagueScoringConfig.pointsPerGoalConceded ?? null,
      }
    : null;

  const sourceOrganizationId = normalizeId(source.organizationId)
    ?? getId(source.organization);
  const isOrganizationTemplate = Boolean(sourceOrganizationId);

  return {
    template: {
      id: params.templateId,
      name: stripEventTemplateSuffix(source.name || 'Untitled Template') || 'Untitled Template',
      description: source.description || null,
      sourceEventId: getId(source),
      ownerUserId: isOrganizationTemplate ? null : normalizeId(source.hostId),
      organizationId: sourceOrganizationId,
      createdByUserId: params.createdByUserId,
      sportId: normalizeId(source.sportId) ?? getId(source.sport),
      eventType: getTemplateEventType(source.eventType),
      timeZone: normalizeString(source.timeZone) ?? 'UTC',
      endOffsetMinutesFromEventStart: sourceEndOffset,
      location: source.location || '',
      address: source.address || null,
      affiliateUrl: source.affiliateUrl || null,
      winnerSetCount: source.winnerSetCount ?? null,
      loserSetCount: source.loserSetCount ?? null,
      doubleElimination: source.doubleElimination ?? null,
      rating: source.rating ?? null,
      teamSizeLimit: source.teamSizeLimit ?? 1,
      maxParticipants: source.maxParticipants ?? null,
      minAge: source.minAge ?? null,
      maxAge: source.maxAge ?? null,
      assistantHostIds: normalizeStringArray(source.assistantHostIds),
      noFixedEndDateTime: source.noFixedEndDateTime !== false,
      price: source.price ?? 0,
      registrationPaymentMode: getRegistrationPaymentMode(source.registrationPaymentMode),
      manualPaymentLinks: Array.isArray(source.manualPaymentLinks) ? source.manualPaymentLinks : [],
      manualPaymentInstructions: source.manualPaymentInstructions ?? null,
      taxHandling: source.taxHandling ?? 'INHERIT_ORG',
      organizerManualTaxRateBps: source.organizerManualTaxRateBps ?? 0,
      singleDivision: source.singleDivision ?? null,
      registrationByDivisionType: source.registrationByDivisionType ?? null,
      cancellationRefundHours: source.cancellationRefundHours ?? null,
      teamSignup: source.teamSignup ?? null,
      prize: source.prize ?? null,
      registrationCutoffHours: source.registrationCutoffHours ?? null,
      seedColor: source.seedColor ?? null,
      imageId: source.imageId ?? null,
      winnerBracketPointsToVictory: normalizeNumberArray(source.winnerBracketPointsToVictory),
      loserBracketPointsToVictory: normalizeNumberArray(source.loserBracketPointsToVictory),
      coordinates: getCoordinates(source.coordinates),
      gamesPerOpponent: source.gamesPerOpponent ?? null,
      includePlayoffs: source.includePlayoffs ?? null,
      playoffTeamCount: source.playoffTeamCount ?? null,
      usesSets: source.usesSets ?? null,
      matchDurationMinutes: source.matchDurationMinutes ?? null,
      setDurationMinutes: source.setDurationMinutes ?? null,
      setsPerMatch: source.setsPerMatch ?? null,
      restTimeMinutes: source.restTimeMinutes ?? null,
      pointsToVictory: normalizeNumberArray(source.pointsToVictory),
      officialSchedulingMode: source.officialSchedulingMode ?? 'SCHEDULE',
      doTeamsOfficiate: source.doTeamsOfficiate ?? null,
      teamOfficialsMaySwap: source.teamOfficialsMaySwap ?? null,
      officialPositions: Array.isArray(source.officialPositions) ? source.officialPositions : [],
      matchRulesOverride: source.matchRulesOverride ?? null,
      autoCreatePointMatchIncidents: source.autoCreatePointMatchIncidents ?? false,
      allowPaymentPlans: source.allowPaymentPlans ?? null,
      installmentCount: source.installmentCount ?? null,
      installmentDueDates: normalizeDateArray(source.installmentDueDates),
      installmentDueRelativeDays: normalizeNumberArray(source.installmentDueRelativeDays),
      installmentAmounts: normalizeNumberArray(source.installmentAmounts),
      allowTeamSplitDefault: source.allowTeamSplitDefault ?? null,
      splitLeaguePlayoffDivisions: source.splitLeaguePlayoffDivisions ?? false,
      requiredTemplateIds: normalizeStringArray(source.requiredTemplateIds),
      divisions: normalizeStringArray(source.divisions),
      divisionDetails: Array.isArray(source.divisionDetails)
        ? source.divisionDetails.map((division) => ({
            ...division,
            teamIds: [],
            standingsOverrides: undefined,
            standingsConfirmedAt: undefined,
            standingsConfirmedBy: undefined,
          }))
        : null,
      playoffDivisionDetails: Array.isArray(source.playoffDivisionDetails)
        ? source.playoffDivisionDetails.map((division) => ({
            ...division,
            teamIds: [],
            standingsOverrides: undefined,
            standingsConfirmedAt: undefined,
            standingsConfirmedBy: undefined,
          }))
        : null,
      divisionResourceIds: source.divisionFieldIds ?? null,
      leagueScoringConfigId: leagueScoringConfig?.id ?? null,
    },
    resources,
    timeSlots,
    rentalHints,
    leagueScoringConfig,
  };
};

export const createEventTemplateFromSourceEvent = async (
  source: Event,
  params: {
    createdByUserId: string;
    templateId?: string;
  },
  client: PrismaClientLike = prisma,
) => {
  const templateId = params.templateId ?? createId();
  const bundle = mapSourceEventToTemplateBundle(source, {
    templateId,
    createdByUserId: params.createdByUserId,
  });

  await client.$transaction(async (tx) => {
    await (tx as any).eventTemplates.create({ data: bundle.template });
    if (bundle.resources.length) {
      await (tx as any).eventTemplateResources.createMany({ data: bundle.resources });
    }
    if (bundle.rentalHints.length) {
      await (tx as any).eventTemplateRentalResourceHints.createMany({ data: bundle.rentalHints });
    }
    if (bundle.timeSlots.length) {
      await (tx as any).eventTemplateTimeSlots.createMany({ data: bundle.timeSlots });
    }
    if (bundle.leagueScoringConfig) {
      await (tx as any).eventTemplateLeagueScoringConfigs.create({ data: bundle.leagueScoringConfig });
    }
  });

  return getEventTemplate(templateId, client);
};

export const listEventTemplates = async (
  where: Record<string, unknown>,
  limit: number,
  client: PrismaClientLike = prisma,
) => {
  const rows = await (client as any).eventTemplates.findMany({
    where: {
      ...where,
      archivedAt: null,
    },
    take: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 50,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    sourceEventId: row.sourceEventId,
    ownerUserId: row.ownerUserId,
    organizationId: row.organizationId,
    sportId: row.sportId,
    eventType: row.eventType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    $createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? '',
    $updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt ?? '',
  }));
};

export const getEventTemplate = async (
  templateId: string,
  client: PrismaClientLike = prisma,
): Promise<TemplateBundle | null> => {
  const [template, resources, timeSlots, rentalHints, leagueScoringConfig] = await Promise.all([
    (client as any).eventTemplates.findUnique({ where: { id: templateId } }),
    (client as any).eventTemplateResources.findMany({ where: { templateId }, orderBy: { sortOrder: 'asc' } }),
    (client as any).eventTemplateTimeSlots.findMany({ where: { templateId }, orderBy: { sortOrder: 'asc' } }),
    (client as any).eventTemplateRentalResourceHints.findMany({ where: { templateId } }),
    (client as any).eventTemplateLeagueScoringConfigs.findUnique({ where: { eventTemplateId: templateId } }),
  ]);
  if (!template || template.archivedAt) {
    return null;
  }
  return { template, resources, timeSlots, rentalHints, leagueScoringConfig };
};

const buildFieldFromResource = (resource: any, id: string): Field => ({
  $id: id,
  name: resource.name ?? 'Resource',
  location: resource.location ?? '',
  lat: typeof resource.lat === 'number' ? resource.lat : 0,
  long: typeof resource.long === 'number' ? resource.long : 0,
  heading: typeof resource.heading === 'number' ? resource.heading : undefined,
  facilityId: resource.facilityId ?? null,
} as Field);

const buildRentalHintSourceType = (hint: any): string => {
  let parsedNotes: Record<string, unknown> = {};
  if (typeof hint.notes === 'string') {
    try {
      parsedNotes = JSON.parse(hint.notes);
    } catch {
      parsedNotes = {};
    }
  }
  return buildTemplateRentalResourceSourceType({
    fieldId: hint.sourceResourceId ?? undefined,
    fieldName: hint.name ?? undefined,
    facilityName: hint.facilityName ?? undefined,
    organizationId: hint.sourceOrganizationId ?? undefined,
    organizationSlug: normalizeString(parsedNotes.organizationSlug),
    location: hint.location ?? undefined,
  });
};

export const buildSeedEventFromTemplate = (
  bundle: TemplateBundle,
  params: {
    newEventId: string;
    newStartDate: Date;
    hostId: string;
  },
): Event => {
  const { template } = bundle;
  const resourceByTemplateId = new Map(bundle.resources.map((resource) => [resource.id, resource]));
  const rentalHintById = new Map(bundle.rentalHints.map((hint) => [hint.id, hint]));
  const localFieldIdByTemplateResourceId = new Map<string, string>();
  const eventFieldIds: string[] = [];
  const fields: Field[] = [];

  bundle.resources.forEach((resource) => {
    const sourceResourceId = normalizeId(resource.sourceResourceId);
    const canReuseSourceResource = Boolean(sourceResourceId && normalizeId(resource.organizationId));
    if (canReuseSourceResource && sourceResourceId) {
      eventFieldIds.push(sourceResourceId);
      return;
    }
    const fieldId = createId();
    localFieldIdByTemplateResourceId.set(resource.id, fieldId);
    eventFieldIds.push(fieldId);
    fields.push(buildFieldFromResource(resource, fieldId));
  });

  const templateStart = new Date(params.newStartDate);
  templateStart.setSeconds(0, 0);
  const endOffset = typeof template.endOffsetMinutesFromEventStart === 'number'
    ? template.endOffsetMinutesFromEventStart
    : 60;
  const eventEnd = addMinutes(templateStart, Math.max(endOffset, 0));

  const timeSlots: TimeSlot[] = bundle.timeSlots.map((slot) => {
    const startDate = addMinutes(templateStart, slot.startOffsetMinutesFromEventStart ?? 0);
    const endDate = addMinutes(templateStart, slot.endOffsetMinutesFromEventStart ?? slot.startOffsetMinutesFromEventStart ?? 0);
    const templateResourceIds = normalizeStringArray(slot.templateResourceIds);
    const rentalHintIds = normalizeStringArray(slot.rentalResourceHintIds);
    const scheduledFieldIds = templateResourceIds
      .map((templateResourceId) => {
        const resource = resourceByTemplateId.get(templateResourceId);
        if (!resource) return null;
        return normalizeId(resource.sourceResourceId) ?? localFieldIdByTemplateResourceId.get(templateResourceId) ?? null;
      })
      .filter((fieldId): fieldId is string => Boolean(fieldId));
    const rentalHints = rentalHintIds
      .map((hintId) => rentalHintById.get(hintId))
      .filter(Boolean);
    return {
      $id: createId(),
      dayOfWeek: Array.isArray(slot.daysOfWeek) ? slot.daysOfWeek[0] : undefined,
      daysOfWeek: Array.isArray(slot.daysOfWeek) ? slot.daysOfWeek : [],
      divisions: normalizeStringArray(slot.divisions),
      startTimeMinutes: slot.startTimeMinutes ?? undefined,
      endTimeMinutes: slot.endTimeMinutes ?? undefined,
      startDate: formatLocalDateTime(startDate),
      endDate: formatLocalDateTime(endDate),
      repeating: false,
      scheduledFieldId: scheduledFieldIds[0],
      scheduledFieldIds,
      sourceType: rentalHints.length ? buildRentalHintSourceType(rentalHints[0]) : null,
      rentalBookingId: null,
      rentalBookingItemId: null,
      rentalLocked: false,
      price: rentalHints.length ? undefined : slot.price ?? undefined,
      requiredTemplateIds: normalizeStringArray(slot.requiredTemplateIds),
      hostRequiredTemplateIds: normalizeStringArray(slot.hostRequiredTemplateIds),
    } as TimeSlot;
  });

  const leagueScoringConfig = bundle.leagueScoringConfig
    ? {
        id: bundle.leagueScoringConfig.id,
        pointsForWin: bundle.leagueScoringConfig.pointsForWin ?? undefined,
        pointsForDraw: bundle.leagueScoringConfig.pointsForDraw ?? undefined,
        pointsForLoss: bundle.leagueScoringConfig.pointsForLoss ?? undefined,
        pointsPerSetWin: bundle.leagueScoringConfig.pointsPerSetWin ?? undefined,
        pointsPerSetLoss: bundle.leagueScoringConfig.pointsPerSetLoss ?? undefined,
        pointsPerGameWin: bundle.leagueScoringConfig.pointsPerGameWin ?? undefined,
        pointsPerGameLoss: bundle.leagueScoringConfig.pointsPerGameLoss ?? undefined,
        pointsPerGoalScored: bundle.leagueScoringConfig.pointsPerGoalScored ?? undefined,
        pointsPerGoalConceded: bundle.leagueScoringConfig.pointsPerGoalConceded ?? undefined,
      }
    : null;

  return {
    $id: params.newEventId,
    name: template.name,
    description: template.description ?? '',
    affiliateUrl: template.affiliateUrl ?? null,
    start: formatLocalDateTime(templateStart),
    end: template.noFixedEndDateTime ? null : formatLocalDateTime(eventEnd),
    timeZone: template.timeZone ?? 'UTC',
    location: template.location ?? '',
    address: template.address ?? '',
    coordinates: getCoordinates(template.coordinates),
    price: template.price ?? 0,
    registrationPaymentMode: getRegistrationPaymentMode(template.registrationPaymentMode),
    manualPaymentLinks: Array.isArray(template.manualPaymentLinks) ? template.manualPaymentLinks : [],
    manualPaymentInstructions: template.manualPaymentInstructions ?? null,
    taxHandling: template.taxHandling ?? 'INHERIT_ORG',
    organizerManualTaxRateBps: template.organizerManualTaxRateBps ?? 0,
    minAge: template.minAge ?? undefined,
    maxAge: template.maxAge ?? undefined,
    rating: template.rating ?? undefined,
    imageId: template.imageId ?? '',
    hostId: params.hostId,
    noFixedEndDateTime: template.noFixedEndDateTime !== false,
    state: 'DRAFT',
    maxParticipants: template.maxParticipants ?? 0,
    teamSizeLimit: template.teamSizeLimit ?? 1,
    restTimeMinutes: template.restTimeMinutes ?? undefined,
    teamSignup: template.teamSignup ?? false,
    singleDivision: template.singleDivision ?? true,
    waitListIds: [],
    freeAgentIds: [],
    teamIds: [],
    userIds: [],
    fieldIds: eventFieldIds,
    timeSlotIds: timeSlots.map((slot) => slot.$id),
    officialIds: [],
    officialSchedulingMode: template.officialSchedulingMode ?? 'SCHEDULE',
    officialPositions: Array.isArray(template.officialPositions) ? template.officialPositions : [],
    eventOfficials: [],
    assistantHostIds: normalizeStringArray(template.assistantHostIds),
    cancellationRefundHours: template.cancellationRefundHours ?? null,
    registrationCutoffHours: template.registrationCutoffHours ?? null,
    seedColor: template.seedColor ?? 0,
    $createdAt: '',
    $updatedAt: '',
    eventType: getTemplateEventType(template.eventType),
    sport: { $id: template.sportId ?? '', name: '' } as any,
    sportId: template.sportId ?? '',
    leagueScoringConfigId: null,
    organizationId: template.organizationId ?? null,
    requiredTemplateIds: normalizeStringArray(template.requiredTemplateIds),
    divisionFieldIds: template.divisionResourceIds ?? undefined,
    allowPaymentPlans: template.allowPaymentPlans ?? undefined,
    installmentCount: template.installmentCount ?? undefined,
    installmentDueDates: toIsoDateArray(template.installmentDueDates),
    installmentDueRelativeDays: normalizeNumberArray(template.installmentDueRelativeDays),
    installmentAmounts: normalizeNumberArray(template.installmentAmounts),
    allowTeamSplitDefault: template.allowTeamSplitDefault ?? undefined,
    registrationByDivisionType: template.registrationByDivisionType ?? undefined,
    splitLeaguePlayoffDivisions: template.splitLeaguePlayoffDivisions ?? undefined,
    divisions: normalizeStringArray(template.divisions),
    divisionDetails: Array.isArray(template.divisionDetails) ? template.divisionDetails : undefined,
    playoffDivisionDetails: Array.isArray(template.playoffDivisionDetails) ? template.playoffDivisionDetails : undefined,
    timeSlots,
    doubleElimination: template.doubleElimination ?? undefined,
    winnerSetCount: template.winnerSetCount ?? undefined,
    loserSetCount: template.loserSetCount ?? undefined,
    winnerBracketPointsToVictory: normalizeNumberArray(template.winnerBracketPointsToVictory),
    loserBracketPointsToVictory: normalizeNumberArray(template.loserBracketPointsToVictory),
    prize: template.prize ?? undefined,
    fields,
    matches: [],
    teams: [],
    players: [],
    officials: [],
    gamesPerOpponent: template.gamesPerOpponent ?? undefined,
    includePlayoffs: template.includePlayoffs ?? undefined,
    playoffTeamCount: template.playoffTeamCount ?? undefined,
    usesSets: template.usesSets ?? undefined,
    matchDurationMinutes: template.matchDurationMinutes ?? undefined,
    setDurationMinutes: template.setDurationMinutes ?? undefined,
    setsPerMatch: template.setsPerMatch ?? undefined,
    doTeamsOfficiate: template.doTeamsOfficiate ?? undefined,
    teamOfficialsMaySwap: template.teamOfficialsMaySwap ?? undefined,
    matchRulesOverride: template.matchRulesOverride ?? null,
    autoCreatePointMatchIncidents: template.autoCreatePointMatchIncidents ?? false,
    pointsToVictory: normalizeNumberArray(template.pointsToVictory),
    leagueScoringConfig,
    attendees: 0,
  } as Event;
};

export const archiveEventTemplate = async (
  templateId: string,
  client: PrismaClientLike = prisma,
) => {
  await (client as any).eventTemplates.update({
    where: { id: templateId },
    data: { archivedAt: new Date() },
  });
};
