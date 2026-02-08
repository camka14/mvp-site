import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { Controller, useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import TournamentFields from '@/app/discover/components/TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { getEventImageUrl, Event, EventState, Division as CoreDivision, UserData, Team, LeagueConfig, Field, FieldSurfaceType, TimeSlot, Organization, LeagueScoringConfig, Sport, TournamentConfig, TemplateDocument } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import LeagueScoringConfigPanel from '@/app/discover/components/LeagueScoringConfigPanel';
import { useSports } from '@/app/hooks/useSports';

import { TextInput, Textarea, NumberInput, Select as MantineSelect, MultiSelect as MantineMultiSelect, Switch, Group, Button, Alert, Loader, Paper, Text, Title, Stack, ActionIcon, SimpleGrid } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
import { locationService } from '@/lib/locationService';
import { userService } from '@/lib/userService';
import { formatLocalDateTime, nowLocalDateTimeString, parseLocalDateTime } from '@/lib/dateUtils';
import { createClientId } from '@/lib/clientId';
import LeagueFields, { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { apiRequest } from '@/lib/apiClient';
import UserCard from '@/components/ui/UserCard';

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
        type: normalizeTemplateType(row?.type),
        content: row?.content ?? undefined,
        $createdAt: row?.$createdAt ?? undefined,
    };
};

// Compares two numeric start/end pairs to detect overlapping minutes within the same day.
const slotsOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
    Math.max(startA, startB) < Math.min(endA, endB);

// Evaluates the current slot against other form slots to surface inline validation errors for leagues.
const computeSlotError = (
    slots: LeagueSlotForm[],
    index: number,
    eventType: EventType
): string | undefined => {
    if (eventType !== 'LEAGUE') {
        return undefined;
    }

    const slot = slots[index];
    if (!slot) {
        return undefined;
    }

    const slotField = slot.scheduledFieldId;

    if (
        typeof slot.dayOfWeek !== 'number' ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number'
    ) {
        return undefined;
    }

    const slotDayOfWeek = slot.dayOfWeek;
    const slotStartTime = slot.startTimeMinutes;
    const slotEndTime = slot.endTimeMinutes;

    if (slotEndTime <= slotStartTime) {
        return 'Timeslot must end after it starts.';
    }

    const hasOverlap = slots.some((other, otherIndex) => {
        if (otherIndex === index) {
            return false;
        }

        const otherField = other.scheduledFieldId;
        if (!otherField) {
            return false;
        }

        if (otherField !== slotField) {
            return false;
        }

        if (typeof other.dayOfWeek !== 'number' || other.dayOfWeek !== slotDayOfWeek) {
            return false;
        }

        if (
            typeof other.startTimeMinutes !== 'number' ||
            typeof other.endTimeMinutes !== 'number'
        ) {
            return false;
        }

        const otherStartTime = other.startTimeMinutes;
        const otherEndTime = other.endTimeMinutes;

        return slotsOverlap(slotStartTime, slotEndTime, otherStartTime, otherEndTime);
    });

    if (hasOverlap) {
        return 'Overlaps with another timeslot in this form.';
    }

    return undefined;
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
    fieldType: FieldSurfaceType;
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
    divisions: string[];
    cancellationRefundHours: number;
    registrationCutoffHours: number;
    organizationId?: string;
    requiredTemplateIds: string[];
    hostId?: string;
    imageId: string;
    seedColor: number;
    waitList: string[];
    freeAgents: string[];
    players: UserData[];
    teams: Team[];
    referees: UserData[];
    refereeIds: string[];
    doTeamsRef: boolean;
    leagueScoringConfig: LeagueScoringConfig;
};

const divisionKeyFromValue = (value: string | CoreDivision): string => {
    if (typeof value === 'string') {
        const normalized = value.toLowerCase();
        if (normalized.includes('beginner')) return 'beginner';
        if (normalized.includes('intermediate')) return 'intermediate';
        if (normalized.includes('advanced')) return 'advanced';
        if (normalized.includes('expert')) return 'expert';
        if (normalized.includes('open')) return 'open';
        return value;
    }
    const fallback = (value.skillLevel || value.name || value.id || '').toString();
    return fallback.toLowerCase() || 'open';
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

const mapEventToFormState = (event: Event): EventFormState => ({
    $id: event.$id,
    name: event.name,
    description: event.description ?? '',
    location: event.location ?? '',
    coordinates: Array.isArray(event.coordinates) ? event.coordinates as [number, number] : [0, 0],
    start: event.start,
    end: event.end,
    state: (event.state as EventState) ?? 'DRAFT',
    eventType: event.eventType,
    sportId: (() => {
        if (event.sport && typeof event.sport === 'object' && '$id' in event.sport) {
            return (event.sport as Sport).$id;
        }
        if (typeof event.sport === 'string') {
            return event.sport;
        }
        return '';
    })(),
    sportConfig: typeof event.sport === 'object' && event.sport !== null
        ? { ...(event.sport as Sport) }
        : null,
    fieldType: event.fieldType ?? 'INDOOR',
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
    organizationId: event.organizationId || undefined,
    divisions: Array.isArray(event.divisions)
        ? (event.divisions as (string | CoreDivision)[]).map(divisionKeyFromValue)
        : [],
    cancellationRefundHours: Number.isFinite(event.cancellationRefundHours)
        ? event.cancellationRefundHours
        : 24,
    registrationCutoffHours: Number.isFinite(event.registrationCutoffHours)
        ? event.registrationCutoffHours
        : 2,
    hostId: event.hostId || undefined,
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
    doTeamsRef: Boolean(event.doTeamsRef),
    leagueScoringConfig: createLeagueScoringConfig(
        typeof event.leagueScoringConfig === 'object'
            ? (event.leagueScoringConfig as Partial<LeagueScoringConfig>)
            : undefined
    ),
});

type EventFormValues = EventFormState & {
    leagueSlots: LeagueSlotForm[];
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    tournamentData: TournamentConfig;
    fields: Field[];
    fieldCount: number;
    joinAsParticipant: boolean;
};

const fieldTypeSchema: z.ZodType<FieldSurfaceType> = z
    .string()
    .transform((value) => value.toUpperCase() as FieldSurfaceType);

const leagueSlotSchema: z.ZodType<LeagueSlotForm> = z.object({
    key: z.string(),
    $id: z.string().optional(),
    scheduledFieldId: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
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
        fieldType: fieldTypeSchema,
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
        divisions: z.array(z.string()),
        cancellationRefundHours: z.number().min(0),
        registrationCutoffHours: z.number().min(0),
        organizationId: z.string().optional(),
        requiredTemplateIds: z.array(z.string()).default([]),
        hostId: z.string().optional(),
        imageId: z.string().trim().min(1, 'Event image is required'),
        seedColor: z.number(),
        waitList: z.array(z.string()),
        freeAgents: z.array(z.string()),
        players: z.array(z.any()),
        teams: z.array(z.any()),
        referees: z.array(z.any()),
        refereeIds: z.array(z.string()),
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

        if (typeof values.minAge === 'number' && typeof values.maxAge === 'number') {
            if (values.minAge > values.maxAge) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Minimum age must be less than or equal to maximum age',
                    path: ['minAge'],
                });
            }
        }

        if (values.eventType === 'LEAGUE') {
            if (!values.leagueSlots.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Add at least one timeslot',
                    path: ['leagueSlots'],
                });
            }
            values.leagueSlots.forEach((slot, index) => {
                if (!slot.scheduledFieldId) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Select a field',
                        path: ['leagueSlots', index, 'scheduledFieldId'],
                    });
                }
                if (typeof slot.dayOfWeek !== 'number') {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Select a day',
                        path: ['leagueSlots', index, 'dayOfWeek'],
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
}, ref) => {
    const open = isOpen ?? true;
    const refsPrefilledRef = useRef<boolean>(false);
    const lastResetEventIdRef = useRef<string | null>(null);
    // Builds the mutable slot model consumed by LeagueFields whenever we add or hydrate time slots.
    const createSlotForm = useCallback((slot?: Partial<TimeSlot>): LeagueSlotForm => ({
        key: slot?.$id ?? createClientId(),
        $id: slot?.$id,
        scheduledFieldId: slot?.scheduledFieldId ? slot.scheduledFieldId as string : undefined,
        dayOfWeek: slot?.dayOfWeek,
        startTimeMinutes: slot?.startTimeMinutes,
        endTimeMinutes: slot?.endTimeMinutes,
        repeating: slot?.repeating ?? true,
        conflicts: [],
        checking: false,
        error: undefined,
    }), []);
    // Reflects whether the Stripe onboarding call is running to disable repeated clicks.
    const [connectingStripe, setConnectingStripe] = useState(false);
    // Cached Stripe onboarding state pulled from the current user so paid inputs can be enabled/disabled.
    const [hasStripeAccount, setHasStripeAccount] = useState(
        Boolean(organization?.hasStripeAccount || currentUser?.hasStripeAccount),
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
        if (defaults.fieldType !== undefined) next.fieldType = defaults.fieldType ?? 'INDOOR';
        // Immutable defaults store price in cents; normalize to dollars for UI.
        if (typeof defaults.price === 'number') next.price = defaults.price / 100;
        if (typeof defaults.minAge === 'number') next.minAge = defaults.minAge;
        if (typeof defaults.maxAge === 'number') next.maxAge = defaults.maxAge;
        if (typeof defaults.maxParticipants === 'number') next.maxParticipants = defaults.maxParticipants;
        if (typeof defaults.teamSizeLimit === 'number') next.teamSizeLimit = defaults.teamSizeLimit;
        if (typeof defaults.teamSignup === 'boolean') next.teamSignup = defaults.teamSignup;
        if (typeof defaults.singleDivision === 'boolean') next.singleDivision = defaults.singleDivision;
        if (defaults.divisions !== undefined) {
            next.divisions = Array.isArray(defaults.divisions)
                ? defaults.divisions.map(divisionKeyFromValue)
                : [];
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

        if (incomingEvent.eventType !== 'LEAGUE') {
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
            if (activeEditingEvent?.fields?.length) {
                return sanitizeFieldsForForm(activeEditingEvent.fields).sort(
                    (a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0),
                );
            }
            if (!organization) {
                return Array.from({ length: defaultFieldCount }, (_, idx) => ({
                    $id: createClientId(),
                    name: `Field ${idx + 1}`,
                    fieldNumber: idx + 1,
                    type: base.fieldType,
                    location: '',
                } as Field));
            }
            return [];
        })();

        const defaults = immutableDefaults ?? {};
        const defaultFieldId = Array.isArray(defaults.fields) && defaults.fields.length > 0
            ? (defaults.fields[0] as Field).$id
            : undefined;

        const defaultSlots = (() => {
            if (Array.isArray(defaults.timeSlots) && defaults.timeSlots.length > 0) {
                return (defaults.timeSlots as TimeSlot[]).map((slot) =>
                    createSlotForm({
                        $id: slot.$id,
                        scheduledFieldId: slot.scheduledFieldId ?? defaultFieldId,
                        dayOfWeek: slot.dayOfWeek,
                        startTimeMinutes: slot.startTimeMinutes,
                        endTimeMinutes: slot.endTimeMinutes,
                        repeating: slot.repeating,
                    })
                );
            }

            if (activeEditingEvent && activeEditingEvent.eventType === 'LEAGUE' && activeEditingEvent.timeSlots?.length) {
                return (activeEditingEvent.timeSlots || []).map((slot) => {
                    return createSlotForm({
                        $id: slot.$id,
                        scheduledFieldId: slot.scheduledFieldId,
                        dayOfWeek: slot.dayOfWeek,
                        startTimeMinutes: slot.startTimeMinutes,
                        endTimeMinutes: slot.endTimeMinutes,
                    });
                });
            }
            return [createSlotForm()];
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
        currentUser?.$id,
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
        setValue,
        getValues,
        reset,
        clearErrors,
        trigger,
        formState: { errors },
    } = useForm<EventFormValues>({
        resolver: zodResolver(eventFormSchema) as Resolver<EventFormValues>,
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        defaultValues: buildDefaultFormValues(),
    });

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

    const formValues = watch();
    const eventData = formValues;
    const leagueSlots = formValues.leagueSlots;
    const leagueData = formValues.leagueData;
    const tournamentData = formValues.tournamentData;
    const playoffData = formValues.playoffData;
    const fields = formValues.fields;
    const fieldCount = formValues.fieldCount;
    const joinAsParticipant = formValues.joinAsParticipant;
    const organizationId = organization?.$id ?? eventData.organizationId;

    const templateOptions = useMemo(
        () => templateDocuments.map((template) => {
            const templateType = template.type ?? 'PDF';
            return {
                value: template.$id,
                label: `${template.title || 'Untitled Template'} (${templateType})`,
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
            setValue('leagueData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setTournamentData = useCallback(
        (updater: React.SetStateAction<TournamentConfig>) => {
            const current = getValues('tournamentData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            setValue('tournamentData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setPlayoffData = useCallback(
        (updater: React.SetStateAction<TournamentConfig>) => {
            const current = getValues('playoffData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            setValue('playoffData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setLeagueSlots = useCallback(
        (updater: React.SetStateAction<LeagueSlotForm[]>) => {
            const current = getValues('leagueSlots');
            const next = typeof updater === 'function' ? (updater as (prev: LeagueSlotForm[]) => LeagueSlotForm[])(current) : updater;
            setValue('leagueSlots', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setFields = useCallback(
        (updater: React.SetStateAction<Field[]>) => {
            const current = getValues('fields');
            const next = typeof updater === 'function' ? (updater as (prev: Field[]) => Field[])(current) : updater;
            setValue('fields', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setFieldCount = useCallback(
        (value: number) => {
            setValue('fieldCount', value, { shouldDirty: true, shouldValidate: true });
        },
        [setValue],
    );

    const setJoinAsParticipant = useCallback(
        (value: boolean) => {
            setValue('joinAsParticipant', value, { shouldDirty: true, shouldValidate: true });
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
    const shouldProvisionFields = !organization && !hasImmutableFields;
    const shouldManageLocalFields = shouldProvisionFields && (eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT');
    const fieldCountOptions = useMemo(
        () => Array.from({ length: 12 }, (_, idx) => ({ value: String(idx + 1), label: String(idx + 1) })),
        []
    );

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
    }, []);

    const handleRemoveReferee = useCallback((refereeId: string) => {
        setEventData((prev) => ({
            ...prev,
            refereeIds: (prev.refereeIds || []).filter((id) => id !== refereeId),
            referees: (prev.referees || []).filter((ref) => ref.$id !== refereeId),
        }));
    }, []);

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
    }, [eventData.eventType, hasImmutableTimeSlots]);

    const handleLeagueScoringConfigChange = useCallback(
        (key: keyof LeagueScoringConfig, value: LeagueScoringConfig[keyof LeagueScoringConfig]) => {
            setEventData(prev => ({
                ...prev,
                leagueScoringConfig: {
                    ...prev.leagueScoringConfig,
                    [key]: value,
                },
            }));
        },
        []
    );

    useEffect(() => {
        if (sportsLoading) {
            return;
        }
        setEventData((prev) => {
            if (prev.sportId) {
                const selected = sportsById.get(prev.sportId);
                if (selected && (!prev.sportConfig || prev.sportConfig.$id !== selected.$id)) {
                    return { ...prev, sportConfig: selected };
                }
                if (!selected && prev.sportConfig) {
                    return { ...prev, sportConfig: null };
                }
                return prev;
            }

            if (prev.sportConfig) {
                return { ...prev, sportConfig: null };
            }

            return prev;
        });
    }, [sportsLoading, sportsById]);

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
    }, [hasImmutableFields, immutableFields]);

    // When provisioning local fields, mirror field type/count changes into the generated list.
    useEffect(() => {
        if (!shouldManageLocalFields) {
            return;
        }
        setFields(prev => {
            const normalized = prev.slice(0, fieldCount).map((field, index) => ({
                ...field,
                fieldNumber: index + 1,
                type: eventData.fieldType,
            }));

            if (normalized.length < fieldCount) {
                for (let index = normalized.length; index < fieldCount; index += 1) {
                    normalized.push({
                        $id: createClientId(),
                        name: `Field ${index + 1}`,
                        fieldNumber: index + 1,
                        type: eventData.fieldType,
                        location: '',
                        lat: 0,
                        long: 0,
                    } as Field);
                }
            }

            return normalized;
        });
    }, [fieldCount, shouldManageLocalFields, eventData.fieldType]);

    // For organizations with existing facilities, seed the field list with their saved ordering.
    useEffect(() => {
        if (shouldManageLocalFields || !activeEditingEvent?.fields?.length) {
            return;
        }
        const sorted = sanitizeFieldsForForm(activeEditingEvent.fields).sort(
            (a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0),
        );
        setFields(sorted);
    }, [activeEditingEvent?.fields, shouldManageLocalFields]);

    // Clear slot field references that point to deleted ad-hoc fields when the list is regenerated.
    useEffect(() => {
        if (!shouldManageLocalFields) return;
        const validIds = new Set(fields.map(field => field.$id));
        updateLeagueSlots(prev => prev.map(slot => {
            const fieldId = slot.scheduledFieldId;
            if (!fieldId || validIds.has(fieldId)) {
                return slot;
            }
            return { ...slot, scheduledFieldId: undefined };
        }));
    }, [fields, shouldManageLocalFields, updateLeagueSlots]);

    useEffect(() => {
        setHasStripeAccount(Boolean(organization?.hasStripeAccount || currentUser?.hasStripeAccount));
    }, [organization?.hasStripeAccount, currentUser?.hasStripeAccount]);

    // Adds a blank slot row in the LeagueFields list when the user taps "Add Timeslot".
    const handleAddSlot = () => {
        if (hasImmutableTimeSlots) {
            return;
        }
        clearErrors('leagueSlots');
        updateLeagueSlots(prev => [...prev, createSlotForm()]);
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

    // Ensure leagues default their end date to the start date until schedules generate an actual end.
    useEffect(() => {
        if (isEditMode) {
            return;
        }

        if ((eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT') && eventData.start) {
            setEventData(prev => {
                if (prev.end === prev.start) {
                    return prev;
                }
                return { ...prev, end: prev.start };
            });
        }
    }, [eventData.eventType, eventData.start, isEditMode]);

    // Hydrate league-specific state and slots when opening the modal for an existing event.
    useEffect(() => {
        if (hasImmutableTimeSlots) {
            return;
        }
        if (activeEditingEvent && activeEditingEvent.eventType === 'LEAGUE') {
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

            const slots = (activeEditingEvent.timeSlots || []).map(slot => {
                const fieldRef = (() => {
                    const fieldId = slot.scheduledFieldId
                    if (!fieldId) {
                        return undefined;
                    }
                    return activeEditingEvent.fields?.find((field) => field.$id === fieldId);
                })();

                return createSlotForm({
                    $id: slot.$id,
                    scheduledFieldId: fieldRef ? fieldRef.$id : "",
                    dayOfWeek: slot.dayOfWeek,
                    startTimeMinutes: slot.startTimeMinutes,
                    endTimeMinutes: slot.endTimeMinutes,
                });
            });

            const initialSlots = slots.length > 0 ? slots : [createSlotForm()];
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
            setLeagueSlots(normalizeSlotState([createSlotForm()], 'EVENT'));
            setPlayoffData(buildTournamentConfig());
        }
    }, [activeEditingEvent, createSlotForm, hasImmutableTimeSlots]);

    useEffect(() => {
        if (!hasImmutableTimeSlots) {
            return;
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        const slotForms = immutableTimeSlots.map((slot) =>
            createSlotForm({
                $id: slot.$id,
                scheduledFieldId: slot.scheduledFieldId ?? fallbackFieldId,
                dayOfWeek: slot.dayOfWeek,
                startTimeMinutes: slot.startTimeMinutes,
                endTimeMinutes: slot.endTimeMinutes,
                repeating: slot.repeating,
            })
        );
        setLeagueSlots(normalizeSlotState(slotForms, eventData.eventType));
    }, [hasImmutableTimeSlots, immutableTimeSlots, immutableFields, createSlotForm, eventData.eventType]);

    // Pull the organization's fields so league/tournament creators can assign real facilities.
    useEffect(() => {
        let isMounted = true;
        if (hasImmutableFields) {
            return () => {
                isMounted = false;
            };
        }
        if (!organization?.fields) {
            return () => {
                isMounted = false;
            };
        }

        setFields(sanitizeFieldsForForm(organization.fields as Field[]));

        return () => {
            isMounted = false;
        };
    }, [organization, hasImmutableFields]);

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
    }, [activeEditingEvent?.fields, hasImmutableFields]);

    // Re-run slot normalization when the modal switches event types (e.g., league -> tournament).
    useEffect(() => {
        updateLeagueSlots(prev => prev);
    }, [eventData.eventType, updateLeagueSlots]);

    const todaysDate = new Date(new Date().setHours(0, 0, 0, 0));
    const leagueFieldOptions = useMemo(() => {
        if (!fields.length) {
            return [] as { value: string; label: string }[];
        }
        return fields.map(field => ({
            value: field.$id,
            label: field.name?.trim() || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Field'),
        }));
    }, [fields]);

    const eventOrganizationId = useMemo(() => {
        return organization?.$id
            || (activeEditingEvent?.organization as Organization | undefined)?.$id
            || activeEditingEvent?.organizationId
            || '';
    }, [activeEditingEvent?.organization, activeEditingEvent?.organizationId, organization?.$id]);

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
                };
                return normalized;
            })
            .filter((slot): slot is TimeSlot => Boolean(slot));
        setRentalLockedTimeSlots(lockedSlots);
    }, [activeEditingEvent?.fields, activeEditingEvent?.timeSlots, hasExternalRentalField, immutableFields]);

    const fieldsReferencedInSlots = useMemo(() => {
        if (!leagueSlots.length) {
            return hasImmutableFields ? immutableFields : ([] as Field[]);
        }

        const fieldMap = new Map<string, Field>();
        fields.forEach(field => {
            if (field?.$id) {
                fieldMap.set(field.$id, field);
            }
        });

        const seen = new Set<string>();
        const picked: Field[] = [];

        leagueSlots.forEach(slot => {
            const slotFieldId = slot.scheduledFieldId;
            if (!slotFieldId || seen.has(slotFieldId)) {
                return;
            }

            const resolved = fieldMap.get(slotFieldId);
            if (resolved) {
                picked.push(resolved);
            }
            seen.add(slotFieldId);
        });

        if (!picked.length && hasImmutableFields) {
            return immutableFields;
        }

        return picked;
    }, [leagueSlots, fields, hasImmutableFields, immutableFields]);

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

    useEffect(() => {
        if ((eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT') &&
            (!eventData.teamSignup || !eventData.singleDivision)) {
            setEventData(prev => {
                if (prev.teamSignup && prev.singleDivision) {
                    return prev;
                }
                return {
                    ...prev,
                    teamSignup: true,
                    singleDivision: true,
                };
            });
        }
    }, [eventData.eventType, eventData.teamSignup, eventData.singleDivision]);

    // Prevents the creator from joining twice when they toggle team-based registration on.
    useEffect(() => {
        if (eventData.teamSignup) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup]);

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
    }, [isEditMode, eventData.location, eventData.coordinates]);

    useEffect(() => {
        if (!hasExternalRentalField) {
            return;
        }
        if (eventData.eventType !== 'EVENT') {
            setValue('eventType', 'EVENT', { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.eventType, hasExternalRentalField, setValue]);

    const leagueError = errors.leagueSlots ? 'Please resolve league timeslot issues before submitting.' : null;

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
    }, [organization, isEditMode]);

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

        const installmentAmountsCents = source.allowPaymentPlans
            ? normalizeInstallmentCents(source.installmentAmounts)
            : [];
        const minAge = normalizeNumber(source.minAge);
        const maxAge = normalizeNumber(source.maxAge);

        const draft: Partial<Event> = {
            $id: activeEditingEvent?.$id,
            hostId: source.hostId || currentUser?.$id,
            name: source.name.trim(),
            description: source.description,
            location: source.location,
            start: source.start,
            end: source.end,
            eventType: source.eventType,
            state: isEditMode ? activeEditingEvent?.state ?? 'PUBLISHED' : 'UNPUBLISHED',
            sportId: sportId || undefined,
            fieldType: source.fieldType,
            // Backend stores price in cents; convert dollars from the form to cents before saving.
            price: Math.round(Math.max(0, source.price || 0) * 100),
            minAge,
            maxAge,
            allowPaymentPlans: source.allowPaymentPlans,
            installmentCount: source.allowPaymentPlans
                ? source.installmentCount || installmentAmountsCents.length || 0
                : undefined,
            installmentAmounts: source.allowPaymentPlans ? installmentAmountsCents : [],
            installmentDueDates: source.allowPaymentPlans ? source.installmentDueDates : [],
            allowTeamSplitDefault: source.allowTeamSplitDefault,
            maxParticipants: source.maxParticipants,
            teamSizeLimit: source.teamSizeLimit,
            teamSignup: source.teamSignup,
            singleDivision: source.singleDivision,
            divisions: source.divisions,
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
            doTeamsRef: source.doTeamsRef,
            coordinates: baseCoordinates,
        };

        const organizationId = organization?.$id;

        if (!shouldManageLocalFields) {
            let fieldsToInclude = fieldsReferencedInSlots;
            if (!fieldsToInclude.length && hasImmutableFields) {
                fieldsToInclude = immutableFields;
            }
            if (fieldsToInclude.length) {
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
            if (localFields.length) {
                draft.fields = localFields.map((field, idx) => ({
                    ...field,
                    fieldNumber: field.fieldNumber ?? idx + 1,
                    type: field.type || eventData.fieldType,
                }));
                const fieldIds = toIdList(localFields);
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            }
        }

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
            draft.timeSlots = immutableTimeSlots.map(slot => ({ ...slot }));
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
                ? source.leagueData.playoffTeamCount ?? undefined
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

            if (source.leagueData.includePlayoffs && source.playoffData) {
                draft.doubleElimination = source.playoffData.doubleElimination;
                draft.winnerSetCount = source.playoffData.winnerSetCount;
                draft.loserSetCount = source.playoffData.loserSetCount;
                draft.winnerBracketPointsToVictory = source.playoffData.winnerBracketPointsToVictory;
                draft.loserBracketPointsToVictory = source.playoffData.loserBracketPointsToVictory;
            }

            const slotDocuments = source.leagueSlots
                .filter((slot) =>
                    slot.scheduledFieldId &&
                    typeof slot.dayOfWeek === 'number' &&
                    typeof slot.startTimeMinutes === 'number' &&
                    typeof slot.endTimeMinutes === 'number',
                )
                .map((slot) => {
                    const slotId = slot.$id || slot.key;
                    const serialized: TimeSlot = {
                        $id: slotId,
                        dayOfWeek: slot.dayOfWeek as TimeSlot['dayOfWeek'],
                        startTimeMinutes: Number(slot.startTimeMinutes),
                        endTimeMinutes: Number(slot.endTimeMinutes),
                        repeating: slot.repeating !== false,
                        scheduledFieldId: slot.scheduledFieldId as string,
                    };

                    if (source.start) {
                        serialized.startDate = source.start;
                    }
                    if (source.end) {
                        serialized.endDate = source.end;
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

        return draft;
    }, [
        activeEditingEvent?.state,
        activeEditingEvent?.$id,
        eventData,
        fieldsReferencedInSlots,
        hasImmutableFields,
        hasImmutableTimeSlots,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        organization,
        currentUser,
        joinAsParticipant,
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

    const sheetContent = (
        <div className="space-y-6">
            <div className="p-2 space-y-6">
                <div className="p-6">
                    <div className="mb-6">
                        <div className="block text-sm font-medium mb-2">Event Image</div>
                        <ImageUploader
                            currentImageUrl={selectedImageUrl}
                            bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!}
                            className="w-full max-w-md"
                            placeholder="Select event image"
                            onChange={allowImageEdit ? handleImageChange : undefined}
                            readOnly={!allowImageEdit}
                        />
                        {errors.imageId && (
                            <p className="text-red-600 text-sm mt-1">{errors.imageId.message as string}</p>
                        )}
            </div>

                    <form id={formId} className="space-y-8">
                        {/* Basic Information */}
                        <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TextInput
                                    label="Event Name"
                                    withAsterisk
                                    disabled={isImmutableField('name')}
                                    placeholder="Enter event name"
                                    error={errors.name?.message as string | undefined}
                                    {...register('name', { required: 'Event name is required' })}
                                />

                                <Controller
                                    name="sportId"
                                    control={control}
                                    rules={{ required: 'Sport is required' }}
                                    render={({ field, fieldState }) => (
                                        <MantineSelect
                                            label="Sport"
                                            placeholder={sportsLoading ? 'Loading sports...' : 'Select a sport'}
                                            data={sportOptions}
                                            value={field.value || ''}
                                            comboboxProps={sharedComboboxProps}
                                            disabled={isImmutableField('sport') || sportsLoading}
                                            onChange={(value) => {
                                                if (isImmutableField('sport')) return;
                                                const next = value || '';
                                                field.onChange(next);
                                                const selected = next ? sportsById.get(next) ?? null : null;
                                                setValue('sportConfig', selected);
                                            }}
                                            searchable
                                            nothingFoundMessage={sportsLoading ? 'Loading sports...' : 'No sports found'}
                                            rightSection={sportsLoading ? <Loader size="xs" /> : undefined}
                                            error={fieldState.error?.message}
                                            withAsterisk
                                        />
                                    )}
                                />
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
                                {...register('description')}
                            />

                        </Paper>

                        {/* Event Details */}
                        <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                            <h3 className="text-lg font-semibold mb-4">Event Details</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                                                    setValue('singleDivision', true, { shouldDirty: true });
                                                }
                                            }}
                                        />
                                    )}
                                />

                                <Controller
                                    name="fieldType"
                                    control={control}
                                    render={({ field }) => (
                                        <MantineSelect
                                            label="Field Type"
                                            data={[
                                                { value: 'INDOOR', label: 'Indoor' },
                                                { value: 'OUTDOOR', label: 'Outdoor' },
                                                { value: 'SAND', label: 'Sand' },
                                                { value: 'GRASS', label: 'Grass' },
                                            ]}
                                            value={field.value}
                                            comboboxProps={sharedComboboxProps}
                                            disabled={isImmutableField('fieldType')}
                                            onChange={(value) => {
                                                if (isImmutableField('fieldType')) return;
                                                const next = (value?.toUpperCase() as FieldSurfaceType) || field.value;
                                                field.onChange(next);
                                            }}
                                        />
                                    )}
                                />
                            </div>
                        </Paper>

                        <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
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

                        <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">

                            {/* Pricing and Participant Details */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <Controller
                                        name="price"
                                        control={control}
                                        render={({ field }) => (
                                            <NumberInput
                                                label="Price ($)"
                                                min={0}
                                                step={0.01}
                                                value={field.value}
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
                                    {!hasStripeAccount && (
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
                                    )}

                                    <p className="text-sm text-gray-500">
                                        {eventData.price === 0 ? 'Free' : `$${eventData.price?.toFixed(2)}`}
                                    </p>
                                </div>

                                <Controller
                                    name="maxParticipants"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberInput
                                            label="Max Participants"
                                            min={2}
                                            value={field.value}
                                            disabled={isImmutableField('maxParticipants')}
                                            onChange={(val) => {
                                                if (isImmutableField('maxParticipants')) return;
                                                field.onChange(Number(val) || 10);
                                            }}
                                            error={fieldState.error?.message as string | undefined}
                                        />
                                    )}
                                />

                                <Controller
                                    name="teamSizeLimit"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberInput
                                            label="Team Size Limit"
                                            min={1}
                                            value={field.value}
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

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Controller
                                    name="minAge"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberInput
                                            label="Minimum Age"
                                            min={0}
                                            value={field.value ?? ''}
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
                                <Controller
                                    name="maxAge"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <NumberInput
                                            label="Maximum Age"
                                            min={0}
                                            value={field.value ?? ''}
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
                                <Text size="xs" c="dimmed" className="md:col-span-2">
                                    Leave age limits blank if anyone can register.
                                </Text>
                                {(typeof eventData.minAge === 'number' || typeof eventData.maxAge === 'number') && (
                                    <Alert color="yellow" variant="light" className="md:col-span-2">
                                        <Text fw={600} size="sm">
                                            Age-restricted event
                                        </Text>
                                        <Text size="sm">
                                            We only check age using the date of birth users enter in their profile. If your event requires an age check (for example, 18+ or 21+), you are responsible for verifying attendees&apos; age at check-in.
                                        </Text>
                                    </Alert>
                                )}
                            </div>

                            <div className="mt-6 space-y-3">
                                <Group justify="space-between" align="center">
                                    <div>
                                        <Title order={6}>Payment plan</Title>
                                        <Text size="sm" c="dimmed">
                                            Let participants pay over time. Installment totals must match the event price.
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
                                        label="Enable payment plans"
                                    />
                                </Group>

                                {eventData.allowPaymentPlans && (
                                    <div className="space-y-3">
                                        <Group align="flex-start" gap="md">
                                            <NumberInput
                                                label="Installments"
                                                min={1}
                                                value={eventData.installmentCount || eventData.installmentAmounts.length || 1}
                                                onChange={(val) => syncInstallmentCount(Number(val) || 1)}
                                                style={{ maxWidth: 180 }}
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
                                                    <Group key={idx} align="flex-end" gap="sm">
                                                        <DateTimePicker
                                                            label={`Installment ${idx + 1} due`}
                                                            value={dueDateValue}
                                                            onChange={(val) => setInstallmentDueDate(idx, val)}
                                                            style={{ flex: 1 }}
                                                        />
                                                        <NumberInput
                                                            label="Amount"
                                                            min={0}
                                                            step={0.01}
                                                            value={amount}
                                                            onChange={(val) => setInstallmentAmount(idx, Number(val) || 0)}
                                                            decimalScale={2}
                                                            fixedDecimalScale
                                                            style={{ maxWidth: 180 }}
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
                                )}
                            </div>

                            {/* Policy Settings */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <Controller
                                    name="cancellationRefundHours"
                                    control={control}
                                    render={({ field }) => (
                                        <NumberInput
                                            label="Cancellation Refund (Hours)"
                                            min={0}
                                            value={field.value}
                                            disabled={isImmutableField('cancellationRefundHours')}
                                            onChange={(val) => {
                                                if (isImmutableField('cancellationRefundHours')) return;
                                                field.onChange(Number(val) || 24);
                                            }}
                                        />
                                    )}
                                />
                                <Controller
                                    name="registrationCutoffHours"
                                    control={control}
                                    render={({ field }) => (
                                        <NumberInput
                                            label="Registration Cutoff (Hours)"
                                            min={0}
                                            value={field.value}
                                            disabled={isImmutableField('registrationCutoffHours')}
                                            onChange={(val) => {
                                                if (isImmutableField('registrationCutoffHours')) return;
                                                field.onChange(Number(val) || 2);
                                            }}
                                        />
                                    )}
                                />
                            </div>

                            {shouldManageLocalFields && (
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <MantineSelect
                                            label="Number of Fields"
                                            placeholder="Select field count"
                                            data={fieldCountOptions}
                                            value={String(fieldCount)}
                                            onChange={(val) => setFieldCount(Number(val) || 1)}
                                            error={errors.fieldCount?.message as string | undefined}
                                            comboboxProps={sharedComboboxProps}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Fields will be created for this event using the names you provide below.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {fields.map((field, index) => (
                                            <TextInput
                                                key={field.$id}
                                                label={`Field ${field.fieldNumber ?? index + 1} Name`}
                                                value={field.name ?? ''}
                                                onChange={(event) => handleLocalFieldNameChange(index, event.currentTarget.value)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Paper>

                        {/* Location & Time */}
                        <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                            <h3 className="text-lg font-semibold mb-4">Location & Time</h3>

                            <div className="mb-6">
                                <Controller
                                    name="location"
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <LocationSelector
                                            value={field.value}
                                            coordinates={{
                                                lat: (eventData.coordinates[1] ?? defaultLocation?.coordinates?.[1] ?? 0),
                                                lng: (eventData.coordinates[0] ?? defaultLocation?.coordinates?.[0] ?? 0)
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
                                        />
                                    )}
                                />
                            </div>

                            {/* Mantine DateTime pickers */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <Controller
                                        name="start"
                                        control={control}
                                        render={({ field }) => (
                                            <DateTimePicker
                                                label="Start Date & Time"
                                                valueFormat="DD MMM YYYY hh:mm A"
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
                                            />
                                        )}
                                    />
                                </div>
                                <div>
                                    {(eventData.eventType === 'EVENT') &&
                                        <Controller
                                            name="end"
                                            control={control}
                                            render={({ field }) => (
                                                <DateTimePicker
                                                    label="End Date & Time"
                                                    valueFormat="DD MMM YYYY hh:mm A"
                                                    value={parseLocalDateTime(field.value)}
                                                    disabled={isImmutableField('end') || hasExternalRentalField}
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
                                                />
                                            )}
                                        />}
                                </div>
                            </div>
                        </Paper>

                        {/* Skills & Settings */}
                        <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                            <h3 className="text-lg font-semibold mb-4">Event Settings</h3>

                            <Controller
                                name="divisions"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <MantineMultiSelect
                                        label="Divisions"
                                        withAsterisk
                                        placeholder="Select divisions"
                                        data={[
                                            { value: 'beginner', label: 'Beginner (1.0 - 2.5)' },
                                            { value: 'intermediate', label: 'Intermediate (2.5 - 3.5)' },
                                            { value: 'advanced', label: 'Advanced (3.5 - 4.5)' },
                                            { value: 'expert', label: 'Expert (4.5+)' },
                                            { value: 'open', label: 'Open (All Skill Levels)' },
                                        ]}
                                        value={field.value}
                                        disabled={isImmutableField('divisions')}
                                        comboboxProps={sharedComboboxProps}
                                        onChange={(vals) => {
                                            if (isImmutableField('divisions')) return;
                                            field.onChange(vals);
                                        }}
                                        clearable
                                        searchable
                                        error={fieldState.error?.message as string | undefined}
                                    />
                                )}
                            />

                            <Controller
                                name="requiredTemplateIds"
                                control={control}
                                render={({ field }) => (
                                    <MantineMultiSelect
                                        label="Required Documents"
                                        placeholder={templatesLoading ? 'Loading templates...' : 'Select templates'}
                                        data={templateOptions}
                                        value={field.value ?? []}
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
                            {templatesError && (
                                <Text size="sm" c="red">
                                    {templatesError}
                                </Text>
                            )}
                            {!templatesLoading && organizationId && templateOptions.length === 0 && (
                                <Text size="sm" c="dimmed">
                                    No templates yet. Create one in your organization Templates tab.
                                </Text>
                            )}

                            {/* Team Settings */}
                            {eventData.eventType === 'EVENT' ? (
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
                                </div>
                            ) : (
                                <div className="mt-6 space-y-2">
                                    <Switch
                                        label="Team Event (teams compete rather than individuals)"
                                        checked
                                        disabled
                                    />
                                    <Switch
                                        label="Single Division (all skill levels play together)"
                                        checked
                                        disabled
                                    />
                                    <Text size="sm" c="dimmed">
                                        Leagues and tournaments are always team events and use a single division.
                                    </Text>
                                </div>
                            )}
                        </Paper>

                        {eventData.eventType === 'LEAGUE' && (
                            <>
                                <LeagueScoringConfigPanel
                                    value={eventData.leagueScoringConfig}
                                    sport={eventData.sportConfig ?? undefined}
                                    editable={!isImmutableField('leagueScoringConfig')}
                                    onChange={handleLeagueScoringConfigChange}
                                />

                                <LeagueFields
                                    leagueData={leagueData}
                                    sport={eventData.sportConfig ?? undefined}
                                    onLeagueDataChange={(updates) => setLeagueData(prev => ({ ...prev, ...updates }))}
                                    slots={leagueSlots}
                                    onAddSlot={handleAddSlot}
                                    onUpdateSlot={handleUpdateSlot}
                                    onRemoveSlot={handleRemoveSlot}
                                    fields={fields}
                                    fieldsLoading={fieldsLoading}
                                    fieldOptions={leagueFieldOptions}
                                    readOnly={hasImmutableTimeSlots}
                                />

                                {leagueData.includePlayoffs && (
                                    <TournamentFields
                                        title="Playoffs Configuration"
                                        tournamentData={playoffData}
                                        setTournamentData={setPlayoffData}
                                        sport={eventData.sportConfig ?? undefined}
                                    />
                                )}
                            </>
                        )}

                        {/* Tournament Fields */}
                        {eventData.eventType === 'TOURNAMENT' && (
                            <TournamentFields
                                tournamentData={tournamentData}
                                setTournamentData={setTournamentData}
                                sport={eventData.sportConfig ?? undefined}
                            />
                        )}
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
