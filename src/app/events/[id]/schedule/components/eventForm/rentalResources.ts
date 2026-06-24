import type { Facility, Field, TimeSlot } from '@/types';
import type { LeagueFieldOption } from '@/app/discover/components/LeagueFields';
import {
    getSystemTimeZone,
    normalizeTimeZone,
    parseLocalDateTime,
} from '@/lib/dateUtils';
import { getFieldDisplayName } from '@/lib/fieldUtils';

import { normalizeDivisionKeys } from './divisionForm';
import { mergeFieldsById } from './resourceGroups';
import { normalizeSlotFieldIds } from './slotForm';
import { normalizeResourceText } from './shared';

export type RentalBookingResourceOption = {
    id: string;
    selectorId: string;
    bookingId: string;
    bookingItemId: string;
    fieldId: string;
    field: Field;
    selectorField: Field;
    label: string;
    start: string;
    end: string;
    timeZone?: string | null;
    priceCents?: number | null;
    requiredTemplateIds?: string[];
    hostRequiredTemplateIds?: string[];
    eventId?: string | null;
    eventTimeSlotId?: string | null;
};

export type RentalBookingsResponse = {
    bookings?: Array<{
        $id?: string;
        id?: string;
        organizationId?: string | null;
        renterOrganizationId?: string | null;
        items?: Array<{
            $id?: string;
            id?: string;
            fieldId?: string | null;
            start?: string | Date | null;
            end?: string | Date | null;
            timeZone?: string | null;
            priceCents?: number | null;
            requiredTemplateIds?: string[];
            hostRequiredTemplateIds?: string[];
            eventId?: string | null;
            eventTimeSlotId?: string | null;
            facilityId?: string | null;
            facility?: Facility | null;
            field?: Field | null;
        }>;
    }>;
};

export const normalizeRentalDateString = (value: string | Date | null | undefined): string | null => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

export const formatRentalBookingOptionWindow = (
    startValue: string,
    endValue: string,
): string => {
    const start = parseLocalDateTime(startValue);
    const end = parseLocalDateTime(endValue);
    if (!start || !end) {
        return '';
    }
    const dateText = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(start);
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
    return `${dateText} ${timeFormatter.format(start)}-${timeFormatter.format(end)}`;
};

export const getRentalBookingSelectorId = (bookingItemId: string): string => `rental:${bookingItemId}`;

export const isRentalBookingSelectorId = (value: unknown): boolean => (
    normalizeResourceText(value).startsWith('rental:')
);

export const buildRentalBookingResourceLabel = (field: Field, start: string, end: string): string => {
    const resourceLabel = getFieldDisplayName(field, 'Resource');
    const windowLabel = formatRentalBookingOptionWindow(start, end);
    return windowLabel ? `${resourceLabel} - ${windowLabel}` : resourceLabel;
};

export const mapRentalBookingsToResourceOptions = (response: RentalBookingsResponse): RentalBookingResourceOption[] => {
    const options: RentalBookingResourceOption[] = [];
    (response.bookings ?? []).forEach((booking) => {
        const bookingId = normalizeResourceText(booking.$id) || normalizeResourceText(booking.id);
        if (!bookingId) {
            return;
        }
        (booking.items ?? []).forEach((item) => {
            const bookingItemId = normalizeResourceText(item.$id) || normalizeResourceText(item.id);
            const fieldId = normalizeResourceText(item.fieldId) || normalizeResourceText(item.field?.$id);
            const start = normalizeRentalDateString(item.start);
            const end = normalizeRentalDateString(item.end);
            if (!bookingItemId || !fieldId || !start || !end || !item.field?.$id) {
                return;
            }
            const itemFacility = item.facility && typeof item.facility === 'object' ? item.facility : null;
            const itemFacilityId = normalizeResourceText(item.facilityId)
                || normalizeResourceText(itemFacility?.$id)
                || normalizeResourceText((itemFacility as { id?: string | null } | null)?.id)
                || normalizeResourceText(item.field.facilityId);
            const fieldFacility = item.field.facility && typeof item.field.facility === 'object'
                ? item.field.facility
                : itemFacility;
            const selectorId = getRentalBookingSelectorId(bookingItemId);
            const fieldWithRentalMetadata = {
                ...item.field,
                facilityId: itemFacilityId || item.field.facilityId || null,
                facility: fieldFacility ?? item.field.facility ?? null,
                rentalResource: true,
                _rentalResource: true,
                rentalBookingId: bookingId,
                _rentalBookingId: bookingId,
                rentalBookingItemId: bookingItemId,
                _rentalBookingItemId: bookingItemId,
                rentalStart: start,
                _rentalStart: start,
                rentalEnd: end,
                _rentalEnd: end,
                rentalTimeZone: item.timeZone ?? null,
                _rentalTimeZone: item.timeZone ?? null,
                rentalPriceCents: Number.isFinite(Number(item.priceCents)) ? Number(item.priceCents) : null,
                _rentalPriceCents: Number.isFinite(Number(item.priceCents)) ? Number(item.priceCents) : null,
                rentalRequiredTemplateIds: Array.isArray(item.requiredTemplateIds) ? item.requiredTemplateIds : [],
                _rentalRequiredTemplateIds: Array.isArray(item.requiredTemplateIds) ? item.requiredTemplateIds : [],
                rentalHostRequiredTemplateIds: Array.isArray(item.hostRequiredTemplateIds) ? item.hostRequiredTemplateIds : [],
                _rentalHostRequiredTemplateIds: Array.isArray(item.hostRequiredTemplateIds) ? item.hostRequiredTemplateIds : [],
            } as Field;
            const selectorLabel = buildRentalBookingResourceLabel(fieldWithRentalMetadata, start, end);
            options.push({
                id: bookingItemId,
                selectorId,
                bookingId,
                bookingItemId,
                fieldId,
                field: fieldWithRentalMetadata,
                selectorField: {
                    ...fieldWithRentalMetadata,
                    $id: selectorId,
                    name: selectorLabel,
                },
                label: selectorLabel,
                start,
                end,
                timeZone: item.timeZone ?? null,
                priceCents: Number.isFinite(Number(item.priceCents)) ? Number(item.priceCents) : null,
                requiredTemplateIds: Array.isArray(item.requiredTemplateIds) ? item.requiredTemplateIds : [],
                hostRequiredTemplateIds: Array.isArray(item.hostRequiredTemplateIds) ? item.hostRequiredTemplateIds : [],
                eventId: item.eventId ?? null,
                eventTimeSlotId: item.eventTimeSlotId ?? null,
            });
        });
    });
    return options.sort((left, right) => {
        const startCompare = left.start.localeCompare(right.start);
        if (startCompare !== 0) return startCompare;
        return getFieldDisplayName(left.field).localeCompare(getFieldDisplayName(right.field), undefined, {
            numeric: true,
            sensitivity: 'base',
        });
    });
};

export const buildRentalBookingTimeSlot = (
    option: RentalBookingResourceOption,
    divisionKeys: string[],
    eventTimeZone?: string | null,
): TimeSlot | null => {
    const start = parseLocalDateTime(option.start);
    const end = parseLocalDateTime(option.end);
    if (!start || !end || end.getTime() <= start.getTime()) {
        return null;
    }
    const dayOfWeek = ((start.getDay() + 6) % 7) as TimeSlot['dayOfWeek'];
    const normalizedTimeZone = normalizeTimeZone(option.timeZone, eventTimeZone || getSystemTimeZone());
    return {
        $id: option.eventTimeSlotId || `rental-slot-${option.bookingItemId}`,
        dayOfWeek,
        daysOfWeek: [dayOfWeek] as TimeSlot['daysOfWeek'],
        divisions: normalizeDivisionKeys(divisionKeys),
        startTimeMinutes: start.getHours() * 60 + start.getMinutes(),
        endTimeMinutes: end.getHours() * 60 + end.getMinutes(),
        startDate: option.start,
        endDate: option.end,
        timeZone: normalizedTimeZone,
        repeating: false,
        price: Number.isFinite(Number(option.priceCents)) ? Number(option.priceCents) : undefined,
        requiredTemplateIds: option.requiredTemplateIds ?? [],
        hostRequiredTemplateIds: option.hostRequiredTemplateIds ?? [],
        scheduledFieldId: option.fieldId,
        scheduledFieldIds: [option.fieldId],
        sourceType: 'RENTAL_BOOKING',
        rentalBookingId: option.bookingId,
        rentalBookingItemId: option.bookingItemId,
        rentalLocked: true,
    };
};

export const buildRentalResourceFields = (options: RentalBookingResourceOption[]): Field[] => (
    mergeFieldsById([], options.map((option) => option.field))
);

export const buildRentalResourceSelectorFields = (options: RentalBookingResourceOption[]): Field[] => (
    mergeFieldsById([], options.map((option) => option.selectorField))
);

export const buildRentalResourceOptionsBySelectorId = (
    options: RentalBookingResourceOption[],
): Map<string, RentalBookingResourceOption> => (
    new Map(options.map((option) => [option.selectorId, option] as const))
);

export const buildRentalResourceOptionsByFieldId = (
    options: RentalBookingResourceOption[],
): Map<string, RentalBookingResourceOption[]> => {
    const byFieldId = new Map<string, RentalBookingResourceOption[]>();
    options.forEach((option) => {
        const fieldId = normalizeResourceText(option.fieldId);
        if (!fieldId) {
            return;
        }
        byFieldId.set(fieldId, [...(byFieldId.get(fieldId) ?? []), option]);
    });
    return byFieldId;
};

export const resolveSelectedRentalResourceOptions = ({
    selectedFieldIds,
    optionsBySelectorId,
    optionsByFieldId,
}: {
    selectedFieldIds: string[];
    optionsBySelectorId: Map<string, RentalBookingResourceOption>;
    optionsByFieldId: Map<string, RentalBookingResourceOption[]>;
}): RentalBookingResourceOption[] => (
    Array.from(
        new Map(
            selectedFieldIds
                .flatMap((fieldId) => {
                    const selectorOption = optionsBySelectorId.get(fieldId);
                    if (selectorOption) {
                        return [selectorOption];
                    }
                    return optionsByFieldId.get(fieldId) ?? [];
                })
                .map((option) => [option.id, option] as const),
        ).values(),
    )
);

export const buildSelectedRentalFieldIds = (options: RentalBookingResourceOption[]): string[] => (
    Array.from(new Set(options.map((option) => option.fieldId)))
);

export const buildRentalLeagueFieldOptions = ({
    rentalResourceOptions,
    selectedFields,
}: {
    rentalResourceOptions: RentalBookingResourceOption[];
    selectedFields: Field[];
}): LeagueFieldOption[] => {
    const rentalResourceFieldIds = new Set(
        rentalResourceOptions.map((option) => normalizeResourceText(option.fieldId)).filter(Boolean),
    );
    const regularOptions = selectedFields
        .filter((field): field is Field & { $id: string } => {
            if (typeof field.$id !== 'string' || field.$id.length === 0) {
                return false;
            }
            const marker = field as { rentalResource?: boolean; _rentalResource?: boolean };
            return !marker.rentalResource
                && !marker._rentalResource
                && !rentalResourceFieldIds.has(field.$id);
        })
        .map((field) => ({
            value: field.$id,
            fieldId: field.$id,
            label: getFieldDisplayName(field, 'Resource'),
        }));
    const rentalOptions = rentalResourceOptions.map((option) => ({
        value: option.selectorId,
        fieldId: option.fieldId,
        label: option.label,
        rentalBookingId: option.bookingId,
        rentalBookingItemId: option.bookingItemId,
        rentalStart: option.start,
        rentalEnd: option.end,
        rentalTimeZone: option.timeZone ?? null,
        rentalPriceCents: option.priceCents ?? null,
        rentalRequiredTemplateIds: option.requiredTemplateIds ?? [],
        rentalHostRequiredTemplateIds: option.hostRequiredTemplateIds ?? [],
    }));
    return [...regularOptions, ...rentalOptions];
};

export const isRentalLockedTimeSlot = (slot: Partial<TimeSlot> | null | undefined): boolean => {
    if (!slot) {
        return false;
    }
    return slot.rentalLocked === true
        || slot.sourceType === 'RENTAL_BOOKING'
        || Boolean(slot.rentalBookingId)
        || Boolean(slot.rentalBookingItemId);
};

export const mergeRentalLockedTimeSlots = (slots: TimeSlot[]): TimeSlot[] => {
    const mergedByKey = new Map<string, TimeSlot>();
    slots.forEach((slot) => {
        const key = slot.rentalBookingItemId
            || `${slot.rentalBookingId ?? ''}:${normalizeSlotFieldIds(slot).join(',')}:${slot.startDate ?? ''}:${slot.endDate ?? ''}`
            || slot.$id;
        mergedByKey.set(key, slot);
    });
    return Array.from(mergedByKey.values()).sort((left, right) => {
        const startCompare = String(left.startDate ?? '').localeCompare(String(right.startDate ?? ''));
        if (startCompare !== 0) return startCompare;
        return normalizeSlotFieldIds(left).join('|').localeCompare(normalizeSlotFieldIds(right).join('|'));
    });
};
