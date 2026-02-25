import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { Controller, useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import TournamentFields from '@/app/discover/components/TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { getEventImageUrl, Event, EventState, Division as CoreDivision, UserData, Team, LeagueConfig, Field, TimeSlot, Organization, LeagueScoringConfig, Sport, TournamentConfig, TemplateDocument } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import LeagueScoringConfigPanel from '@/app/discover/components/LeagueScoringConfigPanel';
import { useSports } from '@/app/hooks/useSports';

import { TextInput, Textarea, NumberInput, Select as MantineSelect, MultiSelect as MantineMultiSelect, Switch, Checkbox, Group, Button, Alert, Loader, Paper, Text, Title, Stack, ActionIcon, SimpleGrid, Collapse } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
import { locationService } from '@/lib/locationService';
import { userService } from '@/lib/userService';
import { organizationService } from '@/lib/organizationService';
import { fieldService } from '@/lib/fieldService';
import { formatLocalDateTime, nowLocalDateTimeString, parseLocalDateTime } from '@/lib/dateUtils';
import { createClientId } from '@/lib/clientId';
import LeagueFields, { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { apiRequest } from '@/lib/apiClient';
import {
    requiresOrganizationEventFieldSelection,
    resolveOrganizationEventFieldIds,
} from './eventFieldSelection';
import { applyLeagueScoringConfigFieldChange } from './leagueScoringConfigForm';
import { applyEventDefaultsToDivisionDetails } from './divisionDefaults';
import { mergeSlotPayloadsForForm } from './slotPayloadMerge';
import UserCard from '@/components/ui/UserCard';
import {
    buildDivisionName,
    buildDivisionToken,
    buildEventDivisionId,
    evaluateDivisionAgeEligibility,
    getDivisionTypeById,
    getDivisionTypeOptionsForSport,
    inferDivisionDetails,
    normalizeDivisionGender,
    normalizeDivisionRatingType,
} from '@/lib/divisionTypes';
import {
    getRequiredSignerTypeLabel,
    normalizeRequiredSignerType,
} from '@/lib/templateSignerTypes';

// UI state will track divisions as string[] of skill keys (e.g., 'beginner')

interface EventFormProps {
    isOpen?: boolean;
    onClose?: () => void;
    currentUser: UserData;
    event: Event;
    organization: Organization | null;
    immutableDefaults?: Partial<Event>;
    formId?: string;
    defaultLocation?: DefaultLocation;
    isCreateMode?: boolean;
    rentalPurchase?: RentalPurchaseContext;
    onDirtyStateChange?: (hasChanges: boolean) => void;
}

export type EventFormHandle = {
    getDraft: () => Partial<Event>;
    validate: () => Promise<boolean>;
};

type RentalPurchaseContext = {
    start: string;
    end: string;
    fieldId?: string;
    organization?: Organization | null;
    organizationEmail?: string | null;
    priceCents?: number;
};

type EventType = Event['eventType'];

type DefaultLocation = {
    location?: string;
    coordinates?: [number, number];
};

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_STANDARD_NUMBER = 99_999;
const MAX_PRICE_NUMBER = 9_999_999;
const SECTION_SCROLL_OFFSET = 140;
const SECTION_ANIMATION_DURATION_MS = 220;
const MAX_EVENT_NAME_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 80;
const MAX_MEDIUM_TEXT_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1000;
const DEFAULT_DIVISION_KEY = 'open';
const DEFAULT_AGE_DIVISION_FALLBACK = '18plus';
const PREFERRED_AGE_DIVISION_IDS = ['18plus', '19plus', 'u18', '18u', 'u19', '19u'] as const;
const DIVISION_GENDER_OPTIONS = [
    { value: 'M', label: 'Mens' },
    { value: 'F', label: 'Womens' },
    { value: 'C', label: 'CoEd' },
] as const;

const AnimatedSection = ({
    in: inProp,
    children,
    className,
    collapseClassName,
}: {
    in: boolean;
    children: React.ReactNode;
    className?: string;
    collapseClassName?: string;
}) => (
    <Collapse
        in={inProp}
        transitionDuration={SECTION_ANIMATION_DURATION_MS}
        transitionTimingFunction="ease"
        animateOpacity
        className={collapseClassName}
    >
        {className ? <div className={className}>{children}</div> : children}
    </Collapse>
);

const normalizeDivisionTokenPart = (value: unknown): string => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const buildCompositeDivisionTypeId = (skillDivisionTypeId: string, ageDivisionTypeId: string): string => {
    const normalizedSkill = normalizeDivisionTokenPart(skillDivisionTypeId) || 'open';
    const normalizedAge = normalizeDivisionTokenPart(ageDivisionTypeId) || DEFAULT_AGE_DIVISION_FALLBACK;
    return `skill_${normalizedSkill}_age_${normalizedAge}`;
};

const parseCompositeDivisionTypeId = (
    divisionTypeId: unknown,
): { skillDivisionTypeId: string; ageDivisionTypeId: string } | null => {
    const normalized = normalizeDivisionTokenPart(divisionTypeId);
    if (!normalized.length) {
        return null;
    }
    const match = normalized.match(/^skill_([a-z0-9_]+)_age_([a-z0-9_]+)$/);
    if (!match) {
        return null;
    }
    return {
        skillDivisionTypeId: match[1],
        ageDivisionTypeId: match[2],
    };
};

const buildDivisionTypeCompositeName = (skillDivisionTypeName: string, ageDivisionTypeName: string): string => (
    `${skillDivisionTypeName} • ${ageDivisionTypeName}`.trim()
);

const normalizeWeekdays = (slot: { dayOfWeek?: number; daysOfWeek?: number[] }): number[] => {
    const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
        ? slot.daysOfWeek
        : typeof slot.dayOfWeek === 'number'
            ? [slot.dayOfWeek]
            : [];
    return Array.from(
        new Set(
            source
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
        ),
    ).sort((a, b) => a - b);
};

const normalizeDivisionKeys = (values: unknown): string[] => {
    if (!Array.isArray(values)) {
        return [];
    }
    return Array.from(
        new Set(
            values
                .map((value) => String(value).trim().toLowerCase())
                .filter((value) => value.length > 0),
        ),
    );
};

const normalizePlacementDivisionIds = (values: unknown): string[] => {
    if (!Array.isArray(values)) {
        return [];
    }
    return values.map((value) => normalizeDivisionKeys([value])[0] ?? '');
};

const normalizeDivisionNameKey = (value: unknown): string => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const buildUniqueDivisionIdForToken = (params: {
    eventId: string;
    token: string;
    existingDivisionIds: string[];
}): string => {
    const usedDivisionIds = new Set(normalizeDivisionKeys(params.existingDivisionIds));
    let suffix = 1;
    while (true) {
        const scopedEventId = suffix === 1 ? params.eventId : `${params.eventId}_${suffix}`;
        const candidate = buildEventDivisionId(scopedEventId, params.token);
        if (!usedDivisionIds.has(candidate)) {
            return candidate;
        }
        suffix += 1;
    }
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

const normalizeSlotFieldIds = (slot: { scheduledFieldId?: string; scheduledFieldIds?: string[] }): string[] => {
    const fromList = normalizeFieldIds(slot.scheduledFieldIds);
    if (fromList.length) {
        return fromList;
    }
    return typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.length > 0
        ? [slot.scheduledFieldId]
        : [];
};

const defaultFieldDivisionKeys = (eventDivisions: unknown): string[] => {
    const normalized = normalizeDivisionKeys(eventDivisions);
    return normalized.length ? normalized : [DEFAULT_DIVISION_KEY];
};

const resolveSportInput = (sportInput?: Sport | string | null): string => {
    const sportName = typeof sportInput === 'string'
        ? sportInput
        : sportInput?.name ?? sportInput?.$id ?? '';
    return sportName.toLowerCase();
};

const getDefaultDivisionTypeSelectionsForSport = (sportInput?: string | null): {
    skillDivisionTypeId: string;
    skillDivisionTypeName: string;
    ageDivisionTypeId: string;
    ageDivisionTypeName: string;
} => {
    const options = getDivisionTypeOptionsForSport(sportInput ?? '');
    const fallbackSkill = options.find((option) => option.ratingType === 'SKILL' && option.id === 'open')
        ?? options.find((option) => option.ratingType === 'SKILL')
        ?? { id: 'open', name: 'Open', ratingType: 'SKILL', sportKey: 'generic' };
    let fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === '18plus');
    if (!fallbackAge) {
        for (const preferredAgeId of PREFERRED_AGE_DIVISION_IDS) {
            fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === preferredAgeId);
            if (fallbackAge) break;
        }
    }
    fallbackAge = fallbackAge
        ?? options.find((option) => option.ratingType === 'AGE')
        ?? { id: '18plus', name: '18+', ratingType: 'AGE', sportKey: 'generic' };
    return {
        skillDivisionTypeId: fallbackSkill.id,
        skillDivisionTypeName: fallbackSkill.name,
        ageDivisionTypeId: fallbackAge.id,
        ageDivisionTypeName: fallbackAge.name,
    };
};

const parseDateValue = (value?: string | null): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const supportsScheduleSlots = (eventType: EventType): boolean =>
    eventType === 'LEAGUE' || eventType === 'TOURNAMENT';

type DivisionDetailForm = {
    id: string;
    key: string;
    kind?: 'LEAGUE' | 'PLAYOFF';
    name: string;
    divisionTypeId: string;
    divisionTypeName: string;
    ratingType: 'AGE' | 'SKILL';
    gender: 'M' | 'F' | 'C';
    skillDivisionTypeId: string;
    skillDivisionTypeName: string;
    ageDivisionTypeId: string;
    ageDivisionTypeName: string;
    // Stored as dollars in the form; converted to cents in API payloads.
    price: number;
    maxParticipants: number;
    playoffTeamCount?: number;
    playoffPlacementDivisionIds?: string[];
    allowPaymentPlans: boolean;
    installmentCount?: number;
    installmentDueDates: string[];
    installmentAmounts: number[];
    sportId?: string;
    fieldIds?: string[];
    ageCutoffDate?: string;
    ageCutoffLabel?: string;
    ageCutoffSource?: string;
};

type PlayoffDivisionDetailForm = {
    id: string;
    key: string;
    kind: 'PLAYOFF';
    name: string;
    maxParticipants: number;
    playoffConfig: TournamentConfig;
};

type SlotDivisionLookup = {
    options: Array<{ value: string; label: string }>;
    keys: string[];
    valueToId: Map<string, string>;
};

type SlotDivisionLookupDetail = {
    id: string;
    name: string;
    gender?: 'M' | 'F' | 'C';
    divisionTypeName?: string;
};

const getDivisionDetailLabel = (
    detail: SlotDivisionLookupDetail,
): string => {
    if (typeof detail.name === 'string' && detail.name.trim().length > 0) {
        return detail.name.trim();
    }
    return buildDivisionName({
        gender: detail.gender ?? 'C',
        divisionTypeName: detail.divisionTypeName ?? 'Open',
    });
};

const buildSlotDivisionLookup = (
    details: SlotDivisionLookupDetail[],
    playoffDetails: PlayoffDivisionDetailForm[] = [],
): SlotDivisionLookup => {
    const allDetails: SlotDivisionLookupDetail[] = [
        ...details,
        ...playoffDetails.map((division) => ({
            id: division.id,
            name: division.name,
            gender: 'C' as const,
            divisionTypeName: 'Playoff',
        })),
    ];
    const optionByValue = new Map<string, { value: string; label: string }>();
    const orderedKeys: string[] = [];
    const seenKeys = new Set<string>();
    const valueToId = new Map<string, string>();

    allDetails.forEach((detail) => {
        const normalizedId = normalizeDivisionKeys([detail.id])[0];
        const label = getDivisionDetailLabel(detail);
        if (!normalizedId) {
            return;
        }

        if (!optionByValue.has(normalizedId)) {
            optionByValue.set(normalizedId, {
                value: normalizedId,
                label,
            });
        }
        if (!seenKeys.has(normalizedId)) {
            seenKeys.add(normalizedId);
            orderedKeys.push(normalizedId);
        }

        const normalizedName = normalizeDivisionNameKey(label);
        valueToId.set(normalizedId, normalizedId);
        valueToId.set(normalizeDivisionNameKey(detail.id), normalizedId);
        if (normalizedName.length > 0 && !valueToId.has(normalizedName)) {
            valueToId.set(normalizedName, normalizedId);
        }
    });

    return {
        options: Array.from(optionByValue.values()).sort((left, right) => left.label.localeCompare(right.label)),
        keys: orderedKeys,
        valueToId,
    };
};

const normalizeSlotDivisionIdsWithLookup = (
    values: unknown,
    lookup: Pick<SlotDivisionLookup, 'valueToId'>,
): string[] => (
    Array.from(
        new Set(
            (Array.isArray(values) ? values : [])
                .map((value) => String(value).trim())
                .filter((value) => value.length > 0)
                .map((value) => {
                    const normalizedId = normalizeDivisionKeys([value])[0];
                    if (normalizedId) {
                        const byId = lookup.valueToId.get(normalizedId);
                        if (byId) {
                            return byId;
                        }
                    }
                    const byLabel = lookup.valueToId.get(normalizeDivisionNameKey(value));
                    return byLabel ?? normalizedId ?? '';
                })
                .filter((value) => value.length > 0),
        ),
    )
);

const normalizeSlotDivisionKeysWithLookup = (
    values: unknown,
    lookup: Pick<SlotDivisionLookup, 'valueToId'>,
): string[] => normalizeSlotDivisionIdsWithLookup(values, lookup);

const applyDivisionAgeCutoff = (
    detail: DivisionDetailForm,
    sportInput?: string | null,
    referenceDate?: Date | null,
): DivisionDetailForm => {
    const eligibility = evaluateDivisionAgeEligibility({
        divisionTypeId: detail.ageDivisionTypeId || detail.divisionTypeId,
        sportInput: sportInput ?? detail.sportId ?? undefined,
        referenceDate: referenceDate ?? null,
    });
    if (!eligibility.applies) {
        return {
            ...detail,
            ageCutoffDate: undefined,
            ageCutoffLabel: undefined,
            ageCutoffSource: undefined,
        };
    }
    return {
        ...detail,
        ageCutoffDate: eligibility.cutoffDate.toISOString(),
        ageCutoffLabel: eligibility.message ?? undefined,
        ageCutoffSource: eligibility.cutoffRule.source,
    };
};

const buildDefaultDivisionDetailsForSport = (
    eventId: string,
    sportInput?: Sport | string | null,
    referenceDate?: Date | null,
): DivisionDetailForm[] => {
    const sport = resolveSportInput(sportInput);
    const options = getDivisionTypeOptionsForSport(sport);
    const fallbackSkill = options.find((option) => option.ratingType === 'SKILL' && option.id === 'open')
        ?? options.find((option) => option.ratingType === 'SKILL')
        ?? { id: 'open', name: 'Open', ratingType: 'SKILL', sportKey: 'generic' };
    let fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === '18plus');
    if (!fallbackAge) {
        for (const preferredAgeId of PREFERRED_AGE_DIVISION_IDS) {
            fallbackAge = options.find((option) => option.ratingType === 'AGE' && option.id === preferredAgeId);
            if (fallbackAge) break;
        }
    }
    fallbackAge = fallbackAge
        ?? options.find((option) => option.ratingType === 'AGE')
        ?? { id: '18plus', name: '18+', ratingType: 'AGE', sportKey: 'generic' };
    const compositeDivisionTypeId = buildCompositeDivisionTypeId(fallbackSkill.id, fallbackAge.id);
    const token = buildDivisionToken({
        gender: 'C',
        ratingType: 'SKILL',
        divisionTypeId: compositeDivisionTypeId,
    });
    const divisionTypeName = buildDivisionTypeCompositeName(fallbackSkill.name, fallbackAge.name);
    const detail: DivisionDetailForm = {
        id: buildEventDivisionId(eventId, token),
        key: token,
        kind: 'LEAGUE',
        name: buildDivisionName({
            gender: 'C',
            divisionTypeName,
        }),
        divisionTypeId: compositeDivisionTypeId,
        divisionTypeName,
        ratingType: 'SKILL',
        gender: 'C',
        skillDivisionTypeId: fallbackSkill.id,
        skillDivisionTypeName: fallbackSkill.name,
        ageDivisionTypeId: fallbackAge.id,
        ageDivisionTypeName: fallbackAge.name,
        price: 0,
        maxParticipants: 10,
        playoffTeamCount: 10,
        playoffPlacementDivisionIds: [],
        allowPaymentPlans: false,
        installmentCount: 0,
        installmentDueDates: [],
        installmentAmounts: [],
        sportId: sport || undefined,
        fieldIds: [],
    };
    return [applyDivisionAgeCutoff(detail, sport, referenceDate)];
};

const toFieldIdList = (fields: Field[]): string[] => {
    return Array.from(
        new Set(
            fields
                .map((field) => field?.$id)
                .filter((fieldId): fieldId is string => typeof fieldId === 'string' && fieldId.length > 0),
        ),
    );
};

const normalizeDivisionFieldIds = (
    value: unknown,
    divisionKeys: string[],
    availableFieldIds: string[],
): Record<string, string[]> => {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    const allowed = new Set(availableFieldIds);
    const normalizedDivisionKeys = divisionKeys.length ? divisionKeys : [DEFAULT_DIVISION_KEY];
    const result: Record<string, string[]> = {};

    normalizedDivisionKeys.forEach((divisionKey) => {
        const rawFieldIds = source[divisionKey];
        const selected = Array.isArray(rawFieldIds)
            ? Array.from(new Set(rawFieldIds.map((entry) => String(entry)).filter((entry) => allowed.has(entry))))
            : [];
        result[divisionKey] = selected.length ? selected : [...availableFieldIds];
    });

    return result;
};

const deriveDivisionFieldIdsFromFields = (
    fields: Field[],
    divisionKeys: string[],
    fallbackFieldIds: string[],
): Record<string, string[]> => {
    const normalizedDivisionKeys = divisionKeys.length ? divisionKeys : [DEFAULT_DIVISION_KEY];
    const map = new Map<string, Set<string>>();
    normalizedDivisionKeys.forEach((divisionKey) => map.set(divisionKey, new Set<string>()));

    fields.forEach((field) => {
        const fieldId = field?.$id;
        if (!fieldId) return;
        const keys = normalizeDivisionKeys(field.divisions);
        keys.forEach((key) => {
            const bucket = map.get(key) ?? new Set<string>();
            bucket.add(fieldId);
            map.set(key, bucket);
        });
    });

    const result: Record<string, string[]> = {};
    normalizedDivisionKeys.forEach((divisionKey) => {
        const mapped = Array.from(map.get(divisionKey) ?? []);
        result[divisionKey] = mapped.length ? mapped : [...fallbackFieldIds];
    });
    return result;
};

const divisionFieldIdsEqual = (
    left: Record<string, string[]>,
    right: Record<string, string[]>,
): boolean => {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    for (const key of keys) {
        const leftValues = Array.from(new Set((left[key] ?? []).map(String))).sort();
        const rightValues = Array.from(new Set((right[key] ?? []).map(String))).sort();
        if (leftValues.length !== rightValues.length) {
            return false;
        }
        for (let index = 0; index < leftValues.length; index += 1) {
            if (leftValues[index] !== rightValues[index]) {
                return false;
            }
        }
    }
    return true;
};

const stringArraysEqual = (left: string[], right: string[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((value, index) => value === right[index]);
};

const stringSetsEqual = (left: string[], right: string[]): boolean => {
    const normalizedLeft = Array.from(new Set(left)).sort();
    const normalizedRight = Array.from(new Set(right)).sort();
    return stringArraysEqual(normalizedLeft, normalizedRight);
};

const tournamentConfigEqual = (left: TournamentConfig, right: TournamentConfig): boolean => (
    left.doubleElimination === right.doubleElimination
    && left.winnerSetCount === right.winnerSetCount
    && left.loserSetCount === right.loserSetCount
    && left.prize === right.prize
    && left.fieldCount === right.fieldCount
    && left.restTimeMinutes === right.restTimeMinutes
    && stringArraysEqual(
        (left.winnerBracketPointsToVictory || []).map((value) => String(value)),
        (right.winnerBracketPointsToVictory || []).map((value) => String(value)),
    )
    && stringArraysEqual(
        (left.loserBracketPointsToVictory || []).map((value) => String(value)),
        (right.loserBracketPointsToVictory || []).map((value) => String(value)),
    )
);

const normalizeTemplateType = (value: unknown): TemplateDocument['type'] => {
    if (typeof value === 'string' && value.toUpperCase() === 'TEXT') {
        return 'TEXT';
    }
    return 'PDF';
};

const mapTemplateRow = (row: Record<string, any>): TemplateDocument => {
    const roleIndexRaw = row?.roleIndex;
    const roleIndex = typeof roleIndexRaw === 'number' ? roleIndexRaw : Number(roleIndexRaw);
    const roleIndexesRaw = Array.isArray(row?.roleIndexes) ? row.roleIndexes : undefined;
    const roleIndexes = roleIndexesRaw
        ? roleIndexesRaw
            .map((entry: unknown) => Number(entry))
            .filter((value: number) => Number.isFinite(value))
        : undefined;
    const signerRolesRaw = Array.isArray(row?.signerRoles) ? row.signerRoles : undefined;
    const signerRoles = signerRolesRaw
        ? signerRolesRaw
            .filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
            .map((entry: string) => entry.trim())
        : undefined;
    const signOnceRaw = row?.signOnce;
    const requiredSignerType = normalizeRequiredSignerType(row?.requiredSignerType);

    return {
        $id: String(row?.$id ?? ''),
        templateId: row?.templateId ?? undefined,
        organizationId: row?.organizationId ?? '',
        title: row?.title ?? 'Untitled Template',
        description: row?.description ?? undefined,
        signOnce: typeof signOnceRaw === 'boolean' ? signOnceRaw : signOnceRaw == null ? true : Boolean(signOnceRaw),
        status: row?.status ?? undefined,
        roleIndex: Number.isFinite(roleIndex) ? roleIndex : undefined,
        roleIndexes: roleIndexes && roleIndexes.length ? roleIndexes : undefined,
        signerRoles: signerRoles && signerRoles.length ? signerRoles : undefined,
        requiredSignerType,
        type: normalizeTemplateType(row?.type),
        content: row?.content ?? undefined,
        $createdAt: row?.$createdAt ?? undefined,
    };
};

// Compares two numeric start/end pairs to detect overlapping minutes within the same day.
const slotsOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
    Math.max(startA, startB) < Math.min(endA, endB);

const slotDateTimeRangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
    startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

// Evaluates the current slot against other form slots to surface inline validation errors for schedulable event types.
const computeSlotError = (
    slots: LeagueSlotForm[],
    index: number,
    eventType: EventType
): string | undefined => {
    if (!supportsScheduleSlots(eventType)) {
        return undefined;
    }

    const slot = slots[index];
    if (!slot) {
        return undefined;
    }

    const slotFieldIds = normalizeSlotFieldIds(slot);
    if (!slotFieldIds.length) {
        return undefined;
    }

    const isRepeating = slot.repeating !== false;
    if (!isRepeating) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        if (!slotStart || !slotEnd) {
            return undefined;
        }
        if (slotEnd.getTime() <= slotStart.getTime()) {
            return 'Timeslot must end after it starts.';
        }

        const hasOverlap = slots.some((other, otherIndex) => {
            if (otherIndex === index || other.repeating !== false) {
                return false;
            }
            const otherFieldIds = normalizeSlotFieldIds(other);
            if (!otherFieldIds.length || !otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))) {
                return false;
            }
            const otherStart = parseLocalDateTime(other.startDate ?? null);
            const otherEnd = parseLocalDateTime(other.endDate ?? null);
            if (!otherStart || !otherEnd) {
                return false;
            }
            return slotDateTimeRangesOverlap(slotStart, slotEnd, otherStart, otherEnd);
        });

        return hasOverlap ? 'Overlaps with another timeslot in this form.' : undefined;
    }

    const slotDays = normalizeWeekdays(slot);
    if (
        slotDays.length === 0 ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number'
    ) {
        return undefined;
    }

    const slotStartTime = slot.startTimeMinutes;
    const slotEndTime = slot.endTimeMinutes;
    if (slotEndTime <= slotStartTime) {
        return 'Timeslot must end after it starts.';
    }

    const hasOverlap = slots.some((other, otherIndex) => {
        if (otherIndex === index || other.repeating === false) {
            return false;
        }
        const otherFieldIds = normalizeSlotFieldIds(other);
        if (!otherFieldIds.length || !otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))) {
            return false;
        }
        const otherDays = normalizeWeekdays(other);
        if (otherDays.length === 0 || !otherDays.some((day) => slotDays.includes(day))) {
            return false;
        }
        if (
            typeof other.startTimeMinutes !== 'number' ||
            typeof other.endTimeMinutes !== 'number'
        ) {
            return false;
        }
        return slotsOverlap(slotStartTime, slotEndTime, other.startTimeMinutes, other.endTimeMinutes);
    });

    return hasOverlap ? 'Overlaps with another timeslot in this form.' : undefined;
};

// Resets conflict bookkeeping and assigns slot errors so UI can block submission when overlaps exist.
const normalizeSlotState = (slots: LeagueSlotForm[], eventType: EventType): LeagueSlotForm[] => {
    let mutated = false;

    const normalized = slots.map((slot, index) => {
        const error = computeSlotError(slots, index, eventType);
        const needsUpdate =
            slot.error !== error ||
            slot.checking !== false ||
            slot.conflicts.length > 0;

        if (!needsUpdate) {
            return slot;
        }

        mutated = true;
        return {
            ...slot,
            conflicts: [],
            checking: false,
            error,
        };
    });

    return mutated ? normalized : slots;
};

// Converts mixed input values into numbers while respecting optional fallbacks for blank fields.
const normalizeNumber = (value: unknown, fallback?: number): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    }
    return undefined;
};

// Helpers to move between UI dollars and API cents for installment amounts.
const normalizeInstallmentDollars = (amounts: unknown): number[] => {
    if (!Array.isArray(amounts)) return [];
    return amounts.map((amount) => {
        const parsed = typeof amount === 'number' ? amount : Number(amount);
        return Number.isFinite(parsed) ? parsed / 100 : 0;
    });
};

const normalizeInstallmentCents = (amounts: unknown): number[] => {
    if (!Array.isArray(amounts)) return [];
    return amounts.map((amount) => {
        const parsed = typeof amount === 'number' ? amount : Number(amount);
        const safe = Number.isFinite(parsed) ? parsed : 0;
        return Math.round(Math.max(0, safe) * 100);
    });
};

const normalizeInstallmentDates = (dates: unknown): string[] => {
    if (!Array.isArray(dates)) return [];
    return dates
        .map((entry) => parseDateValue(typeof entry === 'string' ? entry : String(entry ?? '')))
        .filter((value): value is Date => Boolean(value))
        .map((value) => value.toISOString());
};

const formatLatLngLabel = (lat?: number, lng?: number): string => {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return '';
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return '';
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

const getLongitudeFromCoordinates = (coordinates?: [number, number]): number | undefined => {
    if (!Array.isArray(coordinates)) {
        return undefined;
    }
    const [lng] = coordinates;
    return typeof lng === 'number' && Number.isFinite(lng) ? lng : undefined;
};

const getLatitudeFromCoordinates = (coordinates?: [number, number]): number | undefined => {
    if (!Array.isArray(coordinates)) {
        return undefined;
    }
    const lat = coordinates[1];
    return typeof lat === 'number' && Number.isFinite(lat) ? lat : undefined;
};

const coordinatesAreSet = (coordinates?: [number, number]): boolean => {
    const lat = getLatitudeFromCoordinates(coordinates);
    const lng = getLongitudeFromCoordinates(coordinates);
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return false;
    }
    return !(lat === 0 && lng === 0);
};

const toUserLabel = (user: Partial<UserData> | undefined, fallbackId: string): string => {
    const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
    const lastName = typeof user?.lastName === 'string' ? user.lastName.trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) {
        return fullName;
    }
    if (typeof user?.userName === 'string' && user.userName.trim().length > 0) {
        return user.userName.trim();
    }
    return fallbackId;
};

// Drop match back-references to avoid circular data when React Hook Form clones defaults.
const sanitizeFieldForForm = (field: Field): Field => {
    const { matches: _matches, ...rest } = field as Field & { matches?: unknown };
    return { ...rest } as Field;
};

const sanitizeFieldsForForm = (fields?: Field[] | null): Field[] =>
    Array.isArray(fields) ? fields.map(sanitizeFieldForForm) : [];

const getFieldOrganizationId = (field?: Field | null): string | undefined => {
    if (!field) return undefined;
    const org = (field as any).organization;
    if (org && typeof org === 'object' && '$id' in org) {
        return (org as Organization).$id;
    }
    if (typeof (field as any).organizationId === 'string') {
        return (field as any).organizationId;
    }
    return undefined;
};

type EventFormState = {
    $id: string;
    name: string;
    description: string;
    location: string;
    coordinates: [number, number];
    start: string;
    end: string;
    state: EventState;
    eventType: EventType;
    sportId: string;
    sportConfig: Sport | null;
    price: number;
    minAge?: number;
    maxAge?: number;
    allowPaymentPlans: boolean;
    installmentCount?: number;
    installmentDueDates: string[];
    installmentAmounts: number[];
    allowTeamSplitDefault: boolean;
    maxParticipants: number;
    teamSizeLimit: number;
    teamSignup: boolean;
    singleDivision: boolean;
    splitLeaguePlayoffDivisions: boolean;
    registrationByDivisionType: boolean;
    divisions: string[];
    divisionDetails: DivisionDetailForm[];
    playoffDivisionDetails: PlayoffDivisionDetailForm[];
    divisionFieldIds: Record<string, string[]>;
    selectedFieldIds: string[];
    cancellationRefundHours: number;
    registrationCutoffHours: number;
    organizationId?: string;
    requiredTemplateIds: string[];
    hostId?: string;
    noFixedEndDateTime: boolean;
    imageId: string;
    seedColor: number;
    waitList: string[];
    freeAgents: string[];
    players: UserData[];
    teams: Team[];
    referees: UserData[];
    refereeIds: string[];
    assistantHostIds: string[];
    doTeamsRef: boolean;
    leagueScoringConfig: LeagueScoringConfig;
};

const divisionIdFromValue = (value: string | CoreDivision): string => {
    if (typeof value === 'string') {
        return value.trim().toLowerCase();
    }
    const fallback = (
        value.id
        || (value as any).$id
        || value.key
        || value.skillLevel
        || value.name
        || ''
    ).toString();
    return fallback.trim().toLowerCase();
};

const normalizeDivisionDetailEntry = (
    entry: unknown,
    eventId: string,
    sportInput?: string | null,
    referenceDate?: Date | null,
    priceStoredInCents: boolean = true,
): DivisionDetailForm | null => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const row = entry as Record<string, unknown>;
    const rawId = normalizeDivisionKeys([row.id ?? row.$id])[0];
    const inferred = inferDivisionDetails({
        identifier: (row.key ?? rawId ?? row.name ?? 'c_skill_open') as string,
        sportInput: sportInput ?? undefined,
        fallbackName: typeof row.name === 'string' ? row.name : undefined,
    });
    const defaults = getDefaultDivisionTypeSelectionsForSport(sportInput ?? undefined);
    const rawDivisionTypeId = normalizeDivisionKeys([row.divisionTypeId])[0] || inferred.divisionTypeId;
    const parsedComposite = parseCompositeDivisionTypeId(row.divisionTypeId ?? rawDivisionTypeId);
    const rawSkillDivisionTypeId = normalizeDivisionKeys([row.skillDivisionTypeId])[0];
    const rawAgeDivisionTypeId = normalizeDivisionKeys([row.ageDivisionTypeId])[0];
    const ratingType = parsedComposite || rawSkillDivisionTypeId || rawAgeDivisionTypeId
        ? 'SKILL'
        : (normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType);
    const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
    const skillDivisionTypeId = rawSkillDivisionTypeId
        ?? parsedComposite?.skillDivisionTypeId
        ?? (ratingType === 'SKILL' ? rawDivisionTypeId : defaults.skillDivisionTypeId);
    const ageDivisionTypeId = rawAgeDivisionTypeId
        ?? parsedComposite?.ageDivisionTypeId
        ?? (ratingType === 'AGE' ? rawDivisionTypeId : defaults.ageDivisionTypeId);
    const skillDivisionTypeName = typeof row.skillDivisionTypeName === 'string' && row.skillDivisionTypeName.trim().length > 0
        ? row.skillDivisionTypeName.trim()
        : (
            getDivisionTypeById(sportInput ?? null, skillDivisionTypeId, 'SKILL')?.name
            ?? defaults.skillDivisionTypeName
        );
    const ageDivisionTypeName = typeof row.ageDivisionTypeName === 'string' && row.ageDivisionTypeName.trim().length > 0
        ? row.ageDivisionTypeName.trim()
        : (
            getDivisionTypeById(sportInput ?? null, ageDivisionTypeId, 'AGE')?.name
            ?? defaults.ageDivisionTypeName
        );
    const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
    const divisionTypeName = typeof row.divisionTypeName === 'string' && row.divisionTypeName.trim().length > 0
        ? row.divisionTypeName.trim()
        : buildDivisionTypeCompositeName(skillDivisionTypeName, ageDivisionTypeName);
    const key = normalizeDivisionKeys([row.key])[0] || buildDivisionToken({
        gender,
        ratingType: 'SKILL',
        divisionTypeId,
    });
    const id = rawId || buildEventDivisionId(eventId, key);
    const name = typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name.trim()
        : buildDivisionName({ gender, divisionTypeName });
    const rawDivisionPriceCents = typeof row.price === 'number'
        ? row.price
        : Number.isFinite(Number(row.price))
            ? Number(row.price)
            : 0;
    const rawDivisionMaxParticipants = typeof row.maxParticipants === 'number'
        ? row.maxParticipants
        : Number.isFinite(Number(row.maxParticipants))
            ? Number(row.maxParticipants)
            : 10;
    const rawDivisionPlayoffTeamCount = typeof row.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : Number.isFinite(Number(row.playoffTeamCount))
            ? Number(row.playoffTeamCount)
            : undefined;
    const rawPlayoffPlacementDivisionIds = normalizePlacementDivisionIds(row.playoffPlacementDivisionIds);
    const rawAllowPaymentPlans = normalizeBoolean(row.allowPaymentPlans) ?? false;
    const rawInstallmentAmounts = Array.isArray(row.installmentAmounts)
        ? row.installmentAmounts.map((value) => {
            const parsed = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(parsed)) {
                return 0;
            }
            return priceStoredInCents
                ? Math.max(0, parsed) / 100
                : Math.max(0, parsed);
        })
        : [];
    const rawInstallmentDueDates = normalizeInstallmentDates(row.installmentDueDates);
    const rawInstallmentCount = Number.isFinite(Number(row.installmentCount))
        ? Math.max(0, Math.trunc(Number(row.installmentCount)))
        : rawInstallmentAmounts.length;

    const baseDetail: DivisionDetailForm = {
        id,
        key,
        kind: typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE',
        name,
        divisionTypeId,
        divisionTypeName,
        ratingType,
        gender,
        skillDivisionTypeId,
        skillDivisionTypeName,
        ageDivisionTypeId,
        ageDivisionTypeName,
        price: priceStoredInCents
            ? Math.max(0, rawDivisionPriceCents) / 100
            : Math.max(0, rawDivisionPriceCents),
        maxParticipants: Math.max(2, Math.trunc(rawDivisionMaxParticipants)),
        playoffTeamCount: Number.isFinite(rawDivisionPlayoffTeamCount)
            ? Math.max(2, Math.trunc(rawDivisionPlayoffTeamCount as number))
            : undefined,
        playoffPlacementDivisionIds: rawPlayoffPlacementDivisionIds,
        allowPaymentPlans: rawAllowPaymentPlans,
        installmentCount: rawAllowPaymentPlans
            ? (rawInstallmentCount || rawInstallmentAmounts.length || 0)
            : 0,
        installmentDueDates: rawAllowPaymentPlans ? rawInstallmentDueDates : [],
        installmentAmounts: rawAllowPaymentPlans ? rawInstallmentAmounts : [],
        sportId: typeof row.sportId === 'string' ? row.sportId : sportInput ?? undefined,
        fieldIds: Array.isArray(row.fieldIds)
            ? row.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)
            : [],
        ageCutoffDate: typeof row.ageCutoffDate === 'string' ? row.ageCutoffDate : undefined,
        ageCutoffLabel: typeof row.ageCutoffLabel === 'string' ? row.ageCutoffLabel : undefined,
        ageCutoffSource: typeof row.ageCutoffSource === 'string' ? row.ageCutoffSource : undefined,
    };
    return applyDivisionAgeCutoff(baseDetail, sportInput, referenceDate);
};

const normalizePlayoffDivisionDetailEntry = (
    entry: unknown,
    eventId: string,
    fallbackPlayoffConfig?: TournamentConfig,
): PlayoffDivisionDetailForm | null => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const row = entry as Record<string, unknown>;
    const rawId = normalizeDivisionKeys([row.id ?? row.$id])[0];
    const rawKey = normalizeDivisionKeys([row.key])[0];
    const key = rawKey || `playoff_${Math.max(1, Math.trunc(Number(row.seed) || 1))}`;
    const id = rawId || buildEventDivisionId(eventId, key);
    const name = typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name.trim()
        : `Playoff Division ${key.replace(/^playoff_/, '')}`;
    const maxParticipantsRaw = Number.isFinite(Number(row.maxParticipants))
        ? Number(row.maxParticipants)
        : 2;
    const playoffConfig = extractTournamentConfigFromEvent(row as unknown as Partial<Event>)
        ?? buildTournamentConfig(fallbackPlayoffConfig);

    return {
        id,
        key,
        kind: 'PLAYOFF',
        name,
        maxParticipants: Math.max(2, Math.trunc(maxParticipantsRaw)),
        playoffConfig,
    };
};

const buildTournamentConfig = (source?: Partial<TournamentConfig>): TournamentConfig => {
    const normalizePoints = (points: number[] | undefined, len: number): number[] => {
        const next = Array.isArray(points) ? points.slice(0, len) : [];
        while (next.length < len) next.push(21);
        return next;
    };

    const doubleElimination = Boolean(source?.doubleElimination);
    const winnerSetCount = source?.winnerSetCount ?? 1;
    const loserSetCount = doubleElimination ? source?.loserSetCount ?? 1 : source?.loserSetCount ?? 1;

    return {
        doubleElimination,
        winnerSetCount,
        loserSetCount,
        winnerBracketPointsToVictory: normalizePoints(source?.winnerBracketPointsToVictory, winnerSetCount),
        loserBracketPointsToVictory: normalizePoints(
            source?.loserBracketPointsToVictory,
            doubleElimination ? loserSetCount : 1
        ),
        prize: source?.prize ?? '',
        fieldCount: source?.fieldCount ?? 1,
        restTimeMinutes: source?.restTimeMinutes ?? 0,
    };
};

const TOURNAMENT_CONFIG_KEYS: (keyof TournamentConfig)[] = [
    'doubleElimination',
    'winnerSetCount',
    'loserSetCount',
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
    'prize',
    'fieldCount',
    'restTimeMinutes',
];

const TOURNAMENT_ARRAY_CONFIG_KEYS = new Set<keyof TournamentConfig>([
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
]);

const extractTournamentConfigFromEvent = (event?: Partial<Event> | null): TournamentConfig | null => {
    if (!event) {
        return null;
    }

    const legacyPlayoff = (event as { playoffConfig?: Partial<TournamentConfig> | null }).playoffConfig;
    if (legacyPlayoff) {
        return buildTournamentConfig(legacyPlayoff ?? undefined);
    }

    const partial: Partial<TournamentConfig> = {};
    let hasDefinedValue = false;
    for (const key of TOURNAMENT_CONFIG_KEYS) {
        const candidate = (event as Record<string, unknown>)[key as string];
        if (candidate !== undefined && candidate !== null) {
            hasDefinedValue = true;
            (partial as Record<string, unknown>)[key as string] = candidate;
        }
    }

    if (!hasDefinedValue) {
        return null;
    }

    return buildTournamentConfig(partial);
};

const mapEventToFormState = (event: Event): EventFormState => {
    const isSchedulableType = event.eventType === 'LEAGUE' || event.eventType === 'TOURNAMENT';
    const derivedNoFixedEndDateTime = (() => {
        if (typeof event.noFixedEndDateTime === 'boolean') {
            return event.noFixedEndDateTime;
        }
        const parsedStart = parseLocalDateTime(event.start);
        const parsedEnd = parseLocalDateTime(event.end);
        if (parsedStart && parsedEnd) {
            return parsedStart.getTime() === parsedEnd.getTime();
        }
        return isSchedulableType;
    })();

    const resolvedSportId = (() => {
        // `event.sport` is historically inconsistent: it may be a Sport object, a string id, or absent.
        // Keep runtime compatibility by treating it as unknown and narrowing safely.
        const sport = (event as { sport?: unknown }).sport;
        if (sport && typeof sport === 'object' && '$id' in sport) {
            return (sport as Sport).$id;
        }
        if (typeof sport === 'string' && sport.trim().length > 0) {
            return sport;
        }
        if (typeof event.sportId === 'string' && event.sportId.trim().length > 0) {
            return event.sportId;
        }
        return '';
    })();
    const resolvedSportInput = (event.sport && typeof event.sport === 'object'
        ? ((event.sport as Sport).name || (event.sport as Sport).$id || '')
        : resolvedSportId) || '';
    const divisionReferenceDate = parseDateValue(event.start ?? null);
    const defaultEventInstallmentAmounts = normalizeInstallmentDollars(event.installmentAmounts);
    const defaultEventInstallmentDueDates = Array.isArray(event.installmentDueDates)
        ? event.installmentDueDates.map((value) => String(value))
        : [];
    const defaultEventInstallmentCount = Number.isFinite(event.installmentCount)
        ? Math.max(0, Math.trunc(event.installmentCount as number))
        : defaultEventInstallmentAmounts.length;
    const defaultEventAllowPaymentPlans = Boolean(event.allowPaymentPlans);

    const normalizedDivisionIds = Array.isArray(event.divisions)
        ? Array.from(
            new Set(
                (event.divisions as (string | CoreDivision)[])
                    .map(divisionIdFromValue)
                    .filter((divisionId) => divisionId.length > 0),
            ),
        )
        : [];
    const normalizedDivisionDetails = (() => {
        const details = Array.isArray(event.divisionDetails)
            ? event.divisionDetails
                .map((entry) => normalizeDivisionDetailEntry(entry, event.$id, resolvedSportInput, divisionReferenceDate))
                .filter((entry): entry is DivisionDetailForm => Boolean(entry))
            : [];
        const detailsById = new Map<string, DivisionDetailForm>();
        details.forEach((detail) => detailsById.set(detail.id, detail));

        normalizedDivisionIds.forEach((divisionId) => {
            if (detailsById.has(divisionId)) {
                return;
            }
            const inferred = inferDivisionDetails({
                identifier: divisionId,
                sportInput: resolvedSportInput,
            });
            const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(resolvedSportInput);
            const parsedComposite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
            const skillDivisionTypeId = parsedComposite?.skillDivisionTypeId
                ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
            const ageDivisionTypeId = parsedComposite?.ageDivisionTypeId
                ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
            const skillDivisionTypeName = getDivisionTypeById(
                resolvedSportInput,
                skillDivisionTypeId,
                'SKILL',
            )?.name ?? defaultsForSport.skillDivisionTypeName;
            const ageDivisionTypeName = getDivisionTypeById(
                resolvedSportInput,
                ageDivisionTypeId,
                'AGE',
            )?.name ?? defaultsForSport.ageDivisionTypeName;
            const compositeDivisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
            const compositeDivisionTypeName = buildDivisionTypeCompositeName(
                skillDivisionTypeName,
                ageDivisionTypeName,
            );
            const inferredToken = buildDivisionToken({
                gender: inferred.gender,
                ratingType: 'SKILL',
                divisionTypeId: compositeDivisionTypeId,
            });
            detailsById.set(divisionId, applyDivisionAgeCutoff({
                id: divisionId,
                key: inferredToken,
                kind: 'LEAGUE',
                name: buildDivisionName({ gender: inferred.gender, divisionTypeName: compositeDivisionTypeName }),
                divisionTypeId: compositeDivisionTypeId,
                divisionTypeName: compositeDivisionTypeName,
                ratingType: 'SKILL',
                gender: inferred.gender,
                skillDivisionTypeId,
                skillDivisionTypeName,
                ageDivisionTypeId,
                ageDivisionTypeName,
                price: Number.isFinite(event.price) ? (event.price as number) / 100 : 0,
                maxParticipants: Number.isFinite(event.maxParticipants) ? event.maxParticipants : 10,
                playoffTeamCount: Number.isFinite(event.playoffTeamCount)
                    ? Math.max(2, Math.trunc(event.playoffTeamCount as number))
                    : undefined,
                playoffPlacementDivisionIds: [],
                allowPaymentPlans: defaultEventAllowPaymentPlans,
                installmentCount: defaultEventAllowPaymentPlans
                    ? (defaultEventInstallmentCount || defaultEventInstallmentAmounts.length || 0)
                    : 0,
                installmentDueDates: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentDueDates] : [],
                installmentAmounts: defaultEventAllowPaymentPlans ? [...defaultEventInstallmentAmounts] : [],
                sportId: resolvedSportInput || undefined,
                fieldIds: [],
            }, resolvedSportInput, divisionReferenceDate));
        });

        if (!detailsById.size) {
            const defaults = buildDefaultDivisionDetailsForSport(event.$id, resolvedSportInput, divisionReferenceDate);
            defaults.forEach((detail) => detailsById.set(detail.id, detail));
        }

        const preferredOrder = normalizedDivisionIds.length
            ? normalizedDivisionIds
            : Array.from(detailsById.keys());
        const ordered: DivisionDetailForm[] = preferredOrder
            .map((divisionId) => detailsById.get(divisionId))
            .filter((entry): entry is DivisionDetailForm => Boolean(entry));
        if (ordered.length === detailsById.size) {
            return ordered;
        }
        detailsById.forEach((detail) => {
            if (!ordered.some((entry) => entry.id === detail.id)) {
                ordered.push(detail);
            }
        });
        return ordered;
    })();
    const normalizedDivisionDetailsWithCapacity: DivisionDetailForm[] = normalizedDivisionDetails.map((detail): DivisionDetailForm => ({
        ...detail,
        kind: detail.kind === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE',
        price: Number.isFinite(detail.price)
            ? Math.max(0, detail.price)
            : Number.isFinite(event.price)
                ? (event.price as number) / 100
                : 0,
        maxParticipants: Number.isFinite(detail.maxParticipants)
            ? Math.max(2, Math.trunc(detail.maxParticipants))
            : Number.isFinite(event.maxParticipants)
                ? Math.max(2, Math.trunc(event.maxParticipants))
                : 10,
        playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
            ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
            : Number.isFinite(event.playoffTeamCount)
                ? Math.max(2, Math.trunc(event.playoffTeamCount as number))
                : undefined,
        playoffPlacementDivisionIds: normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds),
        allowPaymentPlans: typeof detail.allowPaymentPlans === 'boolean'
            ? detail.allowPaymentPlans
            : defaultEventAllowPaymentPlans,
        installmentAmounts: (() => {
            const divisionInstallments = Array.isArray(detail.installmentAmounts)
                ? detail.installmentAmounts.map((value) => {
                    const parsed = typeof value === 'number' ? value : Number(value);
                    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
                })
                : [];
            if (detail.allowPaymentPlans) {
                return divisionInstallments;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentAmounts];
            }
            return [];
        })(),
        installmentDueDates: (() => {
            const divisionDueDates = Array.isArray(detail.installmentDueDates)
                ? detail.installmentDueDates
                    .map((value) => String(value))
                    .filter((value) => value.trim().length > 0)
                : [];
            if (detail.allowPaymentPlans) {
                return divisionDueDates;
            }
            if (defaultEventAllowPaymentPlans) {
                return [...defaultEventInstallmentDueDates];
            }
            return [];
        })(),
        installmentCount: (() => {
            if (detail.allowPaymentPlans) {
                if (typeof detail.installmentCount === 'number' && Number.isFinite(detail.installmentCount)) {
                    return Math.max(0, Math.trunc(detail.installmentCount));
                }
                return Array.isArray(detail.installmentAmounts) ? detail.installmentAmounts.length : 0;
            }
            if (defaultEventAllowPaymentPlans) {
                return defaultEventInstallmentCount || defaultEventInstallmentAmounts.length || 0;
            }
            return 0;
        })(),
    }));
    const finalDivisionIds = normalizedDivisionDetailsWithCapacity.map((detail) => detail.id);
    const fallbackPlayoffConfig = extractTournamentConfigFromEvent(event) ?? buildTournamentConfig();
    const normalizedPlayoffDivisionDetails = Array.isArray((event as any).playoffDivisionDetails)
        ? (event as any).playoffDivisionDetails
            .map((entry: unknown) => normalizePlayoffDivisionDetailEntry(entry, event.$id, fallbackPlayoffConfig))
            .filter((entry: PlayoffDivisionDetailForm | null): entry is PlayoffDivisionDetailForm => Boolean(entry))
        : [];
    const splitLeaguePlayoffDivisions = event.eventType === 'LEAGUE'
        ? Boolean(
            event.splitLeaguePlayoffDivisions
            || (normalizedPlayoffDivisionDetails.length > 0 && normalizedDivisionDetailsWithCapacity.some((detail) => (
                Array.isArray(detail.playoffPlacementDivisionIds) && detail.playoffPlacementDivisionIds.length > 0
            ))),
        )
        : false;

    return {
    $id: event.$id,
    name: event.name,
    description: event.description ?? '',
    location: event.location ?? '',
    coordinates: Array.isArray(event.coordinates) ? event.coordinates as [number, number] : [0, 0],
    start: event.start,
    end: event.end,
    state: (event.state as EventState) ?? 'DRAFT',
    eventType: event.eventType,
    sportId: resolvedSportId,
    sportConfig: event.sport && typeof event.sport === 'object'
        ? { ...(event.sport as Sport) }
        : null,
    // Stored in cents in the backend; convert to dollars for the form UI.
    price: Number.isFinite(event.price) ? (event.price as number) / 100 : 0,
    minAge: Number.isFinite(event.minAge) ? event.minAge : undefined,
    maxAge: Number.isFinite(event.maxAge) ? event.maxAge : undefined,
    allowPaymentPlans: Boolean(event.allowPaymentPlans),
    // Stored in cents in the backend; convert to dollars for the form UI.
    installmentAmounts: normalizeInstallmentDollars(event.installmentAmounts),
    installmentCount: (() => {
        const amounts = Array.isArray(event.installmentAmounts) ? event.installmentAmounts as number[] : [];
        return Number.isFinite(event.installmentCount) ? (event.installmentCount as number) : (amounts.length || 0);
    })(),
    installmentDueDates: Array.isArray(event.installmentDueDates) ? event.installmentDueDates as string[] : [],
    allowTeamSplitDefault: Boolean(event.allowTeamSplitDefault),
    maxParticipants: Number.isFinite(event.maxParticipants) ? event.maxParticipants : 10,
    teamSizeLimit: Number.isFinite(event.teamSizeLimit) ? event.teamSizeLimit : 2,
    teamSignup: Boolean(event.teamSignup),
    singleDivision: Boolean(event.singleDivision),
    splitLeaguePlayoffDivisions,
    registrationByDivisionType: Boolean(event.registrationByDivisionType),
    organizationId: event.organizationId || undefined,
    divisions: finalDivisionIds,
    divisionDetails: normalizedDivisionDetailsWithCapacity,
    playoffDivisionDetails: normalizedPlayoffDivisionDetails,
    divisionFieldIds: event.divisionFieldIds && typeof event.divisionFieldIds === 'object'
        ? Object.fromEntries(
            Object.entries(event.divisionFieldIds).map(([divisionKey, fieldIds]) => [
                String(divisionKey).toLowerCase(),
                Array.isArray(fieldIds)
                    ? Array.from(new Set(fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
                    : [],
            ]),
        )
        : {},
    selectedFieldIds: Array.isArray(event.fieldIds)
        ? Array.from(new Set(event.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
        : [],
    cancellationRefundHours: Number.isFinite(event.cancellationRefundHours)
        ? event.cancellationRefundHours
        : 24,
    registrationCutoffHours: Number.isFinite(event.registrationCutoffHours)
        ? event.registrationCutoffHours
        : 2,
    hostId: event.hostId || undefined,
    noFixedEndDateTime: isSchedulableType ? derivedNoFixedEndDateTime : false,
    requiredTemplateIds: Array.isArray(event.requiredTemplateIds)
        ? event.requiredTemplateIds
        : [],
    imageId: event.imageId ?? '',
    seedColor: event.seedColor || 0,
    waitList: event.waitListIds || [],
    freeAgents: event.freeAgentIds || [],
    players: event.players || [],
    teams: event.teams || [],
    referees: event.referees || [],
    refereeIds: event.refereeIds || [],
    assistantHostIds: Array.isArray(event.assistantHostIds) ? event.assistantHostIds : [],
    doTeamsRef: Boolean(event.doTeamsRef),
    leagueScoringConfig: createLeagueScoringConfig(
        typeof event.leagueScoringConfig === 'object'
            ? (event.leagueScoringConfig as Partial<LeagueScoringConfig>)
            : undefined
    ),
};
};

type EventFormValues = EventFormState & {
    leagueSlots: LeagueSlotForm[];
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    tournamentData: TournamentConfig;
    fields: Field[];
    fieldCount: number;
    joinAsParticipant: boolean;
};

const leagueSlotSchema: z.ZodType<LeagueSlotForm> = z.object({
    key: z.string(),
    $id: z.string().optional(),
    scheduledFieldId: z.string().optional(),
    scheduledFieldIds: z.array(z.string()).default([]),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    divisions: z.array(z.string()).default([]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    startTimeMinutes: z.number().int().nonnegative().optional(),
    endTimeMinutes: z.number().int().positive().optional(),
    repeating: z.boolean().optional(),
    conflicts: z.array(z.any()).default([]),
    checking: z.boolean().default(false),
    error: z.string().optional(),
});

const leagueConfigSchema = z.object({
    gamesPerOpponent: z.number().min(1),
    includePlayoffs: z.boolean(),
    playoffTeamCount: z.number().optional(),
    usesSets: z.boolean().optional(),
    matchDurationMinutes: z.number().optional(),
    restTimeMinutes: z.number().min(0).optional(),
    setDurationMinutes: z.number().optional(),
    setsPerMatch: z.number().optional(),
    pointsToVictory: z.array(z.number()).optional(),
});

const tournamentConfigSchema = z.object({
    doubleElimination: z.boolean(),
    winnerSetCount: z.number().min(1),
    loserSetCount: z.number().min(1),
    winnerBracketPointsToVictory: z.array(z.number()),
    loserBracketPointsToVictory: z.array(z.number()),
    prize: z.string(),
    fieldCount: z.number().min(1),
    restTimeMinutes: z.number().min(0),
});

const eventFormSchema = z
    .object({
        $id: z.string(),
        name: z.string().trim().min(1, 'Event name is required'),
        description: z.string().default(''),
        location: z.string().trim(),
        coordinates: z.tuple([z.number(), z.number()]),
        start: z.string(),
        end: z.string(),
        state: z.string().default('DRAFT'),
        eventType: z.enum(['EVENT', 'TOURNAMENT', 'LEAGUE']),
        sportId: z.string().trim(),
        sportConfig: z.any().nullable(),
        price: z.number().min(0, 'Price must be at least 0'),
        minAge: z.number().int().min(0).optional(),
        maxAge: z.number().int().min(0).optional(),
        allowPaymentPlans: z.boolean().default(false),
        installmentCount: z.number().int().min(0).default(0),
        installmentDueDates: z.array(z.string()).default([]),
        installmentAmounts: z.array(z.number().min(0)).default([]),
        allowTeamSplitDefault: z.boolean().default(false),
        maxParticipants: z.number().min(2, 'Enter at least 2'),
        teamSizeLimit: z.number().min(1, 'Enter at least 1'),
        teamSignup: z.boolean(),
        singleDivision: z.boolean(),
        splitLeaguePlayoffDivisions: z.boolean().default(false),
        registrationByDivisionType: z.boolean().default(false),
        divisions: z.array(z.string()),
        divisionDetails: z.array(
            z.object({
                id: z.string().trim().min(1),
                key: z.string().trim().min(1),
                kind: z.enum(['LEAGUE', 'PLAYOFF']).optional(),
                name: z.string().trim().min(1),
                divisionTypeId: z.string().trim().min(1),
                divisionTypeName: z.string().trim().min(1),
                ratingType: z.enum(['AGE', 'SKILL']),
                gender: z.enum(['M', 'F', 'C']),
                skillDivisionTypeId: z.string().trim().min(1),
                skillDivisionTypeName: z.string().trim().min(1),
                ageDivisionTypeId: z.string().trim().min(1),
                ageDivisionTypeName: z.string().trim().min(1),
                price: z.number().min(0),
                maxParticipants: z.number().int().min(2),
                playoffTeamCount: z.number().optional(),
                playoffPlacementDivisionIds: z.array(z.string()).optional(),
                allowPaymentPlans: z.boolean().default(false),
                installmentCount: z.number().int().min(0).default(0),
                installmentDueDates: z.array(z.string()).default([]),
                installmentAmounts: z.array(z.number().min(0)).default([]),
                sportId: z.string().optional(),
                fieldIds: z.array(z.string()).optional(),
                ageCutoffDate: z.string().optional(),
                ageCutoffLabel: z.string().optional(),
                ageCutoffSource: z.string().optional(),
            }),
        ).default([]),
        playoffDivisionDetails: z.array(
            z.object({
                id: z.string().trim().min(1),
                key: z.string().trim().min(1),
                kind: z.literal('PLAYOFF').default('PLAYOFF'),
                name: z.string().trim().min(1),
                maxParticipants: z.number().int().min(2),
                playoffConfig: z.any(),
            }),
        ).default([]),
        divisionFieldIds: z.record(z.string(), z.array(z.string())).default({}),
        selectedFieldIds: z.array(z.string()).default([]),
        cancellationRefundHours: z.number().min(0),
        registrationCutoffHours: z.number().min(0),
        organizationId: z.string().optional(),
        requiredTemplateIds: z.array(z.string()).default([]),
        hostId: z.string().optional(),
        noFixedEndDateTime: z.boolean().default(false),
        imageId: z.string().trim().min(1, 'Event image is required'),
        seedColor: z.number(),
        waitList: z.array(z.string()),
        freeAgents: z.array(z.string()),
        players: z.array(z.any()),
        teams: z.array(z.any()),
        referees: z.array(z.any()),
        refereeIds: z.array(z.string()),
        assistantHostIds: z.array(z.string()).default([]),
        doTeamsRef: z.boolean(),
        leagueScoringConfig: z.any(),
        leagueSlots: z.array(leagueSlotSchema),
        leagueData: z.object({
            gamesPerOpponent: z.number().min(1),
            includePlayoffs: z.boolean(),
            playoffTeamCount: z.number().optional(),
            usesSets: z.boolean().optional(),
            matchDurationMinutes: z.number().optional(),
            restTimeMinutes: z.number().min(0).optional(),
            setDurationMinutes: z.number().optional(),
            setsPerMatch: z.number().optional(),
            pointsToVictory: z.array(z.number()).optional(),
        }),
        playoffData: tournamentConfigSchema,
        tournamentData: tournamentConfigSchema,
        fields: z.array(z.any()),
        fieldCount: z.number().min(1),
        joinAsParticipant: z.boolean(),
    })
    .superRefine((values, ctx) => {
        if (!coordinatesAreSet(values.coordinates)) {
            ctx.addIssue({
                code: "custom",
                message: 'Location and coordinates are required',
                path: ['location'],
            });
        }

        if (values.eventType !== 'LEAGUE' && values.divisions.length === 0) {
            ctx.addIssue({
                code: "custom",
                message: 'Select at least one division',
                path: ['divisions'],
            });
        }

        if ((values.eventType === 'LEAGUE' || values.eventType === 'TOURNAMENT') && !values.noFixedEndDateTime) {
            const parsedStart = parseLocalDateTime(values.start);
            const parsedEnd = parseLocalDateTime(values.end);
            if (!parsedStart || !parsedEnd || parsedEnd.getTime() <= parsedStart.getTime()) {
                ctx.addIssue({
                    code: "custom",
                    message: 'End date/time must be after start date/time when no fixed end date/time is disabled.',
                    path: ['end'],
                });
            }
        }

        const divisionIds = normalizeDivisionKeys(values.divisions);
        const detailIds = normalizeDivisionKeys(
            values.divisionDetails
                .map((detail) => detail?.id)
                .filter((value): value is string => typeof value === 'string'),
        );
        if (!stringSetsEqual(divisionIds, detailIds)) {
            ctx.addIssue({
                code: "custom",
                message: 'Division details are out of sync. Re-add the affected division.',
                path: ['divisionDetails'],
            });
        }
        if (requiresOrganizationEventFieldSelection(values.eventType, values.organizationId, values.selectedFieldIds)) {
            ctx.addIssue({
                code: "custom",
                message: 'Select at least one organization field for this event.',
                path: ['selectedFieldIds'],
            });
        }

        if (values.allowPaymentPlans) {
            const amounts = values.installmentAmounts || [];
            const dueDates = values.installmentDueDates || [];
            if (values.installmentCount && amounts.length !== values.installmentCount) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Installment count must match number of installments',
                    path: ['installmentCount'],
                });
            }
            if (!amounts.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Add at least one installment amount',
                    path: ['installmentAmounts'],
                });
            }
            if (dueDates.length && dueDates.length !== amounts.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Each installment needs a due date',
                    path: ['installmentDueDates'],
                });
            }
            const total = amounts.reduce((sum, amt) => sum + (Number.isFinite(amt) ? Number(amt) : 0), 0);
            if (values.price > 0 && Math.round(total * 100) !== Math.round(values.price * 100)) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Installment amounts must add up to the event price',
                    path: ['installmentAmounts'],
                });
            }
        }

        if (!values.singleDivision) {
            values.divisionDetails.forEach((detail, index) => {
                if (!detail.allowPaymentPlans) {
                    return;
                }
                const amounts = Array.isArray(detail.installmentAmounts) ? detail.installmentAmounts : [];
                const dueDates = Array.isArray(detail.installmentDueDates) ? detail.installmentDueDates : [];
                const expectedCount = Number.isFinite(detail.installmentCount) ? detail.installmentCount : amounts.length;
                if (expectedCount > 0 && amounts.length !== expectedCount) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Division installment count must match number of installments',
                        path: ['divisionDetails', index, 'installmentCount'],
                    });
                }
                if (!amounts.length) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Add at least one division installment amount',
                        path: ['divisionDetails', index, 'installmentAmounts'],
                    });
                }
                if (dueDates.length && dueDates.length !== amounts.length) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Each division installment needs a due date',
                        path: ['divisionDetails', index, 'installmentDueDates'],
                    });
                }
                const total = amounts.reduce((sum, amount) => sum + (Number.isFinite(amount) ? Number(amount) : 0), 0);
                if (detail.price > 0 && Math.round(total * 100) !== Math.round(detail.price * 100)) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Division installment amounts must add up to the division price',
                        path: ['divisionDetails', index, 'installmentAmounts'],
                    });
                }
            });
        }

        if (typeof values.minAge === 'number' && typeof values.maxAge === 'number') {
            if (values.minAge > values.maxAge) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Minimum age must be less than or equal to maximum age',
                    path: ['minAge'],
                });
            }
        }

        if (supportsScheduleSlots(values.eventType)) {
            const slotDivisionLookup = buildSlotDivisionLookup(
                values.divisionDetails,
                values.eventType === 'LEAGUE' && values.leagueData.includePlayoffs && values.splitLeaguePlayoffDivisions
                    ? values.playoffDivisionDetails
                    : [],
            );
            const selectedDivisionKeys = slotDivisionLookup.keys;
            if (values.eventType === 'LEAGUE' && values.leagueData.includePlayoffs) {
                if (values.splitLeaguePlayoffDivisions) {
                    if (!values.playoffDivisionDetails.length) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Add at least one playoff division when split playoffs are enabled.',
                            path: ['playoffDivisionDetails'],
                        });
                    }

                    const playoffDivisionById = new Map(
                        values.playoffDivisionDetails.map((division) => [
                            normalizeDivisionKeys([division.id])[0],
                            division,
                        ]),
                    );
                    const mappingReferences = new Map<string, number>();

                    values.divisionDetails.forEach((detail, index) => {
                        if (!(typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2)) {
                            ctx.addIssue({
                                code: "custom",
                                message: 'Division playoff team count is required when playoffs are enabled',
                                path: ['divisionDetails', index, 'playoffTeamCount'],
                            });
                            return;
                        }

                        const mapping = Array.isArray(detail.playoffPlacementDivisionIds)
                            ? detail.playoffPlacementDivisionIds
                            : [];
                        for (let placementIndex = 0; placementIndex < detail.playoffTeamCount; placementIndex += 1) {
                            const mappedDivisionId = normalizeDivisionKeys([mapping[placementIndex]])[0];
                            if (!mappedDivisionId) {
                                ctx.addIssue({
                                    code: "custom",
                                    message: `Map placement ${placementIndex + 1} to a playoff division.`,
                                    path: ['divisionDetails', index, 'playoffPlacementDivisionIds', placementIndex],
                                });
                                continue;
                            }
                            if (!playoffDivisionById.has(mappedDivisionId)) {
                                ctx.addIssue({
                                    code: "custom",
                                    message: `Placement ${placementIndex + 1} references an invalid playoff division.`,
                                    path: ['divisionDetails', index, 'playoffPlacementDivisionIds', placementIndex],
                                });
                                continue;
                            }
                            mappingReferences.set(mappedDivisionId, (mappingReferences.get(mappedDivisionId) ?? 0) + 1);
                        }
                    });

                    values.playoffDivisionDetails.forEach((division, index) => {
                        const normalizedId = normalizeDivisionKeys([division.id])[0];
                        if (!normalizedId) {
                            return;
                        }
                        const assignedCount = mappingReferences.get(normalizedId) ?? 0;
                        const capacity = Math.max(0, Math.trunc(division.maxParticipants || 0));
                        if (assignedCount > capacity) {
                            ctx.addIssue({
                                code: "custom",
                                message: `Playoff division "${division.name}" has ${assignedCount} mapped positions but only ${capacity} slots.`,
                                path: ['playoffDivisionDetails', index, 'maxParticipants'],
                            });
                        }
                    });
                } else if (values.singleDivision) {
                    if (!(typeof values.leagueData.playoffTeamCount === 'number' && values.leagueData.playoffTeamCount >= 2)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Playoff team count is required when playoffs are enabled',
                            path: ['leagueData', 'playoffTeamCount'],
                        });
                    }
                } else {
                    values.divisionDetails.forEach((detail, index) => {
                        if (!(typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2)) {
                            ctx.addIssue({
                                code: "custom",
                                message: 'Division playoff team count is required when playoffs are enabled',
                                path: ['divisionDetails', index, 'playoffTeamCount'],
                            });
                        }
                    });
                }
            }

            if (!values.leagueSlots.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Add at least one timeslot',
                    path: ['leagueSlots'],
                });
            }
            values.leagueSlots.forEach((slot, index) => {
                if (!normalizeSlotFieldIds(slot).length) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Select at least one field',
                        path: ['leagueSlots', index, 'scheduledFieldIds'],
                    });
                }
                if (slot.repeating === false) {
                    const slotStart = parseLocalDateTime(slot.startDate ?? null);
                    const slotEnd = parseLocalDateTime(slot.endDate ?? null);
                    if (!slotStart) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select a start date/time',
                            path: ['leagueSlots', index, 'startDate'],
                        });
                    }
                    if (!slotEnd) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select an end date/time',
                            path: ['leagueSlots', index, 'endDate'],
                        });
                    }
                    if (slotStart && slotEnd && slotEnd.getTime() <= slotStart.getTime()) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'End date/time must be after start date/time',
                            path: ['leagueSlots', index, 'endDate'],
                        });
                    }
                } else {
                    if (!normalizeWeekdays(slot).length) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select at least one day',
                            path: ['leagueSlots', index, 'daysOfWeek'],
                        });
                    }
                    if (!Number.isFinite(slot.startTimeMinutes)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select a start time',
                            path: ['leagueSlots', index, 'startTimeMinutes'],
                        });
                    }
                    if (!Number.isFinite(slot.endTimeMinutes)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select an end time',
                            path: ['leagueSlots', index, 'endTimeMinutes'],
                        });
                    }
                }
                if (
                    values.singleDivision &&
                    selectedDivisionKeys.length &&
                    !stringSetsEqual(
                        normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup),
                        selectedDivisionKeys,
                    )
                ) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Single division requires every timeslot to include all selected divisions.',
                        path: ['leagueSlots', index, 'divisions'],
                    });
                }
                const error = computeSlotError(values.leagueSlots, index, values.eventType);
                if (error) {
                    ctx.addIssue({
                        code: "custom",
                        message: error,
                        path: ['leagueSlots', index, 'error'],
                    });
                }
            });
        }
    });

const EventForm = React.forwardRef<EventFormHandle, EventFormProps>(({
    isOpen,
    currentUser,
    event: incomingEvent,
    organization,
    immutableDefaults,
    formId,
    defaultLocation,
    isCreateMode = false,
    rentalPurchase,
    onDirtyStateChange,
}, ref) => {
    const open = isOpen ?? true;
    const refsPrefilledRef = useRef<boolean>(false);
    const lastResetEventIdRef = useRef<string | null>(null);
    // Builds the mutable slot model consumed by LeagueFields whenever we add or hydrate time slots.
    const createSlotForm = useCallback((slot?: Partial<TimeSlot>, fallbackDivisions: string[] = []): LeagueSlotForm => {
        const normalizedDays = normalizeWeekdays({
            dayOfWeek: typeof slot?.dayOfWeek === 'number' ? slot.dayOfWeek : undefined,
            daysOfWeek: Array.isArray(slot?.daysOfWeek) ? slot.daysOfWeek : undefined,
        });
        const normalizedDivisions = normalizeDivisionKeys(slot?.divisions);
        const normalizedFieldIds = normalizeSlotFieldIds({
            scheduledFieldId: slot?.scheduledFieldId,
            scheduledFieldIds: slot?.scheduledFieldIds,
        });
        const normalizedStartDate = formatLocalDateTime(slot?.startDate ?? null);
        const normalizedEndDate = formatLocalDateTime(slot?.endDate ?? null);
        return {
            key: slot?.$id ?? createClientId(),
            $id: slot?.$id,
            scheduledFieldId: normalizedFieldIds[0],
            scheduledFieldIds: normalizedFieldIds,
            dayOfWeek: normalizedDays[0],
            daysOfWeek: normalizedDays,
            divisions: normalizedDivisions.length ? normalizedDivisions : fallbackDivisions,
            startDate: normalizedStartDate || undefined,
            endDate: normalizedEndDate || undefined,
            startTimeMinutes: slot?.startTimeMinutes,
            endTimeMinutes: slot?.endTimeMinutes,
            repeating: slot?.repeating ?? true,
            conflicts: [],
            checking: false,
            error: undefined,
        };
    }, []);
    // Reflects whether the Stripe onboarding call is running to disable repeated clicks.
    const [connectingStripe, setConnectingStripe] = useState(false);
    // Organization events must use org billing; personal events use the current user billing account.
    const hasStripeAccount = Boolean(
        organization ? organization.hasStripeAccount : currentUser?.hasStripeAccount,
    );
    const [templateDocuments, setTemplateDocuments] = useState<TemplateDocument[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState<string | null>(null);

    const [hydratedEditingEvent, setHydratedEditingEvent] = useState<Event | null>(null);
    const activeEditingEvent = hydratedEditingEvent ?? incomingEvent ?? null;

    const isEditMode = activeEditingEvent.state !== "DRAFT" && !isCreateMode;

    const { sports, sportsById, loading: sportsLoading, error: sportsError } = useSports();
    const sportOptions = useMemo(() => sports.map((sport) => ({ value: sport.$id, label: sport.name })), [sports]);

    const immutableDefaultsMemo = useMemo(() => immutableDefaults ?? {}, [immutableDefaults]);

    const immutableFields = useMemo(() => {
        if (!Array.isArray(immutableDefaultsMemo.fields)) {
            return [] as Field[];
        }
        return sanitizeFieldsForForm(
            (immutableDefaultsMemo.fields as Field[]).filter((field): field is Field => Boolean(field && field.$id))
        );
    }, [immutableDefaultsMemo.fields]);

    const hasImmutableFields = immutableFields.length > 0;

    const immutableTimeSlotsFromDefaults = useMemo(() => {
        if (!Array.isArray(immutableDefaultsMemo.timeSlots)) {
            return [] as TimeSlot[];
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        return (immutableDefaultsMemo.timeSlots as TimeSlot[])
            .map((slot) => {
                if (!slot) {
                    return null;
                }
                const { event: _ignoredEvent, ...rest } = slot;
                const normalized: TimeSlot = {
                    ...rest,
                    scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                    scheduledFieldIds: normalizeSlotFieldIds({
                        scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                        scheduledFieldIds: rest.scheduledFieldIds,
                    }),
                };
                return normalized;
            })
            .filter((slot): slot is TimeSlot => Boolean(slot));
    }, [immutableDefaultsMemo.timeSlots, immutableFields]);

    const [rentalLockedTimeSlots, setRentalLockedTimeSlots] = useState<TimeSlot[]>([]);
    const immutableTimeSlots = useMemo(() => {
        if (rentalLockedTimeSlots.length) {
            return rentalLockedTimeSlots;
        }
        return immutableTimeSlotsFromDefaults;
    }, [immutableTimeSlotsFromDefaults, rentalLockedTimeSlots]);

    const hasImmutableTimeSlots = immutableTimeSlots.length > 0;

    const isImmutableField = useCallback(
        (key: keyof Event) => immutableDefaultsMemo[key] !== undefined,
        [immutableDefaultsMemo]
    );

    const applyImmutableDefaults = useCallback((state: EventFormState): EventFormState => {
        const defaults = immutableDefaultsMemo;
        if (!defaults || Object.keys(defaults).length === 0) {
            return state;
        }

        const next = { ...state };

        if (defaults.name !== undefined) next.name = defaults.name ?? '';
        if (defaults.description !== undefined) next.description = defaults.description ?? '';
        if (defaults.location !== undefined) next.location = defaults.location ?? '';
        if (Array.isArray(defaults.coordinates) && defaults.coordinates.length === 2) {
            next.coordinates = defaults.coordinates as [number, number];
        }
        if (defaults.start !== undefined) next.start = formatLocalDateTime(defaults.start);
        if (defaults.end !== undefined) next.end = formatLocalDateTime(defaults.end);
        if (defaults.eventType !== undefined) next.eventType = defaults.eventType as EventFormState['eventType'];
        if (defaults.sport !== undefined) {
            if (typeof defaults.sport === 'string') {
                const sportId = defaults.sport ?? '';
                next.sportId = sportId;
                next.sportConfig = sportsById.get(sportId) ?? null;
            } else if (defaults.sport && typeof defaults.sport === 'object') {
                const sport = defaults.sport as Sport;
                const sportId = sport.$id ?? sport.name ?? '';
                next.sportId = sportId;
                next.sportConfig = sportsById.get(sportId) ?? { ...sport };
            } else {
                next.sportId = '';
                next.sportConfig = null;
            }
        }
        if (defaults.leagueScoringConfig && typeof defaults.leagueScoringConfig === 'object') {
            next.leagueScoringConfig = createLeagueScoringConfig(defaults.leagueScoringConfig as Partial<LeagueScoringConfig>);
        }
        // Immutable defaults store price in cents; normalize to dollars for UI.
        if (typeof defaults.price === 'number') next.price = defaults.price / 100;
        if (typeof defaults.minAge === 'number') next.minAge = defaults.minAge;
        if (typeof defaults.maxAge === 'number') next.maxAge = defaults.maxAge;
        if (typeof defaults.maxParticipants === 'number') next.maxParticipants = defaults.maxParticipants;
        if (typeof defaults.teamSizeLimit === 'number') next.teamSizeLimit = defaults.teamSizeLimit;
        if (typeof defaults.teamSignup === 'boolean') next.teamSignup = defaults.teamSignup;
        if (typeof defaults.singleDivision === 'boolean') next.singleDivision = defaults.singleDivision;
        if (typeof (defaults as any).splitLeaguePlayoffDivisions === 'boolean') {
            next.splitLeaguePlayoffDivisions = Boolean((defaults as any).splitLeaguePlayoffDivisions);
        }
        if (typeof (defaults as any).noFixedEndDateTime === 'boolean') {
            next.noFixedEndDateTime = (defaults as any).noFixedEndDateTime;
        }
        if (typeof defaults.registrationByDivisionType === 'boolean') {
            next.registrationByDivisionType = defaults.registrationByDivisionType;
        }
        if (Array.isArray((defaults as any).divisionDetails)) {
            const referenceDate = parseDateValue(next.start ?? null);
            next.divisionDetails = (defaults as any).divisionDetails
                .map((entry: unknown) => normalizeDivisionDetailEntry(
                    entry,
                    next.$id,
                    resolveSportInput(next.sportConfig ?? next.sportId),
                    referenceDate,
                ))
                .filter((entry: DivisionDetailForm | null): entry is DivisionDetailForm => Boolean(entry));
        }
        if (Array.isArray((defaults as any).playoffDivisionDetails)) {
            next.playoffDivisionDetails = (defaults as any).playoffDivisionDetails
                .map((entry: unknown) => normalizePlayoffDivisionDetailEntry(entry, next.$id))
                .filter((entry: PlayoffDivisionDetailForm | null): entry is PlayoffDivisionDetailForm => Boolean(entry));
        }
        if (defaults.divisions !== undefined) {
            next.divisions = Array.isArray(defaults.divisions)
                ? defaults.divisions.map(divisionIdFromValue).filter((divisionId) => divisionId.length > 0)
                : [];
        }
        if (!next.divisionDetails.length && next.divisions.length) {
            next.divisionDetails = next.divisions.map((divisionId) => {
                const inferred = inferDivisionDetails({
                    identifier: divisionId,
                    sportInput: resolveSportInput(next.sportConfig ?? next.sportId),
                });
                const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(
                    resolveSportInput(next.sportConfig ?? next.sportId),
                );
                const composite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
                const skillDivisionTypeId = composite?.skillDivisionTypeId
                    ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
                const ageDivisionTypeId = composite?.ageDivisionTypeId
                    ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
                const skillDivisionTypeName = getDivisionTypeById(
                    resolveSportInput(next.sportConfig ?? next.sportId),
                    skillDivisionTypeId,
                    'SKILL',
                )?.name ?? defaultsForSport.skillDivisionTypeName;
                const ageDivisionTypeName = getDivisionTypeById(
                    resolveSportInput(next.sportConfig ?? next.sportId),
                    ageDivisionTypeId,
                    'AGE',
                )?.name ?? defaultsForSport.ageDivisionTypeName;
                const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
                const divisionTypeName = buildDivisionTypeCompositeName(skillDivisionTypeName, ageDivisionTypeName);
                const token = buildDivisionToken({
                    gender: inferred.gender,
                    ratingType: 'SKILL',
                    divisionTypeId,
                });
                return applyDivisionAgeCutoff({
                    id: divisionId,
                    key: token,
                    kind: 'LEAGUE',
                    name: buildDivisionName({ gender: inferred.gender, divisionTypeName }),
                    divisionTypeId,
                    divisionTypeName,
                    ratingType: 'SKILL',
                    gender: inferred.gender,
                    skillDivisionTypeId,
                    skillDivisionTypeName,
                    ageDivisionTypeId,
                    ageDivisionTypeName,
                    price: Math.max(0, next.price || 0),
                    maxParticipants: Math.max(2, Math.trunc(next.maxParticipants || 2)),
                    playoffTeamCount: Number.isFinite((defaults as any).playoffTeamCount)
                        ? Math.max(2, Math.trunc((defaults as any).playoffTeamCount))
                        : undefined,
                    playoffPlacementDivisionIds: [],
                    allowPaymentPlans: Boolean((defaults as any).allowPaymentPlans),
                    installmentCount: Number.isFinite((defaults as any).installmentCount)
                        ? Math.max(0, Math.trunc((defaults as any).installmentCount))
                        : normalizeInstallmentDollars((defaults as any).installmentAmounts).length,
                    installmentDueDates: Array.isArray((defaults as any).installmentDueDates)
                        ? (defaults as any).installmentDueDates.map((value: unknown) => String(value))
                        : [],
                    installmentAmounts: normalizeInstallmentDollars((defaults as any).installmentAmounts),
                    sportId: resolveSportInput(next.sportConfig ?? next.sportId) || undefined,
                    fieldIds: [],
                }, resolveSportInput(next.sportConfig ?? next.sportId), parseDateValue(next.start ?? null));
            });
        }
        if (!next.divisions.length && next.divisionDetails.length) {
            next.divisions = next.divisionDetails.map((detail) => detail.id);
        }
        if (defaults.divisionFieldIds && typeof defaults.divisionFieldIds === 'object') {
            next.divisionFieldIds = Object.fromEntries(
                Object.entries(defaults.divisionFieldIds).map(([divisionKey, fieldIds]) => [
                    String(divisionKey).toLowerCase(),
                    Array.isArray(fieldIds)
                        ? Array.from(new Set(fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
                        : [],
                ]),
            );
        }
        if (Array.isArray(defaults.fieldIds)) {
            next.selectedFieldIds = Array.from(new Set(defaults.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)));
        }
        if (typeof defaults.cancellationRefundHours === 'number') {
            next.cancellationRefundHours = defaults.cancellationRefundHours;
        }
        if (typeof defaults.registrationCutoffHours === 'number') {
            next.registrationCutoffHours = defaults.registrationCutoffHours;
        }
        if (Array.isArray(defaults.requiredTemplateIds)) {
            next.requiredTemplateIds = [...defaults.requiredTemplateIds];
        }
        if (defaults.imageId !== undefined) next.imageId = defaults.imageId ?? '';
        if (typeof defaults.seedColor === 'number') next.seedColor = defaults.seedColor;
        if (Array.isArray(defaults.waitListIds)) next.waitList = [...defaults.waitListIds];
        if (Array.isArray(defaults.freeAgentIds)) next.freeAgents = [...defaults.freeAgentIds];
        if (Array.isArray(defaults.players)) next.players = [...defaults.players];
        if (Array.isArray(defaults.teams)) next.teams = [...defaults.teams];

        return next;
    }, [immutableDefaultsMemo, sportsById]);

    useEffect(() => {
        if (!open || !incomingEvent || isCreateMode) {
            setHydratedEditingEvent(null);
            return;
        }
        if (!incomingEvent.$createdAt) {
            setHydratedEditingEvent(null);
            return;
        }

        if (!supportsScheduleSlots(incomingEvent.eventType)) {
            setHydratedEditingEvent(null);
            return;
        }

        if (Array.isArray(incomingEvent.timeSlots) && incomingEvent.timeSlots.length > 0) {
            setHydratedEditingEvent(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const full = await eventService.getEventWithRelations(incomingEvent.$id);
                if (!cancelled && full) {
                    setHydratedEditingEvent(full);
                }
            } catch (error) {
                console.warn('Failed to hydrate editing event with time slots:', error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [incomingEvent, open, isCreateMode]);

    const buildDefaultFormValues = useCallback((): EventFormValues => {
        const defaultLocationLabel = (defaultLocation?.location ?? '').trim();
        const defaultLocationCoordinates = defaultLocation?.coordinates;

        const base = (() => {
            const initial = applyImmutableDefaults(mapEventToFormState(activeEditingEvent));
            if (!initial.location && defaultLocationLabel) {
                initial.location = defaultLocationLabel;
            }
            if (!coordinatesAreSet(initial.coordinates) && defaultLocationCoordinates) {
                initial.coordinates = defaultLocationCoordinates;
            }
            return initial;
        })();

        base.allowPaymentPlans = Boolean(base.allowPaymentPlans);
        base.installmentAmounts = Array.isArray(base.installmentAmounts) ? base.installmentAmounts : [];
        base.installmentDueDates = Array.isArray(base.installmentDueDates) ? base.installmentDueDates : [];
        base.requiredTemplateIds = Array.isArray(base.requiredTemplateIds)
            ? base.requiredTemplateIds
            : [];
        const normalizedInstallmentCount = Number.isFinite(base.installmentCount)
            ? Number(base.installmentCount)
            : base.installmentAmounts.length;
        base.installmentCount = normalizedInstallmentCount || 0;
        base.allowTeamSplitDefault = Boolean(base.allowTeamSplitDefault);
        if (!base.organizationId && organization?.$id) {
            base.organizationId = organization.$id;
        }
        const hostedOrganizationId = (
            organization?.$id
            || base.organizationId
            || (activeEditingEvent?.organization as Organization | undefined)?.$id
            || activeEditingEvent?.organizationId
            || ''
        ).trim();

        const defaultFieldCount = (() => {
            if (activeEditingEvent?.fields?.length) {
                return activeEditingEvent.fields.length;
            }
            if (activeEditingEvent && typeof (activeEditingEvent as any)?.fieldCount === 'number') {
                const parsed = Number((activeEditingEvent as any).fieldCount);
                return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
            }
            return 1;
        })();

        const defaultFields: Field[] = (() => {
            if (hasImmutableFields) {
                return sanitizeFieldsForForm(immutableFields);
            }
            if (hostedOrganizationId && Array.isArray(organization?.fields) && organization.fields.length) {
                return sanitizeFieldsForForm(organization.fields as Field[]).sort(
                    (a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0),
                );
            }
            if (activeEditingEvent?.fields?.length) {
                return sanitizeFieldsForForm(activeEditingEvent.fields).sort(
                    (a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0),
                );
            }
            if (!hostedOrganizationId) {
                return Array.from({ length: defaultFieldCount }, (_, idx) => ({
                    $id: createClientId(),
                    name: `Field ${idx + 1}`,
                    fieldNumber: idx + 1,
                    location: '',
                } as Field));
            }
            return [];
        })();
        const allDefaultFieldIds = toFieldIdList(defaultFields);
        const defaultSelectedFieldIds = (() => {
            if (Array.isArray(base.selectedFieldIds) && base.selectedFieldIds.length) {
                return Array.from(new Set(base.selectedFieldIds.filter((fieldId) => allDefaultFieldIds.includes(fieldId))));
            }
            if (Array.isArray(activeEditingEvent?.fieldIds) && activeEditingEvent.fieldIds.length) {
                return Array.from(
                    new Set(
                        activeEditingEvent.fieldIds
                            .map((fieldId) => String(fieldId))
                            .filter((fieldId) => allDefaultFieldIds.includes(fieldId)),
                    ),
                );
            }
            return allDefaultFieldIds;
        })();
        const availableFieldIdsForDivisions = defaultSelectedFieldIds.length
            ? defaultSelectedFieldIds
            : allDefaultFieldIds;
        const defaultDivisionDetails = (() => {
            const normalized = Array.isArray(base.divisionDetails)
                ? base.divisionDetails.filter((detail) => detail && detail.id)
                : [];
            if (normalized.length) {
                return normalized;
            }
            return buildDefaultDivisionDetailsForSport(
                base.$id,
                base.sportConfig ?? base.sportId,
                parseDateValue(base.start ?? null),
            );
        })();
        const baseLeagueIncludesPlayoffs = Boolean(
            base.eventType === 'LEAGUE'
            && (
                (immutableDefaults && typeof (immutableDefaults as any).includePlayoffs === 'boolean'
                    ? Boolean((immutableDefaults as any).includePlayoffs)
                    : undefined)
                ?? (immutableDefaults && typeof (immutableDefaults as any).leagueData?.includePlayoffs === 'boolean'
                    ? Boolean((immutableDefaults as any).leagueData.includePlayoffs)
                    : undefined)
                ??
                activeEditingEvent?.leagueConfig?.includePlayoffs
                ?? activeEditingEvent?.includePlayoffs
                ?? false
            ),
        );
        const defaultSlotDivisionKeys = buildSlotDivisionLookup(
            defaultDivisionDetails,
            base.eventType === 'LEAGUE' && baseLeagueIncludesPlayoffs && base.splitLeaguePlayoffDivisions
                ? (base.playoffDivisionDetails || [])
                : [],
        ).keys;
        const defaultDivisionKeys = (() => {
            const normalizedFromDetails = normalizeDivisionKeys(defaultDivisionDetails.map((detail) => detail.id));
            if (normalizedFromDetails.length) {
                return normalizedFromDetails;
            }
            const normalized = normalizeDivisionKeys(base.divisions);
            if (normalized.length) {
                return normalized;
            }
            return normalizeDivisionKeys(
                buildDefaultDivisionDetailsForSport(
                    base.$id,
                    base.sportConfig ?? base.sportId,
                    parseDateValue(base.start ?? null),
                )
                    .map((detail) => detail.id),
            );
        })();
        const defaultDivisionFieldIds = (() => {
            const normalizedFromEvent = normalizeDivisionFieldIds(
                base.divisionFieldIds,
                defaultDivisionKeys,
                availableFieldIdsForDivisions,
            );
            const hasEventMapValues = Object.values(normalizedFromEvent).some((fieldIds) => fieldIds.length > 0);
            if (hasEventMapValues) {
                return normalizedFromEvent;
            }
            const derivedFromFields = deriveDivisionFieldIdsFromFields(
                defaultFields,
                defaultDivisionKeys,
                availableFieldIdsForDivisions,
            );
            return normalizeDivisionFieldIds(
                derivedFromFields,
                defaultDivisionKeys,
                availableFieldIdsForDivisions,
            );
        })();

        const defaults = immutableDefaults ?? {};
        const defaultFieldId = Array.isArray(defaults.fields) && defaults.fields.length > 0
            ? (defaults.fields[0] as Field).$id
            : undefined;

        const defaultSlots = (() => {
            if (Array.isArray(defaults.timeSlots) && defaults.timeSlots.length > 0) {
                return mergeSlotPayloadsForForm(defaults.timeSlots as TimeSlot[], defaultFieldId)
                    .map((slot) => createSlotForm(slot, defaultSlotDivisionKeys));
            }

            if (activeEditingEvent && supportsScheduleSlots(activeEditingEvent.eventType) && activeEditingEvent.timeSlots?.length) {
                return mergeSlotPayloadsForForm(activeEditingEvent.timeSlots || [])
                    .map((slot) => createSlotForm(slot, defaultSlotDivisionKeys));
            }
            return [createSlotForm(undefined, defaultSlotDivisionKeys)];
        })();

        const defaultLeagueData: LeagueConfig = (() => {
            if (activeEditingEvent && activeEditingEvent.eventType === 'LEAGUE') {
                const source = activeEditingEvent.leagueConfig || activeEditingEvent;
                return {
                    gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                    includePlayoffs: source?.includePlayoffs ?? false,
                    playoffTeamCount: source?.playoffTeamCount ?? undefined,
                    usesSets: Boolean(source?.usesSets),
                    matchDurationMinutes: normalizeNumber(source?.matchDurationMinutes, 60) ?? 60,
                    restTimeMinutes: normalizeNumber(source?.restTimeMinutes, 0) ?? 0,
                    setDurationMinutes: normalizeNumber(source?.setDurationMinutes),
                    setsPerMatch: normalizeNumber(source?.setsPerMatch),
                    pointsToVictory: Array.isArray(source?.pointsToVictory) ? [...(source.pointsToVictory as number[])] : undefined,
                };
            }
            return {
                gamesPerOpponent: 1,
                includePlayoffs: false,
                playoffTeamCount: undefined,
                usesSets: false,
                matchDurationMinutes: 60,
                restTimeMinutes: 0,
                setDurationMinutes: undefined,
                setsPerMatch: undefined,
                pointsToVictory: undefined,
            };
        })();

        const defaultTournamentData = (() => {
            if (activeEditingEvent && activeEditingEvent.eventType === 'TOURNAMENT') {
                return buildTournamentConfig({
                    doubleElimination: activeEditingEvent.doubleElimination,
                    winnerSetCount: activeEditingEvent.winnerSetCount,
                    loserSetCount: activeEditingEvent.loserSetCount,
                    winnerBracketPointsToVictory: activeEditingEvent.winnerBracketPointsToVictory,
                    loserBracketPointsToVictory: activeEditingEvent.loserBracketPointsToVictory,
                    prize: activeEditingEvent.prize,
                    fieldCount: activeEditingEvent.fieldCount ?? activeEditingEvent.fields?.length ?? 1,
                    restTimeMinutes: normalizeNumber(activeEditingEvent.restTimeMinutes, 0) ?? 0,
                });
            }
            return buildTournamentConfig();
        })();

        const defaultPlayoffData = (() => {
            if (activeEditingEvent?.includePlayoffs) {
                const extractedPlayoff = extractTournamentConfigFromEvent(activeEditingEvent);
                if (extractedPlayoff) {
                    return extractedPlayoff;
                }
            }
            return buildTournamentConfig();
        })();

        return {
            ...base,
            divisions: defaultDivisionKeys,
            divisionDetails: defaultDivisionDetails,
            divisionFieldIds: defaultDivisionFieldIds,
            selectedFieldIds: defaultSelectedFieldIds,
            leagueSlots: normalizeSlotState(defaultSlots, base.eventType),
            leagueData: defaultLeagueData,
            playoffData: defaultPlayoffData,
            tournamentData: defaultTournamentData,
            fields: defaultFields,
            fieldCount: defaultFieldCount,
            joinAsParticipant: false,
        };
    }, [
        activeEditingEvent,
        applyImmutableDefaults,
        createSlotForm,
        defaultLocation?.coordinates,
        defaultLocation?.location,
        hasImmutableFields,
        immutableDefaults,
        immutableFields,
        organization,
    ]);

    const {
        control,
        register,
        watch,
        setValue: rawSetValue,
        getValues,
        reset,
        clearErrors,
        trigger,
        formState: { errors, isDirty },
    } = useForm<EventFormValues>({
        resolver: zodResolver(eventFormSchema) as Resolver<EventFormValues>,
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        defaultValues: buildDefaultFormValues(),
    });
    const setValue = rawSetValue as (
        name: string,
        value: unknown,
        options?: Record<string, unknown>,
    ) => void;

    useEffect(() => {
        if (!open) {
            return;
        }
        const nextEventId = activeEditingEvent?.$id ?? null;
        if (lastResetEventIdRef.current === nextEventId) {
            return;
        }
        lastResetEventIdRef.current = nextEventId;
        reset(buildDefaultFormValues());
    }, [activeEditingEvent?.$id, buildDefaultFormValues, reset, open]);

    useEffect(() => {
        onDirtyStateChange?.(isDirty);
    }, [isDirty, onDirtyStateChange]);

    const formValues = watch();
    const eventData = formValues;
    const leagueSlots = formValues.leagueSlots;
    const leagueData = formValues.leagueData;
    const tournamentData = formValues.tournamentData;
    const playoffData = formValues.playoffData;
    const fields = formValues.fields;
    const fieldCount = formValues.fieldCount;
    const selectedFieldIds = useMemo(
        () => (Array.isArray(formValues.selectedFieldIds) ? formValues.selectedFieldIds : []),
        [formValues.selectedFieldIds],
    );
    const divisionFieldIds = useMemo(
        () => (
            formValues.divisionFieldIds && typeof formValues.divisionFieldIds === 'object'
                ? formValues.divisionFieldIds
                : {}
        ),
        [formValues.divisionFieldIds],
    );
    const joinAsParticipant = formValues.joinAsParticipant;
    const organizationId = organization?.$id ?? eventData.organizationId;

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount) {
            return;
        }

        const currentPrice = Number.isFinite(Number(eventData.price))
            ? Number(eventData.price)
            : 0;
        if (currentPrice !== 0) {
            setValue('price', 0, { shouldDirty: false, shouldValidate: true });
        }

        if (eventData.allowPaymentPlans) {
            setValue('allowPaymentPlans', false, { shouldDirty: false, shouldValidate: true });
        }

        const currentInstallmentCount = Number.isFinite(Number(eventData.installmentCount))
            ? Number(eventData.installmentCount)
            : 0;
        if (currentInstallmentCount !== 0) {
            setValue('installmentCount', 0, { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentAmounts = Array.isArray(eventData.installmentAmounts)
            && eventData.installmentAmounts.length > 0;
        if (hasInstallmentAmounts) {
            setValue('installmentAmounts', [], { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentDueDates = Array.isArray(eventData.installmentDueDates)
            && eventData.installmentDueDates.length > 0;
        if (hasInstallmentDueDates) {
            setValue('installmentDueDates', [], { shouldDirty: false, shouldValidate: true });
        }

        const currentDivisionDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDivisionDetails = currentDivisionDetails.map((detail) => {
            const detailPrice = Number.isFinite(Number(detail.price))
                ? Number(detail.price)
                : 0;
            const detailInstallmentCount = Number.isFinite(Number(detail.installmentCount))
                ? Number(detail.installmentCount)
                : 0;
            const hasDetailInstallmentAmounts = Array.isArray(detail.installmentAmounts)
                && detail.installmentAmounts.length > 0;
            const hasDetailInstallmentDueDates = Array.isArray(detail.installmentDueDates)
                && detail.installmentDueDates.length > 0;
            const hasPaidSettings = detailPrice !== 0
                || Boolean(detail.allowPaymentPlans)
                || detailInstallmentCount !== 0
                || hasDetailInstallmentAmounts
                || hasDetailInstallmentDueDates;
            if (!hasPaidSettings) {
                return detail;
            }
            return {
                ...detail,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
            };
        });
        const divisionPricingChanged = nextDivisionDetails.some(
            (detail, index) => detail !== currentDivisionDetails[index],
        );
        if (divisionPricingChanged) {
            setValue('divisionDetails', nextDivisionDetails, { shouldDirty: false, shouldValidate: true });
        }

    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.price,
        hasStripeAccount,
        isCreateMode,
        setValue,
    ]);

    const templateOptions = useMemo(
        () => templateDocuments.map((template) => {
            const templateType = template.type ?? 'PDF';
            const signerLabel = getRequiredSignerTypeLabel(template.requiredSignerType);
            return {
                value: template.$id,
                label: `${template.title || 'Untitled Template'} (${templateType}, ${signerLabel})`,
            };
        }),
        [templateDocuments],
    );

    useEffect(() => {
        if (!organizationId) {
            setTemplateDocuments([]);
            setTemplatesError(null);
            return;
        }

        let cancelled = false;
        const loadTemplates = async () => {
            try {
                setTemplatesLoading(true);
                setTemplatesError(null);
                const response = await apiRequest<{ templates?: any[] }>(
                    `/api/organizations/${organizationId}/templates`,
                );
                const rows = Array.isArray(response.templates) ? response.templates : [];
                if (!cancelled) {
                    setTemplateDocuments(rows.map((row) => mapTemplateRow(row)));
                }
            } catch (error) {
                if (!cancelled) {
                    setTemplateDocuments([]);
                    setTemplatesError(
                        error instanceof Error ? error.message : 'Failed to load templates.',
                    );
                }
            } finally {
                if (!cancelled) {
                    setTemplatesLoading(false);
                }
            }
        };

        loadTemplates();

        return () => {
            cancelled = true;
        };
    }, [organizationId]);

    const setEventData = useCallback(
        (updater: React.SetStateAction<EventFormValues>) => {
            const current = getValues();
            const next = typeof updater === 'function' ? (updater as (prev: EventFormValues) => EventFormValues)(current) : updater;
            if (next === current) {
                return;
            }
            (Object.keys(next) as (keyof EventFormValues)[]).forEach((key) => {
                const currentVal = current[key];
                const nextVal = next[key];
                if (Object.is(currentVal, nextVal)) return;
                setValue(key, nextVal, { shouldDirty: true, shouldValidate: true });
            });
        },
        [getValues, setValue],
    );

    const setLeagueData = useCallback(
        (updater: React.SetStateAction<LeagueConfig>) => {
            const current = getValues('leagueData');
            const next = typeof updater === 'function' ? (updater as (prev: LeagueConfig) => LeagueConfig)(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('leagueData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setTournamentData = useCallback(
        (updater: React.SetStateAction<TournamentConfig>) => {
            const current = getValues('tournamentData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('tournamentData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setPlayoffData = useCallback(
        (updater: React.SetStateAction<TournamentConfig>) => {
            const current = getValues('playoffData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('playoffData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setLeagueSlots = useCallback(
        (updater: React.SetStateAction<LeagueSlotForm[]>) => {
            const current = getValues('leagueSlots');
            const next = typeof updater === 'function' ? (updater as (prev: LeagueSlotForm[]) => LeagueSlotForm[])(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('leagueSlots', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setFields = useCallback(
        (updater: React.SetStateAction<Field[]>) => {
            const current = getValues('fields');
            const next = typeof updater === 'function' ? (updater as (prev: Field[]) => Field[])(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('fields', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setFieldCount = useCallback(
        (value: number) => {
            if (Object.is(getValues('fieldCount'), value)) {
                return;
            }
            setValue('fieldCount', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setSelectedFieldIds = useCallback(
        (value: string[]) => {
            if (Object.is(getValues('selectedFieldIds'), value)) {
                return;
            }
            setValue('selectedFieldIds', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setDivisionFieldIds = useCallback(
        (value: Record<string, string[]>) => {
            if (Object.is(getValues('divisionFieldIds'), value)) {
                return;
            }
            setValue('divisionFieldIds', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setJoinAsParticipant = useCallback(
        (value: boolean) => {
            (setValue as (name: string, value: unknown, options?: { shouldDirty?: boolean; shouldValidate?: boolean }) => void)(
                'joinAsParticipant',
                value,
                { shouldDirty: true, shouldValidate: true },
            );
        },
        [setValue],
    );

    const syncInstallmentCount = useCallback(
        (count: number) => {
            const safeCount = Math.max(1, Math.floor(Number(count) || 0));
            const amounts = [...(getValues('installmentAmounts') || [])];
            const dueDates = [...(getValues('installmentDueDates') || [])];
            const price = getValues('price') || 0;
            const startDate = getValues('start');
            while (amounts.length < safeCount) {
                amounts.push(price);
                dueDates.push(startDate);
            }
            while (amounts.length > safeCount) {
                amounts.pop();
                dueDates.pop();
            }
            setValue('installmentCount', safeCount, { shouldDirty: true, shouldValidate: true });
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', dueDates, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setInstallmentAmount = useCallback(
        (index: number, value: number) => {
            const amounts = [...(getValues('installmentAmounts') || [])];
            if (index >= amounts.length) return;
            amounts[index] = Number.isFinite(value) ? Number(value) : 0;
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setInstallmentDueDate = useCallback(
        (index: number, value: Date | string | null) => {
            const dueDates = [...(getValues('installmentDueDates') || [])];
            if (index >= dueDates.length) return;
            if (value instanceof Date) {
                dueDates[index] = value.toISOString();
            } else if (typeof value === 'string') {
                dueDates[index] = value;
            } else {
                dueDates[index] = '';
            }
            setValue('installmentDueDates', dueDates, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const removeInstallment = useCallback(
        (index: number) => {
            const amounts = [...(getValues('installmentAmounts') || [])];
            const dueDates = [...(getValues('installmentDueDates') || [])];
            if (amounts.length <= 1) return;
            amounts.splice(index, 1);
            dueDates.splice(index, 1);
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', dueDates, { shouldDirty: true, shouldValidate: true });
            setValue('installmentCount', amounts.length, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const syncDivisionInstallmentCount = useCallback((count: number) => {
        setDivisionEditor((prev) => {
            const safeCount = Math.max(1, Math.floor(Number(count) || 0));
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            const price = Math.max(0, Number(prev.price) || 0);
            const fallbackDueDate = eventData.start;

            while (amounts.length < safeCount) {
                amounts.push(price);
                dueDates.push(fallbackDueDate);
            }
            while (amounts.length > safeCount) {
                amounts.pop();
                dueDates.pop();
            }

            return {
                ...prev,
                installmentCount: safeCount,
                installmentAmounts: amounts,
                installmentDueDates: dueDates,
                error: null,
            };
        });
    }, [eventData.start]);

    const setDivisionInstallmentAmount = useCallback((index: number, value: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            if (index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts[index] = Number.isFinite(value) ? Math.max(0, value) : 0;
            return {
                ...prev,
                installmentAmounts: amounts,
                error: null,
            };
        });
    }, []);

    const setDivisionInstallmentDueDate = useCallback((index: number, value: Date | string | null) => {
        setDivisionEditor((prev) => {
            const dueDates = [...(prev.installmentDueDates || [])];
            if (index < 0 || index >= dueDates.length) {
                return prev;
            }
            if (value instanceof Date) {
                dueDates[index] = value.toISOString();
            } else if (typeof value === 'string') {
                dueDates[index] = value;
            } else {
                dueDates[index] = '';
            }
            return {
                ...prev,
                installmentDueDates: dueDates,
                error: null,
            };
        });
    }, []);

    const removeDivisionInstallment = useCallback((index: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            if (amounts.length <= 1 || index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts.splice(index, 1);
            dueDates.splice(index, 1);
            return {
                ...prev,
                installmentAmounts: amounts,
                installmentDueDates: dueDates,
                installmentCount: amounts.length,
                error: null,
            };
        });
    }, []);

    useEffect(() => {
        const ids = eventData.refereeIds || [];
        const refs = eventData.referees || [];
        const missingIds = ids.filter((id) => !refs.some((ref) => ref.$id === id));
        if (!missingIds.length) {
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const fetched = await userService.getUsersByIds(missingIds);
                if (!cancelled && fetched.length) {
                    setEventData((prev) => ({
                        ...prev,
                        referees: [...(prev.referees || []), ...fetched.filter((ref) => ref.$id)],
                    }));
                }
            } catch (error) {
                console.warn('Failed to hydrate referees for event:', error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [eventData.refereeIds, eventData.referees, setEventData]);

    const [refereeSearch, setRefereeSearch] = useState('');
    const [refereeResults, setRefereeResults] = useState<UserData[]>([]);
    const [refereeSearchLoading, setRefereeSearchLoading] = useState(false);
    const [refereeError, setRefereeError] = useState<string | null>(null);
    const [refereeInvites, setRefereeInvites] = useState<{ firstName: string; lastName: string; email: string }[]>([
        { firstName: '', lastName: '', email: '' },
    ]);
    const [refereeInviteError, setRefereeInviteError] = useState<string | null>(null);
    const [invitingReferees, setInvitingReferees] = useState(false);

    const [fieldsLoading, setFieldsLoading] = useState(false);
    const organizationHostedEventId = (
        organization?.$id
        || eventData.organizationId
        || (activeEditingEvent?.organization as Organization | undefined)?.$id
        || activeEditingEvent?.organizationId
        || ''
    );
    const isOrganizationHostedEvent = organizationHostedEventId.length > 0;
    const shouldProvisionFields = !isOrganizationHostedEvent && !hasImmutableFields;
    const shouldManageLocalFields = shouldProvisionFields && (eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT');
    const isOrganizationManagedEvent = isOrganizationHostedEvent && !shouldManageLocalFields;
    const organizationManagerIdSet = useMemo(() => {
        const ids = new Set<string>();
        if (typeof organization?.ownerId === 'string' && organization.ownerId.length > 0) {
            ids.add(organization.ownerId);
        }
        if (Array.isArray(organization?.hostIds)) {
            organization.hostIds
                .map((id) => String(id))
                .filter((id) => id.length > 0)
                .forEach((id) => ids.add(id));
        }
        if (typeof eventData.hostId === 'string' && eventData.hostId.length > 0) {
            ids.add(eventData.hostId);
        }
        (eventData.assistantHostIds || []).forEach((id) => {
            const normalized = String(id).trim();
            if (normalized.length > 0) {
                ids.add(normalized);
            }
        });
        return ids;
    }, [eventData.assistantHostIds, eventData.hostId, organization?.hostIds, organization?.ownerId]);
    const organizationUsersById = useMemo(() => {
        const map = new Map<string, Partial<UserData>>();
        const addUser = (candidate?: UserData | null) => {
            if (candidate?.$id) {
                map.set(candidate.$id, candidate);
            }
        };
        addUser(organization?.owner);
        (organization?.hosts || []).forEach((host) => addUser(host));
        addUser(currentUser);
        return map;
    }, [currentUser, organization?.hosts, organization?.owner]);
    const organizationHostSelectData = useMemo(
        () => Array.from(organizationManagerIdSet)
            .map((id) => {
                const baseLabel = toUserLabel(organizationUsersById.get(id), id);
                const label = id === organization?.ownerId ? `${baseLabel} (Owner)` : baseLabel;
                return { value: id, label };
            })
            .sort((left, right) => left.label.localeCompare(right.label)),
        [organization?.ownerId, organizationManagerIdSet, organizationUsersById],
    );
    const assistantHostSelectData = useMemo(
        () => organizationHostSelectData.filter((option) => option.value !== eventData.hostId),
        [eventData.hostId, organizationHostSelectData],
    );
    const assistantHostValue = useMemo(
        () => Array.from(
            new Set(
                (eventData.assistantHostIds || [])
                    .map((id) => String(id))
                    .filter((id) => id.length > 0 && id !== eventData.hostId),
            ),
        ),
        [eventData.assistantHostIds, eventData.hostId],
    );
    useEffect(() => {
        if (!isOrganizationHostedEvent) {
            return;
        }
        if (typeof eventData.hostId === 'string' && eventData.hostId.length > 0) {
            return;
        }
        const fallbackHostId = organization?.ownerId || organizationHostSelectData[0]?.value;
        if (!fallbackHostId) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: fallbackHostId,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== fallbackHostId),
        }));
    }, [eventData.hostId, isOrganizationHostedEvent, organization?.ownerId, organizationHostSelectData, setEventData]);
    const handleHostChange = useCallback((value: string | null) => {
        if (!value) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: value,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== value),
        }));
    }, [setEventData]);
    const handleAssistantHostsChange = useCallback((values: string[]) => {
        setEventData((prev) => ({
            ...prev,
            assistantHostIds: Array.from(
                new Set(
                    values
                        .map((id) => String(id).trim())
                        .filter((id) => id.length > 0 && id !== prev.hostId),
                ),
            ),
        }));
    }, [setEventData]);
    const fieldCountOptions = useMemo(
        () => Array.from({ length: 12 }, (_, idx) => ({ value: String(idx + 1), label: String(idx + 1) })),
        []
    );
    const slotDivisionLookup = useMemo(
        () => buildSlotDivisionLookup(
            eventData.divisionDetails || [],
            eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && eventData.splitLeaguePlayoffDivisions
                ? (eventData.playoffDivisionDetails || [])
                : [],
        ),
        [
            eventData.divisionDetails,
            eventData.eventType,
            eventData.playoffDivisionDetails,
            eventData.splitLeaguePlayoffDivisions,
            leagueData.includePlayoffs,
        ],
    );
    const slotDivisionKeys = slotDivisionLookup.keys;
    const slotDivisionKeysRef = useRef<string[]>(slotDivisionKeys);
    useEffect(() => {
        slotDivisionKeysRef.current = slotDivisionKeys;
    }, [slotDivisionKeys]);
    const divisionOptions = useMemo(
        () => slotDivisionLookup.options,
        [slotDivisionLookup],
    );
    const divisionTypeOptions = useMemo(() => {
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        const catalogOptions = getDivisionTypeOptionsForSport(sportInput);
        const detailSkillOptions = (eventData.divisionDetails || []).map((detail) => ({
            id: detail.skillDivisionTypeId || detail.divisionTypeId,
            name: detail.skillDivisionTypeName || detail.divisionTypeName,
            ratingType: 'SKILL' as const,
            sportKey: sportInput || 'event',
        }));
        const detailAgeOptions = (eventData.divisionDetails || []).map((detail) => ({
            id: detail.ageDivisionTypeId || detail.divisionTypeId,
            name: detail.ageDivisionTypeName || detail.divisionTypeName,
            ratingType: 'AGE' as const,
            sportKey: sportInput || 'event',
        }));
        const merged = [...catalogOptions, ...detailSkillOptions, ...detailAgeOptions];
        const seen = new Set<string>();
        return merged.filter((option) => {
            const key = `${option.ratingType}:${option.id}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }, [eventData.divisionDetails, eventData.sportConfig, eventData.sportId]);
    const skillDivisionTypeSelectOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'SKILL')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const ageDivisionTypeSelectOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'AGE')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const defaultDivisionTypeSelections = useMemo(
        () => getDefaultDivisionTypeSelectionsForSport(resolveSportInput(eventData.sportConfig ?? eventData.sportId)),
        [eventData.sportConfig, eventData.sportId],
    );

    const [divisionEditor, setDivisionEditor] = useState<{
        editingId: string | null;
        gender: '' | 'M' | 'F' | 'C';
        skillDivisionTypeId: string;
        ageDivisionTypeId: string;
        name: string;
        price: number;
        maxParticipants: number;
        playoffTeamCount: number;
        allowPaymentPlans: boolean;
        installmentCount: number;
        installmentDueDates: string[];
        installmentAmounts: number[];
        nameTouched: boolean;
        error: string | null;
    }>({
        editingId: null,
        gender: '',
        skillDivisionTypeId: '',
        ageDivisionTypeId: '',
        name: '',
        price: 0,
        maxParticipants: 10,
        playoffTeamCount: 10,
        allowPaymentPlans: false,
        installmentCount: 0,
        installmentDueDates: [],
        installmentAmounts: [],
        nameTouched: false,
        error: null,
    });
    const previousSingleDivisionRef = useRef<boolean | null>(null);

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount) {
            return;
        }
        setDivisionEditor((prev) => {
            const hasEditorPaidSettings = prev.price !== 0
                || prev.allowPaymentPlans
                || (prev.installmentCount || 0) !== 0
                || (prev.installmentAmounts?.length || 0) > 0
                || (prev.installmentDueDates?.length || 0) > 0;
            if (!hasEditorPaidSettings) {
                return prev;
            }
            return {
                ...prev,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                error: null,
            };
        });
    }, [hasStripeAccount, isCreateMode]);

    const createNextPlayoffDivision = useCallback((
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ): PlayoffDivisionDetailForm => {
        let index = Math.max(1, existing.length + 1);
        while (index < 500) {
            const key = `playoff_${index}`;
            const id = buildEventDivisionId(eventData.$id, key);
            if (!existing.some((division) => division.id === id || division.key === key)) {
                return {
                    id,
                    key,
                    kind: 'PLAYOFF',
                    name: `Playoff Division ${index}`,
                    maxParticipants: 2,
                    playoffConfig: buildTournamentConfig(configTemplate),
                };
            }
            index += 1;
        }
        const fallbackKey = `playoff_${Date.now()}`;
        return {
            id: buildEventDivisionId(eventData.$id, fallbackKey),
            key: fallbackKey,
            kind: 'PLAYOFF',
            name: 'Playoff Division',
            maxParticipants: 2,
            playoffConfig: buildTournamentConfig(configTemplate),
        };
    }, [eventData.$id]);

    const handleAddPlayoffDivision = useCallback(() => {
        const current = Array.isArray(eventData.playoffDivisionDetails) ? eventData.playoffDivisionDetails : [];
        const next = [...current, createNextPlayoffDivision(current, playoffData)];
        setValue('playoffDivisionDetails', next, { shouldDirty: true, shouldValidate: true });
    }, [createNextPlayoffDivision, eventData.playoffDivisionDetails, playoffData, setValue]);

    const handleUpdatePlayoffDivision = useCallback((
        playoffDivisionId: string,
        updates: Partial<Pick<PlayoffDivisionDetailForm, 'name' | 'maxParticipants'>>,
    ) => {
        const current = Array.isArray(eventData.playoffDivisionDetails) ? eventData.playoffDivisionDetails : [];
        const next = current.map((division) => {
            if (division.id !== playoffDivisionId) {
                return division;
            }
            return {
                ...division,
                name: typeof updates.name === 'string' ? updates.name : division.name,
                maxParticipants: typeof updates.maxParticipants === 'number'
                    ? Math.max(2, Math.trunc(updates.maxParticipants))
                    : division.maxParticipants,
            };
        });
        setValue('playoffDivisionDetails', next, { shouldDirty: true, shouldValidate: true });
    }, [eventData.playoffDivisionDetails, setValue]);

    const handleSetPlayoffDivisionConfig = useCallback((
        playoffDivisionId: string,
        updater: React.SetStateAction<TournamentConfig>,
    ) => {
        const current = Array.isArray(eventData.playoffDivisionDetails) ? eventData.playoffDivisionDetails : [];
        let changed = false;
        const next = current.map((division) => {
            if (division.id !== playoffDivisionId) {
                return division;
            }
            const previousConfig = buildTournamentConfig(division.playoffConfig);
            const resolved = typeof updater === 'function'
                ? (updater as (prev: TournamentConfig) => TournamentConfig)(previousConfig)
                : updater;
            const normalizedConfig = buildTournamentConfig(resolved);
            if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                return division;
            }
            changed = true;
            return {
                ...division,
                playoffConfig: normalizedConfig,
            };
        });
        if (changed) {
            setValue('playoffDivisionDetails', next, { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.playoffDivisionDetails, setValue]);

    const handleSetDivisionPlayoffMapping = useCallback((
        leagueDivisionId: string,
        placementIndex: number,
        playoffDivisionId: string | null,
    ) => {
        const normalizedPlayoffDivisionId = normalizeDivisionKeys([playoffDivisionId ?? ''])[0] ?? '';
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDetails = currentDetails.map((detail) => {
            if (detail.id !== leagueDivisionId) {
                return detail;
            }
            const mapping = Array.isArray(detail.playoffPlacementDivisionIds)
                ? [...detail.playoffPlacementDivisionIds]
                : [];
            while (mapping.length <= placementIndex) {
                mapping.push('');
            }
            mapping[placementIndex] = normalizedPlayoffDivisionId;
            return {
                ...detail,
                playoffPlacementDivisionIds: mapping,
            };
        });
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
    }, [eventData.divisionDetails, setValue]);

    const handleRemovePlayoffDivision = useCallback((playoffDivisionId: string) => {
        const normalizedPlayoffDivisionId = normalizeDivisionKeys([playoffDivisionId])[0];
        if (!normalizedPlayoffDivisionId) {
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivisions = currentPlayoffDivisions.filter((division) => (
            normalizeDivisionKeys([division.id])[0] !== normalizedPlayoffDivisionId
        ));
        setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const remappedLeagueDivisions = currentLeagueDivisions.map((division) => {
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            const nextMapping = mapping.map((entry) => {
                const normalizedEntry = normalizeDivisionKeys([entry])[0];
                return normalizedEntry === normalizedPlayoffDivisionId ? '' : entry;
            });
            if (stringArraysEqual(mapping, nextMapping)) {
                return division;
            }
            return {
                ...division,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        setValue('divisionDetails', remappedLeagueDivisions, { shouldDirty: true, shouldValidate: true });
    }, [eventData.divisionDetails, eventData.playoffDivisionDetails, setValue]);

    const playoffDivisionSelectOptions = useMemo(
        () => (eventData.playoffDivisionDetails || []).map((division) => ({
            value: division.id,
            label: division.name,
        })),
        [eventData.playoffDivisionDetails],
    );

    const playoffDivisionCapacityWarnings = useMemo(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return [] as string[];
        }

        const assignmentCounts = new Map<string, number>();
        const playoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];

        (eventData.divisionDetails || []).forEach((division) => {
            const playoffTeamCount = Number.isFinite(division.playoffTeamCount)
                ? Math.max(0, Math.trunc(division.playoffTeamCount as number))
                : 0;
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            for (let index = 0; index < playoffTeamCount; index += 1) {
                const mappedDivisionId = normalizeDivisionKeys([mapping[index]])[0];
                if (!mappedDivisionId) {
                    continue;
                }
                assignmentCounts.set(mappedDivisionId, (assignmentCounts.get(mappedDivisionId) ?? 0) + 1);
            }
        });

        return playoffDivisions
            .map((division) => {
                const normalizedId = normalizeDivisionKeys([division.id])[0];
                if (!normalizedId) {
                    return null;
                }
                const assigned = assignmentCounts.get(normalizedId) ?? 0;
                const capacity = Math.max(0, Math.trunc(division.maxParticipants || 0));
                if (assigned > capacity) {
                    return `${division.name} has ${assigned} mapped teams but only ${capacity} slots.`;
                }
                return null;
            })
            .filter((message): message is string => Boolean(message));
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
    ]);

    const handleSearchReferees = useCallback(
        async (query: string) => {
            setRefereeSearch(query);
            setRefereeError(null);
            if (query.trim().length < 2) {
                setRefereeResults([]);
                return;
            }
            try {
                setRefereeSearchLoading(true);
                const results = await userService.searchUsers(query.trim());
                const filtered = results.filter((candidate) => !(eventData.refereeIds || []).includes(candidate.$id));
                setRefereeResults(filtered);
            } catch (error) {
                console.error('Failed to search referees:', error);
                setRefereeError('Failed to search referees. Try again.');
            } finally {
                setRefereeSearchLoading(false);
            }
        },
        [eventData.refereeIds],
    );

    const handleAddReferee = useCallback((referee: UserData) => {
        setEventData((prev) => {
            const nextIds = Array.from(new Set([...(prev.refereeIds || []), referee.$id]));
            const nextRefs = (prev.referees || []).some((ref) => ref.$id === referee.$id)
                ? prev.referees
                : [...(prev.referees || []), referee];
            return { ...prev, refereeIds: nextIds, referees: nextRefs };
        });
        setRefereeResults((prev) => prev.filter((candidate) => candidate.$id !== referee.$id));
    }, [setEventData]);

    const handleRemoveReferee = useCallback((refereeId: string) => {
        setEventData((prev) => ({
            ...prev,
            refereeIds: (prev.refereeIds || []).filter((id) => id !== refereeId),
            referees: (prev.referees || []).filter((ref) => ref.$id !== refereeId),
        }));
    }, [setEventData]);

    const handleInviteRefereeEmail = useCallback(async () => {
        if (!currentUser) {
            setRefereeInviteError('You must be signed in to invite referees.');
            return;
        }

        const sanitized = refereeInvites.map((invite) => ({
            firstName: invite.firstName.trim(),
            lastName: invite.lastName.trim(),
            email: invite.email.trim(),
        }));

        for (const invite of sanitized) {
            if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email)) {
                setRefereeInviteError('Enter first, last, and valid email for all invites.');
                return;
            }
        }

        setRefereeInviteError(null);
        setInvitingReferees(true);
        try {
            const eventId = eventData.$id;
            const result = await userService.inviteUsersByEmail(
                currentUser.$id,
                sanitized.map((invite) => ({
                    ...invite,
                    type: 'referee' as const,
                    eventId,
                })),
            );
            if (result.failed && result.failed.length) {
                setRefereeInviteError('Failed to send one or more referee invites.');
            }

            const sentEntries = result.sent || [];
            const notSentEntries = result.not_sent || [];
            const successEntries = [...sentEntries, ...notSentEntries];
            const invitedUserIds = successEntries
                .map((entry: any) => entry.userId)
                .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

            if (invitedUserIds.length) {
                let invitedUsers: UserData[] = [];
                try {
                    invitedUsers = await userService.getUsersByIds(invitedUserIds);
                } catch (error) {
                    console.warn('Failed to fetch invited referees:', error);
                }

                let nextRefereeIds: string[] = [];
                setEventData((prev) => {
                    const existingRefs = prev.referees || [];
                    const nextRefs = [...existingRefs];
                    const nextIds = new Set(prev.refereeIds || []);
                    invitedUserIds.forEach((id) => nextIds.add(id));
                    invitedUsers.forEach((refUser) => {
                        if (!nextRefs.some((ref) => ref.$id === refUser.$id)) {
                            nextRefs.push(refUser);
                        }
                    });
                    nextRefereeIds = Array.from(nextIds);
                    return { ...prev, referees: nextRefs, refereeIds: nextRefereeIds };
                });
            }

            setRefereeInvites([{ firstName: '', lastName: '', email: '' }]);
        } catch (error) {
            setRefereeInviteError(error instanceof Error ? error.message : 'Failed to invite referees.');
        } finally {
            setInvitingReferees(false);
        }
    }, [currentUser, eventData.$id, refereeInvites, setEventData]);

    // Normalizes slot state every time LeagueFields mutates the slot array so errors stay in sync.
    const updateLeagueSlots = useCallback((updater: (slots: LeagueSlotForm[]) => LeagueSlotForm[]) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        setLeagueSlots(prev => normalizeSlotState(updater(prev), eventData.eventType));
    }, [eventData.eventType, hasImmutableTimeSlots, setLeagueSlots]);

    const handleLeagueScoringConfigChange = useCallback(
        (key: keyof LeagueScoringConfig, value: LeagueScoringConfig[keyof LeagueScoringConfig]) => {
            const currentConfig = (
                getValues('leagueScoringConfig') as LeagueScoringConfig | undefined
            ) ?? eventData.leagueScoringConfig;
            const nextConfig = applyLeagueScoringConfigFieldChange(
                currentConfig,
                key,
                value,
                (config) => setValue('leagueScoringConfig', config, { shouldDirty: true, shouldValidate: false }),
            );
            setEventData(prev => ({
                ...prev,
                leagueScoringConfig: nextConfig,
            }));
        },
        [eventData.leagueScoringConfig, getValues, setEventData, setValue]
    );

    const handleIncludePlayoffsToggle = useCallback((checked: boolean) => {
        if (!checked) {
            setLeagueData((prev) => ({
                ...prev,
                includePlayoffs: false,
                playoffTeamCount: undefined,
            }));
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: true, shouldValidate: true });
            return;
        }

        if (eventData.singleDivision) {
            const fallback = typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.maxParticipants || 2;
            setLeagueData((prev) => ({
                ...prev,
                includePlayoffs: true,
                playoffTeamCount: Math.max(2, Math.trunc(fallback)),
            }));
            return;
        }

        setLeagueData((prev) => ({
            ...prev,
            includePlayoffs: true,
            playoffTeamCount: typeof prev.playoffTeamCount === 'number'
                ? Math.max(2, Math.trunc(prev.playoffTeamCount))
                : Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
        }));
    }, [eventData.maxParticipants, eventData.singleDivision, leagueData.playoffTeamCount, setLeagueData, setValue]);

    const resetDivisionEditor = useCallback(() => {
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? (eventData.installmentAmounts || []).map((value) => Math.max(0, Number(value) || 0))
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        setDivisionEditor({
            editingId: null,
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: '',
            price: Math.max(0, eventData.price || 0),
            maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    typeof leagueData.playoffTeamCount === 'number'
                        ? leagueData.playoffTeamCount
                        : eventData.maxParticipants || 2,
                ),
            ),
            allowPaymentPlans: Boolean(eventData.allowPaymentPlans),
            installmentCount: eventData.allowPaymentPlans
                ? (eventData.installmentCount || defaultInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: defaultInstallmentDueDates,
            installmentAmounts: defaultInstallmentAmounts,
            nameTouched: false,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.allowPaymentPlans,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.maxParticipants,
        eventData.price,
        leagueData.playoffTeamCount,
    ]);

    useEffect(() => {
        const isSingleDivision = Boolean(eventData.singleDivision);
        if (previousSingleDivisionRef.current === null) {
            previousSingleDivisionRef.current = isSingleDivision;
            return;
        }
        const wasSingleDivision = previousSingleDivisionRef.current;
        previousSingleDivisionRef.current = isSingleDivision;
        if (!wasSingleDivision || isSingleDivision) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            resetDivisionEditor();
            return;
        }

        const { details: nextDetails, changed } = applyEventDefaultsToDivisionDetails({
            details: currentDetails,
            defaultPrice: Number(eventData.price) || 0,
            defaultMaxParticipants: Number(eventData.maxParticipants) || 2,
            includePlayoffs: eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs,
            defaultPlayoffTeamCount: typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.maxParticipants,
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
        }
        resetDivisionEditor();
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.price,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        resetDivisionEditor,
        setValue,
    ]);

    const getDivisionTypeNameForEditor = useCallback(
        (ratingType: 'AGE' | 'SKILL', divisionTypeId: string): string => {
            if (!divisionTypeId) {
                return '';
            }
            const fromCatalog = divisionTypeOptions.find((option) =>
                option.id === divisionTypeId && option.ratingType === ratingType,
            );
            if (fromCatalog) {
                return fromCatalog.name;
            }
            return getDivisionTypeById(
                resolveSportInput(eventData.sportConfig ?? eventData.sportId),
                divisionTypeId,
                ratingType,
            )?.name ?? divisionTypeId.toUpperCase();
        },
        [divisionTypeOptions, eventData.sportConfig, eventData.sportId],
    );

    const updateDivisionEditorSelection = useCallback((
        updates: Partial<Pick<typeof divisionEditor, 'gender' | 'skillDivisionTypeId' | 'ageDivisionTypeId'>>,
    ) => {
        setDivisionEditor((prev) => {
            const next = { ...prev, ...updates, error: null };
            if (Object.prototype.hasOwnProperty.call(updates, 'skillDivisionTypeId') && !updates.skillDivisionTypeId) {
                next.skillDivisionTypeId = '';
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'ageDivisionTypeId') && !updates.ageDivisionTypeId) {
                next.ageDivisionTypeId = '';
            }

            const hasRequiredFields = Boolean(next.gender && next.skillDivisionTypeId && next.ageDivisionTypeId);
            if (!hasRequiredFields) {
                next.name = '';
                next.nameTouched = false;
                return next;
            }

            const skillDivisionTypeName = getDivisionTypeNameForEditor('SKILL', next.skillDivisionTypeId);
            const ageDivisionTypeName = getDivisionTypeNameForEditor('AGE', next.ageDivisionTypeId);
            const divisionTypeName = buildDivisionTypeCompositeName(skillDivisionTypeName, ageDivisionTypeName);
            next.name = buildDivisionName({
                gender: next.gender as 'M' | 'F' | 'C',
                divisionTypeName,
            });
            next.nameTouched = false;
            return next;
        });
    }, [getDivisionTypeNameForEditor]);

    const handleEditDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.divisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        const composite = parseCompositeDivisionTypeId(detail.divisionTypeId);
        const fallbackSelections = getDefaultDivisionTypeSelectionsForSport(
            resolveSportInput(eventData.sportConfig ?? eventData.sportId),
        );
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? (eventData.installmentAmounts || []).map((value) => Math.max(0, Number(value) || 0))
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        const detailAllowPaymentPlans = typeof detail.allowPaymentPlans === 'boolean'
            ? detail.allowPaymentPlans
            : Boolean(eventData.allowPaymentPlans);
        const detailInstallmentAmounts = detailAllowPaymentPlans
            ? ((detail.installmentAmounts?.length
                ? detail.installmentAmounts
                : defaultInstallmentAmounts).map((value) => Math.max(0, Number(value) || 0)))
            : [];
        const detailInstallmentDueDates = detailAllowPaymentPlans
            ? (detail.installmentDueDates?.length
                ? [...detail.installmentDueDates]
                : defaultInstallmentDueDates)
            : [];
        setDivisionEditor({
            editingId: detail.id,
            gender: detail.gender,
            skillDivisionTypeId: detail.skillDivisionTypeId
                || composite?.skillDivisionTypeId
                || (detail.ratingType === 'SKILL' ? detail.divisionTypeId : fallbackSelections.skillDivisionTypeId),
            ageDivisionTypeId: detail.ageDivisionTypeId
                || composite?.ageDivisionTypeId
                || (detail.ratingType === 'AGE' ? detail.divisionTypeId : fallbackSelections.ageDivisionTypeId),
            name: detail.name,
            price: Math.max(0, detail.price || 0),
            maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    detail.playoffTeamCount
                        || detail.maxParticipants
                        || eventData.maxParticipants
                        || 2,
                ),
            ),
            allowPaymentPlans: detailAllowPaymentPlans,
            installmentCount: detailAllowPaymentPlans
                ? (detail.installmentCount || detailInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: detailInstallmentDueDates,
            installmentAmounts: detailInstallmentAmounts,
            nameTouched: true,
            error: null,
        });
    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentDueDates,
        eventData.maxParticipants,
        eventData.sportConfig,
        eventData.sportId,
    ]);

    const handleRemoveDivisionDetail = useCallback((divisionId: string) => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDetails = currentDetails.filter((detail) => detail.id !== divisionId);
        const nextDivisionIds = nextDetails.map((detail) => detail.id);
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const cleanedFieldMap = Object.fromEntries(
            Object.entries(currentFieldMap).filter(([divisionKey]) => nextDivisionIds.includes(divisionKey)),
        );
        setValue('divisionFieldIds', cleanedFieldMap, { shouldDirty: true, shouldValidate: true });

        if (divisionEditor.editingId === divisionId) {
            resetDivisionEditor();
        }
    }, [
        divisionEditor.editingId,
        eventData.divisionDetails,
        getValues,
        resetDivisionEditor,
        setValue,
    ]);

    const handleSaveDivisionDetail = useCallback(() => {
        const gender = divisionEditor.gender;
        const skillDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.skillDivisionTypeId);
        const ageDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.ageDivisionTypeId);
        const ratingType: 'SKILL' = 'SKILL';
        const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
        const skillDivisionTypeName = getDivisionTypeNameForEditor('SKILL', skillDivisionTypeId);
        const ageDivisionTypeName = getDivisionTypeNameForEditor('AGE', ageDivisionTypeId);
        const divisionTypeName = buildDivisionTypeCompositeName(skillDivisionTypeName, ageDivisionTypeName);
        const name = divisionEditor.name.trim();
        const normalizedDivisionPrice = eventData.singleDivision
            ? Math.max(0, eventData.price || 0)
            : Math.max(0, divisionEditor.price || 0);
        const normalizedDivisionMaxParticipants = eventData.singleDivision
            ? Math.max(2, Math.trunc(eventData.maxParticipants || 2))
            : Math.max(2, Math.trunc(divisionEditor.maxParticipants || 0));
        const normalizedDivisionPlayoffTeamCount = (() => {
            if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs) {
                return undefined;
            }
            if (eventData.singleDivision) {
                const fallback = typeof leagueData.playoffTeamCount === 'number'
                    ? leagueData.playoffTeamCount
                    : eventData.maxParticipants || 2;
                return Math.max(2, Math.trunc(fallback));
            }
            return Math.max(2, Math.trunc(divisionEditor.playoffTeamCount || 0));
        })();
        const normalizedDivisionAllowPaymentPlans = eventData.singleDivision
            ? Boolean(eventData.allowPaymentPlans)
            : Boolean(divisionEditor.allowPaymentPlans);
        const normalizedDivisionInstallmentAmounts = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? (eventData.installmentAmounts || []).map((value) => Math.max(0, Number(value) || 0))
                : (divisionEditor.installmentAmounts || []).map((value) => Math.max(0, Number(value) || 0)))
            : [];
        const normalizedDivisionInstallmentDueDates = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? [...(eventData.installmentDueDates || [])]
                : [...(divisionEditor.installmentDueDates || [])])
            : [];
        const normalizedDivisionInstallmentCount = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? (eventData.installmentCount || normalizedDivisionInstallmentAmounts.length || 0)
                : (divisionEditor.installmentCount || normalizedDivisionInstallmentAmounts.length || 0))
            : 0;

        if (!gender || !skillDivisionTypeId || !ageDivisionTypeId) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: 'Select gender, skill division, and age division before adding.',
            }));
            return;
        }
        if (!name.length) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division name is required.' }));
            return;
        }
        if (!eventData.singleDivision && normalizedDivisionMaxParticipants < 2) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: eventData.teamSignup
                    ? 'Division max teams must be at least 2.'
                    : 'Division max participants must be at least 2.',
            }));
            return;
        }
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && !(typeof normalizedDivisionPlayoffTeamCount === 'number' && normalizedDivisionPlayoffTeamCount >= 2)
        ) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division playoff team count must be at least 2.' }));
            return;
        }
        if (!eventData.singleDivision && normalizedDivisionAllowPaymentPlans) {
            if (!normalizedDivisionInstallmentAmounts.length) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Add at least one installment amount for this division.',
                }));
                return;
            }
            if (
                normalizedDivisionInstallmentCount > 0
                && normalizedDivisionInstallmentAmounts.length !== normalizedDivisionInstallmentCount
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Division installment count must match number of installment rows.',
                }));
                return;
            }
            if (
                normalizedDivisionInstallmentDueDates.length
                && normalizedDivisionInstallmentDueDates.length !== normalizedDivisionInstallmentAmounts.length
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Each division installment amount needs a due date.',
                }));
                return;
            }
            const total = normalizedDivisionInstallmentAmounts.reduce(
                (sum, amount) => sum + (Number.isFinite(amount) ? amount : 0),
                0,
            );
            if (
                normalizedDivisionPrice > 0
                && Math.round(total * 100) !== Math.round(normalizedDivisionPrice * 100)
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Division installment amounts must add up to the division price.',
                }));
                return;
            }
        }

        const token = buildDivisionToken({ gender, ratingType, divisionTypeId });
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId) || undefined;
        const referenceDate = parseDateValue(eventData.start ?? null);

        const currentDetails = Array.isArray(eventData.divisionDetails) ? [...eventData.divisionDetails] : [];
        const existingDetail = divisionEditor.editingId
            ? currentDetails.find((detail) => detail.id === divisionEditor.editingId)
            : null;
        const normalizedName = normalizeDivisionNameKey(name);
        const duplicateByName = currentDetails.find((detail) =>
            detail.id !== divisionEditor.editingId
            && normalizeDivisionNameKey(detail.name) === normalizedName,
        );
        if (duplicateByName) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: 'Division name must be unique within this event.',
            }));
            return;
        }
        const nextId = existingDetail?.id ?? buildUniqueDivisionIdForToken({
            eventId: eventData.$id,
            token,
            existingDivisionIds: currentDetails.map((detail) => detail.id),
        });

        const nextDetail = applyDivisionAgeCutoff({
            id: nextId,
            key: token,
            kind: 'LEAGUE',
            name,
            divisionTypeId,
            divisionTypeName,
            ratingType,
            gender,
            skillDivisionTypeId,
            skillDivisionTypeName,
            ageDivisionTypeId,
            ageDivisionTypeName,
            price: normalizedDivisionPrice,
            maxParticipants: normalizedDivisionMaxParticipants,
            playoffTeamCount: normalizedDivisionPlayoffTeamCount,
            playoffPlacementDivisionIds: Array.isArray(existingDetail?.playoffPlacementDivisionIds)
                ? [...existingDetail.playoffPlacementDivisionIds]
                : [],
            allowPaymentPlans: normalizedDivisionAllowPaymentPlans,
            installmentCount: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0,
            installmentDueDates: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueDates : [],
            installmentAmounts: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [],
            sportId: sportInput,
            fieldIds: [],
        }, sportInput, referenceDate);

        let nextDetails: DivisionDetailForm[] = [];
        if (divisionEditor.editingId) {
            nextDetails = currentDetails.map((detail) =>
                detail.id === divisionEditor.editingId ? nextDetail : detail,
            );
        } else {
            nextDetails = [...currentDetails, nextDetail];
        }
        const nextDivisionIds = nextDetails.map((detail) => detail.id);

        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const remappedFieldMap: Record<string, string[]> = {};
        Object.entries(currentFieldMap).forEach(([divisionKey, fieldIds]) => {
            if (divisionEditor.editingId && divisionKey === divisionEditor.editingId) {
                remappedFieldMap[nextId] = Array.isArray(fieldIds) ? [...fieldIds] : [];
                return;
            }
            if (nextDivisionIds.includes(divisionKey)) {
                remappedFieldMap[divisionKey] = Array.isArray(fieldIds) ? [...fieldIds] : [];
            }
        });
        setValue('divisionFieldIds', remappedFieldMap, { shouldDirty: true, shouldValidate: true });
        resetDivisionEditor();
    }, [
        divisionEditor,
        eventData.$id,
        eventData.divisionDetails,
        eventData.sportConfig,
        eventData.sportId,
        eventData.start,
        eventData.singleDivision,
        eventData.teamSignup,
        eventData.eventType,
        eventData.allowPaymentPlans,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.price,
        eventData.maxParticipants,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        getDivisionTypeNameForEditor,
        getValues,
        resetDivisionEditor,
        setValue,
    ]);

    const divisionEditorReady = Boolean(
        divisionEditor.gender
        && divisionEditor.skillDivisionTypeId
        && divisionEditor.ageDivisionTypeId,
    );

    useEffect(() => {
        if (sportsLoading) {
            return;
        }
        const selectedSportId = String(getValues('sportId') ?? '').trim();
        const currentSportConfig = getValues('sportConfig') as Sport | null | undefined;
        const currentSportConfigId = currentSportConfig && typeof currentSportConfig === 'object'
            ? String((currentSportConfig as any).$id ?? '')
            : '';

        if (!selectedSportId) {
            if (currentSportConfig) {
                setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
            }
            return;
        }

        const selected = sportsById.get(selectedSportId) ?? null;
        if (selected && currentSportConfigId !== selected.$id) {
            setValue('sportConfig', selected, { shouldDirty: false, shouldValidate: false });
            return;
        }
        if (!selected && currentSportConfig) {
            setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
        }
    }, [getValues, setValue, sportsLoading, sportsById]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            const defaults = buildDefaultDivisionDetailsForSport(
                eventData.$id,
                eventData.sportConfig ?? eventData.sportId,
                parseDateValue(eventData.start ?? null),
            );
            setValue('divisionDetails', defaults, { shouldDirty: false, shouldValidate: false });
            setValue(
                'divisions',
                defaults.map((detail) => detail.id),
                { shouldDirty: false, shouldValidate: true },
            );
            return;
        }

        const idsFromDetails = normalizeDivisionKeys(currentDetails.map((detail) => detail.id));
        const currentDivisionIds = normalizeDivisionKeys(getValues('divisions'));
        if (!stringArraysEqual(idsFromDetails, currentDivisionIds)) {
            setValue('divisions', idsFromDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [eventData.$id, eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, getValues, setValue]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        const referenceDate = parseDateValue(eventData.start ?? null);
        const nextDetails = currentDetails.map((detail) => applyDivisionAgeCutoff({
            ...detail,
            sportId: detail.sportId ?? (sportInput || undefined),
        }, sportInput, referenceDate));

        const changed = nextDetails.some((detail, index) => {
            const current = currentDetails[index];
            if (!current) {
                return true;
            }
            return detail.ageCutoffDate !== current.ageCutoffDate
                || detail.ageCutoffLabel !== current.ageCutoffLabel
                || detail.ageCutoffSource !== current.ageCutoffSource
                || detail.sportId !== current.sportId;
        });

        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: false });
        }
    }, [eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, setValue]);

    useEffect(() => {
        const selectedDivisionKeys = slotDivisionKeys;
        if (!selectedDivisionKeys.length) {
            return;
        }
        const selectedDivisionSet = new Set(selectedDivisionKeys);
        const enforceAllSlotDivisions = Boolean(eventData.singleDivision);
        const hasMismatch = leagueSlots.some((slot) => {
            const currentRaw = normalizeDivisionKeys(slot.divisions);
            const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
            if (!stringArraysEqual(currentRaw, current)) {
                return true;
            }
            if (enforceAllSlotDivisions) {
                return !stringSetsEqual(current, selectedDivisionKeys);
            }
            const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
            return filtered.length === 0 || !stringArraysEqual(current, filtered);
        });
        if (!hasMismatch) {
            return;
        }
        updateLeagueSlots((prev) =>
            prev.map((slot) => {
                const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
                const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
                return {
                    ...slot,
                    divisions: enforceAllSlotDivisions
                        ? selectedDivisionKeys
                        : (filtered.length ? filtered : selectedDivisionKeys),
                };
            }),
        );
    }, [eventData.singleDivision, leagueSlots, slotDivisionKeys, slotDivisionLookup, updateLeagueSlots]);

    useEffect(() => {
        if (eventData.eventType === 'LEAGUE') {
            return;
        }

        if (eventData.splitLeaguePlayoffDivisions) {
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: true, shouldValidate: true });
        }
        if ((eventData.playoffDivisionDetails || []).length > 0) {
            setValue('playoffDivisionDetails', [], { shouldDirty: true, shouldValidate: true });
        }
    }, [
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        setValue,
    ]);

    useEffect(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return;
        }
        const current = Array.isArray(eventData.playoffDivisionDetails) ? eventData.playoffDivisionDetails : [];
        if (current.length > 0) {
            return;
        }
        setValue('playoffDivisionDetails', [createNextPlayoffDivision(current)], { shouldDirty: true, shouldValidate: true });
    }, [
        createNextPlayoffDivision,
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                : 0;
            if (playoffTeamCount <= 0) {
                if (!Array.isArray(detail.playoffPlacementDivisionIds) || detail.playoffPlacementDivisionIds.length === 0) {
                    return detail;
                }
                changed = true;
                return {
                    ...detail,
                    playoffPlacementDivisionIds: [],
                };
            }
            const currentMapping = Array.isArray(detail.playoffPlacementDivisionIds)
                ? detail.playoffPlacementDivisionIds
                : [];
            const nextMapping = currentMapping.slice(0, playoffTeamCount);
            while (nextMapping.length < playoffTeamCount) {
                nextMapping.push('');
            }
            if (stringArraysEqual(currentMapping, nextMapping)) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || !eventData.singleDivision) {
            return;
        }
        if (typeof leagueData.playoffTeamCount === 'number' && leagueData.playoffTeamCount >= 2) {
            return;
        }
        const fallbackFromDivision = eventData.divisionDetails?.[0]?.playoffTeamCount
            ?? eventData.divisionDetails?.[0]?.maxParticipants
            ?? eventData.maxParticipants
            ?? 2;
        setLeagueData((prev) => ({
            ...prev,
            playoffTeamCount: Math.max(2, Math.trunc(fallbackFromDivision)),
        }));
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        setLeagueData,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || eventData.singleDivision) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            if (typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffTeamCount: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        const requiresSets = Boolean(eventData.sportConfig?.usePointsPerSetWin);
        setLeagueData((prev) => {
            const next = { ...prev };
            let changed = false;

            if (next.usesSets !== requiresSets) {
                next.usesSets = requiresSets;
                changed = true;
            }

            if (requiresSets) {
                const allowed = [1, 3, 5];
                const currentSets = next.setsPerMatch && allowed.includes(next.setsPerMatch)
                    ? next.setsPerMatch
                    : 1;
                if (next.setsPerMatch !== currentSets) {
                    next.setsPerMatch = currentSets;
                    changed = true;
                }

                if (!Number.isFinite(next.setDurationMinutes)) {
                    next.setDurationMinutes = 20;
                    changed = true;
                }

                const targetLength = currentSets;
                const existingPoints = Array.isArray(next.pointsToVictory)
                    ? next.pointsToVictory
                    : [];
                const points = existingPoints.slice(0, targetLength);
                while (points.length < targetLength) points.push(21);
                if (
                    points.length !== existingPoints.length ||
                    points.some((value, index) => value !== existingPoints[index])
                ) {
                    next.pointsToVictory = points;
                    changed = true;
                }
            } else {
                if (next.setsPerMatch !== undefined) {
                    next.setsPerMatch = undefined;
                    changed = true;
                }
                if (next.setDurationMinutes !== undefined) {
                    next.setDurationMinutes = undefined;
                    changed = true;
                }
                if (next.pointsToVictory !== undefined) {
                    next.pointsToVictory = undefined;
                    changed = true;
                }
            }

            if (!Number.isFinite(next.matchDurationMinutes)) {
                next.matchDurationMinutes = 60;
                changed = true;
            }

            return changed ? next : prev;
        });
    }, [eventData.sportConfig, setLeagueData]);

    useEffect(() => {
        if (!hasImmutableFields) {
            return;
        }
        setFields(sanitizeFieldsForForm(immutableFields));
    }, [hasImmutableFields, immutableFields, setFields]);

    // When provisioning local fields, mirror count/division changes into the generated list.
    useEffect(() => {
        if (!shouldManageLocalFields) {
            return;
        }
        const fallbackDivisions = defaultFieldDivisionKeys(eventData.divisions);
        setFields(prev => {
            const normalized: Field[] = prev.slice(0, fieldCount).map((field, index) => ({
                ...field,
                fieldNumber: index + 1,
                divisions: (() => {
                    const current = normalizeDivisionKeys(field.divisions);
                    return current.length ? current : fallbackDivisions;
                })(),
            } as Field));

            if (normalized.length < fieldCount) {
                for (let index = normalized.length; index < fieldCount; index += 1) {
                    normalized.push({
                        $id: createClientId(),
                        name: `Field ${index + 1}`,
                        fieldNumber: index + 1,
                        location: '',
                        lat: 0,
                        long: 0,
                        divisions: fallbackDivisions,
                    } as Field);
                }
            }

            return normalized;
        });
    }, [fieldCount, shouldManageLocalFields, eventData.divisions, setFields]);

    // For non-organization events with existing facilities, seed the field list with event ordering.
    useEffect(() => {
        if (shouldManageLocalFields || isOrganizationManagedEvent || !activeEditingEvent?.fields?.length) {
            return;
        }
        const sorted = sanitizeFieldsForForm(activeEditingEvent.fields).sort(
            (a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0),
        );
        setFields(sorted);
    }, [activeEditingEvent?.fields, isOrganizationManagedEvent, setFields, shouldManageLocalFields]);

    useEffect(() => {
        const availableFieldIds = toFieldIdList(fields);
        const allowed = new Set(availableFieldIds);
        const normalizedSelected = Array.from(
            new Set(
                selectedFieldIds
                    .map((fieldId) => String(fieldId))
                    .filter((fieldId) => allowed.has(fieldId)),
            ),
        );
        const nextSelected = normalizedSelected.length ? normalizedSelected : availableFieldIds;
        if (!stringArraysEqual(selectedFieldIds, nextSelected)) {
            setValue('selectedFieldIds', nextSelected, { shouldDirty: false, shouldValidate: true });
        }
    }, [fields, selectedFieldIds, setValue]);

    useEffect(() => {
        const divisionKeys = normalizeDivisionKeys(eventData.divisions);
        const availableFieldIds = toFieldIdList(fields);

        const nextDivisionFieldIds = shouldManageLocalFields
            ? normalizeDivisionFieldIds(
                deriveDivisionFieldIdsFromFields(fields, divisionKeys, availableFieldIds),
                divisionKeys,
                availableFieldIds,
            )
            : normalizeDivisionFieldIds(divisionFieldIds, divisionKeys, availableFieldIds);

        if (!divisionFieldIdsEqual(divisionFieldIds, nextDivisionFieldIds)) {
            setValue('divisionFieldIds', nextDivisionFieldIds, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        divisionFieldIds,
        eventData.divisions,
        fields,
        setValue,
        shouldManageLocalFields,
    ]);

    // Clear slot field references that point to fields no longer selected/available.
    useEffect(() => {
        const availableFieldIds = toFieldIdList(fields);
        if (!availableFieldIds.length) {
            return;
        }
        const validIds = new Set(availableFieldIds);

        const hasInvalidSlots = leagueSlots.some((slot) => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            return slotFieldIds.some((fieldId) => !validIds.has(fieldId));
        });
        if (!hasInvalidSlots) {
            return;
        }

        updateLeagueSlots(prev => prev.map(slot => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            const nextFieldIds = slotFieldIds.filter((fieldId) => validIds.has(fieldId));
            if (stringSetsEqual(slotFieldIds, nextFieldIds)) {
                return slot;
            }
            return {
                ...slot,
                scheduledFieldId: nextFieldIds[0],
                scheduledFieldIds: nextFieldIds,
            };
        }));
    }, [fields, leagueSlots, updateLeagueSlots]);

    // Adds a blank slot row in the LeagueFields list when the user taps "Add Timeslot".
    const handleAddSlot = () => {
        if (hasImmutableTimeSlots) {
            return;
        }
        clearErrors('leagueSlots');
        updateLeagueSlots(prev => [...prev, createSlotForm(undefined, slotDivisionKeys)]);
    };

    // Drops a specific slot by index, leaving at least one slot for the scheduler UI to edit.
    const handleRemoveSlot = (index: number) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        updateLeagueSlots(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, idx) => idx !== index);
        });
    };

    // Applies granular updates coming back from LeagueFields inputs before revalidating the array.
    const handleUpdateSlot = (index: number, updates: Partial<LeagueSlotForm>) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        const current = leagueSlots[index];
        if (!current) return;

        const updated: LeagueSlotForm = {
            ...current,
            ...updates,
        };
        const normalizedDays = normalizeWeekdays(updated);
        const normalizedFieldIds = normalizeSlotFieldIds(updated);
        const selectedDivisionKeys = slotDivisionKeys;
        const normalizedDivisions = normalizeSlotDivisionKeysWithLookup(updated.divisions, slotDivisionLookup);
        const normalizedStartDate = formatLocalDateTime(updated.startDate ?? null);
        const normalizedEndDate = formatLocalDateTime(updated.endDate ?? null);
        updated.scheduledFieldId = normalizedFieldIds[0];
        updated.scheduledFieldIds = normalizedFieldIds;
        updated.divisions = eventData.singleDivision
            ? selectedDivisionKeys
            : (normalizedDivisions.length ? normalizedDivisions : selectedDivisionKeys);
        updated.startDate = normalizedStartDate || undefined;
        updated.endDate = normalizedEndDate || undefined;

        const repeating = updated.repeating !== false;
        if (repeating) {
            const parsedStart = parseLocalDateTime(updated.startDate ?? null);
            const parsedEnd = parseLocalDateTime(updated.endDate ?? null);
            const nextDays = normalizedDays.length
                ? normalizedDays
                : parsedStart
                    ? [((parsedStart.getDay() + 6) % 7)]
                    : [];
            if (nextDays.length) {
                updated.dayOfWeek = nextDays[0] as LeagueSlotForm['dayOfWeek'];
                updated.daysOfWeek = nextDays as LeagueSlotForm['daysOfWeek'];
            } else {
                updated.dayOfWeek = undefined;
                updated.daysOfWeek = [];
            }

            if (!Number.isFinite(updated.startTimeMinutes) && parsedStart) {
                updated.startTimeMinutes = parsedStart.getHours() * 60 + parsedStart.getMinutes();
            }
            if (!Number.isFinite(updated.endTimeMinutes) && parsedEnd) {
                updated.endTimeMinutes = parsedEnd.getHours() * 60 + parsedEnd.getMinutes();
            }
        } else {
            let slotStart = parseLocalDateTime(updated.startDate ?? null);
            let slotEnd = parseLocalDateTime(updated.endDate ?? null);
            if (!slotStart) {
                const fallbackEventStart = parseLocalDateTime(eventData.start ?? null);
                if (fallbackEventStart) {
                    slotStart = fallbackEventStart;
                }
            }
            if (!slotEnd && slotStart) {
                const fallbackEventEnd = parseLocalDateTime(eventData.end ?? null);
                if (fallbackEventEnd && fallbackEventEnd.getTime() > slotStart.getTime()) {
                    slotEnd = fallbackEventEnd;
                } else {
                    const startMinutes = Number.isFinite(updated.startTimeMinutes) ? Number(updated.startTimeMinutes) : null;
                    const endMinutes = Number.isFinite(updated.endTimeMinutes) ? Number(updated.endTimeMinutes) : null;
                    const durationMinutes = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
                        ? endMinutes - startMinutes
                        : 60;
                    slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
                }
            }

            if (slotStart) {
                const dayOfWeek = ((slotStart.getDay() + 6) % 7);
                updated.dayOfWeek = dayOfWeek as LeagueSlotForm['dayOfWeek'];
                updated.daysOfWeek = [dayOfWeek] as LeagueSlotForm['daysOfWeek'];
                updated.startDate = formatLocalDateTime(slotStart);
                updated.startTimeMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
            } else {
                updated.dayOfWeek = undefined;
                updated.daysOfWeek = [];
                updated.startDate = undefined;
                updated.startTimeMinutes = undefined;
            }

            if (slotEnd) {
                updated.endDate = formatLocalDateTime(slotEnd);
                updated.endTimeMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
            } else {
                updated.endDate = undefined;
                updated.endTimeMinutes = undefined;
            }
        }

        updateLeagueSlots(prev => {
            const next = [...prev];
            next[index] = updated;
            return next;
        });

        clearErrors('leagueSlots');
    };

    // Updates locally managed fields when the org lacks saved fields (new event + provisioning).
    const handleLocalFieldNameChange = useCallback((index: number, name: string) => {
        if (!shouldManageLocalFields || hasImmutableFields) {
            return;
        }
        setFields(prev => {
            const next = [...prev];
            if (next[index]) {
                next[index] = { ...next[index], name };
            }
            return next;
        });
    }, [hasImmutableFields, setFields, shouldManageLocalFields]);

    // Hydrate schedule state and slots when opening the modal for an existing event.
    useEffect(() => {
        if (hasImmutableTimeSlots) {
            return;
        }
        if (activeEditingEvent && supportsScheduleSlots(activeEditingEvent.eventType)) {
            if (activeEditingEvent.eventType === 'LEAGUE') {
                const source = activeEditingEvent.leagueConfig || activeEditingEvent;
                setLeagueData({
                    gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                    includePlayoffs: source?.includePlayoffs ?? false,
                    playoffTeamCount: source?.playoffTeamCount ?? undefined,
                    usesSets: source?.usesSets ?? false,
                    matchDurationMinutes: normalizeNumber(source?.matchDurationMinutes, 60) ?? 60,
                    setDurationMinutes: normalizeNumber(source?.setDurationMinutes),
                    setsPerMatch: normalizeNumber(source?.setsPerMatch),
                    pointsToVictory: Array.isArray(source?.pointsToVictory) ? source.pointsToVictory as number[] : undefined,
                });

                if (activeEditingEvent.includePlayoffs) {
                    const extractedPlayoff = extractTournamentConfigFromEvent(activeEditingEvent);
                    if (extractedPlayoff) {
                        setPlayoffData(extractedPlayoff);
                    } else {
                        setPlayoffData(buildTournamentConfig());
                    }
                } else {
                    setPlayoffData(buildTournamentConfig());
                }
            } else {
                setLeagueData({
                    gamesPerOpponent: 1,
                    includePlayoffs: false,
                    playoffTeamCount: undefined,
                    usesSets: false,
                    matchDurationMinutes: 60,
                    setDurationMinutes: undefined,
                    setsPerMatch: undefined,
                });
                setPlayoffData(buildTournamentConfig());
            }

            const fallbackFieldId = activeEditingEvent.fields?.[0]?.$id;
            const slots = mergeSlotPayloadsForForm(activeEditingEvent.timeSlots || [], fallbackFieldId)
                .map((slot) => createSlotForm(slot, slotDivisionKeysRef.current));

            const initialSlots = slots.length > 0
                ? slots
                : [createSlotForm(undefined, slotDivisionKeysRef.current)];
            setLeagueSlots(normalizeSlotState(initialSlots, activeEditingEvent.eventType));
        } else if (!activeEditingEvent) {
            setLeagueData({
                gamesPerOpponent: 1,
                includePlayoffs: false,
                playoffTeamCount: undefined,
                usesSets: false,
                matchDurationMinutes: 60,
                    setDurationMinutes: undefined,
                    setsPerMatch: undefined,
                });
            setLeagueSlots(normalizeSlotState([createSlotForm(undefined, slotDivisionKeysRef.current)], 'EVENT'));
            setPlayoffData(buildTournamentConfig());
        }
    }, [activeEditingEvent, createSlotForm, hasImmutableTimeSlots, setLeagueData, setLeagueSlots, setPlayoffData]);

    useEffect(() => {
        if (!hasImmutableTimeSlots) {
            return;
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        const slotForms = mergeSlotPayloadsForForm(immutableTimeSlots, fallbackFieldId)
            .map((slot) => createSlotForm(slot, slotDivisionKeysRef.current));
        setLeagueSlots(normalizeSlotState(slotForms, eventData.eventType));
    }, [hasImmutableTimeSlots, immutableTimeSlots, immutableFields, createSlotForm, eventData.eventType, setLeagueSlots]);

    // Pull the organization's full field list so timeslot field options are complete in edit/create mode.
    useEffect(() => {
        let cancelled = false;

        if (hasImmutableFields || shouldManageLocalFields) {
            return () => {
                cancelled = true;
            };
        }

        if (!organizationHostedEventId) {
            return () => {
                cancelled = true;
            };
        }

        const hydrateOrganizationFields = async () => {
            const sortByFieldNumber = (nextFields: Field[]) =>
                [...nextFields].sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0));

            const seededFields = Array.isArray(organization?.fields)
                ? sortByFieldNumber(sanitizeFieldsForForm(organization.fields as Field[]))
                : [];
            if (seededFields.length) {
                setFields(seededFields);
            }

            try {
                setFieldsLoading(true);
                const resolvedOrganization = await organizationService.getOrganizationById(organizationHostedEventId, true);
                if (cancelled) return;

                let resolvedFields = Array.isArray(resolvedOrganization?.fields)
                    ? sortByFieldNumber(sanitizeFieldsForForm(resolvedOrganization.fields as Field[]))
                    : seededFields;
                if (!resolvedFields.length) {
                    const fallbackFieldIds = Array.isArray(resolvedOrganization?.fieldIds)
                        ? resolvedOrganization.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)
                        : Array.isArray(organization?.fieldIds)
                            ? organization.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)
                            : [];
                    if (fallbackFieldIds.length) {
                        const fetchedFields = await fieldService.listFields({ fieldIds: fallbackFieldIds });
                        if (cancelled) return;
                        resolvedFields = sortByFieldNumber(sanitizeFieldsForForm(fetchedFields));
                    }
                }
                if (resolvedFields.length) {
                    setFields(resolvedFields);
                }
            } catch (error) {
                console.warn('Failed to hydrate organization fields for event form:', error);
            } finally {
                if (!cancelled) {
                    setFieldsLoading(false);
                }
            }
        };

        hydrateOrganizationFields();

        return () => {
            cancelled = true;
        };
    }, [
        organization?.fieldIds,
        organization?.fields,
        hasImmutableFields,
        organizationHostedEventId,
        setFields,
        shouldManageLocalFields,
    ]);

    // Merge any newly loaded fields from the event into local state without losing existing edits.
    useEffect(() => {
        if (hasImmutableFields) {
            return;
        }
        if (activeEditingEvent?.fields) {
            setFields(prev => {
                const map = new Map<string, Field>();
                const incoming = sanitizeFieldsForForm(activeEditingEvent.fields as Field[]);
                [...prev, ...incoming].forEach(field => {
                    if (field?.$id) {
                        map.set(field.$id, field);
                    }
                });
                return Array.from(map.values());
            });
        }
    }, [activeEditingEvent?.fields, hasImmutableFields, setFields]);

    // Re-run slot normalization when the modal switches event types (e.g., league -> tournament).
    useEffect(() => {
        updateLeagueSlots(prev => prev);
    }, [eventData.eventType, updateLeagueSlots]);

    const todaysDate = new Date(new Date().setHours(0, 0, 0, 0));
    const selectedFields = useMemo(() => {
        return fields;
    }, [fields]);
    const leagueFieldOptions = useMemo(() => {
        return selectedFields
            .filter((field): field is Field & { $id: string } => typeof field.$id === 'string' && field.$id.length > 0)
            .map((field) => ({
                value: field.$id,
                label: field.name?.trim() || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Field'),
            }));
    }, [selectedFields]);

    const eventOrganizationId = organizationHostedEventId;

    const hasExternalRentalField = useMemo(() => {
        if (!eventOrganizationId) {
            return false;
        }
        const sourceFields = fields.length ? fields : (activeEditingEvent?.fields ?? []);
        return sourceFields.some((field) => {
            const orgId = getFieldOrganizationId(field);
            return orgId && orgId !== eventOrganizationId;
        });
    }, [activeEditingEvent?.fields, eventOrganizationId, fields]);

    useEffect(() => {
        if (!hasExternalRentalField) {
            setRentalLockedTimeSlots([]);
            return;
        }
        const fallbackFieldId = immutableFields[0]?.$id || (activeEditingEvent?.fields?.[0] as Field | undefined)?.$id;
        const lockedSlots = (activeEditingEvent?.timeSlots ?? [])
            .map((slot) => {
                if (!slot) return null;
                const { event: _ignored, ...rest } = slot as any;
                const normalized: TimeSlot = {
                    ...rest,
                    scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                    scheduledFieldIds: normalizeSlotFieldIds({
                        scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                        scheduledFieldIds: rest.scheduledFieldIds,
                    }),
                };
                return normalized;
            })
            .filter((slot): slot is TimeSlot => Boolean(slot));
        setRentalLockedTimeSlots(lockedSlots);
    }, [activeEditingEvent?.fields, activeEditingEvent?.timeSlots, hasExternalRentalField, immutableFields]);

    const fieldsReferencedInSlots = useMemo(() => {
        const availableFields = isOrganizationManagedEvent ? selectedFields : fields;
        if (!leagueSlots.length) {
            if (availableFields.length) {
                return availableFields;
            }
            return hasImmutableFields ? immutableFields : ([] as Field[]);
        }

        const fieldMap = new Map<string, Field>();
        availableFields.forEach(field => {
            if (field?.$id) {
                fieldMap.set(field.$id, field);
            }
        });

        const seen = new Set<string>();
        const picked: Field[] = [];

        leagueSlots.forEach(slot => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            slotFieldIds.forEach((slotFieldId) => {
                if (seen.has(slotFieldId)) {
                    return;
                }
                const resolved = fieldMap.get(slotFieldId);
                if (resolved) {
                    picked.push(resolved);
                }
                seen.add(slotFieldId);
            });
        });

        if (!picked.length && availableFields.length) {
            return availableFields;
        }

        if (!picked.length && hasImmutableFields) {
            return immutableFields;
        }

        return picked;
    }, [fields, hasImmutableFields, immutableFields, isOrganizationManagedEvent, leagueSlots, selectedFields]);

    const selectedImageId = eventData.imageId;
    const selectedImageUrl = useMemo(
        () => (selectedImageId ? getEventImageUrl({ imageId: selectedImageId, width: 800 }) : ''),
        [selectedImageId],
    );

    const eventTypeOptions = useMemo(
        () =>
            hasExternalRentalField
                ? [{ value: 'EVENT', label: 'Pickup Game' }]
                : [
                    { value: 'EVENT', label: 'Pickup Game' },
                    { value: 'TOURNAMENT', label: 'Tournament' },
                    { value: 'LEAGUE', label: 'League' },
                ],
        [hasExternalRentalField],
    );
    const supportsNoFixedEndDateTime = eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT';

    useEffect(() => {
        if ((eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT') &&
            !eventData.teamSignup) {
            setEventData(prev => {
                if (prev.teamSignup) {
                    return prev;
                }
                return {
                    ...prev,
                    teamSignup: true,
                };
            });
        }
    }, [eventData.eventType, eventData.teamSignup, setEventData]);

    // Prevents the creator from joining twice when they toggle team-based registration on.
    useEffect(() => {
        if (eventData.teamSignup) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup, setJoinAsParticipant]);

    // Populate human-readable location if empty
    // Converts coordinates into a city/state label when the user hasn't typed an address manually.
    useEffect(() => {
        const lat = getLatitudeFromCoordinates(eventData.coordinates);
        const lng = getLongitudeFromCoordinates(eventData.coordinates);
        const hasCoords = coordinatesAreSet(eventData.coordinates);

        if (!isEditMode && eventData.location.trim().length === 0 && hasCoords && typeof lat === 'number' && typeof lng === 'number') {
            locationService.reverseGeocode(lat, lng)
                .then(info => {
                    const label = [info.city, info.state].filter(Boolean).join(', ')
                        || `${info.lat.toFixed(4)}, ${info.lng.toFixed(4)}`;
                    setEventData(prev => ({ ...prev, location: label }));
                })
                .catch(() => { /* ignore */ });
        }
    }, [isEditMode, eventData.location, eventData.coordinates, setEventData]);

    useEffect(() => {
        if (!hasExternalRentalField) {
            return;
        }
        if (eventData.eventType !== 'EVENT') {
            setValue('eventType', 'EVENT', { shouldDirty: true, shouldValidate: true });
        }
        if (eventData.noFixedEndDateTime) {
            setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.eventType, eventData.noFixedEndDateTime, hasExternalRentalField, setValue]);

    const leagueError = errors.leagueSlots ? 'Please resolve schedule timeslot issues before submitting.' : null;

    useEffect(() => {
        if (isEditMode || !organization) {
            return;
        }
        if (refsPrefilledRef.current) {
            return;
        }
        const orgRefIds = organization.refIds ?? [];
        const orgReferees = organization.referees ?? [];
        if (orgRefIds.length || orgReferees.length) {
            setEventData((prev) => ({
                ...prev,
                refereeIds: orgRefIds,
                referees: orgReferees.length ? orgReferees : prev.referees,
            }));
            refsPrefilledRef.current = true;
        }
    }, [organization, isEditMode, setEventData]);

    // Launches the Stripe onboarding flow before allowing event owners to set paid pricing.
    const handleConnectStripe = async () => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;
        try {
            setConnectingStripe(true);
            const origin = window.location.origin;
            const refreshUrl = `${origin}/discover?stripe=refresh`;
            const returnUrl = `${origin}/discover?stripe=return`;
            const result = await paymentService.connectStripeAccount({
                user: currentUser,
                refreshUrl,
                returnUrl,
            });
            if (result?.onboardingUrl) {
                window.location.href = result.onboardingUrl;
            }
        } catch (error) {
            console.error('Failed to connect Stripe account:', error);
        } finally {
            setConnectingStripe(false);
        }
    };

    // Builds the event payload used for draft updates.
    const buildDraftEvent = useCallback((formValues?: EventFormValues): Partial<Event> => {
        const source = formValues ?? eventData;
        const finalImageId = source.imageId;
        const sportSelection = source.sportConfig;
        const sportId = (sportSelection?.$id && String(sportSelection.$id)) || (source.sportId?.trim() || '');
        const baseCoordinates: [number, number] = source.coordinates;
        const toIdList = <T extends { $id?: string | undefined }>(items: T[] | undefined): string[] => {
            if (!Array.isArray(items)) {
                return [];
            }
            return items
                .map((item) => {
                    if (item && typeof item === 'object' && item.$id) {
                        return String(item.$id);
                    }
                    return '';
                })
                .filter((id): id is string => id.length > 0);
        };

        const pricingEnabled = hasStripeAccount;
        const eventPriceDollars = pricingEnabled ? Math.max(0, source.price || 0) : 0;
        const eventAllowPaymentPlans = pricingEnabled ? Boolean(source.allowPaymentPlans) : false;
        const installmentAmountsCents = eventAllowPaymentPlans
            ? normalizeInstallmentCents(source.installmentAmounts)
            : [];
        const minAge = normalizeNumber(source.minAge);
        const maxAge = normalizeNumber(source.maxAge);
        const sportInput = resolveSportInput(source.sportConfig ?? source.sportId);
        const divisionReferenceDate = parseDateValue(source.start ?? null);
        const normalizedDivisionDetails = (() => {
            const fromDetails = Array.isArray(source.divisionDetails)
                ? source.divisionDetails
                    .map((entry) => normalizeDivisionDetailEntry(
                        entry,
                        source.$id,
                        sportInput,
                        divisionReferenceDate,
                        false,
                    ))
                    .filter((entry): entry is DivisionDetailForm => Boolean(entry))
                : [];
            if (fromDetails.length) {
                return fromDetails;
            }
            const fromIds = normalizeDivisionKeys(source.divisions).map((divisionId) => {
                const inferred = inferDivisionDetails({
                    identifier: divisionId,
                    sportInput,
                });
                const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(sportInput);
                const composite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
                const skillDivisionTypeId = composite?.skillDivisionTypeId
                    ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
                const ageDivisionTypeId = composite?.ageDivisionTypeId
                    ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
                const skillDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    skillDivisionTypeId,
                    'SKILL',
                )?.name ?? defaultsForSport.skillDivisionTypeName;
                const ageDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    ageDivisionTypeId,
                    'AGE',
                )?.name ?? defaultsForSport.ageDivisionTypeName;
                const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
                const divisionTypeName = buildDivisionTypeCompositeName(skillDivisionTypeName, ageDivisionTypeName);
                const token = buildDivisionToken({
                    gender: inferred.gender,
                    ratingType: 'SKILL',
                    divisionTypeId,
                });
                return applyDivisionAgeCutoff({
                    id: divisionId,
                    key: token,
                    kind: 'LEAGUE',
                    name: buildDivisionName({ gender: inferred.gender, divisionTypeName }),
                    divisionTypeId,
                    divisionTypeName,
                    ratingType: 'SKILL',
                    gender: inferred.gender,
                    skillDivisionTypeId,
                    skillDivisionTypeName,
                    ageDivisionTypeId,
                    ageDivisionTypeName,
                    price: eventPriceDollars,
                    maxParticipants: Math.max(2, Math.trunc(source.maxParticipants || 2)),
                    playoffTeamCount: Number.isFinite(source.leagueData?.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined,
                    playoffPlacementDivisionIds: [],
                    allowPaymentPlans: eventAllowPaymentPlans,
                    installmentCount: eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0,
                    installmentDueDates: eventAllowPaymentPlans ? [...(source.installmentDueDates || [])] : [],
                    installmentAmounts: eventAllowPaymentPlans
                        ? (source.installmentAmounts || []).map((value) => Math.max(0, Number(value) || 0))
                        : [],
                    sportId: sportInput || undefined,
                    fieldIds: [],
                } satisfies DivisionDetailForm, sportInput, divisionReferenceDate);
            });
            if (fromIds.length) {
                return fromIds;
            }
            return buildDefaultDivisionDetailsForSport(
                source.$id,
                source.sportConfig ?? source.sportId,
                divisionReferenceDate,
            );
        })();
        const normalizedDivisionKeys = (() => {
            const normalized = normalizeDivisionKeys(normalizedDivisionDetails.map((detail) => detail.id));
            if (normalized.length) {
                return normalized;
            }
            return normalizeDivisionKeys(source.divisions);
        })();
        const splitLeaguePlayoffDivisions = Boolean(
            source.eventType === 'LEAGUE'
            && source.leagueData.includePlayoffs
            && source.splitLeaguePlayoffDivisions,
        );
        const normalizedPlayoffDivisionDetails = splitLeaguePlayoffDivisions
            ? (source.playoffDivisionDetails || [])
                .map((entry) => normalizePlayoffDivisionDetailEntry(entry, source.$id, source.playoffData))
                .filter((entry): entry is PlayoffDivisionDetailForm => Boolean(entry))
            : [];
        const slotDivisionLookupForDraft = buildSlotDivisionLookup(
            normalizedDivisionDetails,
            splitLeaguePlayoffDivisions ? normalizedPlayoffDivisionDetails : [],
        );
        const singleDivisionEnabled = Boolean(source.singleDivision);
        const normalizedDivisionDetailsForPayload = normalizedDivisionDetails.map((detail) => ({
            ...detail,
            kind: 'LEAGUE' as const,
            price: pricingEnabled
                ? (
                    singleDivisionEnabled
                        ? eventPriceDollars
                        : Math.max(0, detail.price || 0)
                )
                : 0,
            maxParticipants: singleDivisionEnabled
                ? Math.max(2, Math.trunc(source.maxParticipants || 2))
                : Math.max(2, Math.trunc(detail.maxParticipants || source.maxParticipants || 2)),
            playoffTeamCount: (() => {
                if (source.eventType !== 'LEAGUE' || !source.leagueData.includePlayoffs) {
                    return undefined;
                }
                if (singleDivisionEnabled && !splitLeaguePlayoffDivisions) {
                    return Number.isFinite(source.leagueData.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined;
                }
                return Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined;
            })(),
            playoffPlacementDivisionIds: (() => {
                if (!splitLeaguePlayoffDivisions) {
                    return [] as string[];
                }
                const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                    : 0;
                const mapping = normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds);
                if (playoffTeamCount <= 0) {
                    return mapping;
                }
                return mapping.slice(0, playoffTeamCount);
            })(),
            allowPaymentPlans: pricingEnabled
                ? (
                    singleDivisionEnabled
                        ? eventAllowPaymentPlans
                        : Boolean(detail.allowPaymentPlans)
                )
                : false,
            installmentCount: (() => {
                if (!pricingEnabled) {
                    return 0;
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0;
                }
                if (!detail.allowPaymentPlans) {
                    return 0;
                }
                return detail.installmentCount || detail.installmentAmounts.length || 0;
            })(),
            installmentAmounts: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans
                        ? (source.installmentAmounts || []).map((value) => Math.max(0, Number(value) || 0))
                        : [];
                }
                if (!detail.allowPaymentPlans) {
                    return [];
                }
                return (detail.installmentAmounts || []).map((value) => Math.max(0, Number(value) || 0));
            })(),
            installmentDueDates: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans ? [...(source.installmentDueDates || [])] : [];
                }
                if (!detail.allowPaymentPlans) {
                    return [];
                }
                return Array.isArray(detail.installmentDueDates) ? [...detail.installmentDueDates] : [];
            })(),
        }));

        const draft: Partial<Event> = {
            $id: activeEditingEvent?.$id,
            hostId: source.hostId || currentUser?.$id,
            name: source.name.trim(),
            description: source.description,
            location: source.location,
            start: source.start,
            end: source.end,
            eventType: source.eventType,
            noFixedEndDateTime: (
                source.eventType === 'LEAGUE' || source.eventType === 'TOURNAMENT'
            ) ? Boolean(source.noFixedEndDateTime) : false,
            state: isEditMode ? activeEditingEvent?.state ?? 'PUBLISHED' : 'UNPUBLISHED',
            sportId: sportId || undefined,
            // Backend stores price in cents; convert dollars from the form to cents before saving.
            price: Math.round(eventPriceDollars * 100),
            minAge,
            maxAge,
            allowPaymentPlans: eventAllowPaymentPlans,
            installmentCount: eventAllowPaymentPlans
                ? source.installmentCount || installmentAmountsCents.length || 0
                : undefined,
            installmentAmounts: eventAllowPaymentPlans ? installmentAmountsCents : [],
            installmentDueDates: eventAllowPaymentPlans ? source.installmentDueDates : [],
            allowTeamSplitDefault: source.allowTeamSplitDefault,
            maxParticipants: source.maxParticipants,
            teamSizeLimit: source.teamSizeLimit,
            teamSignup: source.teamSignup,
            singleDivision: source.singleDivision,
            splitLeaguePlayoffDivisions,
            registrationByDivisionType: source.registrationByDivisionType,
            divisions: normalizedDivisionKeys,
            divisionDetails: normalizedDivisionDetailsForPayload.map((detail) => ({
                ...detail,
                // Persist division pricing in cents to match event-level pricing semantics.
                price: Math.round(Math.max(0, detail.price || 0) * 100),
                maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || 2)),
                playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined,
                allowPaymentPlans: Boolean(detail.allowPaymentPlans),
                installmentCount: detail.allowPaymentPlans
                    ? (detail.installmentCount || detail.installmentAmounts.length || 0)
                    : 0,
                installmentAmounts: detail.allowPaymentPlans
                    ? normalizeInstallmentCents(detail.installmentAmounts)
                    : [],
                installmentDueDates: detail.allowPaymentPlans
                    ? (Array.isArray(detail.installmentDueDates)
                        ? detail.installmentDueDates
                        : [])
                    : [],
            })),
            playoffDivisionDetails: normalizedPlayoffDivisionDetails.map((division) => ({
                id: division.id,
                key: division.key,
                kind: 'PLAYOFF' as const,
                name: division.name,
                maxParticipants: Math.max(2, Math.trunc(division.maxParticipants || 2)),
                playoffConfig: buildTournamentConfig(division.playoffConfig),
            })),
            cancellationRefundHours: source.cancellationRefundHours,
            registrationCutoffHours: source.registrationCutoffHours,
            requiredTemplateIds: source.requiredTemplateIds,
            imageId: finalImageId,
            seedColor: source.seedColor,
            waitListIds: source.waitList,
            freeAgentIds: source.freeAgents,
            teams: source.teams,
            players: source.players,
            referees: source.referees,
            refereeIds: source.refereeIds,
            assistantHostIds: Array.from(
                new Set(
                    (source.assistantHostIds || [])
                        .map((id) => String(id))
                        .filter((id) => id.length > 0 && id !== source.hostId),
                ),
            ),
            doTeamsRef: source.doTeamsRef,
            coordinates: baseCoordinates,
        };

        const organizationId = source.organizationId || organizationHostedEventId || undefined;

        if (!shouldManageLocalFields) {
            let fieldsToInclude = fieldsReferencedInSlots;
            if (!fieldsToInclude.length && hasImmutableFields) {
                fieldsToInclude = immutableFields;
            }
            if (isOrganizationManagedEvent) {
                const defaultOrganizationFieldIds = toIdList(fields.length ? fields : fieldsToInclude);
                const fieldIds = source.eventType === 'EVENT'
                    ? resolveOrganizationEventFieldIds(source.selectedFieldIds, defaultOrganizationFieldIds)
                    : toIdList(fieldsToInclude);
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            } else if (fieldsToInclude.length) {
                draft.fields = fieldsToInclude.map(field => ({ ...field }));
                const fieldIds = toIdList(fieldsToInclude);
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            }
            if ((!draft.fieldIds || draft.fieldIds.length === 0) && rentalPurchase?.fieldId) {
                draft.fieldIds = [rentalPurchase.fieldId];
            }
        } else {
            const localFields = hasImmutableFields ? immutableFields : fields;
            const fallbackDivisions = defaultFieldDivisionKeys(normalizedDivisionKeys);
            if (localFields.length) {
                draft.fields = localFields.map((field, idx) => ({
                    ...field,
                    fieldNumber: field.fieldNumber ?? idx + 1,
                    divisions: (() => {
                        const normalized = normalizeDivisionKeys(field.divisions);
                        return normalized.length ? normalized : fallbackDivisions;
                    })(),
                }));
                const fieldIds = toIdList(localFields);
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            }
        }

        const normalizedFieldIds = Array.isArray(draft.fieldIds)
            ? Array.from(new Set(draft.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
            : [];
        if (normalizedFieldIds.length) {
            draft.fieldIds = normalizedFieldIds;
        }
        delete (draft as Partial<Event>).divisionFieldIds;

        if (organizationId) {
            draft.organizationId = organizationId;
        }

        if (!isEditMode) {
            if (currentUser?.$id) {
                draft.hostId = currentUser.$id;
            }
            draft.waitListIds = [];
            draft.freeAgentIds = [];
            draft.players = joinAsParticipant && currentUser ? [currentUser] : [];
            draft.userIds = joinAsParticipant && currentUser?.$id ? [currentUser.$id] : [];
            if (shouldProvisionFields) {
                draft.fieldCount = fieldCount;
            }
        }

        if (hasImmutableTimeSlots) {
            draft.timeSlots = immutableTimeSlots.map((slot) => {
                const slotDivisions = normalizeSlotDivisionIdsWithLookup(slot.divisions, slotDivisionLookupForDraft);
                return {
                    ...slot,
                    divisions: singleDivisionEnabled
                        ? normalizedDivisionKeys
                        : (slotDivisions.length ? slotDivisions : normalizedDivisionKeys),
                };
            });
            const slotIds = toIdList(immutableTimeSlots);
            if (slotIds.length) {
                draft.timeSlotIds = slotIds;
            }
        }

        const teamIds = toIdList(draft.teams as Team[] | undefined);
        if (teamIds.length) {
            draft.teamIds = teamIds;
        }

        const userIds = toIdList(draft.players as UserData[] | undefined);
        if (userIds.length && !draft.userIds?.length) {
            draft.userIds = userIds;
        }

        if (source.eventType === 'LEAGUE') {
            if (source.leagueScoringConfig?.$id) {
                draft.leagueScoringConfigId = source.leagueScoringConfig.$id;
            }
            if (source.leagueScoringConfig) {
                draft.leagueScoringConfig = source.leagueScoringConfig;
            }
        } else {
            draft.leagueScoringConfigId = undefined;
            draft.leagueScoringConfig = undefined;
        }

        if (source.eventType === 'LEAGUE') {
            const restTime = normalizeNumber(source.leagueData.restTimeMinutes);
            const requiresSets = Boolean(source.sportConfig?.usePointsPerSetWin);
            const setsPerMatchValue = source.leagueData.setsPerMatch ?? 1;
            const normalizedPoints = requiresSets
                ? (() => {
                    const base = Array.isArray(source.leagueData.pointsToVictory)
                        ? source.leagueData.pointsToVictory.slice(0, setsPerMatchValue)
                        : [];
                    while (base.length < setsPerMatchValue) base.push(21);
                    return base;
                })()
                : undefined;

            draft.gamesPerOpponent = source.leagueData.gamesPerOpponent;
            draft.includePlayoffs = source.leagueData.includePlayoffs;
            draft.playoffTeamCount = source.leagueData.includePlayoffs
                ? (Number.isFinite(source.leagueData.playoffTeamCount)
                    ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                    : undefined)
                : undefined;

            if (requiresSets) {
                draft.usesSets = true;
                draft.setDurationMinutes = normalizeNumber(source.leagueData.setDurationMinutes) ?? 20;
                draft.setsPerMatch = setsPerMatchValue;
                draft.pointsToVictory = normalizedPoints;
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            } else {
                draft.usesSets = false;
                draft.matchDurationMinutes = normalizeNumber(source.leagueData.matchDurationMinutes, 60) ?? 60;
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            }

            if (source.leagueData.includePlayoffs && source.playoffData && !splitLeaguePlayoffDivisions) {
                draft.doubleElimination = source.playoffData.doubleElimination;
                draft.winnerSetCount = source.playoffData.winnerSetCount;
                draft.loserSetCount = source.playoffData.loserSetCount;
                draft.winnerBracketPointsToVictory = source.playoffData.winnerBracketPointsToVictory;
                draft.loserBracketPointsToVictory = source.playoffData.loserBracketPointsToVictory;
            }

        }

        if (source.eventType === 'TOURNAMENT') {
            draft.doubleElimination = source.tournamentData.doubleElimination;
            draft.winnerSetCount = source.tournamentData.winnerSetCount;
            draft.loserSetCount = source.tournamentData.loserSetCount;
            draft.winnerBracketPointsToVictory = source.tournamentData.winnerBracketPointsToVictory;
            draft.loserBracketPointsToVictory = source.tournamentData.loserBracketPointsToVictory;
            draft.prize = source.tournamentData.prize;
            draft.fieldCount = source.tournamentData.fieldCount;
            draft.restTimeMinutes = normalizeNumber(source.tournamentData.restTimeMinutes, 0) ?? 0;
        }

        if (supportsScheduleSlots(source.eventType)) {
            const slotDocuments = source.leagueSlots
                .filter((slot) => {
                    if (!normalizeSlotFieldIds(slot).length) {
                        return false;
                    }
                    if (slot.repeating === false) {
                        const slotStart = parseLocalDateTime(slot.startDate ?? null);
                        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
                        return Boolean(slotStart && slotEnd && slotEnd.getTime() > slotStart.getTime());
                    }
                    return normalizeWeekdays(slot).length > 0
                        && typeof slot.startTimeMinutes === 'number'
                        && typeof slot.endTimeMinutes === 'number';
                })
                .map((slot) => {
                    const slotId = slot.$id || slot.key;
                    const repeating = slot.repeating !== false;
                    const slotFieldIds = normalizeSlotFieldIds(slot);
                    const slotDivisionKeys = normalizeSlotDivisionIdsWithLookup(
                        slot.divisions,
                        slotDivisionLookupForDraft,
                    );
                    const explicitStart = parseLocalDateTime(slot.startDate ?? null);
                    const explicitEnd = parseLocalDateTime(slot.endDate ?? null);
                    const fallbackStart = parseLocalDateTime(source.start ?? null);
                    const nonRepeatingDay = explicitStart
                        ? ((explicitStart.getDay() + 6) % 7)
                        : fallbackStart
                            ? ((fallbackStart.getDay() + 6) % 7)
                            : 0;
                    const normalizedDays = repeating
                        ? normalizeWeekdays(slot)
                        : [nonRepeatingDay];
                    const startTimeMinutes = repeating
                        ? Number(slot.startTimeMinutes)
                        : (explicitStart
                            ? explicitStart.getHours() * 60 + explicitStart.getMinutes()
                            : Number(slot.startTimeMinutes));
                    const endTimeMinutes = repeating
                        ? Number(slot.endTimeMinutes)
                        : (explicitEnd
                            ? explicitEnd.getHours() * 60 + explicitEnd.getMinutes()
                            : Number(slot.endTimeMinutes));
                    const serialized: TimeSlot = {
                        $id: slotId,
                        dayOfWeek: normalizedDays[0] as TimeSlot['dayOfWeek'],
                        daysOfWeek: normalizedDays as TimeSlot['daysOfWeek'],
                        scheduledFieldId: slotFieldIds[0],
                        scheduledFieldIds: slotFieldIds,
                        divisions: singleDivisionEnabled
                            ? normalizedDivisionKeys
                            : (slotDivisionKeys.length ? slotDivisionKeys : normalizedDivisionKeys),
                        startTimeMinutes,
                        endTimeMinutes,
                        repeating,
                    };

                    if (!repeating) {
                        if (explicitStart) {
                            serialized.startDate = formatLocalDateTime(explicitStart);
                        }
                        if (explicitEnd) {
                            serialized.endDate = formatLocalDateTime(explicitEnd);
                        }
                    } else {
                        const slotStartDateOverride = formatLocalDateTime(slot.startDate ?? null);
                        if (slotStartDateOverride) {
                            serialized.startDate = slotStartDateOverride;
                        } else if (source.start) {
                            serialized.startDate = source.start;
                        }
                        if (source.end) {
                            serialized.endDate = source.end;
                        }
                    }

                    return serialized;
                });

            if (slotDocuments.length) {
                draft.timeSlots = slotDocuments;
                const slotIds = slotDocuments
                    .map((slot) => (typeof slot.$id === 'string' ? slot.$id : null))
                    .filter((id): id is string => Boolean(id));
                if (slotIds.length) {
                    draft.timeSlotIds = slotIds;
                }
                const slotFieldIds = Array.from(
                    new Set(
                        slotDocuments.flatMap((slot) => normalizeSlotFieldIds(slot)),
                    ),
                );
                if (slotFieldIds.length) {
                    draft.fieldIds = slotFieldIds;
                }
            }
        }

        return draft;
    }, [
        activeEditingEvent?.state,
        activeEditingEvent?.$id,
        eventData,
        fields,
        fieldsReferencedInSlots,
        hasImmutableFields,
        hasImmutableTimeSlots,
        hasStripeAccount,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        isOrganizationManagedEvent,
        organizationHostedEventId,
        currentUser,
        joinAsParticipant,
        rentalPurchase,
        shouldManageLocalFields,
        shouldProvisionFields,
        fieldCount,
    ]);

    const getDraftSnapshot = useCallback(
        () => buildDraftEvent(getValues()),
        [buildDraftEvent, getValues],
    );

    const validateDraft = useCallback(
        () => trigger(),
        [trigger],
    );

    useImperativeHandle(
        ref,
        () => ({
            getDraft: getDraftSnapshot,
            validate: validateDraft,
        }),
        [getDraftSnapshot, validateDraft],
    );

    // Syncs the selected event image with component state after uploads or picker changes.
    const handleImageChange = (fileId: string, _url: string) => {
        if (isImmutableField('imageId')) {
            return;
        }
        setValue('imageId', fileId, { shouldDirty: true, shouldValidate: true });
    };

    const allowImageEdit = !isImmutableField('imageId');
    const isLocationImmutable = isImmutableField('location') || isImmutableField('coordinates') || hasExternalRentalField;
    const isSchedulableEventType = eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT';
    const usesRentalSlots = hasExternalRentalField || hasImmutableTimeSlots || Boolean(rentalPurchase?.fieldId);
    const showScheduleConfig = isSchedulableEventType || usesRentalSlots;
    const sectionNavItems = useMemo(
        () => [
            { id: 'section-basic-information', label: 'Basic Information', visible: true },
            { id: 'section-event-details', label: 'Event Details', visible: true },
            { id: 'section-referees', label: 'Referees', visible: true },
            { id: 'section-division-settings', label: 'Division Settings', visible: true },
            { id: 'section-league-scoring-config', label: 'League Scoring Config', visible: eventData.eventType === 'LEAGUE' },
            { id: 'section-schedule-config', label: 'Schedule Config', visible: showScheduleConfig },
        ],
        [eventData.eventType, showScheduleConfig],
    );
    const visibleSectionNavItems = useMemo(
        () => sectionNavItems.filter((item) => item.visible),
        [sectionNavItems],
    );
    const [activeSectionId, setActiveSectionId] = useState<string>(visibleSectionNavItems[0]?.id ?? 'section-basic-information');
    const sectionNavTargetRef = useRef<string | null>(null);
    const sectionNavSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const firstVisibleSection = visibleSectionNavItems[0]?.id;
        if (!firstVisibleSection) return;
        if (!visibleSectionNavItems.some((item) => item.id === activeSectionId)) {
            setActiveSectionId(firstVisibleSection);
        }
    }, [activeSectionId, visibleSectionNavItems]);

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;

        const handleScroll = () => {
            const pendingTarget = sectionNavTargetRef.current;
            if (pendingTarget) {
                const pendingElement = document.getElementById(pendingTarget);
                if (pendingElement) {
                    const distanceFromAnchor = Math.abs(
                        pendingElement.getBoundingClientRect().top - SECTION_SCROLL_OFFSET,
                    );
                    if (distanceFromAnchor > 36) {
                        return;
                    }
                }
                setActiveSectionId((previous) => (previous === pendingTarget ? previous : pendingTarget));
                return;
            }
            let currentSection = visibleSectionNavItems[0]?.id;
            for (const section of visibleSectionNavItems) {
                const sectionElement = document.getElementById(section.id);
                if (!sectionElement) continue;
                const top = sectionElement.getBoundingClientRect().top;
                if (top - SECTION_SCROLL_OFFSET <= 0) {
                    currentSection = section.id;
                } else {
                    break;
                }
            }
            if (currentSection) {
                setActiveSectionId((previous) => (previous === currentSection ? previous : currentSection));
            }
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [open, visibleSectionNavItems]);

    useEffect(() => {
        return () => {
            if (sectionNavSettleTimerRef.current) {
                clearTimeout(sectionNavSettleTimerRef.current);
            }
        };
    }, []);

    const scrollToSection = useCallback((sectionId: string) => {
        const target = document.getElementById(sectionId);
        if (!target) return;
        if (sectionNavSettleTimerRef.current) {
            clearTimeout(sectionNavSettleTimerRef.current);
        }
        sectionNavTargetRef.current = sectionId;
        setActiveSectionId(sectionId);
        const nextTop = target.getBoundingClientRect().top + window.scrollY - SECTION_SCROLL_OFFSET;
        const scrollTop = Math.max(nextTop, 0);
        const settleMs = Math.min(1600, Math.max(700, Math.abs(window.scrollY - scrollTop) * 0.9));
        window.scrollTo({ top: scrollTop, behavior: 'smooth' });
        sectionNavSettleTimerRef.current = setTimeout(() => {
            sectionNavTargetRef.current = null;
            sectionNavSettleTimerRef.current = null;
        }, settleMs);
    }, []);

    const sheetContent = (
        <div className="mx-auto max-w-[1320px] space-y-6">
            <div className="p-2">
                <div className="grid grid-cols-1 gap-8 xl:grid-cols-[240px_minmax(0,1fr)]">
                    <aside className="hidden xl:block">
                        <div className="sticky top-6 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
                            <Text fw={700} size="sm" c="gray.8" mb="xs">
                                Sections
                            </Text>
                            <Text size="xs" c="dimmed" mb="md">
                                Jump to any section. Changes are preserved as you move.
                            </Text>
                            <div className="space-y-1">
                                {visibleSectionNavItems.map((section) => {
                                    const isActive = activeSectionId === section.id;
                                    return (
                                        <button
                                            key={section.id}
                                            type="button"
                                            onClick={() => scrollToSection(section.id)}
                                            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                                                isActive
                                                    ? 'bg-slate-900 text-white shadow-sm'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            {section.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </aside>

                    <div className="min-w-0">
                        <div className="mb-4 xl:hidden overflow-x-auto">
                            <div className="flex min-w-max gap-2 pb-1">
                                {visibleSectionNavItems.map((section) => {
                                    const isActive = activeSectionId === section.id;
                                    return (
                                        <button
                                            key={`mobile-${section.id}`}
                                            type="button"
                                            onClick={() => scrollToSection(section.id)}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                                isActive
                                                    ? 'border-slate-900 bg-slate-900 text-white'
                                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            {section.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="mx-auto w-full max-w-[1000px] p-6">
                            <form id={formId} className="space-y-8">
                        {/* Basic Information */}
                        <Paper
                            id="section-basic-information"
                            shadow="xs"
                            radius="md"
                            withBorder
                            p="lg"
                            className="scroll-mt-28 bg-gray-50"
                        >
                            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                            <div className="mb-6">
                                <div className="block text-sm font-medium mb-2">Event Image</div>
                                <ImageUploader
                                    currentImageUrl={selectedImageUrl}
                                    className="w-full max-w-md"
                                    placeholder="Select event image"
                                    onChange={allowImageEdit ? handleImageChange : undefined}
                                    readOnly={!allowImageEdit}
                                />
                                {errors.imageId && (
                                    <p className="text-red-600 text-sm mt-1">{errors.imageId.message as string}</p>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
                                <TextInput
                                    label="Event Name"
                                    withAsterisk
                                    disabled={isImmutableField('name')}
                                    placeholder="Enter event name"
                                    error={errors.name?.message as string | undefined}
                                    maw={520}
                                    maxLength={MAX_EVENT_NAME_LENGTH}
                                    className="md:col-span-6"
                                    {...register('name', { required: 'Event name is required' })}
                                />

                                <div className="md:col-span-6">
                                    <Controller
                                        name="sportId"
                                        control={control}
                                        rules={{ required: 'Sport is required' }}
                                        render={({ field, fieldState }) => (
                                            <MantineSelect
                                                label="Sport"
                                                placeholder={sportsLoading ? 'Loading sports...' : 'Select a sport'}
                                                data={sportOptions}
                                                value={field.value || null}
                                                comboboxProps={sharedComboboxProps}
                                                disabled={isImmutableField('sport') || sportsLoading}
                                                onChange={(value) => {
                                                    if (isImmutableField('sport')) return;
                                                    const next = (value || '').trim();
                                                    if (next === (field.value || '').trim()) {
                                                        return;
                                                    }
                                                    field.onChange(next);
                                                }}
                                                searchable
                                                nothingFoundMessage={sportsLoading ? 'Loading sports...' : 'No sports found'}
                                                rightSection={sportsLoading ? <Loader size="xs" /> : undefined}
                                                error={fieldState.error?.message}
                                                withAsterisk
                                                maw={360}
                                            />
                                        )}
                                    />
                                </div>
                            </div>

                            {sportsError && (
                                <Alert color="red" radius="md" mt="sm">
                                    Unable to load sports at the moment. Please refresh the page and try again.
                                </Alert>
                            )}

                            <Textarea
                                label="Description"
                                disabled={isImmutableField('description')}
                                placeholder="Describe your event..."
                                autosize
                                minRows={3}
                                className="mt-4"
                                maxLength={MAX_DESCRIPTION_LENGTH}
                                {...register('description')}
                            />

                        </Paper>

                        {/* Event Details */}
                        <Paper
                            id="section-event-details"
                            shadow="xs"
                            radius="md"
                            withBorder
                            p="lg"
                            className="scroll-mt-28 bg-gray-50"
                        >
                            <h3 className="text-lg font-semibold mb-4">Event Details</h3>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4 md:items-end">
                                <div className="md:col-span-3">
                                    <Controller
                                        name="eventType"
                                        control={control}
                                        rules={{ required: true }}
                                        render={({ field }) => (
                                            <MantineSelect
                                                label="Event Type"
                                                data={eventTypeOptions}
                                                value={field.value}
                                                comboboxProps={sharedComboboxProps}
                                                disabled={isImmutableField('eventType') || hasExternalRentalField}
                                                onChange={(value) => {
                                                    if (isImmutableField('eventType')) return;
                                                    if (!value) return;
                                                    clearErrors('leagueSlots');
                                                    const nextType = value as EventType;
                                                    const enforcingTeamSettings = nextType === 'LEAGUE' || nextType === 'TOURNAMENT';
                                                    field.onChange(nextType);
                                                    if (enforcingTeamSettings) {
                                                        setValue('teamSignup', true, { shouldDirty: true });
                                                        setValue('singleDivision', true, { shouldDirty: true, shouldValidate: true });
                                                        setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
                                                    } else {
                                                        setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
                                                        const parsedStart = parseLocalDateTime(getValues('start'));
                                                        const parsedEnd = parseLocalDateTime(getValues('end'));
                                                        if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
                                                            const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
                                                            setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
                                                        }
                                                    }
                                                }}
                                                maw={320}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <Controller
                                        name="maxParticipants"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <NumberInput
                                                label={eventData.singleDivision
                                                    ? (eventData.teamSignup ? 'Max Teams' : 'Max Participants')
                                                    : (eventData.teamSignup ? 'Default Max Teams' : 'Default Max Participants')}
                                                min={2}
                                                max={MAX_STANDARD_NUMBER}
                                                value={field.value}
                                                maw={220}
                                                clampBehavior="strict"
                                                disabled={isImmutableField('maxParticipants')}
                                                onChange={(val) => {
                                                    if (isImmutableField('maxParticipants')) return;
                                                    field.onChange(Number(val) || 10);
                                                }}
                                                error={fieldState.error?.message as string | undefined}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <Controller
                                        name="teamSizeLimit"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <NumberInput
                                                label="Team Size Limit"
                                                min={1}
                                                max={MAX_STANDARD_NUMBER}
                                                value={field.value}
                                                maw={220}
                                                clampBehavior="strict"
                                                disabled={isImmutableField('teamSizeLimit')}
                                                onChange={(val) => {
                                                    if (isImmutableField('teamSizeLimit')) return;
                                                    field.onChange(Number(val) || 2);
                                                }}
                                                error={fieldState.error?.message as string | undefined}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <AnimatedSection in={eventData.eventType === 'LEAGUE'} className="rounded-lg border border-gray-200 bg-white p-3 transition-all duration-200">
                                        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                                            <div>
                                                <Text fw={600} size="sm">Include Playoffs</Text>
                                                <Text size="xs" c="dimmed">
                                                    Enable a playoff bracket for league standings.
                                                </Text>
                                            </div>
                                            <Switch
                                                checked={leagueData.includePlayoffs}
                                                disabled={isImmutableField('includePlayoffs')}
                                                onChange={(event) => {
                                                    if (isImmutableField('includePlayoffs')) return;
                                                    handleIncludePlayoffsToggle(event.currentTarget.checked);
                                                }}
                                            />
                                        </Group>
                                        <AnimatedSection in={leagueData.includePlayoffs} className="mt-3 border-l-2 border-slate-200 pl-3">
                                            <NumberInput
                                                label={eventData.singleDivision ? 'Playoff Team Count' : 'Default Playoff Team Count'}
                                                min={2}
                                                max={MAX_STANDARD_NUMBER}
                                                maw={220}
                                                value={typeof leagueData.playoffTeamCount === 'number' ? leagueData.playoffTeamCount : undefined}
                                                disabled={isImmutableField('playoffTeamCount')}
                                                clampBehavior="strict"
                                                onChange={(value) => {
                                                    if (isImmutableField('playoffTeamCount')) return;
                                                    const numeric = typeof value === 'number' ? value : Number(value);
                                                    setLeagueData((prev) => ({
                                                        ...prev,
                                                        playoffTeamCount: Number.isFinite(numeric) ? Math.max(2, Math.trunc(numeric)) : undefined,
                                                    }));
                                                }}
                                                error={errors.leagueData?.playoffTeamCount?.message as string | undefined}
                                            />
                                            <AnimatedSection in={!eventData.singleDivision}>
                                                <Text size="xs" c="dimmed" mt="xs">
                                                    Existing divisions keep their own playoff counts. This value is used as the default for new divisions.
                                                </Text>
                                            </AnimatedSection>
                                        </AnimatedSection>
                                    </AnimatedSection>
                                </div>
                            </div>

                            <div className="space-y-6 mb-4">
                                <div>
                                    <Controller
                                        name="location"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <LocationSelector
                                                value={field.value}
                                                coordinates={{
                                                    lat: (eventData.coordinates[1] ?? defaultLocation?.coordinates?.[1] ?? 0),
                                                    lng: (eventData.coordinates[0] ?? defaultLocation?.coordinates?.[0] ?? 0),
                                                }}
                                                onChange={(location, lat, lng) => {
                                                    if (isLocationImmutable) return;
                                                    field.onChange(location);
                                                    setValue('coordinates', [lng, lat], { shouldDirty: true, shouldValidate: true });
                                                }}
                                                isValid={!fieldState.error}
                                                disabled={isLocationImmutable}
                                                label="Location"
                                                required
                                                errorMessage={fieldState.error?.message as string | undefined}
                                                showStreetViewControl={false}
                                            />
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:items-end">
                                    <div className="md:col-span-6">
                                        <Controller
                                            name="start"
                                            control={control}
                                            render={({ field }) => (
                                                <DateTimePicker
                                                    label="Start Date & Time"
                                                    valueFormat="MM/DD/YYYY hh:mm A"
                                                    value={parseLocalDateTime(field.value)}
                                                    disabled={isImmutableField('start') || hasExternalRentalField}
                                                    onChange={(val) => {
                                                        if (isImmutableField('start')) return;
                                                        const parsed = parseLocalDateTime(val as Date | string | null);
                                                        if (!parsed) return;
                                                        field.onChange(formatLocalDateTime(parsed));
                                                    }}
                                                    minDate={todaysDate}
                                                    timePickerProps={{
                                                        withDropdown: true,
                                                        format: '12h',
                                                    }}
                                                    popoverProps={sharedPopoverProps}
                                                    style={{ maxWidth: 280 }}
                                                />
                                            )}
                                        />
                                    </div>
                                    <div className="md:col-span-6">
                                        <AnimatedSection in={eventData.eventType === 'EVENT' || supportsNoFixedEndDateTime}>
                                            <Controller
                                                name="end"
                                                control={control}
                                                render={({ field }) => (
                                                    <DateTimePicker
                                                        label={
                                                            supportsNoFixedEndDateTime ? (
                                                                <Group justify="space-between" wrap="nowrap" gap="sm">
                                                                    <Text size="sm" fw={500}>End Date & Time</Text>
                                                                    <Checkbox
                                                                        size="xs"
                                                                        label="No fixed end date/time"
                                                                        checked={Boolean(eventData.noFixedEndDateTime)}
                                                                        disabled={isImmutableField('noFixedEndDateTime') || hasExternalRentalField}
                                                                        onChange={(event) => {
                                                                            if (isImmutableField('noFixedEndDateTime')) return;
                                                                            const checked = event.currentTarget.checked;
                                                                            setValue('noFixedEndDateTime', checked, { shouldDirty: true, shouldValidate: true });
                                                                            if (!checked) {
                                                                                const parsedStart = parseLocalDateTime(getValues('start'));
                                                                                const parsedEnd = parseLocalDateTime(getValues('end'));
                                                                                if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
                                                                                    const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
                                                                                    setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
                                                                                }
                                                                            }
                                                                        }}
                                                                    />
                                                                </Group>
                                                            ) : 'End Date & Time'
                                                        }
                                                        description={
                                                            supportsNoFixedEndDateTime && eventData.noFixedEndDateTime
                                                                ? 'Open-ended scheduling is enabled. Turn this off to enforce a fixed end date/time.'
                                                                : undefined
                                                        }
                                                        valueFormat="MM/DD/YYYY hh:mm A"
                                                        value={parseLocalDateTime(field.value)}
                                                        disabled={
                                                            isImmutableField('end')
                                                            || hasExternalRentalField
                                                            || (supportsNoFixedEndDateTime && eventData.noFixedEndDateTime)
                                                        }
                                                        onChange={(val) => {
                                                            if (isImmutableField('end')) return;
                                                            const parsed = parseLocalDateTime(val as Date | string | null);
                                                            if (!parsed) return;
                                                            field.onChange(formatLocalDateTime(parsed));
                                                        }}
                                                        minDate={parseLocalDateTime(eventData.start) ?? todaysDate}
                                                        timePickerProps={{
                                                            withDropdown: true,
                                                            format: '12h',
                                                        }}
                                                        popoverProps={sharedPopoverProps}
                                                        style={{ maxWidth: 280 }}
                                                    />
                                                )}
                                            />
                                        </AnimatedSection>
                                    </div>
                                </div>
                            </div>

                            <AnimatedSection in={isOrganizationHostedEvent}>
                                <div className="space-y-2">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
                                        <div className="md:col-span-6">
                                            <Controller
                                                name="hostId"
                                                control={control}
                                                render={({ field }) => (
                                                    <MantineSelect
                                                        label="Primary Host"
                                                        placeholder={organizationHostSelectData.length ? 'Select host' : 'No organization hosts available'}
                                                        data={organizationHostSelectData}
                                                        value={field.value ?? null}
                                                        comboboxProps={sharedComboboxProps}
                                                        disabled={isImmutableField('hostId') || organizationHostSelectData.length === 0}
                                                        allowDeselect={false}
                                                        onChange={(value) => {
                                                            if (isImmutableField('hostId')) return;
                                                            if (!value) return;
                                                            field.onChange(value);
                                                            handleHostChange(value);
                                                        }}
                                                        maw={420}
                                                    />
                                                )}
                                            />
                                        </div>
                                        <div className="md:col-span-6">
                                            <Controller
                                                name="assistantHostIds"
                                                control={control}
                                                render={({ field }) => (
                                                    <MantineMultiSelect
                                                        label="Assistant Hosts"
                                                        description="Assistant hosts can edit and reschedule this event."
                                                        placeholder={assistantHostSelectData.length ? 'Select assistant hosts' : 'No additional hosts available'}
                                                        data={assistantHostSelectData}
                                                        value={Array.isArray(field.value) ? field.value : assistantHostValue}
                                                        comboboxProps={sharedComboboxProps}
                                                        disabled={isImmutableField('assistantHostIds') || assistantHostSelectData.length === 0}
                                                        searchable
                                                        clearable
                                                        onChange={(values) => {
                                                            if (isImmutableField('assistantHostIds')) return;
                                                            field.onChange(values);
                                                            handleAssistantHostsChange(values);
                                                        }}
                                                        maw={420}
                                                    />
                                                )}
                                            />
                                        </div>
                                    </div>
                                    <AnimatedSection in={organizationHostSelectData.length === 0}>
                                        <Text size="xs" c="dimmed">
                                            Add organization hosts first to assign event hosts.
                                        </Text>
                                    </AnimatedSection>
                                </div>
                            </AnimatedSection>

                            {/* Pricing and Participant Details */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
                                <div className="md:col-span-12 lg:col-span-6">
                                    <Controller
                                        name="price"
                                        control={control}
                                        render={({ field }) => (
                                            <NumberInput
                                                label={eventData.singleDivision ? 'Price ($)' : 'Default Price ($)'}
                                                min={0}
                                                max={MAX_PRICE_NUMBER}
                                                step={0.01}
                                                value={field.value}
                                                maw={220}
                                                clampBehavior="strict"
                                                onChange={(val) => {
                                                    if (isImmutableField('price')) return;
                                                    field.onChange(Number(val) || 0);
                                                }}
                                                disabled={!hasStripeAccount || isImmutableField('price')}
                                                decimalScale={2}
                                                fixedDecimalScale
                                            />
                                        )}
                                    />

                                    {/* Always show connect Stripe when no account */}
                                    <AnimatedSection in={!hasStripeAccount}>
                                        <div className="mt-2">
                                            <button
                                                type="button"
                                                onClick={handleConnectStripe}
                                                disabled={connectingStripe}
                                                className={`px-4 py-2 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${connectingStripe ? 'bg-blue-500' : 'bg-blue-600 hover:bg-blue-700'}`}
                                            >
                                                {connectingStripe ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className="h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                                                        Connecting…
                                                    </span>
                                                ) : (
                                                    'Connect Stripe Account'
                                                )}
                                            </button>
                                            <p className="text-sm text-gray-600 mt-1">
                                                Connect your Stripe account to enable paid events and set a price.
                                            </p>
                                        </div>
                                    </AnimatedSection>

                                    <p className="text-sm text-gray-500">
                                        {!eventData.singleDivision
                                            ? `Used as the default for new divisions (${eventData.price === 0 ? 'Free' : `$${eventData.price?.toFixed(2)}`})`
                                            : eventData.price === 0
                                                ? 'Free'
                                                : `$${eventData.price?.toFixed(2)}`}
                                    </p>
                                </div>
                            </div>

                            <Controller
                                name="requiredTemplateIds"
                                control={control}
                                render={({ field }) => (
                                    <MantineMultiSelect
                                        label="Required Documents"
                                        placeholder={templatesLoading ? 'Loading templates...' : 'Select templates'}
                                        data={templateOptions}
                                        value={field.value ?? []}
                                        maw={560}
                                        disabled={!organizationId || templatesLoading || isImmutableField('requiredTemplateIds')}
                                        comboboxProps={sharedComboboxProps}
                                        onChange={(vals) => {
                                            if (isImmutableField('requiredTemplateIds')) return;
                                            field.onChange(vals);
                                        }}
                                        clearable
                                        searchable
                                    />
                                )}
                            />
                            <AnimatedSection in={Boolean(templatesError)}>
                                <Text size="sm" c="red">
                                    {templatesError}
                                </Text>
                            </AnimatedSection>
                            <AnimatedSection in={!templatesLoading && Boolean(organizationId) && templateOptions.length === 0}>
                                <Text size="sm" c="dimmed">
                                    No templates yet. Create one in your organization Document Templates tab.
                                </Text>
                            </AnimatedSection>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
                                <div className="md:col-span-4">
                                    <Controller
                                        name="minAge"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <NumberInput
                                                label="Minimum Age"
                                                min={0}
                                                max={MAX_STANDARD_NUMBER}
                                                value={field.value ?? ''}
                                                maw={180}
                                                clampBehavior="strict"
                                                disabled={isImmutableField('minAge')}
                                                onChange={(val) => {
                                                    if (isImmutableField('minAge')) return;
                                                    const next = typeof val === 'number' && Number.isFinite(val) ? val : undefined;
                                                    field.onChange(next);
                                                }}
                                                error={fieldState.error?.message as string | undefined}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="md:col-span-4">
                                    <Controller
                                        name="maxAge"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <NumberInput
                                                label="Maximum Age"
                                                min={0}
                                                max={MAX_STANDARD_NUMBER}
                                                value={field.value ?? ''}
                                                maw={180}
                                                clampBehavior="strict"
                                                disabled={isImmutableField('maxAge')}
                                                onChange={(val) => {
                                                    if (isImmutableField('maxAge')) return;
                                                    const next = typeof val === 'number' && Number.isFinite(val) ? val : undefined;
                                                    field.onChange(next);
                                                }}
                                                error={fieldState.error?.message as string | undefined}
                                            />
                                        )}
                                    />
                                </div>
                                <Text size="xs" c="dimmed" className="md:col-span-12">
                                    Leave age limits blank if anyone can register.
                                </Text>
                                <AnimatedSection
                                    in={typeof eventData.minAge === 'number' || typeof eventData.maxAge === 'number'}
                                    collapseClassName="md:col-span-12"
                                >
                                    <Alert color="yellow" variant="light">
                                        <Text fw={600} size="sm">
                                            Age-restricted event
                                        </Text>
                                        <Text size="sm">
                                            We only check age using the date of birth users enter in their profile. If your event requires an age check (for example, 18+ or 21+), you are responsible for verifying attendees&apos; age at check-in.
                                        </Text>
                                    </Alert>
                                </AnimatedSection>
                            </div>

                            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
                                <Group justify="space-between" align="center" wrap="nowrap" gap="lg">
                                    <div>
                                        <Title order={6}>{eventData.singleDivision ? 'Payment Plans' : 'Default Payment Plan'}</Title>
                                        <Text size="sm" c="dimmed">
                                            {eventData.singleDivision
                                                ? 'Offer installments. Total installment amount must equal event price.'
                                                : 'Set payment-plan defaults for new divisions. Total installment amount must equal the default event price.'}
                                        </Text>
                                    </div>
                                    <Switch
                                        checked={eventData.allowPaymentPlans}
                                        onChange={(e) => {
                                            const next = e.currentTarget.checked;
                                            setValue('allowPaymentPlans', next, { shouldDirty: true, shouldValidate: true });
                                            if (next && (!eventData.installmentAmounts?.length || eventData.installmentAmounts.length === 0)) {
                                                syncInstallmentCount((eventData.installmentCount || 1));
                                            }
                                        }}
                                        disabled={!hasStripeAccount}
                                    />
                                </Group>

                                <AnimatedSection in={eventData.allowPaymentPlans}>
                                    <div className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
                                        <Group align="flex-start" gap="md">
                                            <NumberInput
                                                label={eventData.singleDivision ? 'Installments' : 'Default Installments'}
                                                min={1}
                                                max={MAX_STANDARD_NUMBER}
                                                value={eventData.installmentCount || eventData.installmentAmounts.length || 1}
                                                onChange={(val) => syncInstallmentCount(Number(val) || 1)}
                                                clampBehavior="strict"
                                                maw={180}
                                            />
                                            {eventData.teamSignup && (
                                                <Switch
                                                    checked={eventData.allowTeamSplitDefault}
                                                    onChange={(e) =>
                                                        setValue('allowTeamSplitDefault', e.currentTarget.checked, {
                                                            shouldDirty: true,
                                                            shouldValidate: true,
                                                        })
                                                    }
                                                    label="Allow team bill splitting by default"
                                                />
                                            )}
                                        </Group>

                                        <Stack gap="sm">
                                            {(eventData.installmentAmounts || []).map((amount, idx) => {
                                                const dueDateValue = parseLocalDateTime(
                                                    eventData.installmentDueDates?.[idx] || eventData.start,
                                                );
                                                return (
                                                    <Group key={idx} align="flex-end" gap="sm" wrap="wrap">
                                                        <DateTimePicker
                                                            label={`Installment ${idx + 1} due`}
                                                            value={dueDateValue}
                                                            onChange={(val) => setInstallmentDueDate(idx, val)}
                                                            valueFormat="MM/DD/YYYY hh:mm A"
                                                            timePickerProps={{
                                                                withDropdown: true,
                                                                format: '12h',
                                                            }}
                                                            style={{ flex: '1 1 260px', maxWidth: 280 }}
                                                        />
                                                        <NumberInput
                                                            label="Amount"
                                                            min={0}
                                                            max={MAX_PRICE_NUMBER}
                                                            step={0.01}
                                                            value={amount}
                                                            onChange={(val) => setInstallmentAmount(idx, Number(val) || 0)}
                                                            decimalScale={2}
                                                            fixedDecimalScale
                                                            clampBehavior="strict"
                                                            maw={180}
                                                        />
                                                        {eventData.installmentAmounts.length > 1 && (
                                                            <ActionIcon
                                                                variant="light"
                                                                color="red"
                                                                aria-label="Remove installment"
                                                                onClick={() => removeInstallment(idx)}
                                                            >
                                                                ×
                                                            </ActionIcon>
                                                        )}
                                                    </Group>
                                                );
                                            })}
                                            <Group justify="space-between" align="center">
                                                <Button variant="light" onClick={() => syncInstallmentCount((eventData.installmentAmounts?.length || 0) + 1)}>
                                                    Add installment
                                                </Button>
                                                <Text size="sm" c={Math.round(((eventData.installmentAmounts || []).reduce((s, a) => s + (Number(a) || 0), 0) - eventData.price) * 100) === 0 ? 'dimmed' : 'red'}>
                                                    Installment total: $
                                                    {((eventData.installmentAmounts || []).reduce((s, a) => s + (Number(a) || 0), 0)).toFixed(2)} / $
                                                    {(eventData.price || 0).toFixed(2)}
                                                </Text>
                                            </Group>
                                        </Stack>
                                    </div>
                                </AnimatedSection>
                            </div>

                            {/* Policy Settings */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 md:items-end">
                                <div className="md:col-span-6">
                                    <Controller
                                        name="cancellationRefundHours"
                                        control={control}
                                        render={({ field }) => (
                                            <NumberInput
                                                label="Cancellation Refund (Hours)"
                                                min={0}
                                                max={MAX_STANDARD_NUMBER}
                                                value={field.value}
                                                maw={220}
                                                clampBehavior="strict"
                                                disabled={isImmutableField('cancellationRefundHours')}
                                                onChange={(val) => {
                                                    if (isImmutableField('cancellationRefundHours')) return;
                                                    field.onChange(Number(val) || 24);
                                                }}
                                            />
                                        )}
                                    />
                                </div>
                                <div className="md:col-span-6">
                                    <Controller
                                        name="registrationCutoffHours"
                                        control={control}
                                        render={({ field }) => (
                                            <NumberInput
                                                label="Registration Cutoff (Hours)"
                                                min={0}
                                                max={MAX_STANDARD_NUMBER}
                                                value={field.value}
                                                maw={220}
                                                clampBehavior="strict"
                                                disabled={isImmutableField('registrationCutoffHours')}
                                                onChange={(val) => {
                                                    if (isImmutableField('registrationCutoffHours')) return;
                                                    field.onChange(Number(val) || 2);
                                                }}
                                            />
                                        )}
                                    />
                                </div>
                            </div>

                            {shouldManageLocalFields && (
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <MantineSelect
                                            label="Number of Fields"
                                            placeholder="Select field count"
                                            data={fieldCountOptions}
                                            value={String(fieldCount)}
                                            maw={220}
                                            onChange={(val) => setFieldCount(Number(val) || 1)}
                                            error={errors.fieldCount?.message as string | undefined}
                                            comboboxProps={sharedComboboxProps}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Fields will be created for this event using the names you provide below.
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        {fields.map((field, index) => (
                                            <div key={field.$id} className="grid grid-cols-1 gap-3">
                                                <TextInput
                                                    label={`Field ${field.fieldNumber ?? index + 1} Name`}
                                                    value={field.name ?? ''}
                                                    maw={420}
                                                    maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                                    onChange={(event) => handleLocalFieldNameChange(index, event.currentTarget.value)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </Paper>

                        <Paper
                            id="section-referees"
                            shadow="xs"
                            radius="md"
                            withBorder
                            p="lg"
                            className="scroll-mt-28 bg-gray-50"
                        >
                            <h3 className="text-lg font-semibold mb-4">Referees</h3>
                            <Stack gap="sm">
                                <Controller
                                    name="doTeamsRef"
                                    control={control}
                                    render={({ field }) => (
                                        <Switch
                                            label="Teams provide referees"
                                            description="Allow assigning team referees alongside dedicated refs."
                                            checked={field.value}
                                            onChange={(e) => field.onChange(e?.currentTarget?.checked ?? false)}
                                        />
                                    )}
                                />

                                <div>
                                    <Title order={6} mb="xs">Selected referees</Title>
                                    {eventData.referees.length > 0 ? (
                                        <Stack gap="xs">
                                            {eventData.referees.map((referee) => (
                                                <Group key={referee.$id} justify="space-between" align="center" gap="sm">
                                                    <UserCard user={referee} className="!p-0 !shadow-none flex-1" />
                                                    <Button
                                                        variant="subtle"
                                                        color="red"
                                                        size="xs"
                                                        onClick={() => handleRemoveReferee(referee.$id)}
                                                    >
                                                        Remove
                                                    </Button>
                                                </Group>
                                            ))}
                                        </Stack>
                                    ) : (
                                        <Text size="sm" c="dimmed">No referees selected.</Text>
                                    )}
                                </div>

                                <div>
                                    <Title order={6} mb="xs">Add referees</Title>
                                    <TextInput
                                        value={refereeSearch}
                                        onChange={(e) => handleSearchReferees(e.currentTarget.value)}
                                        placeholder="Search by name or username"
                                        maw={420}
                                        maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                        mb="xs"
                                    />
                                    {refereeError && (
                                        <Text size="xs" c="red" mb="xs">
                                            {refereeError}
                                        </Text>
                                    )}
                                    {refereeSearchLoading ? (
                                        <Text size="sm" c="dimmed">Searching referees...</Text>
                                    ) : refereeSearch.length < 2 ? (
                                        <Text size="sm" c="dimmed">Type at least 2 characters to search.</Text>
                                    ) : refereeResults.length > 0 ? (
                                        <Stack gap="xs">
                                            {refereeResults.map((result) => (
                                                <Group key={result.$id} justify="space-between" align="center" gap="sm">
                                                    <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                                                    <Button size="xs" onClick={() => handleAddReferee(result)}>
                                                        Add
                                                    </Button>
                                                </Group>
                                            ))}
                                        </Stack>
                                    ) : (
                                        <Stack gap="xs">
                                            <Text size="sm" c="dimmed">No referees found. Invite by email below.</Text>
                                        </Stack>
                                    )}
                                </div>

                                <div>
                                    <Title order={6} mb="xs">Invite referees by email</Title>
                                    <Text size="sm" c="dimmed" mb="xs">
                                        Add referees to this event and send them an email invite.
                                    </Text>
                                    <div className="space-y-3">
                                        {refereeInvites.map((invite, index) => (
                                            <Paper key={index} withBorder radius="md" p="sm">
                                                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                                                    <TextInput
                                                        label="First name"
                                                        placeholder="First name"
                                                        value={invite.firstName}
                                                        maw={220}
                                                        maxLength={MAX_SHORT_TEXT_LENGTH}
                                                        onChange={(e) => {
                                                            const next = [...refereeInvites];
                                                            next[index] = { ...invite, firstName: e.currentTarget.value };
                                                            setRefereeInvites(next);
                                                        }}
                                                    />
                                                    <TextInput
                                                        label="Last name"
                                                        placeholder="Last name"
                                                        value={invite.lastName}
                                                        maw={220}
                                                        maxLength={MAX_SHORT_TEXT_LENGTH}
                                                        onChange={(e) => {
                                                            const next = [...refereeInvites];
                                                            next[index] = { ...invite, lastName: e.currentTarget.value };
                                                            setRefereeInvites(next);
                                                        }}
                                                    />
                                                    <TextInput
                                                        label="Email"
                                                        placeholder="name@example.com"
                                                        value={invite.email}
                                                        maw={280}
                                                        maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                                        onChange={(e) => {
                                                            const next = [...refereeInvites];
                                                            next[index] = { ...invite, email: e.currentTarget.value };
                                                            setRefereeInvites(next);
                                                        }}
                                                    />
                                                </SimpleGrid>
                                                {refereeInvites.length > 1 && (
                                                    <Group justify="flex-end" mt="xs">
                                                        <Button
                                                            variant="subtle"
                                                            color="red"
                                                            size="xs"
                                                            onClick={() => {
                                                                setRefereeInvites((prev) => prev.filter((_, i) => i !== index));
                                                            }}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </Group>
                                                )}
                                            </Paper>
                                        ))}
                                        <Group justify="space-between" align="center">
                                            <Button
                                                type="button"
                                                variant="default"
                                                size="lg"
                                                radius="md"
                                                style={{ width: 64, height: 64, fontSize: 28, padding: 0 }}
                                                onClick={() =>
                                                    setRefereeInvites((prev) => [...prev, { firstName: '', lastName: '', email: '' }])
                                                }
                                            >
                                                +
                                            </Button>
                                            <Button
                                                onClick={handleInviteRefereeEmail}
                                                loading={invitingReferees}
                                                disabled={invitingReferees}
                                            >
                                                Add Referees
                                            </Button>
                                        </Group>
                                        {refereeInviteError && (
                                            <Text size="xs" c="red">
                                                {refereeInviteError}
                                            </Text>
                                        )}
                                    </div>
                                </div>
                            </Stack>
                        </Paper>

                        {/* Division Settings */}
                        <Paper
                            id="section-division-settings"
                            shadow="xs"
                            radius="md"
                            withBorder
                            p="lg"
                            className="scroll-mt-28 bg-gray-50"
                        >
                            <h3 className="text-lg font-semibold mb-4">Division Settings</h3>

                            <div className="space-y-4">
                                <Text size="sm" fw={600}>
                                    {eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && eventData.splitLeaguePlayoffDivisions
                                        ? 'League Divisions'
                                        : 'Divisions'}
                                </Text>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
                                    <MantineSelect
                                        label="Gender"
                                        placeholder="Select gender"
                                        data={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                                        value={divisionEditor.gender || null}
                                        className="md:col-span-4"
                                        maw={280}
                                        comboboxProps={sharedComboboxProps}
                                        disabled={isImmutableField('divisions')}
                                        onChange={(value) => updateDivisionEditorSelection({
                                            gender: (value as '' | 'M' | 'F' | 'C') || '',
                                        })}
                                    />
                                    <MantineSelect
                                        label="Skill Division"
                                        placeholder="Select skill division"
                                        data={skillDivisionTypeSelectOptions}
                                        value={divisionEditor.skillDivisionTypeId || null}
                                        className="md:col-span-4"
                                        maw={280}
                                        comboboxProps={sharedComboboxProps}
                                        disabled={isImmutableField('divisions')}
                                        searchable
                                        allowDeselect={false}
                                        onChange={(value) => updateDivisionEditorSelection({
                                            skillDivisionTypeId: value || '',
                                        })}
                                    />
                                    <MantineSelect
                                        label="Age Division"
                                        placeholder="Select age division"
                                        data={ageDivisionTypeSelectOptions}
                                        value={divisionEditor.ageDivisionTypeId || null}
                                        className="md:col-span-4"
                                        maw={320}
                                        comboboxProps={sharedComboboxProps}
                                        disabled={isImmutableField('divisions')}
                                        searchable
                                        allowDeselect={false}
                                        onChange={(value) => updateDivisionEditorSelection({
                                            ageDivisionTypeId: value || '',
                                        })}
                                    />
                                    <TextInput
                                        label="Division Name"
                                        placeholder="Division display name"
                                        value={divisionEditor.name}
                                        className="md:col-span-6"
                                        maw={520}
                                        maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                        disabled={isImmutableField('divisions') || !divisionEditorReady}
                                        onChange={(event) => {
                                            const nextName = event.currentTarget.value;
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                name: nextName,
                                                nameTouched: true,
                                                error: null,
                                            }));
                                        }}
                                    />
                                    <NumberInput
                                        label="Division Price ($)"
                                        min={0}
                                        max={MAX_PRICE_NUMBER}
                                        step={0.01}
                                        value={eventData.singleDivision ? eventData.price : divisionEditor.price}
                                        className="md:col-span-3"
                                        maw={220}
                                        decimalScale={2}
                                        fixedDecimalScale
                                        clampBehavior="strict"
                                        disabled={
                                            isImmutableField('divisions')
                                            || !divisionEditorReady
                                            || eventData.singleDivision
                                            || !hasStripeAccount
                                        }
                                        onChange={(val) => {
                                            if (
                                                isImmutableField('divisions')
                                                || !divisionEditorReady
                                                || eventData.singleDivision
                                                || !hasStripeAccount
                                            ) {
                                                return;
                                            }
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                price: Math.max(0, Number(val) || 0),
                                                error: null,
                                            }));
                                        }}
                                    />
                                    <NumberInput
                                        label={eventData.teamSignup ? 'Division Max Teams' : 'Division Max Participants'}
                                        min={2}
                                        max={MAX_STANDARD_NUMBER}
                                        value={eventData.singleDivision ? eventData.maxParticipants : divisionEditor.maxParticipants}
                                        className="md:col-span-3"
                                        maw={220}
                                        clampBehavior="strict"
                                        disabled={isImmutableField('divisions') || !divisionEditorReady || eventData.singleDivision}
                                        onChange={(val) => {
                                            if (isImmutableField('divisions') || !divisionEditorReady || eventData.singleDivision) {
                                                return;
                                            }
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                maxParticipants: Math.max(2, Math.trunc(Number(val) || 0)),
                                                error: null,
                                            }));
                                        }}
                                    />
                                    <div className="md:col-span-3">
                                        <AnimatedSection in={eventData.eventType === 'LEAGUE'}>
                                            <NumberInput
                                                label="Division Playoff Team Count"
                                                min={2}
                                                max={MAX_STANDARD_NUMBER}
                                                maw={220}
                                                value={eventData.singleDivision
                                                    ? (typeof leagueData.playoffTeamCount === 'number' ? leagueData.playoffTeamCount : undefined)
                                                    : divisionEditor.playoffTeamCount}
                                                clampBehavior="strict"
                                                disabled={
                                                    isImmutableField('divisions')
                                                    || !divisionEditorReady
                                                    || eventData.singleDivision
                                                    || !leagueData.includePlayoffs
                                                }
                                                onChange={(val) => {
                                                    if (
                                                        isImmutableField('divisions')
                                                        || !divisionEditorReady
                                                        || eventData.singleDivision
                                                        || !leagueData.includePlayoffs
                                                    ) {
                                                        return;
                                                    }
                                                    setDivisionEditor((prev) => ({
                                                        ...prev,
                                                        playoffTeamCount: Math.max(2, Math.trunc(Number(val) || 0)),
                                                        error: null,
                                                    }));
                                                }}
                                            />
                                        </AnimatedSection>
                                    </div>
                                </div>
                                <AnimatedSection in={!eventData.singleDivision}>
                                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                                        <Group justify="space-between" align="center" wrap="nowrap" gap="lg">
                                            <div>
                                                <Text fw={600} size="sm">Division Payment Plan</Text>
                                                <Text size="xs" c="dimmed">
                                                    Configure installments for this division only.
                                                </Text>
                                            </div>
                                            <Switch
                                                checked={divisionEditor.allowPaymentPlans}
                                                disabled={isImmutableField('divisions') || !divisionEditorReady || !hasStripeAccount}
                                                onChange={(event) => {
                                                    if (isImmutableField('divisions') || !divisionEditorReady || !hasStripeAccount) {
                                                        return;
                                                    }
                                                    const checked = event.currentTarget.checked;
                                                    setDivisionEditor((prev) => ({
                                                        ...prev,
                                                        allowPaymentPlans: checked,
                                                        installmentCount: checked
                                                            ? (prev.installmentCount || prev.installmentAmounts.length || 1)
                                                            : 0,
                                                        installmentDueDates: checked ? prev.installmentDueDates : [],
                                                        installmentAmounts: checked ? prev.installmentAmounts : [],
                                                        error: null,
                                                    }));
                                                    if (checked && (!divisionEditor.installmentAmounts || divisionEditor.installmentAmounts.length === 0)) {
                                                        syncDivisionInstallmentCount(divisionEditor.installmentCount || 1);
                                                    }
                                                }}
                                            />
                                        </Group>

                                        <AnimatedSection in={divisionEditor.allowPaymentPlans}>
                                            <div className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
                                                <NumberInput
                                                    label="Installments"
                                                    min={1}
                                                    max={MAX_STANDARD_NUMBER}
                                                    value={divisionEditor.installmentCount || divisionEditor.installmentAmounts.length || 1}
                                                    onChange={(value) => syncDivisionInstallmentCount(Number(value) || 1)}
                                                    clampBehavior="strict"
                                                    maw={180}
                                                />
                                                <Stack gap="sm">
                                                    {(divisionEditor.installmentAmounts || []).map((amount, idx) => {
                                                        const dueDateValue = parseLocalDateTime(
                                                            divisionEditor.installmentDueDates?.[idx] || eventData.start,
                                                        );
                                                        return (
                                                            <Group key={idx} align="flex-end" gap="sm" wrap="wrap">
                                                                <DateTimePicker
                                                                    label={`Installment ${idx + 1} due`}
                                                                    value={dueDateValue}
                                                                    onChange={(value) => setDivisionInstallmentDueDate(idx, value)}
                                                                    valueFormat="MM/DD/YYYY hh:mm A"
                                                                    timePickerProps={{
                                                                        withDropdown: true,
                                                                        format: '12h',
                                                                    }}
                                                                    style={{ flex: '1 1 260px', maxWidth: 280 }}
                                                                />
                                                                <NumberInput
                                                                    label="Amount"
                                                                    min={0}
                                                                    max={MAX_PRICE_NUMBER}
                                                                    step={0.01}
                                                                    value={amount}
                                                                    onChange={(value) => setDivisionInstallmentAmount(idx, Number(value) || 0)}
                                                                    decimalScale={2}
                                                                    fixedDecimalScale
                                                                    clampBehavior="strict"
                                                                    maw={180}
                                                                />
                                                                {divisionEditor.installmentAmounts.length > 1 && (
                                                                    <ActionIcon
                                                                        variant="light"
                                                                        color="red"
                                                                        aria-label="Remove division installment"
                                                                        onClick={() => removeDivisionInstallment(idx)}
                                                                    >
                                                                        ×
                                                                    </ActionIcon>
                                                                )}
                                                            </Group>
                                                        );
                                                    })}
                                                    <Group justify="space-between" align="center">
                                                        <Button
                                                            variant="light"
                                                            onClick={() => syncDivisionInstallmentCount((divisionEditor.installmentAmounts?.length || 0) + 1)}
                                                        >
                                                            Add installment
                                                        </Button>
                                                        <Text
                                                            size="sm"
                                                            c={Math.round(((divisionEditor.installmentAmounts || []).reduce((sum, value) => sum + (Number(value) || 0), 0) - divisionEditor.price) * 100) === 0
                                                                ? 'dimmed'
                                                                : 'red'}
                                                        >
                                                            Installment total: $
                                                            {((divisionEditor.installmentAmounts || []).reduce((sum, value) => sum + (Number(value) || 0), 0)).toFixed(2)} / $
                                                            {(divisionEditor.price || 0).toFixed(2)}
                                                        </Text>
                                                    </Group>
                                                </Stack>
                                            </div>
                                        </AnimatedSection>
                                    </div>
                                </AnimatedSection>
                                <AnimatedSection in={eventData.singleDivision}>
                                    <Text size="xs" c="dimmed">
                                        {eventData.eventType === 'LEAGUE'
                                            ? 'Division price, capacity, payment plan, and playoff team count mirror event-level values while single division is enabled.'
                                            : 'Division price, capacity, and payment plan mirror event-level values while single division is enabled.'}
                                    </Text>
                                </AnimatedSection>
                                <Group justify="space-between" align="center">
                                    <Button
                                        variant="light"
                                        onClick={handleSaveDivisionDetail}
                                        disabled={isImmutableField('divisions')}
                                    >
                                        {divisionEditor.editingId ? 'Update Division' : 'Add Division'}
                                    </Button>
                                    {divisionEditor.editingId ? (
                                        <Button variant="subtle" color="gray" onClick={resetDivisionEditor}>
                                            Cancel Edit
                                        </Button>
                                    ) : null}
                                </Group>
                                {divisionEditor.error && (
                                    <Text size="sm" c="red">
                                        {divisionEditor.error}
                                    </Text>
                                )}
                                {errors.divisions?.message && (
                                    <Text size="sm" c="red">
                                        {errors.divisions.message as string}
                                    </Text>
                                )}
                                {errors.divisionDetails?.message && (
                                    <Text size="sm" c="red">
                                        {errors.divisionDetails.message as string}
                                    </Text>
                                )}
                                <div className="space-y-2">
                                    {(eventData.divisionDetails || []).map((detail) => {
                                        const effectiveDivisionPrice = eventData.singleDivision
                                            ? Math.max(0, eventData.price || 0)
                                            : Math.max(0, detail.price || 0);
                                        const effectiveDivisionCapacity = eventData.singleDivision
                                            ? Math.max(2, Math.trunc(eventData.maxParticipants || 2))
                                            : Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2));
                                        const effectiveDivisionPlayoffTeamCount = eventData.singleDivision
                                            ? (typeof leagueData.playoffTeamCount === 'number'
                                                ? Math.max(2, Math.trunc(leagueData.playoffTeamCount))
                                                : undefined)
                                            : (typeof detail.playoffTeamCount === 'number'
                                                ? Math.max(2, Math.trunc(detail.playoffTeamCount))
                                                : undefined);
                                        const effectiveDivisionAllowPaymentPlans = eventData.singleDivision
                                            ? Boolean(eventData.allowPaymentPlans)
                                            : Boolean(detail.allowPaymentPlans);
                                        const effectiveDivisionInstallmentAmounts = effectiveDivisionAllowPaymentPlans
                                            ? (
                                                eventData.singleDivision
                                                    ? (eventData.installmentAmounts || [])
                                                    : (detail.installmentAmounts || [])
                                            ).map((value) => Math.max(0, Number(value) || 0))
                                            : [];
                                        const effectiveDivisionInstallmentCount = effectiveDivisionAllowPaymentPlans
                                            ? (
                                                eventData.singleDivision
                                                    ? (eventData.installmentCount || effectiveDivisionInstallmentAmounts.length || 0)
                                                    : (detail.installmentCount || effectiveDivisionInstallmentAmounts.length || 0)
                                            )
                                            : 0;
                                        return (
                                            <Paper key={detail.id} withBorder radius="md" p="sm">
                                                <Group justify="space-between" align="center" gap="sm">
                                                    <div>
                                                        <Text fw={600}>{detail.name}</Text>
                                                        <Text size="xs" c="dimmed">
                                                            {`${detail.gender} • Skill: ${detail.skillDivisionTypeName || detail.divisionTypeName} • Age: ${detail.ageDivisionTypeName || detail.divisionTypeName}`}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            {`Price: $${effectiveDivisionPrice.toFixed(2)} • ${eventData.teamSignup ? 'Max teams' : 'Max participants'}: ${effectiveDivisionCapacity}`}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            {effectiveDivisionAllowPaymentPlans
                                                                ? `Payment plan: ${effectiveDivisionInstallmentCount || effectiveDivisionInstallmentAmounts.length || 0} installment(s) totaling $${effectiveDivisionInstallmentAmounts.reduce((sum, value) => sum + (Number(value) || 0), 0).toFixed(2)}`
                                                                : 'Payment plan: disabled'}
                                                        </Text>
                                                        {eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && (
                                                            <Text size="xs" c="dimmed">
                                                                {`Playoff teams: ${effectiveDivisionPlayoffTeamCount ?? 'Not set'}`}
                                                            </Text>
                                                        )}
                                                        {eventData.eventType === 'LEAGUE'
                                                            && leagueData.includePlayoffs
                                                            && eventData.splitLeaguePlayoffDivisions
                                                            && typeof effectiveDivisionPlayoffTeamCount === 'number'
                                                            && effectiveDivisionPlayoffTeamCount > 0 && (
                                                                <div className="mt-2 space-y-2">
                                                                    <Text size="xs" fw={600} c="dimmed">
                                                                        Playoff placement mapping
                                                                    </Text>
                                                                    {playoffDivisionSelectOptions.length === 0 ? (
                                                                        <Text size="xs" c="red">
                                                                            Add playoff divisions to map placements.
                                                                        </Text>
                                                                    ) : (
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                            {Array.from({ length: effectiveDivisionPlayoffTeamCount }).map((_, placementIndex) => (
                                                                                <MantineSelect
                                                                                    key={`${detail.id}-placement-${placementIndex}`}
                                                                                    label={`Placement #${placementIndex + 1}`}
                                                                                    placeholder="Select playoff division"
                                                                                    data={playoffDivisionSelectOptions}
                                                                                    value={normalizeDivisionKeys([
                                                                                        detail.playoffPlacementDivisionIds?.[placementIndex] ?? '',
                                                                                    ])[0] ?? null}
                                                                                    comboboxProps={sharedComboboxProps}
                                                                                    disabled={isImmutableField('divisions')}
                                                                                    onChange={(value) => handleSetDivisionPlayoffMapping(
                                                                                        detail.id,
                                                                                        placementIndex,
                                                                                        value,
                                                                                    )}
                                                                                />
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        {detail.ageCutoffLabel && (
                                                            <Text size="xs" c="dimmed">
                                                                {detail.ageCutoffLabel}
                                                            </Text>
                                                        )}
                                                    </div>
                                                    <Group gap="xs">
                                                        <Button
                                                            size="xs"
                                                            variant="subtle"
                                                            onClick={() => handleEditDivisionDetail(detail.id)}
                                                            disabled={isImmutableField('divisions')}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            size="xs"
                                                            variant="subtle"
                                                            color="red"
                                                            onClick={() => handleRemoveDivisionDetail(detail.id)}
                                                            disabled={isImmutableField('divisions')}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </Group>
                                                </Group>
                                            </Paper>
                                        );
                                    })}
                                </div>

                                <AnimatedSection in={eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && eventData.splitLeaguePlayoffDivisions}>
                                    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                                        <Group justify="space-between" align="center">
                                            <div>
                                                <Text fw={600} size="sm">Playoff Divisions</Text>
                                                <Text size="xs" c="dimmed">
                                                    Configure the playoff brackets that league placements feed into.
                                                </Text>
                                            </div>
                                            <Button
                                                variant="light"
                                                onClick={handleAddPlayoffDivision}
                                                disabled={isImmutableField('divisions')}
                                            >
                                                Add Playoff Division
                                            </Button>
                                        </Group>

                                        {(eventData.playoffDivisionDetails || []).length === 0 ? (
                                            <Text size="sm" c="dimmed">
                                                No playoff divisions added yet.
                                            </Text>
                                        ) : (
                                            <Stack gap="sm">
                                                {(eventData.playoffDivisionDetails || []).map((playoffDivision, index) => (
                                                    <Paper key={playoffDivision.id} withBorder radius="md" p="sm">
                                                        <Stack gap="sm">
                                                            <Group align="flex-end" justify="space-between" gap="sm" wrap="wrap">
                                                                <TextInput
                                                                    label="Playoff Division Name"
                                                                    value={playoffDivision.name}
                                                                    maw={320}
                                                                    maxLength={MAX_MEDIUM_TEXT_LENGTH}
                                                                    disabled={isImmutableField('divisions')}
                                                                    onChange={(event) => handleUpdatePlayoffDivision(
                                                                        playoffDivision.id,
                                                                        { name: event.currentTarget.value },
                                                                    )}
                                                                />
                                                                <NumberInput
                                                                    label={eventData.teamSignup ? 'Teams Count' : 'Participants Count'}
                                                                    value={playoffDivision.maxParticipants}
                                                                    min={2}
                                                                    max={MAX_STANDARD_NUMBER}
                                                                    maw={220}
                                                                    clampBehavior="strict"
                                                                    disabled={isImmutableField('divisions')}
                                                                    onChange={(value) => handleUpdatePlayoffDivision(
                                                                        playoffDivision.id,
                                                                        { maxParticipants: Number(value) || 2 },
                                                                    )}
                                                                    error={errors.playoffDivisionDetails?.[index]?.maxParticipants?.message as string | undefined}
                                                                />
                                                                <Button
                                                                    size="xs"
                                                                    color="red"
                                                                    variant="subtle"
                                                                    disabled={isImmutableField('divisions')}
                                                                    onClick={() => handleRemovePlayoffDivision(playoffDivision.id)}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </Group>

                                                            <TournamentFields
                                                                title={`${playoffDivision.name} Playoff Settings`}
                                                                tournamentData={buildTournamentConfig(playoffDivision.playoffConfig)}
                                                                setTournamentData={(updater) => handleSetPlayoffDivisionConfig(playoffDivision.id, updater)}
                                                                sport={eventData.sportConfig ?? undefined}
                                                            />
                                                        </Stack>
                                                    </Paper>
                                                ))}
                                            </Stack>
                                        )}

                                        {playoffDivisionCapacityWarnings.length > 0 && (
                                            <Alert color="yellow" radius="md">
                                                <Stack gap={2}>
                                                    {playoffDivisionCapacityWarnings.map((warning) => (
                                                        <Text key={warning} size="sm">{warning}</Text>
                                                    ))}
                                                </Stack>
                                            </Alert>
                                        )}
                                    </div>
                                </AnimatedSection>
                            </div>

                            {/* Team Settings */}
                            <AnimatedSection in={eventData.eventType === 'EVENT'}>
                                <div className="mt-6 space-y-3">
                                    <Controller
                                        name="teamSignup"
                                        control={control}
                                        render={({ field }) => (
                                            <Switch
                                                label="Team Event (teams compete rather than individuals)"
                                                checked={field.value}
                                                disabled={isImmutableField('teamSignup')}
                                                onChange={(e) => {
                                                    if (isImmutableField('teamSignup')) return;
                                                    field.onChange(e?.currentTarget?.checked ?? field.value);
                                                }}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="singleDivision"
                                        control={control}
                                        render={({ field }) => (
                                            <Switch
                                                label="Single Division (all skill levels play together)"
                                                checked={field.value}
                                                disabled={isImmutableField('singleDivision')}
                                                onChange={(e) => {
                                                    if (isImmutableField('singleDivision')) return;
                                                    field.onChange(e?.currentTarget?.checked ?? field.value);
                                                }}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="registrationByDivisionType"
                                        control={control}
                                        render={({ field }) => (
                                            <Switch
                                                label="Register by Division Type"
                                                description="When enabled, users pick a division type and are auto-assigned to one matching division."
                                                checked={field.value}
                                                disabled={isImmutableField('registrationByDivisionType')}
                                                onChange={(e) => {
                                                    if (isImmutableField('registrationByDivisionType')) return;
                                                    field.onChange(e?.currentTarget?.checked ?? field.value);
                                                }}
                                            />
                                        )}
                                    />
                                    <AnimatedSection in={isOrganizationManagedEvent}>
                                        <Controller
                                            name="selectedFieldIds"
                                            control={control}
                                            render={({ field, fieldState }) => (
                                                <MantineMultiSelect
                                                    label="Organization Fields"
                                                    description="Choose which organization fields this event can use."
                                                    placeholder={fieldsLoading ? 'Loading organization fields...' : 'Select one or more fields'}
                                                    data={leagueFieldOptions}
                                                    value={Array.isArray(field.value) ? field.value : []}
                                                    comboboxProps={sharedComboboxProps}
                                                    disabled={fieldsLoading || isImmutableField('fieldIds')}
                                                    onChange={(values) => {
                                                        if (isImmutableField('fieldIds')) return;
                                                        field.onChange(values);
                                                    }}
                                                    searchable
                                                    clearable
                                                    error={fieldState.error?.message}
                                                />
                                            )}
                                        />
                                    </AnimatedSection>
                                </div>
                            </AnimatedSection>
                            <AnimatedSection in={eventData.eventType !== 'EVENT'}>
                                <div className="mt-6 space-y-2">
                                    <Switch
                                        label="Team Event (teams compete rather than individuals)"
                                        checked
                                        disabled
                                    />
                                    <Controller
                                        name="singleDivision"
                                        control={control}
                                        render={({ field }) => (
                                            <Switch
                                                label="Single Division (all skill levels play together)"
                                                checked={field.value}
                                                disabled={isImmutableField('singleDivision')}
                                                onChange={(e) => {
                                                    if (isImmutableField('singleDivision')) return;
                                                    field.onChange(e?.currentTarget?.checked ?? field.value);
                                                }}
                                            />
                                        )}
                                    />
                                    <Controller
                                        name="registrationByDivisionType"
                                        control={control}
                                        render={({ field }) => (
                                            <Switch
                                                label="Register by Division Type"
                                                description="When enabled, users pick a division type and are auto-assigned to one matching division."
                                                checked={field.value}
                                                disabled={isImmutableField('registrationByDivisionType')}
                                                onChange={(e) => {
                                                    if (isImmutableField('registrationByDivisionType')) return;
                                                    field.onChange(e?.currentTarget?.checked ?? field.value);
                                                }}
                                            />
                                        )}
                                    />
                                    <AnimatedSection in={eventData.eventType === 'LEAGUE'}>
                                        <Controller
                                            name="splitLeaguePlayoffDivisions"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch
                                                    label="Split League & Playoff Divisions"
                                                    description={leagueData.includePlayoffs
                                                        ? 'Configure league divisions separately from playoff bracket divisions.'
                                                        : 'Enable playoffs to configure split league/playoff divisions.'}
                                                    checked={field.value}
                                                    disabled={isImmutableField('splitLeaguePlayoffDivisions') || !leagueData.includePlayoffs}
                                                    onChange={(event) => {
                                                        if (isImmutableField('splitLeaguePlayoffDivisions')) return;
                                                        const checked = event.currentTarget.checked;
                                                        field.onChange(checked);
                                                        if (checked && (eventData.playoffDivisionDetails || []).length === 0) {
                                                            setValue(
                                                                'playoffDivisionDetails',
                                                                [createNextPlayoffDivision(eventData.playoffDivisionDetails || [], playoffData)],
                                                                { shouldDirty: true, shouldValidate: true },
                                                            );
                                                        }
                                                    }}
                                                />
                                            )}
                                        />
                                    </AnimatedSection>
                                    <Text size="sm" c="dimmed">
                                        Leagues and tournaments are always team events. When single division is enabled,
                                        each timeslot is automatically assigned all selected divisions.
                                    </Text>
                                </div>
                            </AnimatedSection>
                        </Paper>

                        <AnimatedSection in={eventData.eventType === 'LEAGUE'}>
                            <Paper
                                id="section-league-scoring-config"
                                shadow="xs"
                                radius="md"
                                withBorder
                                p="lg"
                                className="scroll-mt-28 bg-gray-50"
                            >
                                <h3 className="text-lg font-semibold mb-4">League Scoring Config</h3>
                                <LeagueScoringConfigPanel
                                    value={eventData.leagueScoringConfig}
                                    sport={eventData.sportConfig ?? undefined}
                                    editable={!isImmutableField('leagueScoringConfig')}
                                    onChange={handleLeagueScoringConfigChange}
                                />
                            </Paper>
                        </AnimatedSection>

                        <AnimatedSection in={showScheduleConfig}>
                            <Paper
                                id="section-schedule-config"
                                shadow="xs"
                                radius="md"
                                withBorder
                                p="lg"
                                className="scroll-mt-28 bg-gray-50"
                            >
                                <h3 className="text-lg font-semibold mb-4">Schedule Config</h3>

                                <div className="space-y-6">
                                    <AnimatedSection in={!isSchedulableEventType && usesRentalSlots}>
                                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                                            <Text fw={600} size="sm">Rental Slot Schedule</Text>
                                            <Text size="sm" c="dimmed">
                                                This event uses pre-booked rental slots. Slot scheduling is managed by the rental reservation.
                                            </Text>
                                            <Text size="sm" c="dimmed" mt="xs">
                                                Linked slots: {immutableTimeSlots.length}
                                            </Text>
                                        </div>
                                    </AnimatedSection>

                                    <AnimatedSection in={isSchedulableEventType}>
                                    <div className="space-y-4">
                                        <AnimatedSection in={eventData.eventType === 'TOURNAMENT'}>
                                            <TournamentFields
                                                tournamentData={tournamentData}
                                                setTournamentData={setTournamentData}
                                                sport={eventData.sportConfig ?? undefined}
                                            />
                                        </AnimatedSection>

                                        <AnimatedSection in={isOrganizationManagedEvent}>
                                            <Text size="xs" c="dimmed">
                                                Select event fields directly inside each timeslot.
                                            </Text>
                                        </AnimatedSection>

                                        <LeagueFields
                                            leagueData={leagueData}
                                            sport={eventData.sportConfig ?? undefined}
                                            participantCount={eventData.singleDivision
                                                ? eventData.maxParticipants
                                                : (() => {
                                                    const total = (eventData.divisionDetails || []).reduce((sum, detail) => (
                                                        sum + Math.max(0, Math.trunc(detail.maxParticipants || 0))
                                                    ), 0);
                                                    return total > 0 ? total : eventData.maxParticipants;
                                                })()}
                                            onLeagueDataChange={(updates) => setLeagueData(prev => ({ ...prev, ...updates }))}
                                            slots={leagueSlots}
                                            onAddSlot={handleAddSlot}
                                            onUpdateSlot={handleUpdateSlot}
                                            onRemoveSlot={handleRemoveSlot}
                                            fields={selectedFields}
                                            fieldsLoading={fieldsLoading}
                                            fieldOptions={leagueFieldOptions}
                                            divisionOptions={divisionOptions}
                                            eventStartDate={eventData.start}
                                            lockSlotDivisions={Boolean(eventData.singleDivision)}
                                            lockedDivisionKeys={slotDivisionKeys}
                                            readOnly={hasImmutableTimeSlots}
                                            showPlayoffSettings={false}
                                            showLeagueConfiguration={eventData.eventType === 'LEAGUE'}
                                        />

                                        <AnimatedSection in={eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && !eventData.splitLeaguePlayoffDivisions}>
                                            <TournamentFields
                                                title="Playoffs Configuration"
                                                tournamentData={playoffData}
                                                setTournamentData={setPlayoffData}
                                                sport={eventData.sportConfig ?? undefined}
                                            />
                                        </AnimatedSection>
                                    </div>
                                    </AnimatedSection>
                                </div>
                            </Paper>
                        </AnimatedSection>
                    </form>
                </div>

                {/* Footer */}
                <div className="border-t p-6 flex justify-between items-center">
                    <div className="flex flex-col gap-3">
                        {leagueError && (
                            <Alert color="red" radius="md">
                                {leagueError}
                            </Alert>
                        )}
                    </div>
                </div>
            </div>
        </div>
            </div>
        </div>
    );

    if (!open) {
        return null;
    }

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 pb-8">
            {sheetContent}
        </div>
    );
});

EventForm.displayName = 'EventForm';

export default EventForm;
