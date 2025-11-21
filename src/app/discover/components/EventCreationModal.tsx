import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ClockIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import TournamentFields from './TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { useLocation } from '@/app/hooks/useLocation';
import { getEventImageUrl, Event, EventStatus, Division as CoreDivision, UserData, Team, LeagueConfig, Field, FieldSurfaceType, TimeSlot, Organization, EventState, LeagueScoringConfig, Sport, TournamentConfig, toEventPayload } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import LeagueScoringConfigPanel from './LeagueScoringConfigPanel';
import SportConfigPanel from './SportConfigPanel';
import { useSports } from '@/app/hooks/useSports';

import { Modal, TextInput, Textarea, NumberInput, Select as MantineSelect, MultiSelect as MantineMultiSelect, Switch, Group, Button, Alert, Loader, Paper, Text, Title, Stack } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
import { locationService } from '@/lib/locationService';
import { leagueService } from '@/lib/leagueService';
import { userService } from '@/lib/userService';
import { formatLocalDateTime, nowLocalDateTimeString, parseLocalDateTime } from '@/lib/dateUtils';
import LeagueFields, { LeagueSlotForm } from './LeagueFields';
import { ID } from '@/app/appwrite';
import UserCard from '@/components/ui/UserCard';

// UI state will track divisions as string[] of skill keys (e.g., 'beginner')

interface EventCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEventCreated?: (draftEvent: Partial<Event>) => Promise<boolean>;
    onEventSaved?: (createdEvent: Event) => void;
    currentUser: UserData;
    editingEvent?: Event;
    organization: Organization | null;
    immutableDefaults?: Partial<Event>;
}

type EventType = Event['eventType'];

type DefaultLocationSource = 'none' | 'user' | 'organization';

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

type EventFormState = {
    name: string;
    description: string;
    location: string;
    coordinates: [number, number];
    start: string;
    end: string;
    eventType: EventType;
    sportId: string;
    sportConfig: Sport | null;
    fieldType: FieldSurfaceType;
    price: number;
    maxParticipants: number;
    teamSizeLimit: number;
    teamSignup: boolean;
    singleDivision: boolean;
    divisions: string[];
    cancellationRefundHours: number;
    registrationCutoffHours: number;
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

const applyTournamentConfigToEvent = (target: Partial<Event>, config: TournamentConfig): void => {
    for (const key of TOURNAMENT_CONFIG_KEYS) {
        const value = config[key];
        (target as Record<string, unknown>)[key] = TOURNAMENT_ARRAY_CONFIG_KEYS.has(key)
            ? [...(value as number[])]
            : value;
    }
};

const clearTournamentConfigFromEvent = (target: Partial<Event>): void => {
    for (const key of TOURNAMENT_CONFIG_KEYS) {
        if (key === 'restTimeMinutes') {
            continue;
        }
        delete (target as Record<string, unknown>)[key];
    }
};

const createDefaultEventData = (): EventFormState => ({
    name: '',
    description: '',
    location: '',
    coordinates: [0, 0],
    start: nowLocalDateTimeString(),
    end: formatLocalDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    eventType: 'PICKUP',
    sportId: '',
    sportConfig: null,
    fieldType: 'INDOOR',
    price: 0,
    maxParticipants: 10,
    teamSizeLimit: 2,
    teamSignup: false,
    singleDivision: false,
    divisions: [],
    cancellationRefundHours: 24,
    registrationCutoffHours: 2,
    imageId: '',
    seedColor: 0,
    waitList: [],
    freeAgents: [],
    players: [],
    teams: [],
    referees: [],
    refereeIds: [],
    doTeamsRef: false,
    leagueScoringConfig: createLeagueScoringConfig(),
});

const mapEventToFormState = (event: Event): EventFormState => ({
    name: event.name,
    description: event.description ?? '',
    location: event.location ?? '',
    coordinates: Array.isArray(event.coordinates) ? event.coordinates as [number, number] : [0, 0],
    start: event.start,
    end: event.end,
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
    price: Number.isFinite(event.price) ? event.price : 0,
    maxParticipants: Number.isFinite(event.maxParticipants) ? event.maxParticipants : 10,
    teamSizeLimit: Number.isFinite(event.teamSizeLimit) ? event.teamSizeLimit : 2,
    teamSignup: Boolean(event.teamSignup),
    singleDivision: Boolean(event.singleDivision),
    divisions: Array.isArray(event.divisions)
        ? (event.divisions as (string | CoreDivision)[]).map(divisionKeyFromValue)
        : [],
    cancellationRefundHours: Number.isFinite(event.cancellationRefundHours)
        ? event.cancellationRefundHours
        : 24,
    registrationCutoffHours: Number.isFinite(event.registrationCutoffHours)
        ? event.registrationCutoffHours
        : 2,
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

const EventCreationModal: React.FC<EventCreationModalProps> = ({
    isOpen,
    onClose,
    onEventCreated = async () => true,
    onEventSaved,
    currentUser,
    editingEvent,
    organization,
    immutableDefaults,
}) => {
    const router = useRouter();
    const { location: userLocation, locationInfo: userLocationInfo } = useLocation();
    const modalRef = useRef<HTMLDivElement>(null);
    const defaultLocationSourceRef = useRef<DefaultLocationSource>('none');
    const appliedDefaultLocationLabelRef = useRef<string | null>(null);
    const refsPrefilledRef = useRef<boolean>(false);
    // Stores the persisted file ID for the event image so submissions reference storage assets.
    const [selectedImageId, setSelectedImageId] = useState<string>(editingEvent?.imageId || '');


    // Mirrors the event image URL for live preview.
    const [selectedImageUrl, setSelectedImageUrl] = useState(
        editingEvent ? getEventImageUrl({ imageId: editingEvent.imageId, width: 800 }) : ''
    );
    // Builds the mutable slot model consumed by LeagueFields whenever we add or hydrate time slots.
    const createSlotForm = useCallback((slot?: Partial<TimeSlot>): LeagueSlotForm => ({
        key: slot?.$id ?? ID.unique(),
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
    // Guards the submit button and spinner while create/update or preview requests are in-flight.
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Reflects whether the Stripe onboarding call is running to disable repeated clicks.
    const [connectingStripe, setConnectingStripe] = useState(false);
    // Flag the user can toggle to add themselves to new pickup/tournament rosters on creation.
    const [joinAsParticipant, setJoinAsParticipant] = useState(false);
    // Cached Stripe onboarding state pulled from the current user so paid inputs can be enabled/disabled.
    const [hasStripeAccount, setHasStripeAccount] = useState(
        Boolean(organization?.hasStripeAccount || currentUser?.hasStripeAccount),
    );

    const [hydratedEditingEvent, setHydratedEditingEvent] = useState<Event | null>(null);
    const activeEditingEvent = hydratedEditingEvent ?? editingEvent ?? null;

    const isPreviewDraft = Boolean(editingEvent?.$id && editingEvent.$id.startsWith('preview-'));
    const isEditMode = !!activeEditingEvent && !isPreviewDraft;

    const { sports, sportsById, loading: sportsLoading, error: sportsError } = useSports();
    const sportOptions = useMemo(() => sports.map((sport) => ({ value: sport.$id, label: sport.name })), [sports]);

    const immutableDefaultsMemo = useMemo(() => immutableDefaults ?? {}, [immutableDefaults]);

    const immutableFields = useMemo(() => {
        if (!Array.isArray(immutableDefaultsMemo.fields)) {
            return [] as Field[];
        }
        return (immutableDefaultsMemo.fields as Field[])
            .filter((field): field is Field => Boolean(field && field.$id))
            .map((field) => ({ ...field }));
    }, [immutableDefaultsMemo.fields]);

    const hasImmutableFields = immutableFields.length > 0;

    const immutableTimeSlots = useMemo(() => {
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
        if (typeof defaults.price === 'number') next.price = defaults.price;
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
        if (defaults.imageId !== undefined) next.imageId = defaults.imageId ?? '';
        if (typeof defaults.seedColor === 'number') next.seedColor = defaults.seedColor;
        if (Array.isArray(defaults.waitListIds)) next.waitList = [...defaults.waitListIds];
        if (Array.isArray(defaults.freeAgentIds)) next.freeAgents = [...defaults.freeAgentIds];
        if (Array.isArray(defaults.players)) next.players = [...defaults.players];
        if (Array.isArray(defaults.teams)) next.teams = [...defaults.teams];

        return next;
    }, [immutableDefaultsMemo, sportsById]);

    useEffect(() => {
        if (!isOpen || !editingEvent) {
            setHydratedEditingEvent(null);
            return;
        }

        if (editingEvent.eventType !== 'LEAGUE') {
            setHydratedEditingEvent(null);
            return;
        }

        if (Array.isArray(editingEvent.timeSlots) && editingEvent.timeSlots.length > 0) {
            setHydratedEditingEvent(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const full = await eventService.getEventWithRelations(editingEvent.$id);
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
    }, [editingEvent, isOpen]);

    // Complete event data state with ALL fields
    // Central event payload that binds the form inputs for basic details, logistics, and relationships.
    const [eventData, setEventData] = useState<EventFormState>(() =>
        applyImmutableDefaults(
            activeEditingEvent ? mapEventToFormState(activeEditingEvent) : createDefaultEventData()
        )
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
    }, [eventData.refereeIds, eventData.referees]);

    // Holds tournament-specific settings so the modal can conditionally render the TournamentFields block.
    const [tournamentData, setTournamentData] = useState<TournamentConfig>(() => {
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
    });

    const [playoffData, setPlayoffData] = useState<TournamentConfig>(() => buildTournamentConfig());

    // Maintains league configuration sliders/toggles passed into the schedule preview pipeline.
    const [leagueData, setLeagueData] = useState<LeagueConfig>(() => {
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
    });

    // Represents weekly availability rows for league scheduling; normalized with createSlotForm.
    const [leagueSlots, setLeagueSlots] = useState<LeagueSlotForm[]>(() => {
        const defaults = immutableDefaults ?? {};
        const defaultFieldId = Array.isArray(defaults.fields) && defaults.fields.length > 0
            ? (defaults.fields[0] as Field).$id
            : undefined;

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
    });

    // Surface-level validation message shown beneath the LeagueFields component.
    const [leagueError, setLeagueError] = useState<string | null>(null);
    const [refereeSearch, setRefereeSearch] = useState('');
    const [refereeResults, setRefereeResults] = useState<UserData[]>([]);
    const [refereeSearchLoading, setRefereeSearchLoading] = useState(false);
    const [refereeError, setRefereeError] = useState<string | null>(null);

    const initialFieldCount = (() => {
        if (activeEditingEvent?.fields?.length) {
            return activeEditingEvent.fields.length;
        }
        if (activeEditingEvent && typeof (activeEditingEvent as any)?.fieldCount === 'number') {
            const parsed = Number((activeEditingEvent as any).fieldCount);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        }
        return 1;
    })();

    // Tracks the number of ad-hoc fields we should provision when the org lacks saved facilities.
    const [fieldCount, setFieldCount] = useState<number>(initialFieldCount);

    // Mutable list of fields either fetched from the org or generated locally for new events.
    const [fields, setFields] = useState<Field[]>(() => {
        if (hasImmutableFields) {
            return immutableFields.map((field) => ({ ...field }));
        }
        if (activeEditingEvent?.fields?.length) {
            return [...activeEditingEvent.fields].sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0));
        }
        if (!organization) {
            return Array.from({ length: initialFieldCount }, (_, idx) => ({
                $id: ID.unique(),
                name: `Field ${idx + 1}`,
                fieldNumber: idx + 1,
                type: eventData.fieldType,
                location: '',
            } as Field));
        }
        return [];
    });
    // Spinner flag while asynchronous field lookups resolve.
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const shouldProvisionFields = !organization && !hasImmutableFields;
    const shouldManageLocalFields = shouldProvisionFields && !isEditMode && (eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT');

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
                return prev;
            }
            if (!isEditMode && sports.length > 0) {
                const fallback = sports[0];
                if (prev.sportId === fallback.$id && prev.sportConfig?.$id === fallback.$id) {
                    return prev;
                }
                return { ...prev, sportId: fallback.$id, sportConfig: fallback };
            }
            return prev;
        });
    }, [sportsLoading, sports, sportsById, isEditMode]);

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
        if (!isOpen) {
            return;
        }

        defaultLocationSourceRef.current = 'none';
        appliedDefaultLocationLabelRef.current = null;

        if (activeEditingEvent) {
            const mapped = mapEventToFormState(activeEditingEvent);
            const applied = applyImmutableDefaults(mapped);
            setEventData(applied);

            const imageIdDefault = immutableDefaultsMemo.imageId ?? activeEditingEvent.imageId ?? '';
            setSelectedImageId(imageIdDefault);
            setSelectedImageUrl(
                imageIdDefault
                    ? getEventImageUrl({ imageId: imageIdDefault, width: 800 })
                    : ''
            );
        } else {
            const applied = applyImmutableDefaults(createDefaultEventData());
            setEventData(applied);
            const imageIdDefault = immutableDefaultsMemo.imageId;
            if (imageIdDefault) {
                setSelectedImageId(imageIdDefault);
                setSelectedImageUrl(getEventImageUrl({ imageId: imageIdDefault, width: 800 }));
            } else {
                setSelectedImageId('');
                setSelectedImageUrl('');
            }
        }
    }, [activeEditingEvent, isOpen, applyImmutableDefaults, immutableDefaultsMemo]);

    useEffect(() => {
        if (!hasImmutableFields) {
            return;
        }
        setFields(immutableFields.map((field) => ({ ...field })));
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
                        $id: ID.unique(),
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
        setFields([...activeEditingEvent.fields].sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0)));
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
        setLeagueError(null);
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

        setLeagueError(null);
    };

    // Updates locally managed fields when the org lacks saved fields (new event + provisioning).
    const handleLocalFieldNameChange = (index: number, name: string) => {
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
    };

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
            setLeagueSlots(normalizeSlotState([createSlotForm()], 'PICKUP'));
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

        setFields(organization.fields);

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
                [...prev, ...(activeEditingEvent.fields as Field[])].forEach(field => {
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
    const modalTitle = isEditMode ? 'Edit Event' : 'Create New Event';
    const submitButtonText = isEditMode
        ? 'Update Event'
        : eventData.eventType === 'LEAGUE'
            ? 'Preview Schedule'
            : 'Create Event';
    const submittingText = isEditMode
        ? 'Updating...'
        : eventData.eventType === 'LEAGUE'
            ? 'Generating schedule...'
            : 'Creating...';

    const leagueFieldOptions = useMemo(() => {
        if (!fields.length) {
            return [] as { value: string; label: string }[];
        }
        return fields.map(field => ({
            value: field.$id,
            label: field.name?.trim() || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Field'),
        }));
    }, [fields]);

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

    // Validation state
    // Aggregated validity flags used to gate the submit button and surface inline messages.
    const [validation, setValidation] = useState({
        isNameValid: false,
        isPriceValid: true,
        isMaxParticipantsValid: true,
        isTeamSizeValid: true,
        isLocationValid: false,
        isSkillLevelValid: false,
        isImageValid: false,
        isFieldCountValid: true,
        isSportValid: false,
    });

    // Validation effect
    // Recalculate validation every time relevant form values change so the CTA stays accurate.
    useEffect(() => {
        const hasCoordinates = coordinatesAreSet(eventData.coordinates);

        setValidation({
            isNameValid: eventData.name ? eventData.name?.trim().length > 0 : false,
            isPriceValid: eventData.price !== undefined ? eventData.price >= 0 : false,
            isMaxParticipantsValid: eventData.maxParticipants ? eventData.maxParticipants > 1 : false,
            isTeamSizeValid: eventData.teamSizeLimit ? eventData.teamSizeLimit >= 1 : false,
            isLocationValid: eventData.location ? eventData.location.trim().length > 0 && hasCoordinates : false,
            isSkillLevelValid: eventData.eventType === 'LEAGUE' ? true : (eventData.divisions ? eventData.divisions?.length > 0 : false),
            isImageValid: Boolean(selectedImageId || eventData.imageId || selectedImageUrl),
            isFieldCountValid: shouldManageLocalFields ? fields.length >= 1 && fields.every(field => field.name?.trim().length > 0) : true,
            isSportValid: Boolean(eventData.sportId),
        });
    }, [eventData, fieldCount, fields, selectedImageId, selectedImageUrl, shouldManageLocalFields]);

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

    const hasSlotConflicts = eventData.eventType === 'LEAGUE' && leagueSlots.some(slot => Boolean(slot.error));
    const hasIncompleteSlot = eventData.eventType === 'LEAGUE' && leagueSlots.some(slot =>
        !slot.scheduledFieldId ||
        typeof slot.dayOfWeek !== 'number' ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number'
    );

    const requiresSets = Boolean(eventData.sportConfig?.usePointsPerSetWin);
    const matchDurationValid = !requiresSets
        ? (normalizeNumber(leagueData.matchDurationMinutes) ?? 0) > 0
        : true;
    const setTimingValid = !requiresSets
        ? true
        : ((normalizeNumber(leagueData.setsPerMatch) ?? 0) > 0 && (normalizeNumber(leagueData.setDurationMinutes) ?? 0) > 0);
    const pointsValid = !requiresSets
        ? true
        : ((leagueData.pointsToVictory?.length ?? 0) === (leagueData.setsPerMatch ?? 0) &&
            (leagueData.pointsToVictory ?? []).every((value) => Number(value) > 0));

    const leagueFormValid = eventData.eventType !== 'LEAGUE'
        ? true
        : (
            leagueData.gamesPerOpponent >= 1 &&
            matchDurationValid &&
            (!leagueData.includePlayoffs || (leagueData.playoffTeamCount && leagueData.playoffTeamCount > 1)) &&
            setTimingValid &&
            pointsValid &&
            !hasSlotConflicts &&
            !hasIncompleteSlot &&
            (!shouldManageLocalFields || fields.length === Math.max(1, fieldCount)) &&
            (!shouldManageLocalFields || fields.every(field => field.name?.trim().length > 0))
        );

    const userLocationLabel = useMemo(() => {
        if (userLocationInfo) {
            const parts = [userLocationInfo.city, userLocationInfo.state]
                .filter((part): part is string => Boolean(part && part.trim().length > 0));
            if (parts.length) {
                return parts.join(', ');
            }
            if (userLocationInfo.zipCode && userLocationInfo.zipCode.trim().length > 0) {
                return userLocationInfo.zipCode;
            }
            if (userLocationInfo.country && userLocationInfo.country.trim().length > 0) {
                return userLocationInfo.country;
            }
            if (typeof userLocationInfo.lat === 'number' && typeof userLocationInfo.lng === 'number') {
                return formatLatLngLabel(userLocationInfo.lat, userLocationInfo.lng);
            }
        }
        if (userLocation) {
            return formatLatLngLabel(userLocation.lat, userLocation.lng);
        }
        return '';
    }, [userLocationInfo, userLocation]);

    const organizationLocationLabel = (organization?.location ?? '').trim();
    const organizationCoordinates = Array.isArray(organization?.coordinates) ? organization.coordinates : undefined;
    const organizationLat = typeof organizationCoordinates?.[1] === 'number' ? organizationCoordinates[1] : null;
    const organizationLong = typeof organizationCoordinates?.[0] === 'number' ? organizationCoordinates[0] : null;

    // Seeds the location picker with organization defaults or the user's saved location for new events.
    useEffect(() => {
        if (!isOpen || isEditMode) {
            return;
        }

        if (isImmutableField('location') || isImmutableField('coordinates')) {
            return;
        }

        let appliedSource: DefaultLocationSource = 'none';
        let appliedLabel: string | null = null;

        setEventData(prev => {
            if (organizationLocationLabel && defaultLocationSourceRef.current !== 'organization') {
                const canOverride =
                    defaultLocationSourceRef.current === 'none' ||
                    (
                        defaultLocationSourceRef.current === 'user' &&
                        (!appliedDefaultLocationLabelRef.current ||
                            prev.location.trim() === appliedDefaultLocationLabelRef.current.trim())
                    );

                if (canOverride) {
                    const updates: Partial<EventFormState> = { location: organizationLocationLabel };

                    if (
                        organizationLat !== null &&
                        organizationLong !== null &&
                        Number.isFinite(organizationLat) &&
                        Number.isFinite(organizationLong)
                    ) {
                        updates.coordinates = [organizationLong, organizationLat] as [number, number];
                    }

                    const nextLocation = updates.location ?? prev.location;
                    const prevCoordinates = (prev.coordinates ?? [0, 0]) as [number, number];
                    const nextCoordinates = (updates.coordinates ?? prev.coordinates ?? [0, 0]) as [number, number];

                    const locationChanged = nextLocation !== prev.location;
                    const coordsChanged =
                        prevCoordinates[0] !== nextCoordinates[0] || prevCoordinates[1] !== nextCoordinates[1];

                    if (locationChanged || coordsChanged) {
                        appliedSource = 'organization';
                        appliedLabel = organizationLocationLabel;
                        return {
                            ...prev,
                            ...updates,
                        };
                    }
                }
            }

            if (defaultLocationSourceRef.current === 'none' && userLocation) {
                const labelCandidate = userLocationLabel.trim() || formatLatLngLabel(userLocation.lat, userLocation.lng);
                const updates: Partial<EventFormState> = {};

                if (!prev.location.trim() && labelCandidate) {
                    updates.location = labelCandidate;
                }

                if (!coordinatesAreSet(prev.coordinates)) {
                    updates.coordinates = [userLocation.lng, userLocation.lat] as [number, number];
                }

                if (Object.keys(updates).length > 0) {
                    appliedSource = 'user';
                    appliedLabel = updates.location ?? labelCandidate;
                    return {
                        ...prev,
                        ...updates,
                    };
                }
            }

            return prev;
        });

        if (appliedSource !== 'none') {
            defaultLocationSourceRef.current = appliedSource;
            appliedDefaultLocationLabelRef.current = appliedLabel;
        }
    }, [
        isOpen,
        isEditMode,
        organizationLocationLabel,
        organizationLat,
        organizationLong,
        userLocation,
        userLocationLabel,
    ]);

    useEffect(() => {
        refsPrefilledRef.current = false;
    }, [organization?.$id]);

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

    const isValid = Object.values(validation).every(v => v) && leagueFormValid;

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

    // Generates an in-memory league schedule and navigates to the preview page for new leagues.
    const handleLeaguePreview = async () => {
        if (eventData.eventType !== 'LEAGUE' || isEditMode) return;
        if (isSubmitting || !isValid) return;

        const startDate = parseLocalDateTime(eventData.start);
        if (!startDate) {
            setLeagueError('Provide a valid start date for the league.');
            return;
        }

        const endDate = eventData.end ? parseLocalDateTime(eventData.end) : null;
        if (eventData.end && !endDate) {
            setLeagueError('Provide a valid end date for the league or leave it blank.');
            return;
        }

        if (endDate && startDate > endDate) {
            setLeagueError('League end date must be after the start date.');
            return;
        }

        const invalidTimes = leagueSlots.some(slot =>
            typeof slot.startTimeMinutes === 'number' &&
            typeof slot.endTimeMinutes === 'number' &&
            slot.endTimeMinutes <= slot.startTimeMinutes
        );

        if (invalidTimes) {
            setLeagueError('Each timeslot must end after it starts.');
            return;
        }

        const sportSelection = eventData.sportConfig;
        if (!sportSelection) {
            setLeagueError('Select a sport before previewing the schedule.');
            return;
        }

        const finalImageId = selectedImageId || eventData.imageId;
        if (!finalImageId) {
            setLeagueError('Add an event image before previewing the schedule.');
            return;
        }

        const validSlots = leagueSlots.filter(slot =>
            slot.scheduledFieldId &&
            typeof slot.dayOfWeek === 'number' &&
            typeof slot.startTimeMinutes === 'number' &&
            typeof slot.endTimeMinutes === 'number'
        );

        if (validSlots.length === 0) {
            setLeagueError('Add at least one complete weekly timeslot to continue.');
            return;
        }

        setIsSubmitting(true);
        setLeagueError(null);

        try {
            const restTime = normalizeNumber(leagueData.restTimeMinutes);
            const previewRequiresSets = Boolean(sportSelection.usePointsPerSetWin);
            const setsPerMatchValue = leagueData.setsPerMatch ?? 1;
            const normalizedPoints = previewRequiresSets
                ? (() => {
                    const base = Array.isArray(leagueData.pointsToVictory)
                        ? leagueData.pointsToVictory.slice(0, setsPerMatchValue)
                        : [];
                    while (base.length < setsPerMatchValue) base.push(21);
                    return base;
                })()
                : undefined;

            const timingFields = previewRequiresSets
                ? {
                    usesSets: true,
                    setDurationMinutes: normalizeNumber(leagueData.setDurationMinutes) ?? 20,
                    setsPerMatch: setsPerMatchValue,
                    pointsToVictory: normalizedPoints,
                    ...(restTime !== undefined ? { restTimeMinutes: restTime } : {}),
                }
                : {
                    usesSets: false,
                    matchDurationMinutes: normalizeNumber(leagueData.matchDurationMinutes, 60) ?? 60,
                    ...(restTime !== undefined ? { restTimeMinutes: restTime } : {}),
                };

            const fieldMap = new Map<string, Field>();
            fieldsReferencedInSlots.forEach(field => {
                if (field?.$id) {
                    fieldMap.set(field.$id, field);
                }
            });

            const slotDocuments: Record<string, unknown>[] = validSlots
                .map((slot): any | null => {
                    if (!slot.scheduledFieldId) {
                        return null;
                    }

                    const fieldId = slot.scheduledFieldId;
                    const startDateValue = eventData.start;
                    const endDateValue = eventData.end;

                    const serializedSlot: Record<string, unknown> = {
                        $id: slot.$id || ID.unique(),
                        dayOfWeek: slot.dayOfWeek as TimeSlot['dayOfWeek'],
                        startTimeMinutes: Number(slot.startTimeMinutes),
                        endTimeMinutes: Number(slot.endTimeMinutes),
                        repeating: slot.repeating !== false,
                        scheduledFieldId: fieldId,
                    };

                    if (startDateValue) {
                        serializedSlot.startDate = startDateValue;
                    }
                    if (endDateValue) {
                        serializedSlot.endDate = endDateValue;
                    }

                    return serializedSlot;
                })
                .filter((slot): slot is Record<string, unknown> => slot !== null);


            const organizationId = organization?.$id;

            const eventDocument: Record<string, any> = {
                $id: ID.unique(),
                name: eventData.name,
                description: eventData.description,
                start: eventData.start,
                end: eventData.end,
                location: eventData.location,
                coordinates: eventData.coordinates,
                eventType: 'LEAGUE',
                sportId: sportSelection.$id,
                fieldType: eventData.fieldType,
                price: eventData.price,
                maxParticipants: eventData.maxParticipants,
                teamSignup: eventData.teamSignup,
                waitListIds: eventData.waitList,
                freeAgentIds: eventData.freeAgents,
                imageId: finalImageId,
                singleDivision: eventData.singleDivision,
                divisions: eventData.divisions,
                teamSizeLimit: eventData.teamSizeLimit,
                hostId: currentUser?.$id,
                state: 'UNPUBLISHED' as EventState,
                gamesPerOpponent: leagueData.gamesPerOpponent,
                includePlayoffs: leagueData.includePlayoffs,
                playoffTeamCount: leagueData.includePlayoffs ? leagueData.playoffTeamCount ?? undefined : undefined,
                seedColor: eventData.seedColor,
                cancellationRefundHours: eventData.cancellationRefundHours,
                registrationCutoffHours: eventData.registrationCutoffHours,
                ...timingFields,
                matches: [],
                teams: [],
                players: joinAsParticipant ? [currentUser] : [],
                fields: fieldsReferencedInSlots,
                timeSlots: slotDocuments,
                organizationId: organizationId,
                leagueScoringConfig: eventData.leagueScoringConfig,
            };

            if (leagueData.includePlayoffs) {
                applyTournamentConfigToEvent(eventDocument as Partial<Event>, playoffData);
            } else {
                clearTournamentConfigFromEvent(eventDocument as Partial<Event>);
            }

            const preview = await leagueService.previewScheduleFromDocument(eventDocument);
            const previewEvent = preview.event as Event | undefined;
            if (!previewEvent) {
                throw new Error('Failed to generate preview schedule.');
            }

            const previewPayload = toEventPayload(previewEvent);

            if (typeof window !== 'undefined') {
                sessionStorage.setItem(
                    `league-preview-event:${previewPayload.$id}`,
                    JSON.stringify(previewPayload)
                );
                sessionStorage.setItem('league-preview-resume-id', previewPayload.$id);
            }

            onClose();
            router.push(`/discover/${previewPayload.$id}/schedule?preview=1`);
        } catch (error) {
            setLeagueError(error instanceof Error ? error.message : 'Failed to generate preview schedule.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Persists the event (or triggers preview for new leagues) when the modal form is submitted.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting || !isValid) return;

        if (!isEditMode && eventData.eventType === 'LEAGUE') {
            await handleLeaguePreview();
            return;
        }

        setIsSubmitting(true);
        try {
            const finalImageId = selectedImageId || eventData.imageId;
            if (!finalImageId) {
                setIsSubmitting(false);
                return;
            }

            const sportSelection = eventData.sportConfig;
            if (!sportSelection) {
                setIsSubmitting(false);
                return;
            }
            const sportId = (sportSelection.$id && String(sportSelection.$id)) || (eventData.sportId?.trim() || '');

            const baseCoordinates: [number, number] = eventData.coordinates;
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

            const submitEvent: Partial<Event> = {
                name: eventData.name.trim(),
                description: eventData.description,
                location: eventData.location,
                start: eventData.start,
                end: eventData.end,
                eventType: eventData.eventType,
                state: isEditMode ? activeEditingEvent?.state ?? 'PUBLISHED' : 'UNPUBLISHED',
                sportId: sportId || undefined,
                fieldType: eventData.fieldType,
                price: eventData.price,
                maxParticipants: eventData.maxParticipants,
                teamSizeLimit: eventData.teamSizeLimit,
                teamSignup: eventData.teamSignup,
                singleDivision: eventData.singleDivision,
                divisions: eventData.divisions,
                cancellationRefundHours: eventData.cancellationRefundHours,
                registrationCutoffHours: eventData.registrationCutoffHours,
                imageId: finalImageId,
                seedColor: eventData.seedColor,
                waitListIds: eventData.waitList,
                freeAgentIds: eventData.freeAgents,
                teams: eventData.teams,
                players: eventData.players,
                referees: eventData.referees,
                refereeIds: eventData.refereeIds,
                doTeamsRef: eventData.doTeamsRef,
                coordinates: baseCoordinates,
                
            };

            const organizationId = organization?.$id;

            if (!shouldManageLocalFields) {
                let fieldsToInclude = fieldsReferencedInSlots;
                if (!fieldsToInclude.length && hasImmutableFields) {
                    fieldsToInclude = immutableFields;
                }
                if (fieldsToInclude.length) {
                    submitEvent.fields = fieldsToInclude.map(field => ({ ...field }));
                    const fieldIds = toIdList(fieldsToInclude);
                    if (fieldIds.length) {
                        submitEvent.fieldIds = fieldIds;
                    }
                }
            } else if (hasImmutableFields) {
                submitEvent.fields = immutableFields.map(field => ({ ...field }));
                const fieldIds = toIdList(immutableFields);
                if (fieldIds.length) {
                    submitEvent.fieldIds = fieldIds;
                }
            }

            if (organizationId) {
                submitEvent.organization = organizationId;
                submitEvent.organizationId = organizationId;
            }

            if (!isEditMode) {
                if (currentUser?.$id) {
                    submitEvent.hostId = currentUser.$id;
                }
                submitEvent.waitListIds = [];
                submitEvent.freeAgentIds = [];
                submitEvent.players = joinAsParticipant && currentUser ? [currentUser] : [];
                submitEvent.userIds = joinAsParticipant && currentUser?.$id ? [currentUser.$id] : [];
                if (shouldProvisionFields) {
                    submitEvent.fieldCount = fieldCount;
                }
            }

            if (eventData.eventType === 'TOURNAMENT') {
                Object.assign(submitEvent, tournamentData);
                if (!isEditMode && shouldProvisionFields) {
                    submitEvent.fieldCount = fieldCount;
                }
            }

        if (eventData.eventType === 'LEAGUE') {
                const restTime = normalizeNumber(leagueData.restTimeMinutes);
                const submitRequiresSets = Boolean(sportSelection.usePointsPerSetWin);
                const setsPerMatchValue = leagueData.setsPerMatch ?? 1;
                const normalizedPoints = submitRequiresSets
                    ? (() => {
                        const base = Array.isArray(leagueData.pointsToVictory)
                            ? leagueData.pointsToVictory.slice(0, setsPerMatchValue)
                            : [];
                        while (base.length < setsPerMatchValue) base.push(21);
                        return base;
                    })()
                    : undefined;

                const timingFields = submitRequiresSets
                    ? {
                        usesSets: true,
                        setDurationMinutes: normalizeNumber(leagueData.setDurationMinutes) ?? 20,
                        setsPerMatch: setsPerMatchValue,
                        pointsToVictory: normalizedPoints,
                        ...(restTime !== undefined ? { restTimeMinutes: restTime } : {}),
                    }
                    : {
                        usesSets: false,
                        matchDurationMinutes: normalizeNumber(leagueData.matchDurationMinutes, 60) ?? 60,
                        ...(restTime !== undefined ? { restTimeMinutes: restTime } : {}),
                    };

                Object.assign(submitEvent, {
                    gamesPerOpponent: leagueData.gamesPerOpponent,
                    includePlayoffs: leagueData.includePlayoffs,
                    playoffTeamCount: leagueData.includePlayoffs ? leagueData.playoffTeamCount ?? undefined : undefined,
                    ...timingFields,
                });

                if (leagueData.includePlayoffs) {
                    applyTournamentConfigToEvent(submitEvent, playoffData);
                } else {
                    clearTournamentConfigFromEvent(submitEvent);
                }

                if (!isEditMode) {
                    submitEvent.status = 'draft' as EventStatus;
                }

                if (!isEditMode && shouldProvisionFields && !shouldManageLocalFields) {
                    submitEvent.fieldCount = fieldCount;
                }
            }

            if (eventData.eventType === 'TOURNAMENT' || eventData.eventType === 'LEAGUE') {
                delete submitEvent.end;
            }

            if (hasImmutableTimeSlots) {
                submitEvent.timeSlots = immutableTimeSlots.map(slot => ({ ...slot }));
                const slotIds = toIdList(immutableTimeSlots);
                if (slotIds.length) {
                    submitEvent.timeSlotIds = slotIds;
                }
            }

            const teamIds = toIdList(submitEvent.teams as Team[] | undefined);
            if (teamIds.length) {
                submitEvent.teamIds = teamIds;
            }

            const userIds = toIdList(submitEvent.players as UserData[] | undefined);
            if (userIds.length && !submitEvent.userIds?.length) {
                submitEvent.userIds = userIds;
            }

            if (eventData.leagueScoringConfig?.$id) {
                submitEvent.leagueScoringConfigId = eventData.leagueScoringConfig.$id;
            }

            const shouldProceed = await onEventCreated(submitEvent);
            if (!shouldProceed) {
                setIsSubmitting(false);
                return;
            }

            let resultEvent;
            if (isEditMode && activeEditingEvent) {
                resultEvent = await eventService.updateEvent(activeEditingEvent.$id, submitEvent);
            } else {
                resultEvent = await eventService.createEvent(submitEvent);
            }

            onEventSaved?.(resultEvent);
            onClose();
        } catch (error) {
            console.error(`Failed to ${isEditMode ? 'update' : 'create'} event:`, error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Syncs the selected event image with component state after uploads or picker changes.
    const handleImageChange = (fileId: string, _url: string) => {
        if (isImmutableField('imageId')) {
            return;
        }
        setSelectedImageId(fileId);
        setSelectedImageUrl(fileId ? getEventImageUrl({ imageId: fileId, width: 800 }) : '');
        setEventData(prev => ({ ...prev, imageId: fileId }));
    };

    const allowImageEdit = !isImmutableField('imageId');
    const isLocationImmutable = isImmutableField('location') || isImmutableField('coordinates');

    if (!isOpen) return null;

    return (
        <Modal opened={isOpen} onClose={onClose} title={modalTitle} size="xl" centered>
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
                    {!validation.isImageValid && (
                        <p className="text-red-600 text-sm mt-1">An event image is required.</p>
                    )}
                </div>

                <h2 className="text-3xl font-bold mb-4">{modalTitle}</h2>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Basic Information */}
                    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                        <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TextInput
                                label="Event Name"
                                withAsterisk
                                value={eventData.name}
                                disabled={isImmutableField('name')}
                                onChange={(e) => {
                                    if (isImmutableField('name')) return;
                                    setEventData(prev => ({ ...prev, name: e.currentTarget?.value || '' }));
                                }}
                                placeholder="Enter event name"
                                error={!validation.isNameValid ? 'Event name is required' : undefined}
                            />

                            <MantineSelect
                                label="Sport"
                                placeholder={sportsLoading ? 'Loading sports...' : 'Select a sport'}
                                data={sportOptions}
                                value={eventData.sportId}
                                disabled={isImmutableField('sport') || sportsLoading}
                                onChange={(value) => {
                                    if (isImmutableField('sport')) return;
                                    if (!value) {
                                        setEventData(prev => ({
                                            ...prev,
                                            sportId: '',
                                            sportConfig: null,
                                        }));
                                        return;
                                    }
                                    const selected = sportsById.get(value);
                                    setEventData(prev => ({
                                        ...prev,
                                        sportId: value,
                                        sportConfig: selected ?? null,
                                    }));
                                }}
                                searchable
                                nothingFoundMessage={sportsLoading ? 'Loading sports...' : 'No sports found'}
                                rightSection={sportsLoading ? <Loader size="xs" /> : undefined}
                                error={!validation.isSportValid && !sportsLoading ? 'Select a sport' : undefined}
                                withAsterisk
                            />
                        </div>

                        {sportsError && (
                            <Alert color="red" radius="md" mt="sm">
                                Unable to load sports at the moment. Please refresh the page and try again.
                            </Alert>
                        )}

                        <Textarea
                            label="Description"
                            value={eventData.description}
                            disabled={isImmutableField('description')}
                            onChange={(e) => {
                                if (isImmutableField('description')) return;
                                setEventData(prev => ({ ...prev, description: e.currentTarget?.value || '' }));
                            }}
                            placeholder="Describe your event..."
                            autosize
                            minRows={3}
                            className="mt-4"
                        />

                        {eventData.sportConfig && (
                            <div className="mt-6">
                                <SportConfigPanel sport={eventData.sportConfig} />
                            </div>
                        )}
                    </Paper>

                    {/* Event Details */}
                    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                        <h3 className="text-lg font-semibold mb-4">Event Details</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <MantineSelect
                                label="Event Type"
                                data={[
                                    { value: 'PICKUP', label: 'Pickup Game' },
                                    { value: 'TOURNAMENT', label: 'Tournament' },
                                    { value: 'LEAGUE', label: 'League' },
                                ]}
                                value={eventData.eventType}
                                disabled={isImmutableField('eventType')}
                                onChange={(value) => {
                                    if (isImmutableField('eventType')) return;
                                    if (!value) return;
                                    setLeagueError(null);
                                    const nextType = value as EventType;
                                    const enforcingTeamSettings = nextType === 'LEAGUE' || nextType === 'TOURNAMENT';
                                    setEventData(prev => ({
                                        ...prev,
                                        eventType: nextType,
                                        teamSignup: enforcingTeamSettings ? true : prev.teamSignup,
                                        singleDivision: enforcingTeamSettings ? true : prev.singleDivision,
                                    }));
                                }}
                            />

                            <MantineSelect
                                label="Field Type"
                                data={[
                                    { value: 'INDOOR', label: 'Indoor' },
                                    { value: 'OUTDOOR', label: 'Outdoor' },
                                    { value: 'SAND', label: 'Sand' },
                                    { value: 'GRASS', label: 'Grass' },
                                ]}
                                value={eventData.fieldType}
                                disabled={isImmutableField('fieldType')}
                                onChange={(value) => {
                                    if (isImmutableField('fieldType')) return;
                                    setEventData(prev => ({
                                        ...prev,
                                        fieldType: (value?.toUpperCase() as FieldSurfaceType) || prev.fieldType,
                                    }));
                                }}
                            />
                        </div>
                    </Paper>

                    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                        <h3 className="text-lg font-semibold mb-4">Referees</h3>
                        <Stack gap="sm">
                            <Switch
                                label="Teams provide referees"
                                description="Allow assigning team referees alongside dedicated refs."
                                checked={eventData.doTeamsRef}
                                onChange={(e) => setEventData((prev) => ({ ...prev, doTeamsRef: e.currentTarget.checked }))}
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
                                    <Text size="sm" c="dimmed">No referees found.</Text>
                                )}
                            </div>
                        </Stack>
                    </Paper>

                    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">

                        {/* Pricing and Participant Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <NumberInput
                                    label="Price ($)"
                                    min={0}
                                    step={0.01}
                                    value={eventData.price}
                                    onChange={(val) => {
                                        if (isImmutableField('price')) return;
                                        setEventData(prev => ({ ...prev, price: Number(val) || 0 }));
                                    }}
                                    disabled={!hasStripeAccount || isImmutableField('price')}
                                    decimalScale={2}
                                    fixedDecimalScale
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

                            <NumberInput
                                label="Max Participants"
                                min={2}
                                value={eventData.maxParticipants}
                                disabled={isImmutableField('maxParticipants')}
                                onChange={(val) => {
                                    if (isImmutableField('maxParticipants')) return;
                                    setEventData(prev => ({ ...prev, maxParticipants: Number(val) || 10 }));
                                }}
                                error={!validation.isMaxParticipantsValid ? 'Enter at least 2' : undefined}
                            />

                            <NumberInput
                                label="Team Size Limit"
                                min={1}
                                value={eventData.teamSizeLimit}
                                disabled={isImmutableField('teamSizeLimit')}
                                onChange={(val) => {
                                    if (isImmutableField('teamSizeLimit')) return;
                                    setEventData(prev => ({ ...prev, teamSizeLimit: Number(val) || 2 }));
                                }}
                                error={!validation.isTeamSizeValid ? 'Enter at least 1' : undefined}
                            />
                        </div>

                        {/* Policy Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <NumberInput
                                label="Cancellation Refund (Hours)"
                                min={0}
                                value={eventData.cancellationRefundHours}
                                disabled={isImmutableField('cancellationRefundHours')}
                                onChange={(val) => {
                                    if (isImmutableField('cancellationRefundHours')) return;
                                    setEventData(prev => ({ ...prev, cancellationRefundHours: Number(val) || 24 }));
                                }}
                            />
                            <NumberInput
                                label="Registration Cutoff (Hours)"
                                min={0}
                                value={eventData.registrationCutoffHours}
                                disabled={isImmutableField('registrationCutoffHours')}
                                onChange={(val) => {
                                    if (isImmutableField('registrationCutoffHours')) return;
                                    setEventData(prev => ({ ...prev, registrationCutoffHours: Number(val) || 2 }));
                                }}
                            />
                        </div>

                        {shouldManageLocalFields && (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <NumberInput
                                        label="Number of Fields"
                                        min={1}
                                        value={fieldCount}
                                        onChange={(val) => setFieldCount(Number(val) || 1)}
                                        error={!validation.isFieldCountValid ? 'Specify at least one field' : undefined}
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
                            <LocationSelector
                                value={eventData.location}
                                coordinates={{
                                    lat: (eventData.coordinates[1] ?? userLocation?.lat ?? 0),
                                    lng: (eventData.coordinates[0] ?? userLocation?.lng ?? 0)
                                }}
                                onChange={(location, lat, lng) => {
                                    if (isLocationImmutable) return;
                                    setEventData(prev => ({ ...prev, location, coordinates: [lng, lat] }));
                                }}
                                isValid={validation.isLocationValid}
                                disabled={isLocationImmutable}
                                label="Location"
                                required
                                errorMessage="Location is required"
                            />
                        </div>

                        {/* Mantine DateTime pickers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <DateTimePicker
                                    label="Start Date & Time"
                                    valueFormat="DD MMM YYYY hh:mm A"
                                    value={parseLocalDateTime(eventData.start)}
                                    disabled={isImmutableField('start')}
                                    onChange={(val) => {
                                        if (isImmutableField('start')) return;
                                        const parsed = parseLocalDateTime(val as Date | string | null);
                                        if (!parsed) return;
                                        setEventData(prev => ({ ...prev, start: formatLocalDateTime(parsed) }));
                                    }}
                                    minDate={todaysDate}
                                    timePickerProps={{
                                        withDropdown: true,
                                        format: '12h',

                                    }}
                                />
                            </div>
                            <div>
                                {(eventData.eventType === 'PICKUP') &&
                                    <DateTimePicker
                                        label="End Date & Time"
                                        valueFormat="DD MMM YYYY hh:mm A"
                                        value={parseLocalDateTime(eventData.end)}
                                        disabled={isImmutableField('end')}
                                        onChange={(val) => {
                                            if (isImmutableField('end')) return;
                                            const parsed = parseLocalDateTime(val as Date | string | null);
                                            if (!parsed) return;
                                            setEventData(prev => ({ ...prev, end: formatLocalDateTime(parsed) }));
                                        }}
                                        minDate={parseLocalDateTime(eventData.start) ?? todaysDate}
                                        timePickerProps={{
                                            withDropdown: true,
                                            format: '12h',

                                        }}
                                    />}
                            </div>
                        </div>
                    </Paper>

                    {/* legacy date/time inputs removed after migration to Mantine DateTimePicker */}

                    {/* Skills & Settings */}
                    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
                        <h3 className="text-lg font-semibold mb-4">Event Settings</h3>

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
                            value={eventData.divisions}
                            disabled={isImmutableField('divisions')}
                            onChange={(vals) => {
                                if (isImmutableField('divisions')) return;
                                setEventData(prev => ({ ...prev, divisions: vals }));
                            }}
                            clearable
                            searchable
                            error={!validation.isSkillLevelValid ? 'Select at least one division' : undefined}
                        />

                        {/* Team Settings */}
                        {eventData.eventType === 'PICKUP' ? (
                            <div className="mt-6 space-y-3">
                                <Switch
                                    label="Team Event (teams compete rather than individuals)"
                                    checked={eventData.teamSignup}
                                    disabled={isImmutableField('teamSignup')}
                                    onChange={(e) => {
                                        if (isImmutableField('teamSignup')) return;
                                        const checked = e.currentTarget.checked;
                                        setEventData(prev => ({ ...prev, teamSignup: checked }));
                                    }}
                                />
                                <Switch
                                    label="Single Division (all skill levels play together)"
                                    checked={eventData.singleDivision}
                                    disabled={isImmutableField('singleDivision')}
                                    onChange={(e) => {
                                        if (isImmutableField('singleDivision')) return;
                                        const checked = e.currentTarget.checked;
                                        setEventData(prev => ({ ...prev, singleDivision: checked }));
                                    }}
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
                    {!isEditMode && !eventData.teamSignup && eventData.eventType !== 'LEAGUE' && (
                        <Switch
                            label="Join as participant"
                            checked={joinAsParticipant}
                            onChange={(e) => {
                                const checked = e.currentTarget.checked;
                                setJoinAsParticipant(checked);
                            }}
                        />
                    )}
                    {isEditMode && activeEditingEvent && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (!activeEditingEvent) return;
                                if (!confirm('Delete this event? This cannot be undone.')) return;
                                setIsSubmitting(true);
                                try {
                                    const ok = await eventService.deleteEvent(activeEditingEvent);
                                    if (ok) {
                                        onClose();
                                    }
                                } finally {
                                    setIsSubmitting(false);
                                }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                            Delete Event
                        </button>
                    )}
                </div>

                <Group gap="sm">
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
                        {isSubmitting ? submittingText : submitButtonText}
                    </Button>
                </Group>
            </div>
        </Modal>
    );
};

export default EventCreationModal;
