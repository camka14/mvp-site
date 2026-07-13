import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { PaymentEventSummary } from '@/components/ui/PaymentModal';
import { apiRequest } from '@/lib/apiClient';
import { boldsignService, type SignStep } from '@/lib/boldsignService';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFieldResolvedLocation } from '@/lib/fieldUtils';
import { createClientId } from '@/lib/clientId';
import { createId } from '@/lib/id';
import { organizationService } from '@/lib/organizationService';
import { paymentService } from '@/lib/paymentService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import {
  buildTemplateRentalResourceHref,
  getTemplateRentalResourceHintsFromEvent,
  type TemplateRentalResourceHint,
} from '@/lib/templateRentalResources';
import type {
  Event,
  EventState,
  Field,
  Match,
  Organization,
  PaymentIntent,
  TimeSlot,
  UserData,
} from '@/types';

import type { EventFormHandle, EventFormProps } from '../components/EventForm';
import type { RentalCheckoutModalsProps } from './RentalCheckoutModals';
import {
  buildScheduleLocationDefaults,
  getFieldCoordinatesForRental,
} from './locationDefaults';
import {
  cloneValue,
  type PendingRentalCheckoutContext,
  type RentalSelectionQuery,
} from './helpers';

type TemplateSummary = {
  id: string;
  name: string;
};

const seedEventTemplate = async (
  templateId: string,
  params: {
    newEventId: string;
    newStartDate: Date;
  },
): Promise<Event> => {
  const response = await apiRequest<{ event?: Event }>(
    `/api/event-templates/${encodeURIComponent(templateId)}/seed`,
    {
      method: 'POST',
      body: {
        newEventId: params.newEventId,
        newStartDate: formatLocalDateTime(params.newStartDate),
      },
    },
  );
  if (!response?.event) {
    throw new Error('Template seed response did not include an event.');
  }
  return response.event;
};

export type TemplateRentalResourcePrompt = {
  message: string;
  href: string | null;
};

const buildTemplateRentalResourcePrompt = (
  event: Event,
): TemplateRentalResourcePrompt | null => {
  const hints = getTemplateRentalResourceHintsFromEvent(event);
  if (hints.length === 0) {
    return null;
  }
  const labels = hints
    .map((hint: TemplateRentalResourceHint) => hint.fieldName ?? hint.facilityName ?? hint.location)
    .filter((label): label is string => Boolean(label));
  const uniqueLabels = Array.from(new Set(labels));
  const resourceLabel = uniqueLabels.length > 0
    ? uniqueLabels.slice(0, 3).join(', ')
    : hints.length === 1
      ? 'a rented resource'
      : 'rented resources';
  const overflow = uniqueLabels.length > 3 ? ` and ${uniqueLabels.length - 3} more` : '';
  const href = hints
    .map(buildTemplateRentalResourceHref)
    .find((value): value is string => Boolean(value)) ?? null;

  return {
    message: `This template used ${resourceLabel}${overflow}. Create a new rental for the resource before scheduling this event there.`,
    href,
  };
};

type UseCreateEventFlowParams = {
  isCreateMode: boolean;
  eventId?: string | null;
  user: UserData | null;
  isGuest: boolean;
  changesEvent: Event | null;
  activeEvent: Event | null;
  activeMatches: Match[];
  hasPendingUnsavedChanges: boolean;
  eventFormRef: RefObject<EventFormHandle | null>;
  templateIdParam?: string;
  skipTemplatePromptParam: boolean;
  resolvedHostOrgId?: string;
  resolvedRentalOrgId?: string;
  isRentalFlow: boolean;
  normalizedRentalStart?: string | null;
  normalizedRentalEnd?: string | null;
  rentalSelections: RentalSelectionQuery[];
  rentalFieldIdsFromSelections: string[];
  rentalRequiredTemplateIds: string[];
  rentalHostRequiredTemplateIds: string[];
  rentalBookingIdParam?: string;
  rentalFieldIdParam?: string;
  rentalFieldNameParam?: string;
  rentalFacilityIdParam?: string;
  rentalFacilityNameParam?: string;
  rentalFacilityLocationParam?: string;
  rentalFacilityAddressParam?: string;
  rentalLocationParam?: string;
  rentalCoordinates?: [number, number];
  rentalPriceParam?: string;
  defaultSport: Event['sport'];
  userLocationLabel: string;
  userCoordinates: [number, number] | null;
  setChangesEvent: Dispatch<SetStateAction<Event | null>>;
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
  setFormHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
};

export function useCreateEventFlow({
  isCreateMode,
  eventId,
  user,
  isGuest,
  changesEvent,
  activeEvent,
  activeMatches,
  hasPendingUnsavedChanges,
  eventFormRef,
  templateIdParam,
  skipTemplatePromptParam,
  resolvedHostOrgId,
  resolvedRentalOrgId,
  isRentalFlow,
  normalizedRentalStart,
  normalizedRentalEnd,
  rentalSelections,
  rentalFieldIdsFromSelections,
  rentalRequiredTemplateIds,
  rentalHostRequiredTemplateIds,
  rentalBookingIdParam,
  rentalFieldIdParam,
  rentalFieldNameParam,
  rentalFacilityIdParam,
  rentalFacilityNameParam,
  rentalFacilityLocationParam,
  rentalFacilityAddressParam,
  rentalLocationParam,
  rentalCoordinates,
  rentalPriceParam,
  defaultSport,
  userLocationLabel,
  userCoordinates,
  setChangesEvent,
  setHasUnsavedChanges,
  setFormHasUnsavedChanges,
  setActionError,
}: UseCreateEventFlowParams) {
  const templatePromptResolvedRef = useRef(false);
  const templateIdSeedResolvedRef = useRef<string | null>(null);
  const templateRentalResourcePromptDismissedRef = useRef(false);

  const [organizationForCreate, setOrganizationForCreate] = useState<Organization | null>(null);
  const [rentalOrganization, setRentalOrganization] = useState<Organization | null>(null);
  const [formSeedEvent, setFormSeedEvent] = useState<Event | null>(null);
  const [templateSummaries, setTemplateSummaries] = useState<TemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatePromptOpen, setTemplatePromptOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateStartDate, setSelectedTemplateStartDate] = useState<Date | null>(null);
  const [templateSeedKey, setTemplateSeedKey] = useState(0);
  const [failedTemplateSeedId, setFailedTemplateSeedId] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [templateRentalResourcePrompt, setTemplateRentalResourcePrompt] = useState<TemplateRentalResourcePrompt | null>(null);

  const createLocationDefaults = useMemo(
    () => buildScheduleLocationDefaults({
      organization: organizationForCreate,
      userLocationLabel,
      userCoordinates,
    }),
    [organizationForCreate, userCoordinates, userLocationLabel],
  );

  const rentalImmutableDefaults = useMemo<Partial<Event> | undefined>(() => {
    if (!isCreateMode || (!normalizedRentalStart && !normalizedRentalEnd && rentalSelections.length === 0)) {
      return undefined;
    }

    const normalizedStart = normalizedRentalStart;
    const normalizedEnd = normalizedRentalEnd;
    if (!normalizedStart || !normalizedEnd) {
      return undefined;
    }

    const rentalFieldsById = new Map(
      (rentalOrganization?.fields || [])
        .filter((field): field is Field => Boolean(field?.$id))
        .map((field) => [field.$id, field as Field]),
    );
    const allRentalFieldIds = Array.from(
      new Set([
        ...(rentalFieldIdParam ? [rentalFieldIdParam] : []),
        ...rentalFieldIdsFromSelections,
      ]),
    );
    const primaryRentalFieldId = allRentalFieldIds[0];
    const rentalFieldFromOrg = primaryRentalFieldId
      ? rentalFieldsById.get(primaryRentalFieldId)
      : undefined;

    const rentalField: Field | undefined = (() => {
      if (rentalFieldFromOrg) {
        return rentalFieldFromOrg as Field;
      }
      if (!primaryRentalFieldId) {
        return undefined;
      }
      return {
        $id: primaryRentalFieldId,
        name: rentalFieldNameParam?.trim() || primaryRentalFieldId,
        location: rentalLocationParam ?? '',
        lat: rentalCoordinates?.[1] ?? 0,
        long: rentalCoordinates?.[0] ?? 0,
        facilityId: rentalFacilityIdParam ?? null,
        facility: rentalFacilityIdParam || rentalFacilityNameParam || rentalFacilityLocationParam || rentalFacilityAddressParam
          ? {
            $id: rentalFacilityIdParam ?? `${primaryRentalFieldId}-facility`,
            organizationId: resolvedRentalOrgId ?? '',
            name: rentalFacilityNameParam ?? 'Facility',
            location: rentalFacilityLocationParam ?? '',
            address: rentalFacilityAddressParam ?? null,
          }
          : null,
      };
    })();

    const resolvedField = rentalFieldFromOrg ?? rentalField;
    const derivedLocation = rentalLocationParam
      ?? getFieldResolvedLocation(resolvedField, rentalFacilityLocationParam ?? rentalOrganization?.location ?? '');
    const derivedCoordinates =
      rentalCoordinates ??
      getFieldCoordinatesForRental(resolvedField) ??
      (rentalOrganization?.coordinates as [number, number] | undefined);

    const defaults: Partial<Event> = {
      start: normalizedStart,
      end: normalizedEnd,
      location: derivedLocation,
      address: rentalFacilityAddressParam ?? rentalOrganization?.address ?? undefined,
    };

    if (derivedCoordinates) {
      defaults.coordinates = derivedCoordinates;
    }
    const resolvedFields = allRentalFieldIds
      .map((fieldId) => {
        const fromOrganization = rentalFieldsById.get(fieldId);
        if (fromOrganization) {
          return fromOrganization;
        }
        if (resolvedField && resolvedField.$id === fieldId) {
          return resolvedField;
        }
        return {
          $id: fieldId,
          name: fieldId,
          location: rentalLocationParam ?? rentalOrganization?.location ?? '',
          lat: rentalCoordinates?.[1] ?? 0,
          long: rentalCoordinates?.[0] ?? 0,
          facilityId: rentalFacilityIdParam ?? null,
          facility: rentalFacilityIdParam || rentalFacilityNameParam || rentalFacilityLocationParam || rentalFacilityAddressParam
            ? {
              $id: rentalFacilityIdParam ?? `${fieldId}-facility`,
              organizationId: resolvedRentalOrgId ?? '',
              name: rentalFacilityNameParam ?? 'Facility',
              location: rentalFacilityLocationParam ?? '',
              address: rentalFacilityAddressParam ?? null,
            }
            : null,
        } as Field;
      })
      .filter((field): field is Field => Boolean(field?.$id));
    if (resolvedFields.length > 0) {
      defaults.fields = resolvedFields;
      defaults.fieldIds = resolvedFields.map((field) => field.$id);
    } else if (resolvedField) {
      defaults.fields = [resolvedField];
      defaults.fieldIds = [resolvedField.$id];
    }
    if (rentalSelections.length > 0) {
      const rentalTimeSlots: TimeSlot[] = [];
      rentalSelections.forEach((selectionItem, index) => {
        const selectionStart = parseLocalDateTime(selectionItem.startDate);
        const selectionEnd = parseLocalDateTime(selectionItem.endDate);
        if (!selectionStart || !selectionEnd || selectionEnd.getTime() <= selectionStart.getTime()) {
          return;
        }
        const dayOfWeek = ((selectionStart.getDay() + 6) % 7) as TimeSlot['dayOfWeek'];
        rentalTimeSlots.push({
          $id: selectionItem.key || `rental-selection-${index + 1}`,
          dayOfWeek,
          daysOfWeek: [dayOfWeek] as TimeSlot['daysOfWeek'],
          startTimeMinutes: selectionStart.getHours() * 60 + selectionStart.getMinutes(),
          endTimeMinutes: selectionEnd.getHours() * 60 + selectionEnd.getMinutes(),
          startDate: formatLocalDateTime(selectionStart) ?? selectionItem.startDate,
          endDate: formatLocalDateTime(selectionEnd) ?? selectionItem.endDate,
          repeating: false,
          scheduledFieldId: selectionItem.scheduledFieldIds[0],
          scheduledFieldIds: selectionItem.scheduledFieldIds,
          sourceType: rentalBookingIdParam ? 'RENTAL_BOOKING' : null,
          rentalBookingId: rentalBookingIdParam ?? null,
          rentalLocked: Boolean(rentalBookingIdParam),
        });
      });
      defaults.timeSlots = rentalTimeSlots;
    }
    if (rentalRequiredTemplateIds.length > 0) {
      defaults.requiredTemplateIds = rentalRequiredTemplateIds;
    }

    return defaults;
  }, [
    isCreateMode,
    normalizedRentalEnd,
    normalizedRentalStart,
    rentalBookingIdParam,
    rentalCoordinates,
    rentalFacilityAddressParam,
    rentalFacilityIdParam,
    rentalFacilityLocationParam,
    rentalFacilityNameParam,
    rentalFieldIdParam,
    rentalFieldIdsFromSelections,
    rentalFieldNameParam,
    rentalRequiredTemplateIds,
    rentalLocationParam,
    rentalOrganization,
    rentalSelections,
    resolvedRentalOrgId,
  ]);

  const rentalPurchaseContext = useMemo<EventFormProps['rentalPurchase']>(() => {
    if (!isCreateMode) {
      return undefined;
    }
    const normalizedStart = normalizedRentalStart;
    const normalizedEnd = normalizedRentalEnd;
    if (!normalizedStart || !normalizedEnd) {
      return undefined;
    }
    const priceCents = rentalPriceParam ? Number(rentalPriceParam) : undefined;
    const normalizedPrice = Number.isFinite(priceCents) ? Number(priceCents) : undefined;
    return {
      start: normalizedStart,
      end: normalizedEnd,
      fieldId: rentalFieldIdParam ?? rentalFieldIdsFromSelections[0] ?? undefined,
      priceCents: normalizedPrice,
      requiredTemplateIds: rentalHostRequiredTemplateIds,
    };
  }, [
    isCreateMode,
    normalizedRentalEnd,
    normalizedRentalStart,
    rentalFieldIdParam,
    rentalFieldIdsFromSelections,
    rentalHostRequiredTemplateIds,
    rentalPriceParam,
  ]);

  const rentalPurchaseTimeSlot = useMemo<TimeSlot | null>(() => {
    if (!rentalPurchaseContext) {
      return null;
    }
    const startDate = parseLocalDateTime(rentalPurchaseContext.start);
    const endDate = parseLocalDateTime(rentalPurchaseContext.end);
    if (!startDate || !endDate) {
      return null;
    }

    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
    const draftFields = Array.isArray(changesEvent?.fields)
      ? changesEvent?.fields
      : rentalImmutableDefaults?.fields;
    const fallbackFieldId = Array.isArray(draftFields) && draftFields.length > 0
      ? (draftFields[0] as Field).$id
      : undefined;
    const scheduledFieldId = rentalPurchaseContext.fieldId ?? fallbackFieldId;
    if (!scheduledFieldId) {
      return null;
    }

    const dayOfWeek = ((startDate.getDay() + 7) % 7) as TimeSlot['dayOfWeek'];
    const price = Number.isFinite(rentalPurchaseContext.priceCents) ? Number(rentalPurchaseContext.priceCents) : undefined;

    return {
      $id: createClientId(),
      dayOfWeek,
      startTimeMinutes: startMinutes,
      endTimeMinutes: endMinutes,
      startDate: formatLocalDateTime(startDate),
      endDate: formatLocalDateTime(endDate),
      repeating: false,
      scheduledFieldId,
      price,
      requiredTemplateIds: rentalRequiredTemplateIds,
      hostRequiredTemplateIds: rentalPurchaseContext.requiredTemplateIds ?? [],
      sourceType: rentalBookingIdParam ? 'RENTAL_BOOKING' : null,
      rentalBookingId: rentalBookingIdParam ?? null,
      rentalLocked: Boolean(rentalBookingIdParam),
    };
  }, [changesEvent?.fields, rentalBookingIdParam, rentalImmutableDefaults?.fields, rentalPurchaseContext, rentalRequiredTemplateIds]);

  const templateSelectData = useMemo(
    () => templateSummaries.map((template) => ({ value: template.id, label: template.name })),
    [templateSummaries],
  );

  const closeTemplatePrompt = useCallback(() => {
    templatePromptResolvedRef.current = true;
    setTemplatePromptOpen(false);
  }, []);

  useEffect(() => {
    if (!isCreateMode) {
      return;
    }
    if (templateIdParam && templateIdSeedResolvedRef.current === templateIdParam) {
      return;
    }
    templatePromptResolvedRef.current = false;
    templateIdSeedResolvedRef.current = null;
    templateRentalResourcePromptDismissedRef.current = false;
    setTemplatePromptOpen(Boolean(templateIdParam));
    setTemplateSummaries([]);
    setTemplateRentalResourcePrompt(null);
    setSelectedTemplateId(templateIdParam ?? null);
    setSelectedTemplateStartDate(null);
    setTemplatesError(null);
    setFailedTemplateSeedId(null);
  }, [eventId, isCreateMode, resolvedHostOrgId, templateIdParam]);

  useEffect(() => {
    if (!isCreateMode || !eventId || !user?.$id || !templateIdParam) {
      return;
    }
    if (
      templateIdSeedResolvedRef.current === templateIdParam
      || templatePromptResolvedRef.current
    ) {
      return;
    }

    setTemplatesError(null);
    setActionError(null);
    setFailedTemplateSeedId(null);
    setSelectedTemplateId(templateIdParam);
    setSelectedTemplateStartDate(null);
    setTemplatePromptOpen(true);
  }, [
    eventId,
    isCreateMode,
    resolvedHostOrgId,
    setActionError,
    templateIdParam,
    user?.$id,
  ]);

  const handleApplyTemplate = useCallback(async () => {
    if (!isCreateMode || !user?.$id) {
      closeTemplatePrompt();
      return false;
    }

    if (!selectedTemplateId) {
      setTemplatesError('Select a template to continue.');
      return false;
    }
    if (!selectedTemplateStartDate) {
      setTemplatesError('Select a start date to continue.');
      return false;
    }
    if (!eventId) {
      setTemplatesError('Missing event id for creation.');
      return false;
    }

    setApplyingTemplate(true);
    setTemplatesError(null);
    setActionError(null);

    try {
      const seeded = await seedEventTemplate(selectedTemplateId, {
        newEventId: eventId,
        newStartDate: selectedTemplateStartDate,
      });

      setChangesEvent(seeded);
      templateRentalResourcePromptDismissedRef.current = false;
      setTemplateRentalResourcePrompt(
        buildTemplateRentalResourcePrompt(seeded),
      );
      setHasUnsavedChanges(false);
      setFormHasUnsavedChanges(false);
      setTemplateSeedKey((prev) => prev + 1);
      if (selectedTemplateId === templateIdParam) {
        templateIdSeedResolvedRef.current = selectedTemplateId;
      }
      closeTemplatePrompt();
      return true;
    } catch (error) {
      console.error('Failed to apply template:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to apply template.');
      return false;
    } finally {
      setApplyingTemplate(false);
    }
  }, [
    closeTemplatePrompt,
    eventId,
    isCreateMode,
    selectedTemplateId,
    selectedTemplateStartDate,
    setActionError,
    setChangesEvent,
    setFormHasUnsavedChanges,
    setHasUnsavedChanges,
    templateIdParam,
    user?.$id,
  ]);

  useEffect(() => {
    if (
      !isCreateMode
      || templateRentalResourcePrompt
      || templateRentalResourcePromptDismissedRef.current
      || !changesEvent
    ) {
      return;
    }
    const prompt = buildTemplateRentalResourcePrompt(changesEvent);
    if (prompt) {
      setTemplateRentalResourcePrompt(prompt);
    }
  }, [changesEvent, isCreateMode, templateRentalResourcePrompt]);

  useEffect(() => {
    if (!isCreateMode || !user) return;
    setChangesEvent((prev) => {
      if (prev) return prev;
      const defaultStartDate = new Date(Date.now() + 60 * 60 * 1000);
      if (
        defaultStartDate.getMinutes() !== 0
        || defaultStartDate.getSeconds() !== 0
        || defaultStartDate.getMilliseconds() !== 0
      ) {
        defaultStartDate.setHours(defaultStartDate.getHours() + 1, 0, 0, 0);
      } else {
        defaultStartDate.setMinutes(0, 0, 0);
      }
      const defaultEndDate = new Date(defaultStartDate.getTime() + 60 * 60 * 1000);
      const start = rentalImmutableDefaults?.start ?? formatLocalDateTime(defaultStartDate);
      const end = rentalImmutableDefaults?.end ?? formatLocalDateTime(defaultEndDate);
      const locationDefaults = createLocationDefaults;
      const rentalLocation = (rentalImmutableDefaults?.location ?? '').trim();
      const rentalAddress = (rentalImmutableDefaults?.address ?? '').trim();
      const rentalCoordinatesValue = rentalImmutableDefaults?.coordinates;
      return {
        $id: eventId || 'temp-id',
        name: '',
        description: '',
        location: rentalLocation || locationDefaults?.location || '',
        address: rentalAddress || locationDefaults?.address || '',
        coordinates: rentalCoordinatesValue ?? locationDefaults?.coordinates ?? [0, 0],
        start,
        end,
        eventType: 'EVENT',
        sportId: '',
        sport: defaultSport,
        price: 0,
        maxParticipants: 10,
        teamSizeLimit: 2,
        teamSignup: false,
        singleDivision: true,
        divisions: [],
        cancellationRefundHours: null,
        registrationCutoffHours: 2,
        hostId: user.$id,
        state: 'DRAFT' as EventState,
        requiredTemplateIds: [],
        $createdAt: '',
        $updatedAt: '',
        attendees: 0,
        imageId: '',
        seedColor: 0,
        waitListIds: [],
        freeAgentIds: [],
        players: [],
        teams: [],
        officials: [],
        officialIds: [],
        officialSchedulingMode: 'SCHEDULE',
        officialPositions: [],
        eventOfficials: [],
        assistantHostIds: [],
      } as Event;
    });
  }, [
    createLocationDefaults,
    defaultSport,
    eventId,
    isCreateMode,
    rentalImmutableDefaults,
    setChangesEvent,
    user,
  ]);

  useEffect(() => {
    if (
      !isCreateMode ||
      !eventId ||
      !user?.$id ||
      isGuest ||
      isRentalFlow ||
      skipTemplatePromptParam
    ) {
      setTemplateSummaries([]);
      setTemplatePromptOpen(false);
      setTemplatesError(null);
      return;
    }
    if (templatePromptResolvedRef.current) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setTemplatesLoading(true);
        setTemplatesError(null);
        const qs = new URLSearchParams();
        if (resolvedHostOrgId) {
          qs.set('organizationId', resolvedHostOrgId);
        } else {
          qs.set('hostId', user.$id);
        }
        qs.set('limit', '50');
        const response = await apiRequest<{ templates?: any[] }>(`/api/event-templates?${qs.toString()}`);
        const rows = Array.isArray(response?.templates) ? response.templates : [];
        const summaries = rows
          .map((row) => ({
            id: String(row?.id ?? ''),
            name: String(row?.name ?? 'Untitled Template'),
          }))
          .filter((entry) => entry.id.length > 0);

        if (cancelled) return;
        setTemplateSummaries(summaries);

        if ((summaries.length > 0 || templateIdParam) && !templatePromptResolvedRef.current) {
          setTemplatePromptOpen(true);
          setSelectedTemplateId((prev) => prev ?? templateIdParam ?? null);
          setSelectedTemplateStartDate((prev) => {
            if (templateIdParam) return prev;
            if (prev) return prev;
            const base = changesEvent?.start ? parseLocalDateTime(changesEvent.start) : null;
            const seed = base ?? new Date();
            const day = new Date(seed);
            day.setHours(0, 0, 0, 0);
            return day;
          });
        } else {
          setTemplatePromptOpen(false);
        }
      } catch (error) {
        if (cancelled) return;
        setTemplateSummaries([]);
        setTemplatePromptOpen(Boolean(templateIdParam));
        setSelectedTemplateId((prev) => prev ?? templateIdParam ?? null);
        setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    changesEvent?.start,
    eventId,
    failedTemplateSeedId,
    isCreateMode,
    isGuest,
    isRentalFlow,
    resolvedHostOrgId,
    skipTemplatePromptParam,
    templateIdParam,
    user?.$id,
  ]);

  useEffect(() => {
    if (!isCreateMode) {
      setFormSeedEvent(null);
      return;
    }
    if (!changesEvent) {
      return;
    }
    if (!hasPendingUnsavedChanges) {
      setFormSeedEvent(changesEvent);
    }
  }, [changesEvent, hasPendingUnsavedChanges, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode) {
      setOrganizationForCreate(null);
      setRentalOrganization(null);
      return;
    }

    let cancelled = false;

    const loadOrganizationsForCreate = async () => {
      const hostOrgId = resolvedHostOrgId;
      const rentalOrgId = resolvedRentalOrgId;

      if (!hostOrgId && !rentalOrgId) {
        setOrganizationForCreate(null);
        setRentalOrganization(null);
        return;
      }

      try {
        const hostPromise = hostOrgId
          ? (
            organizationService.getOrganizationByIdForEventForm
              ? organizationService.getOrganizationByIdForEventForm(hostOrgId)
              : organizationService.getOrganizationById(hostOrgId, true)
          )
          : Promise.resolve(null);
        const rentalPromise =
          rentalOrgId && rentalOrgId !== hostOrgId
            ? (
              organizationService.getOrganizationByIdForEventForm
                ? organizationService.getOrganizationByIdForEventForm(rentalOrgId)
                : organizationService.getOrganizationById(rentalOrgId, true)
            )
            : Promise.resolve(null);
        const [hostOrg, rentalOrg] = await Promise.all([hostPromise, rentalPromise]);

        if (cancelled) return;

        const resolvedHostOrg = hostOrg ? (hostOrg as Organization) : null;
        const resolvedRentalOrg = rentalOrgId === hostOrgId
          ? resolvedHostOrg
          : rentalOrg
            ? (rentalOrg as Organization)
            : null;

        setOrganizationForCreate(resolvedHostOrg);
        setRentalOrganization(resolvedRentalOrg);

        if (resolvedHostOrg) {
          setChangesEvent((prev) => {
            const base = prev ?? ({ $id: eventId, state: 'DRAFT' } as Event);
            const orgLocation = (resolvedHostOrg.location ?? '').trim();
            const orgAddress = (resolvedHostOrg.address ?? '').trim();
            const resolvedOrgOfficialIds = Array.isArray(resolvedHostOrg.officials)
              ? resolvedHostOrg.officials
                .map((official) => official?.$id)
                .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
              : [];
            const orgCoordinates =
              Array.isArray(resolvedHostOrg.coordinates) &&
                typeof resolvedHostOrg.coordinates[0] === 'number' &&
                typeof resolvedHostOrg.coordinates[1] === 'number'
                ? (resolvedHostOrg.coordinates as [number, number])
                : undefined;
            const baseLocation = (base.location ?? '').trim();
            const baseAddress = (base.address ?? '').trim();
            const hasBaseCoordinates =
              Array.isArray(base.coordinates) &&
                typeof base.coordinates[0] === 'number' &&
                typeof base.coordinates[1] === 'number' &&
                (base.coordinates[0] !== 0 || base.coordinates[1] !== 0);
            return {
              ...base,
              organization: resolvedHostOrg,
              organizationId: resolvedHostOrg.$id,
              hostId: base.hostId ?? resolvedHostOrg.ownerId ?? base.hostId,
              fields: Array.isArray(base.fields) && base.fields.length > 0
                ? base.fields
                : Array.isArray(resolvedHostOrg.fields)
                  ? resolvedHostOrg.fields
                  : base.fields,
              officialIds: resolvedOrgOfficialIds.length > 0 ? resolvedOrgOfficialIds : base.officialIds,
              officials: Array.isArray(resolvedHostOrg.officials) ? resolvedHostOrg.officials : base.officials,
              location: baseLocation || orgLocation || '',
              address: baseAddress || orgAddress || '',
              coordinates: hasBaseCoordinates ? base.coordinates : orgCoordinates ?? base.coordinates ?? [0, 0],
            } as Event;
          });
        }
      } catch (error) {
        console.warn('Failed to load organizations for create:', error);
      }
    };

    loadOrganizationsForCreate();

    return () => {
      cancelled = true;
    };
  }, [eventId, isCreateMode, resolvedHostOrgId, resolvedRentalOrgId, setChangesEvent]);

  const buildTemplateSourceFromDraft = useCallback((): Event | null => {
    if (!activeEvent) {
      return null;
    }

    const formDraft = eventFormRef.current?.getDraft();
    const merged = {
      ...(cloneValue(activeEvent) as Event),
      ...((formDraft ?? {}) as Partial<Event>),
    } as Event;

    if (!Array.isArray(merged.matches) || merged.matches.length === 0) {
      merged.matches = Array.isArray(activeMatches)
        ? (cloneValue(activeMatches) as Match[])
        : [];
    }
    if (!Array.isArray(merged.timeSlots)) {
      merged.timeSlots = [];
    }
    if (typeof merged.$id !== 'string' || merged.$id.trim().length === 0) {
      merged.$id = activeEvent.$id;
    }

    return merged;
  }, [activeEvent, activeMatches, eventFormRef]);

  return {
    organizationForCreate,
    rentalOrganization,
    formSeedEvent,
    createLocationDefaults,
    rentalImmutableDefaults,
    rentalPurchaseContext,
    rentalPurchaseTimeSlot,
    templateSelectData,
    templatePromptOpen: templatePromptOpen || Boolean(
      isCreateMode
      && templateIdParam
      && templateIdSeedResolvedRef.current !== templateIdParam
      && !templatePromptResolvedRef.current,
    ),
    closeTemplatePrompt,
    applyingTemplate,
    templatesError,
    templatesLoading,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplateStartDate,
    setSelectedTemplateStartDate,
    templateSeedKey,
    templateRentalResourcePrompt,
    dismissTemplateRentalResourcePrompt: () => {
      templateRentalResourcePromptDismissedRef.current = true;
      setTemplateRentalResourcePrompt(null);
    },
    handleApplyTemplate,
    buildTemplateSourceFromDraft,
  };
}

type UseRentalCheckoutFlowParams = {
  eventId?: string | null;
  user: UserData | null;
  authEmail?: string | null;
  activeEvent: Event | null;
  changesEvent: Event | null;
  event: Event | null;
  rentalOrganization: Organization | null;
  rentalHostRequiredTemplateIds: string[];
  rentalPurchaseContext: EventFormProps['rentalPurchase'];
  eventFormRef: RefObject<EventFormHandle | null>;
  setPublishing: Dispatch<SetStateAction<boolean>>;
  setSubmitError: Dispatch<SetStateAction<string | null>>;
  scheduleRegularEvent: (draft: Partial<Event>) => Promise<Event | null>;
};

export function useRentalCheckoutFlow({
  eventId,
  user,
  authEmail,
  activeEvent,
  changesEvent,
  event,
  rentalOrganization,
  rentalHostRequiredTemplateIds,
  rentalPurchaseContext,
  eventFormRef,
  setPublishing,
  setSubmitError,
  scheduleRegularEvent,
}: UseRentalCheckoutFlowParams) {
  const pendingRegularEventRef = useRef<Partial<Event> | null>(null);
  const pendingRentalLockRef = useRef<{ eventDraft: Event; rentalSlot: TimeSlot } | null>(null);
  const pendingRentalCheckoutRef = useRef<PendingRentalCheckoutContext | null>(null);

  const [rentalPaymentData, setRentalPaymentData] = useState<PaymentIntent | null>(null);
  const [showRentalPayment, setShowRentalPayment] = useState(false);
  const [showRentalSignModal, setShowRentalSignModal] = useState(false);
  const [rentalSignLinks, setRentalSignLinks] = useState<SignStep[]>([]);
  const [rentalSignIndex, setRentalSignIndex] = useState(0);
  const [rentalTextAccepted, setRentalTextAccepted] = useState(false);
  const [rentalSignError, setRentalSignError] = useState<string | null>(null);
  const [recordingRentalSignature, setRecordingRentalSignature] = useState(false);
  const [pendingRentalSignedDocumentId, setPendingRentalSignedDocumentId] = useState<string | null>(null);
  const [pendingRentalSignatureOperationId, setPendingRentalSignatureOperationId] = useState<string | null>(null);

  const rentalPaymentEventSummary: PaymentEventSummary = useMemo(() => {
    const source = changesEvent ?? activeEvent ?? event;
    return {
      name: source?.name || 'Rental Event',
      location: source?.location || '',
      eventType: source?.eventType ?? 'EVENT',
      price: rentalPurchaseContext?.priceCents ?? 0,
      imageId: source?.imageId,
    };
  }, [activeEvent, changesEvent, event, rentalPurchaseContext?.priceCents]);
  const currentRentalSignLink = rentalSignLinks[rentalSignIndex] ?? null;

  const resetRentalSignFlowState = useCallback(() => {
    setRentalSignLinks([]);
    setRentalSignIndex(0);
    setRentalTextAccepted(false);
    setRentalSignError(null);
    setRecordingRentalSignature(false);
    setPendingRentalSignedDocumentId(null);
    setPendingRentalSignatureOperationId(null);
  }, []);

  const releasePendingRentalCheckoutLock = useCallback(async () => {
    const pendingLock = pendingRentalLockRef.current;
    pendingRentalLockRef.current = null;
    if (!pendingLock) {
      return;
    }
    try {
      await paymentService.releaseRentalCheckoutLock(pendingLock.eventDraft, pendingLock.rentalSlot);
    } catch (error) {
      console.warn('Failed to release rental checkout lock.', error);
    }
  }, []);

  const reserveRentalCheckoutLock = useCallback(async (context: PendingRentalCheckoutContext) => {
    await paymentService.reserveRentalCheckoutLock(context.eventDraft, context.rentalSlot);
    pendingRentalLockRef.current = {
      eventDraft: context.eventDraft,
      rentalSlot: context.rentalSlot,
    };
  }, []);

  const startRentalPaymentIntent = useCallback(async (context: PendingRentalCheckoutContext) => {
    if (!context.requiresPayment) {
      const scheduledEvent = await scheduleRegularEvent(context.draftToSave);
      if (scheduledEvent?.$id) {
        eventFormRef.current?.commitDirtyBaseline();
      }
      return;
    }
    if (!user) {
      await releasePendingRentalCheckoutLock();
      setSubmitError('You must be signed in to continue checkout.');
      return;
    }

    pendingRegularEventRef.current = context.draftToSave;
    setPublishing(true);
    try {
      const paymentIntent = await paymentService.createPaymentIntent(
        user,
        context.eventDraft,
        undefined,
        context.rentalSlot,
        rentalOrganization ?? undefined,
      );
      setRentalPaymentData(paymentIntent);
      setShowRentalPayment(true);
    } catch (error) {
      pendingRegularEventRef.current = null;
      await releasePendingRentalCheckoutLock();
      setSubmitError(error instanceof Error ? error.message : 'Failed to start rental payment.');
    } finally {
      setPublishing(false);
    }
  }, [
    eventFormRef,
    releasePendingRentalCheckoutLock,
    rentalOrganization,
    scheduleRegularEvent,
    setPublishing,
    setSubmitError,
    user,
  ]);

  const startRentalCheckoutFlow = useCallback(async (context: PendingRentalCheckoutContext) => {
    try {
      await reserveRentalCheckoutLock(context);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to reserve rental checkout slot.');
      return;
    }

    if (!rentalHostRequiredTemplateIds.length) {
      await startRentalPaymentIntent(context);
      return;
    }
    if (!user) {
      await releasePendingRentalCheckoutLock();
      setSubmitError('You must be signed in to sign rental documents.');
      return;
    }

    try {
      const signLinks = await boldsignService.createRentalSignLinks({
        user,
        userEmail: authEmail ?? undefined,
        templateIds: rentalHostRequiredTemplateIds,
        eventId: context.eventDraft.$id ?? eventId ?? undefined,
        organizationId: rentalOrganization?.$id ?? context.eventDraft.organizationId ?? undefined,
        timeoutMs: 45_000,
      });

      if (!signLinks.length) {
        await startRentalPaymentIntent(context);
        return;
      }

      pendingRentalCheckoutRef.current = context;
      setRentalSignLinks(signLinks);
      setRentalSignIndex(0);
      setRentalTextAccepted(false);
      setRentalSignError(null);
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
      setShowRentalSignModal(true);
    } catch (error) {
      await releasePendingRentalCheckoutLock();
      setSubmitError(error instanceof Error ? error.message : 'Failed to start rental document signing.');
    }
  }, [
    authEmail,
    eventId,
    releasePendingRentalCheckoutLock,
    rentalHostRequiredTemplateIds,
    rentalOrganization?.$id,
    reserveRentalCheckoutLock,
    setSubmitError,
    startRentalPaymentIntent,
    user,
  ]);

  const advanceRentalSignFlow = useCallback(async () => {
    const nextIndex = rentalSignIndex + 1;
    if (nextIndex < rentalSignLinks.length) {
      setRentalSignIndex(nextIndex);
      setRentalTextAccepted(false);
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
      setShowRentalSignModal(true);
      return;
    }

    const checkoutContext = pendingRentalCheckoutRef.current;
    pendingRentalCheckoutRef.current = null;
    setShowRentalSignModal(false);
    resetRentalSignFlowState();
    if (checkoutContext) {
      await startRentalPaymentIntent(checkoutContext);
    }
  }, [rentalSignIndex, rentalSignLinks.length, resetRentalSignFlowState, startRentalPaymentIntent]);

  const recordRentalSignature = useCallback(async (params: {
    templateId: string;
    documentId: string;
    type: SignStep['type'];
  }): Promise<{ operationId?: string; syncStatus?: string }> => {
    if (!user) {
      throw new Error('You must be signed in to sign rental documents.');
    }

    const pendingContext = pendingRentalCheckoutRef.current;
    const result = await apiRequest<{
      ok?: boolean;
      error?: string;
      operationId?: string;
      syncStatus?: string;
    }>('/api/documents/record-signature', {
      method: 'POST',
      body: {
        templateId: params.templateId,
        documentId: params.documentId,
        eventId: pendingContext?.eventDraft?.$id ?? eventId,
        type: params.type,
        userId: user.$id,
        signerContext: 'participant',
        user,
      },
    });

    if (result?.error) {
      throw new Error(result.error);
    }

    return {
      operationId: typeof result?.operationId === 'string' ? result.operationId : undefined,
      syncStatus: typeof result?.syncStatus === 'string' ? result.syncStatus : undefined,
    };
  }, [eventId, user]);

  const handleRentalSignedDocument = useCallback(async (messageDocumentId?: string) => {
    const currentLink = rentalSignLinks[rentalSignIndex];
    if (!currentLink || currentLink.type === 'TEXT') {
      return;
    }
    if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
      return;
    }
    if (pendingRentalSignedDocumentId || pendingRentalSignatureOperationId || recordingRentalSignature) {
      return;
    }
    if (!currentLink.documentId) {
      setRentalSignError('Missing document identifier for signature.');
      return;
    }

    setRecordingRentalSignature(true);
    setRentalSignError(null);
    try {
      const signatureResult = await recordRentalSignature({
        templateId: currentLink.templateId,
        documentId: currentLink.documentId,
        type: currentLink.type,
      });
      setShowRentalSignModal(false);
      setPendingRentalSignedDocumentId(currentLink.documentId);
      setPendingRentalSignatureOperationId(signatureResult.operationId || currentLink.operationId || null);
    } catch (error) {
      setRentalSignError(error instanceof Error ? error.message : 'Failed to record rental signature.');
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
    } finally {
      setRecordingRentalSignature(false);
    }
  }, [
    pendingRentalSignatureOperationId,
    pendingRentalSignedDocumentId,
    recordRentalSignature,
    recordingRentalSignature,
    rentalSignIndex,
    rentalSignLinks,
  ]);

  const handleRentalTextAcceptance = useCallback(async () => {
    const currentLink = rentalSignLinks[rentalSignIndex];
    if (!currentLink || currentLink.type !== 'TEXT') {
      return;
    }
    if (!rentalTextAccepted || pendingRentalSignedDocumentId || pendingRentalSignatureOperationId || recordingRentalSignature) {
      return;
    }

    const documentId = currentLink.documentId || createId();
    setRecordingRentalSignature(true);
    setRentalSignError(null);
    try {
      const signatureResult = await recordRentalSignature({
        templateId: currentLink.templateId,
        documentId,
        type: currentLink.type,
      });
      setShowRentalSignModal(false);
      setPendingRentalSignedDocumentId(documentId);
      setPendingRentalSignatureOperationId(signatureResult.operationId || currentLink.operationId || null);
    } catch (error) {
      setRentalSignError(error instanceof Error ? error.message : 'Failed to record rental signature.');
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
    } finally {
      setRecordingRentalSignature(false);
    }
  }, [
    pendingRentalSignatureOperationId,
    pendingRentalSignedDocumentId,
    recordRentalSignature,
    recordingRentalSignature,
    rentalSignIndex,
    rentalSignLinks,
    rentalTextAccepted,
  ]);

  useEffect(() => {
    setRentalTextAccepted(false);
  }, [rentalSignIndex, rentalSignLinks]);

  useEffect(() => {
    if (!showRentalSignModal) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
        return;
      }
      const payload = event.data;
      let eventName = '';
      if (typeof payload === 'string') {
        eventName = payload;
      } else if (payload && typeof payload === 'object') {
        eventName = payload.event || payload.eventName || payload.type || payload.name || '';
      }
      const eventLabel = eventName.toString();
      if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
        return;
      }

      const documentId =
        (payload && typeof payload === 'object' && (payload.documentId || payload.documentID)) || undefined;
      void handleRentalSignedDocument(
        typeof documentId === 'string' ? documentId : undefined,
      );
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleRentalSignedDocument, showRentalSignModal]);

  useEffect(() => {
    if (!pendingRentalSignatureOperationId || !user) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const intervalMs = 1500;
    const timeoutMs = 90_000;

    const poll = async () => {
      try {
        const operation = await boldsignService.getOperationStatus(pendingRentalSignatureOperationId);
        if (cancelled) {
          return;
        }

        const status = String(operation.status ?? '').toUpperCase();
        if (status === 'CONFIRMED') {
          setPendingRentalSignedDocumentId(null);
          setPendingRentalSignatureOperationId(null);
          await advanceRentalSignFlow();
          return;
        }

        if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
          throw new Error(operation.error || 'Failed to synchronize rental signature status.');
        }

        if (Date.now() - startedAt > timeoutMs) {
          throw new Error('Rental document sync is delayed. Please try again.');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRentalSignError(error instanceof Error ? error.message : 'Failed to confirm rental signature.');
        setPendingRentalSignedDocumentId(null);
        setPendingRentalSignatureOperationId(null);
        setShowRentalSignModal(true);
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, intervalMs);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [advanceRentalSignFlow, pendingRentalSignatureOperationId, user]);

  useEffect(() => {
    if (!pendingRentalSignedDocumentId || !user || pendingRentalSignatureOperationId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const signed = await signedDocumentService.isDocumentSigned(
          pendingRentalSignedDocumentId,
          user.$id,
        );
        if (!signed || cancelled) {
          return;
        }

        setPendingRentalSignedDocumentId(null);
        await advanceRentalSignFlow();
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRentalSignError(error instanceof Error ? error.message : 'Failed to confirm rental signature.');
        setPendingRentalSignedDocumentId(null);
        setShowRentalSignModal(true);
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 1000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [advanceRentalSignFlow, pendingRentalSignatureOperationId, pendingRentalSignedDocumentId, user]);

  const closeRentalSignModal = useCallback(() => {
    setShowRentalSignModal(false);
    resetRentalSignFlowState();
    pendingRentalCheckoutRef.current = null;
    void releasePendingRentalCheckoutLock();
  }, [releasePendingRentalCheckoutLock, resetRentalSignFlowState]);

  const closeRentalPaymentModal = useCallback((options?: { releaseLock?: boolean }) => {
    setShowRentalPayment(false);
    setRentalPaymentData(null);
    pendingRegularEventRef.current = null;
    if (options?.releaseLock !== false) {
      void releasePendingRentalCheckoutLock();
    }
  }, [releasePendingRentalCheckoutLock]);

  const handleRentalPaymentSuccess = useCallback(async () => {
    const pendingDraft = pendingRegularEventRef.current;
    if (pendingDraft) {
      const scheduledEvent = await scheduleRegularEvent(pendingDraft);
      if (scheduledEvent?.$id) {
        eventFormRef.current?.commitDirtyBaseline();
      }
    }
    closeRentalPaymentModal({ releaseLock: false });
  }, [
    closeRentalPaymentModal,
    eventFormRef,
    scheduleRegularEvent,
  ]);

  useEffect(() => {
    return () => {
      void releasePendingRentalCheckoutLock();
    };
  }, [releasePendingRentalCheckoutLock]);

  const rentalCheckout = useMemo<RentalCheckoutModalsProps>(() => ({
    paymentOpen: showRentalPayment && Boolean(rentalPaymentData),
    paymentData: rentalPaymentData,
    paymentEvent: rentalPaymentEventSummary,
    onPaymentClose: closeRentalPaymentModal,
    onPaymentSuccess: handleRentalPaymentSuccess,
    signOpen: showRentalSignModal && Boolean(currentRentalSignLink),
    signLink: currentRentalSignLink,
    signIndex: rentalSignIndex,
    signLinkCount: rentalSignLinks.length,
    signError: rentalSignError,
    confirmingSignature: Boolean(pendingRentalSignedDocumentId || pendingRentalSignatureOperationId),
    textAccepted: rentalTextAccepted,
    recordingSignature: recordingRentalSignature,
    onSignClose: closeRentalSignModal,
    onTextAcceptedChange: setRentalTextAccepted,
    onTextAcceptance: handleRentalTextAcceptance,
    onSignedDocument: () => { void handleRentalSignedDocument(); },
  }), [
    closeRentalPaymentModal,
    closeRentalSignModal,
    currentRentalSignLink,
    handleRentalPaymentSuccess,
    handleRentalSignedDocument,
    handleRentalTextAcceptance,
    pendingRentalSignatureOperationId,
    pendingRentalSignedDocumentId,
    recordingRentalSignature,
    rentalPaymentData,
    rentalPaymentEventSummary,
    rentalSignError,
    rentalSignIndex,
    rentalSignLinks.length,
    rentalTextAccepted,
    showRentalPayment,
    showRentalSignModal,
  ]);

  return {
    rentalCheckout,
    startRentalCheckoutFlow,
  };
}
