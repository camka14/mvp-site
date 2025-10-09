import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ClockIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import TournamentFields from './TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { useLocation } from '@/app/hooks/useLocation';
import { getEventImageUrl, SPORTS_LIST, Event, EventStatus, Division as CoreDivision, UserData, Team, LeagueConfig, Field, TimeSlot, Organization } from '@/types';

import { Modal, TextInput, Textarea, NumberInput, Select as MantineSelect, MultiSelect as MantineMultiSelect, Switch, Group, Button, Alert } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
import { locationService } from '@/lib/locationService';
import { leagueService } from '@/lib/leagueService';
import { formatLocalDateTime, nowLocalDateTimeString, parseLocalDateTime } from '@/lib/dateUtils';
import LeagueFields, { LeagueSlotForm } from './LeagueFields';
import { ID } from '@/app/appwrite';

// UI state will track divisions as string[] of skill keys (e.g., 'beginner')

interface EventCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEventCreated: (updatedEvent?: Event) => void;
    currentUser: UserData;
    editingEvent?: Event;
    organization: Organization | null;
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
    if (eventType !== 'league') {
        return undefined;
    }

    const slot = slots[index];
    if (!slot) {
        return undefined;
    }

    const slotField = slot.field;
    if (!slotField || typeof slotField.$id !== 'string') {
        return undefined;
    }

    if (
        typeof slot.dayOfWeek !== 'number' ||
        typeof slot.startTime !== 'number' ||
        typeof slot.endTime !== 'number'
    ) {
        return undefined;
    }

    const slotDayOfWeek = slot.dayOfWeek;
    const slotStartTime = slot.startTime;
    const slotEndTime = slot.endTime;

    if (slotEndTime <= slotStartTime) {
        return 'Timeslot must end after it starts.';
    }

    const hasOverlap = slots.some((other, otherIndex) => {
        if (otherIndex === index) {
            return false;
        }

        const otherField = other.field;
        if (!otherField || typeof otherField.$id !== 'string') {
            return false;
        }

        if (otherField.$id !== slotField.$id) {
            return false;
        }

        if (typeof other.dayOfWeek !== 'number' || other.dayOfWeek !== slotDayOfWeek) {
            return false;
        }

        if (
            typeof other.startTime !== 'number' ||
            typeof other.endTime !== 'number'
        ) {
            return false;
        }

        const otherStartTime = other.startTime;
        const otherEndTime = other.endTime;

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

type EventFormState = {
    name: string;
    description: string;
    location: string;
    coordinates: [number, number];
    lat: number;
    long: number;
    start: string;
    end: string;
    eventType: 'pickup' | 'tournament' | 'league';
    sport: string;
    fieldType: string;
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

const createDefaultEventData = (): EventFormState => ({
    name: '',
    description: '',
    location: '',
    coordinates: [0, 0],
    lat: 0,
    long: 0,
    start: nowLocalDateTimeString(),
    end: formatLocalDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    eventType: 'pickup',
    sport: '',
    fieldType: 'indoor',
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
});

const mapEventToFormState = (event: Event): EventFormState => ({
    name: event.name,
    description: event.description ?? '',
    location: event.location ?? '',
    coordinates: Array.isArray(event.coordinates) ? event.coordinates as [number, number] : [0, 0],
    lat: Array.isArray(event.coordinates)
        ? Number(event.coordinates[1])
        : Number((event as any).coordinates?.lat || 0),
    long: Array.isArray(event.coordinates)
        ? Number(event.coordinates[0])
        : Number((event as any).coordinates?.lng || 0),
    start: event.start,
    end: event.end,
    eventType: event.eventType,
    sport: event.sport ?? '',
    fieldType: event.fieldType ?? 'indoor',
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
});

const EventCreationModal: React.FC<EventCreationModalProps> = ({
    isOpen,
    onClose,
    onEventCreated,
    currentUser,
    editingEvent,
    organization
}) => {
    const router = useRouter();
    const { location: userLocation, locationInfo: userLocationInfo } = useLocation();
    const modalRef = useRef<HTMLDivElement>(null);
    const defaultLocationSourceRef = useRef<DefaultLocationSource>('none');
    const appliedDefaultLocationLabelRef = useRef<string | null>(null);
    // Stores the persisted file ID for the event hero image so submissions reference storage assets.
    const [selectedImageId, setSelectedImageId] = useState<string>(editingEvent?.imageId || '');


    // Mirrors the hero image URL for live preview inside the modal banner.
    const [selectedImageUrl, setSelectedImageUrl] = useState(
        editingEvent ? getEventImageUrl({ imageId: editingEvent.imageId, width: 800 }) : ''
    );
    // Builds the mutable slot model consumed by LeagueFields whenever we add or hydrate time slots.
    const createSlotForm = useCallback((slot?: Partial<TimeSlot>): LeagueSlotForm => ({
        key: slot?.$id ?? ID.unique(),
        $id: slot?.$id,
        field: typeof slot?.field === 'object' && slot.field ? slot.field as Field : undefined,
        dayOfWeek: slot?.dayOfWeek,
        startTime: slot?.startTime,
        endTime: slot?.endTime,
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
    const [hasStripeAccount, setHasStripeAccount] = useState(currentUser?.hasStripeAccount || false);

    const isPreviewDraft = Boolean(editingEvent?.$id && editingEvent.$id.startsWith('preview-'));
    const isEditMode = !!editingEvent && !isPreviewDraft;

    // Complete event data state with ALL fields
    // Central event payload that binds the form inputs for basic details, logistics, and relationships.
    const [eventData, setEventData] = useState<EventFormState>(() =>
        editingEvent ? mapEventToFormState(editingEvent) : createDefaultEventData()
    );

    // Holds tournament-specific settings so the modal can conditionally render the TournamentFields block.
    const [tournamentData, setTournamentData] = useState(() => {
        if (editingEvent && editingEvent.eventType === 'tournament') {
            return {
                doubleElimination: editingEvent.doubleElimination || false,
                winnerSetCount: editingEvent.winnerSetCount || 1,
                loserSetCount: editingEvent.loserSetCount || 1,
                winnerBracketPointsToVictory: editingEvent.winnerBracketPointsToVictory || [21],
                loserBracketPointsToVictory: editingEvent.loserBracketPointsToVictory || [21],
                prize: editingEvent.prize || '',
                fieldCount: editingEvent.fieldCount ?? editingEvent.fields?.length ?? 1,
                restTimeMinutes: normalizeNumber(editingEvent.restTimeMinutes, 0) ?? 0,
            };
        } else {
            return {
                doubleElimination: false,
                winnerSetCount: 1,
                loserSetCount: 1,
                winnerBracketPointsToVictory: [21],
                loserBracketPointsToVictory: [21],
                prize: '',
                fieldCount: 1,
                restTimeMinutes: 0,
            };
        }
    });

    // Maintains league configuration sliders/toggles passed into the schedule preview pipeline.
    const [leagueData, setLeagueData] = useState<LeagueConfig>(() => {
        if (editingEvent && editingEvent.eventType === 'league') {
            const source = editingEvent.leagueConfig || editingEvent;
            return {
                gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                includePlayoffs: source?.includePlayoffs ?? false,
                playoffTeamCount: source?.playoffTeamCount ?? undefined,
                usesSets: source?.usesSets ?? false,
                matchDurationMinutes: normalizeNumber(source?.matchDurationMinutes, 60) ?? 60,
                restTimeMinutes: normalizeNumber(source?.restTimeMinutes, 0) ?? 0,
                setDurationMinutes: normalizeNumber(source?.setDurationMinutes),
                setsPerMatch: normalizeNumber(source?.setsPerMatch),
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
        };
    });

    // Represents weekly availability rows for league scheduling; normalized with createSlotForm.
    const [leagueSlots, setLeagueSlots] = useState<LeagueSlotForm[]>(() => {
        if (editingEvent && editingEvent.eventType === 'league' && editingEvent.timeSlots?.length) {
            return (editingEvent.timeSlots || []).map((slot) => {
                const fieldRef = (() => {
                    if (slot.field && typeof slot.field === 'object') {
                        return slot.field as Field;
                    }
                    const fieldId = typeof slot.field === 'string'
                        ? slot.field
                        : (slot.field as any)?.$id;
                    if (!fieldId) {
                        return undefined;
                    }
                    return editingEvent.fields?.find((field) => field.$id === fieldId);
                })();

                return createSlotForm({
                    $id: slot.$id,
                    field: fieldRef,
                    dayOfWeek: slot.dayOfWeek,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                });
            });
        }
        return [createSlotForm()];
    });

    // Surface-level validation message shown beneath the LeagueFields component.
    const [leagueError, setLeagueError] = useState<string | null>(null);

    const initialFieldCount = (() => {
        if (editingEvent?.fields?.length) {
            return editingEvent.fields.length;
        }
        if (editingEvent && typeof (editingEvent as any)?.fieldCount === 'number') {
            const parsed = Number((editingEvent as any).fieldCount);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        }
        return 1;
    })();

    // Tracks the number of ad-hoc fields we should provision when the org lacks saved facilities.
    const [fieldCount, setFieldCount] = useState<number>(initialFieldCount);

    // Mutable list of fields either fetched from the org or generated locally for new events.
    const [fields, setFields] = useState<Field[]>(() => {
        if (editingEvent?.fields?.length) {
            return [...editingEvent.fields].sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0));
        }
        if (!organization) {
            return Array.from({ length: initialFieldCount }, (_, idx) => ({
                $id: ID.unique(),
                name: `Field ${idx + 1}`,
                fieldNumber: idx + 1,
                type: eventData.fieldType,
                location: '',
                lat: 0,
                long: 0,
            } as Field));
        }
        return [];
    });
    // Spinner flag while asynchronous field lookups resolve.
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const shouldProvisionFields = !organization;
    const shouldManageLocalFields = shouldProvisionFields && !isEditMode && (eventData.eventType === 'league' || eventData.eventType === 'tournament');

    // Normalizes slot state every time LeagueFields mutates the slot array so errors stay in sync.
    const updateLeagueSlots = useCallback((updater: (slots: LeagueSlotForm[]) => LeagueSlotForm[]) => {
        setLeagueSlots(prev => normalizeSlotState(updater(prev), eventData.eventType));
    }, [eventData.eventType]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        defaultLocationSourceRef.current = 'none';
        appliedDefaultLocationLabelRef.current = null;

        if (editingEvent) {
            setEventData(mapEventToFormState(editingEvent));
            setSelectedImageId(editingEvent.imageId || '');
            setSelectedImageUrl(editingEvent.imageId
                ? getEventImageUrl({ imageId: editingEvent.imageId, width: 800 })
                : '');
        } else {
            setEventData(createDefaultEventData());
            setSelectedImageId('');
            setSelectedImageUrl('');
        }
    }, [editingEvent, isOpen]);

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
        if (shouldManageLocalFields || !editingEvent?.fields?.length) {
            return;
        }
        setFields([...editingEvent.fields].sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0)));
    }, [editingEvent?.fields, shouldManageLocalFields]);

    // Clear slot field references that point to deleted ad-hoc fields when the list is regenerated.
    useEffect(() => {
        if (!shouldManageLocalFields) return;
        const validIds = new Set(fields.map(field => field.$id));
        updateLeagueSlots(prev => prev.map(slot => {
            const fieldId = slot.field?.$id;
            if (!fieldId || validIds.has(fieldId)) {
                return slot;
            }
            return { ...slot, field: undefined };
        }));
    }, [fields, shouldManageLocalFields, updateLeagueSlots]);

    // Adds a blank slot row in the LeagueFields list when the user taps "Add Timeslot".
    const handleAddSlot = () => {
        setLeagueError(null);
        updateLeagueSlots(prev => [...prev, createSlotForm()]);
    };

    // Drops a specific slot by index, leaving at least one slot for the scheduler UI to edit.
    const handleRemoveSlot = (index: number) => {
        updateLeagueSlots(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, idx) => idx !== index);
        });
    };

    // Applies granular updates coming back from LeagueFields inputs before revalidating the array.
    const handleUpdateSlot = (index: number, updates: Partial<LeagueSlotForm>) => {
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
        if (!shouldManageLocalFields) {
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

        if ((eventData.eventType === 'league' || eventData.eventType === 'tournament') && eventData.start) {
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
        if (editingEvent && editingEvent.eventType === 'league') {
            const source = editingEvent.leagueConfig || editingEvent;
            setLeagueData({
                gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                includePlayoffs: source?.includePlayoffs ?? false,
                playoffTeamCount: source?.playoffTeamCount ?? undefined,
                usesSets: source?.usesSets ?? false,
                matchDurationMinutes: normalizeNumber(source?.matchDurationMinutes, 60) ?? 60,
                setDurationMinutes: normalizeNumber(source?.setDurationMinutes),
                setsPerMatch: normalizeNumber(source?.setsPerMatch),
            });

            const slots = (editingEvent.timeSlots || []).map(slot => {
                const fieldRef = (() => {
                    if (slot.field && typeof slot.field === 'object') {
                        return slot.field as Field;
                    }
                    const fieldId = typeof slot.field === 'string'
                        ? slot.field
                        : (slot.field as any)?.$id;
                    if (!fieldId) {
                        return undefined;
                    }
                    return editingEvent.fields?.find((field) => field.$id === fieldId);
                })();

                return createSlotForm({
                    $id: slot.$id,
                    field: fieldRef,
                    dayOfWeek: slot.dayOfWeek,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                });
            });

            const initialSlots = slots.length > 0 ? slots : [createSlotForm()];
            setLeagueSlots(normalizeSlotState(initialSlots, editingEvent.eventType));
        } else if (!editingEvent) {
            setLeagueData({
                gamesPerOpponent: 1,
                includePlayoffs: false,
                playoffTeamCount: undefined,
                usesSets: false,
                matchDurationMinutes: 60,
                setDurationMinutes: undefined,
                setsPerMatch: undefined,
            });
            setLeagueSlots(normalizeSlotState([createSlotForm()], 'pickup'));
        }
    }, [createSlotForm, editingEvent]);

    // Pull the organization's fields so league/tournament creators can assign real facilities.
    useEffect(() => {
        let isMounted = true;
        if (!organization?.fields) {
            return;
        }

        setFields(organization.fields);

        return () => {
            isMounted = false;
        };
    }, [organization]);

    // Merge any newly loaded fields from the event into local state without losing existing edits.
    useEffect(() => {
        if (editingEvent?.fields) {
            setFields(prev => {
                const map = new Map<string, Field>();
                [...prev, ...(editingEvent.fields as Field[])].forEach(field => {
                    if (field?.$id) {
                        map.set(field.$id, field);
                    }
                });
                return Array.from(map.values());
            });
        }
    }, [editingEvent?.fields]);

    // Re-run slot normalization when the modal switches event types (e.g., league -> tournament).
    useEffect(() => {
        updateLeagueSlots(prev => prev);
    }, [eventData.eventType, updateLeagueSlots]);

    const todaysDate = new Date(new Date().setHours(0, 0, 0, 0));
    const modalTitle = isEditMode ? 'Edit Event' : 'Create New Event';
    const submitButtonText = isEditMode
        ? 'Update Event'
        : eventData.eventType === 'league'
            ? 'Preview Schedule'
            : 'Create Event';
    const submittingText = isEditMode
        ? 'Updating...'
        : eventData.eventType === 'league'
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
            return [] as Field[];
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
            const slotField = slot.field;
            const fieldId = slotField?.$id;
            if (!slotField || !fieldId || seen.has(fieldId)) {
                return;
            }

            const resolved = fieldMap.get(fieldId) ?? slotField;
            picked.push(resolved);
            seen.add(fieldId);
        });

        return picked;
    }, [leagueSlots, fields]);

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
    });

    // Validation effect
    // Recalculate validation every time relevant form values change so the CTA stays accurate.
    useEffect(() => {
        setValidation({
            isNameValid: eventData.name ? eventData.name?.trim().length > 0 : false,
            isPriceValid: eventData.price !== undefined ? eventData.price >= 0 : false,
            isMaxParticipantsValid: eventData.maxParticipants ? eventData.maxParticipants > 1 : false,
            isTeamSizeValid: eventData.teamSizeLimit ? eventData.teamSizeLimit >= 1 : false,
            isLocationValid: eventData.location ? eventData.location?.trim().length > 0 && (eventData.lat !== 0 && eventData.long !== 0) : false,
            isSkillLevelValid: eventData.eventType === 'league' ? true : (eventData.divisions ? eventData.divisions?.length > 0 : false),
            isImageValid: Boolean(selectedImageId || eventData.imageId || selectedImageUrl),
            isFieldCountValid: shouldManageLocalFields ? fields.length >= 1 && fields.every(field => field.name?.trim().length > 0) : true,
        });
    }, [eventData, fieldCount, fields, selectedImageId, selectedImageUrl, shouldManageLocalFields]);

    // Prevents the creator from joining twice when they toggle team-based registration on.
    useEffect(() => {
        if (eventData.teamSignup) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup]);

    // Populate human-readable location if empty
    // Converts coordinates into a city/state label when the user hasn't typed an address manually.
    useEffect(() => {
        if (!isEditMode && eventData.location.trim().length === 0 && eventData.lat !== 0 && eventData.long !== 0) {
            locationService.reverseGeocode(eventData.lat, eventData.long)
                .then(info => {
                    const label = [info.city, info.state].filter(Boolean).join(', ')
                        || `${info.lat.toFixed(4)}, ${info.lng.toFixed(4)}`;
                    setEventData(prev => ({ ...prev, location: label }));
                })
                .catch(() => { /* ignore */ });
        }
    }, [isEditMode, eventData.lat, eventData.long]);

    const hasSlotConflicts = eventData.eventType === 'league' && leagueSlots.some(slot => Boolean(slot.error));
    const hasIncompleteSlot = eventData.eventType === 'league' && leagueSlots.some(slot =>
        !slot.field ||
        typeof slot.dayOfWeek !== 'number' ||
        typeof slot.startTime !== 'number' ||
        typeof slot.endTime !== 'number'
    );

    const matchDurationValid = !leagueData.usesSets
        ? (normalizeNumber(leagueData.matchDurationMinutes) ?? 0) > 0
        : true;
    const setTimingValid = !leagueData.usesSets
        ? true
        : ((normalizeNumber(leagueData.setsPerMatch) ?? 0) > 0 && (normalizeNumber(leagueData.setDurationMinutes) ?? 0) > 0);

    const leagueFormValid = eventData.eventType !== 'league'
        ? true
        : (
            leagueData.gamesPerOpponent >= 1 &&
            matchDurationValid &&
            (!leagueData.includePlayoffs || (leagueData.playoffTeamCount && leagueData.playoffTeamCount > 1)) &&
            setTimingValid &&
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
    const organizationLat = typeof organization?.lat === 'number' ? organization.lat : null;
    const organizationLong = typeof organization?.long === 'number' ? organization.long : null;

    // Seeds the location picker with organization defaults or the user's saved location for new events.
    useEffect(() => {
        if (!isOpen || isEditMode) {
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
                        updates.lat = organizationLat;
                        updates.long = organizationLong;
                        updates.coordinates = [organizationLong, organizationLat] as [number, number];
                    }

                    const nextLocation = updates.location ?? prev.location;
                    const nextLat = updates.lat ?? prev.lat;
                    const nextLong = updates.long ?? prev.long;
                    const prevCoordinates = (prev.coordinates ?? [prev.long, prev.lat]) as [number, number];
                    const nextCoordinates = (updates.coordinates ?? prev.coordinates ?? [nextLong, nextLat]) as [number, number];

                    const locationChanged = nextLocation !== prev.location;
                    const latChanged = nextLat !== prev.lat;
                    const longChanged = nextLong !== prev.long;
                    const coordsChanged =
                        prevCoordinates[0] !== nextCoordinates[0] || prevCoordinates[1] !== nextCoordinates[1];

                    if (locationChanged || latChanged || longChanged || coordsChanged) {
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

                if (prev.lat === 0 && prev.long === 0) {
                    updates.lat = userLocation.lat;
                    updates.long = userLocation.lng;
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

    const isValid = Object.values(validation).every(v => v) && leagueFormValid;

    // Launches the Stripe onboarding flow before allowing event owners to set paid pricing.
    const handleConnectStripe = async () => {
        try {
            setConnectingStripe(true);
            const result = await paymentService.connectStripeAccount(currentUser?.$id);
            window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Failed to connect Stripe account:', error);
        } finally {
            setConnectingStripe(false);
        }
    };

    // Generates an in-memory league schedule and navigates to the preview page for new leagues.
    const handleLeaguePreview = async () => {
        if (eventData.eventType !== 'league' || isEditMode) return;
        if (isSubmitting || !isValid) return;

        const startDate = parseLocalDateTime(eventData.start);
        const endDate = parseLocalDateTime(eventData.end);
        if (!startDate || !endDate) {
            setLeagueError('Provide a valid start and end date for the league.');
            return;
        }

        if (startDate > endDate) {
            setLeagueError('League end date must be after the start date.');
            return;
        }

        const invalidTimes = leagueSlots.some(slot =>
            typeof slot.startTime === 'number' &&
            typeof slot.endTime === 'number' &&
            slot.endTime <= slot.startTime
        );

        if (invalidTimes) {
            setLeagueError('Each timeslot must end after it starts.');
            return;
        }

        const finalImageId = selectedImageId || eventData.imageId;
        if (!finalImageId) {
            setLeagueError('Add an event image before previewing the schedule.');
            return;
        }

        const validSlots = leagueSlots.filter(slot =>
            slot.field &&
            typeof slot.dayOfWeek === 'number' &&
            typeof slot.startTime === 'number' &&
            typeof slot.endTime === 'number'
        );

        if (validSlots.length === 0) {
            setLeagueError('Add at least one complete weekly timeslot to continue.');
            return;
        }

        setIsSubmitting(true);
        setLeagueError(null);

        try {
            const restTime = normalizeNumber(leagueData.restTimeMinutes);
            const timingFields = leagueData.usesSets
                ? {
                    usesSets: true,
                    setDurationMinutes: normalizeNumber(leagueData.setDurationMinutes),
                    setsPerMatch: normalizeNumber(leagueData.setsPerMatch),
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

            const slotDocuments: any[] = validSlots
                .map((slot): any | null => {
                    if (!slot.field) {
                        return null;
                    }

                    const fieldId = slot.field.$id;
                    const fieldDetails = fieldId ? fieldMap.get(fieldId) ?? slot.field : slot.field;

                    return {
                        $id: slot.$id || ID.unique(),
                        dayOfWeek: slot.dayOfWeek as TimeSlot['dayOfWeek'],
                        startTime: Number(slot.startTime),
                        endTime: Number(slot.endTime),
                        field: {$id: fieldDetails.$id},
                    };
                })
                .filter((slot): slot is TimeSlot => slot !== null);


            const eventDocument: Record<string, any> = {
                $id: ID.unique(),
                name: eventData.name,
                description: eventData.description,
                start: eventData.start,
                end: eventData.end,
                location: eventData.location,
                lat: eventData.lat,
                long: eventData.long,
                coordinates: eventData.coordinates,
                eventType: 'league',
                sport: eventData.sport,
                fieldType: eventData.fieldType,
                price: eventData.price,
                maxParticipants: eventData.maxParticipants,
                teamSignup: eventData.teamSignup,
                waitListIds: eventData.waitList,
                freeAgentIds: eventData.freeAgents,
                imageId: finalImageId,
                singleDivision: eventData.singleDivision,
                divisions: eventData.divisions,
                hostId: currentUser?.$id,
                organization: {...organization, fields: undefined, events: undefined, teams: undefined},
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
            };

            const preview = await leagueService.previewScheduleFromDocument(eventDocument);
            const previewEvent = (preview.event as Event);

            if (typeof window !== 'undefined') {
                sessionStorage.setItem(`league-preview-event:${previewEvent.$id}`, JSON.stringify(previewEvent));
            }

            onClose();
            router.push(`/events/${previewEvent.$id}/schedule?preview=1`);
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

        if (!isEditMode && eventData.eventType === 'league') {
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

            const baseCoordinates: [number, number] = [eventData.long, eventData.lat];

            const submitEvent: Partial<Event> & { lat?: number; long?: number } = {
                name: eventData.name.trim(),
                description: eventData.description,
                location: eventData.location,
                start: eventData.start,
                end: eventData.end,
                eventType: eventData.eventType,
                sport: eventData.sport,
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
                coordinates: baseCoordinates,
                lat: eventData.lat,
                long: eventData.long,
            };

            if (!shouldManageLocalFields) {
                const fieldsToInclude = fieldsReferencedInSlots;
                if (fieldsToInclude.length) {
                    submitEvent.fields = fieldsToInclude;
                }
            }

            if (!isEditMode) {
                if (currentUser?.$id) {
                    submitEvent.hostId = currentUser.$id;
                }
                if (organization) {
                    submitEvent.organization = organization;
                }
                submitEvent.waitListIds = [];
                submitEvent.freeAgentIds = [];
                if (shouldProvisionFields) {
                    submitEvent.fieldCount = fieldCount;
                }
            }

            if (eventData.eventType === 'tournament') {
                Object.assign(submitEvent, tournamentData);
                if (!isEditMode && shouldProvisionFields) {
                    submitEvent.fieldCount = fieldCount;
                }
            }

            if (eventData.eventType === 'league') {
                const restTime = normalizeNumber(leagueData.restTimeMinutes);
                const timingFields = leagueData.usesSets
                    ? {
                        usesSets: true,
                        setDurationMinutes: normalizeNumber(leagueData.setDurationMinutes),
                        setsPerMatch: normalizeNumber(leagueData.setsPerMatch),
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

                if (!isEditMode) {
                    submitEvent.status = 'draft' as EventStatus;
                }

                if (!isEditMode && shouldProvisionFields && !shouldManageLocalFields) {
                    submitEvent.fieldCount = fieldCount;
                }
            }

            if (eventData.eventType === 'tournament' || eventData.eventType === 'league') {
                delete submitEvent.end;
            }

            let resultEvent;
            if (isEditMode) {
                resultEvent = await eventService.updateEvent(editingEvent!.$id, submitEvent);
            } else {
                resultEvent = await eventService.createEvent(submitEvent);
            }

            onEventCreated(resultEvent);
            onClose();
        } catch (error) {
            console.error(`Failed to ${isEditMode ? 'update' : 'create'} event:`, error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Syncs the selected hero image with component state after uploads or picker changes.
    const handleImageChange = (fileId: string, url: string) => {
        setSelectedImageId(fileId);
        setSelectedImageUrl(url);
        setEventData(prev => ({ ...prev, imageId: fileId }));
    };

    if (!isOpen) return null;

    return (
        <Modal opened={isOpen} onClose={onClose} title={modalTitle} size="xl" centered>
            {/* Hero banner similar to EventDetailModal */}
            <div className="relative">
                {selectedImageUrl ? (
                    <img
                        src={selectedImageUrl}
                        alt={eventData.name || 'Event image'}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&h=200&fit=crop';
                        }}
                    />
                ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
                        <div className="text-center">
                            <div className="text-6xl mb-2">🏆</div>
                            <p className="text-sm opacity-90">Add an image for your event</p>
                        </div>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>

            {/* Content */}
            <div className="p-6">
                <div className="mb-6">
                    <h2 className="text-3xl font-bold mb-4">{modalTitle}</h2>

                    {/* Image Upload */}
                    <div className="mb-6">
                        <div className="block text-sm font-medium mb-2">Event Image</div>
                        <ImageUploader
                            currentImageUrl={selectedImageUrl}
                            bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!}
                            className="w-full max-w-md"
                            placeholder="Select event image"
                            onChange={handleImageChange}
                        />
                        {!validation.isImageValid && (
                            <p className="text-red-600 text-sm mt-1">An event image is required.</p>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Basic Information */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TextInput
                                label="Event Name *"
                                value={eventData.name}
                                onChange={(e) => setEventData(prev => ({ ...prev, name: e.currentTarget?.value || '' }))}
                                placeholder="Enter event name"
                                error={!validation.isNameValid && !!eventData.name ? 'Event name is required' : undefined}
                            />

                            <MantineSelect
                                label="Sport *"
                                placeholder="Select a sport"
                                data={SPORTS_LIST}
                                value={eventData.sport}
                                onChange={(value) => setEventData(prev => ({ ...prev, sport: value || '' }))}
                                searchable
                            />
                        </div>

                        <Textarea
                            label="Description"
                            value={eventData.description}
                            onChange={(e) => setEventData(prev => ({ ...prev, description: e.currentTarget?.value || '' }))}
                            placeholder="Describe your event..."
                            autosize
                            minRows={3}
                            className="mt-4"
                        />
                    </div>

                    {/* Event Details */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Event Details</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <MantineSelect
                                label="Event Type *"
                                data={[
                                    { value: 'pickup', label: 'Pickup Game' },
                                    { value: 'tournament', label: 'Tournament' },
                                    { value: 'league', label: 'League' },
                                ]}
                                value={eventData.eventType}
                                onChange={(value) => {
                                    if (!value) return;
                                    setLeagueError(null);
                                    setEventData(prev => ({
                                        ...prev,
                                        eventType: value as 'pickup' | 'tournament' | 'league',
                                    }));
                                }}
                            />

                            <MantineSelect
                                label="Field Type *"
                                data={[
                                    { value: 'indoor', label: 'Indoor' },
                                    { value: 'outdoor', label: 'Outdoor' },
                                    { value: 'sand', label: 'Sand' },
                                    { value: 'grass', label: 'Grass' },
                                ]}
                                value={eventData.fieldType}
                                onChange={(value) => setEventData(prev => ({ ...prev, fieldType: value || prev.fieldType }))}
                            />
                        </div>

                        {/* Pricing and Participant Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <NumberInput
                                    label="Price ($)"
                                    min={0}
                                    step={0.01}
                                    value={eventData.price}
                                    onChange={(val) => setEventData(prev => ({ ...prev, price: Number(val) || 0 }))}
                                    disabled={!hasStripeAccount}
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
                                label="Max Participants *"
                                min={2}
                                value={eventData.maxParticipants}
                                onChange={(val) => setEventData(prev => ({ ...prev, maxParticipants: Number(val) || 10 }))}
                                error={!validation.isMaxParticipantsValid ? 'Enter at least 2' : undefined}
                            />

                            <NumberInput
                                label="Team Size Limit"
                                min={1}
                                value={eventData.teamSizeLimit}
                                onChange={(val) => setEventData(prev => ({ ...prev, teamSizeLimit: Number(val) || 2 }))}
                                error={!validation.isTeamSizeValid ? 'Enter at least 1' : undefined}
                            />
                        </div>

                        {/* Policy Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <NumberInput
                                label="Cancellation Refund (Hours)"
                                min={0}
                                value={eventData.cancellationRefundHours}
                                onChange={(val) => setEventData(prev => ({ ...prev, cancellationRefundHours: Number(val) || 24 }))}
                            />
                            <NumberInput
                                label="Registration Cutoff (Hours)"
                                min={0}
                                value={eventData.registrationCutoffHours}
                                onChange={(val) => setEventData(prev => ({ ...prev, registrationCutoffHours: Number(val) || 2 }))}
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
                    </div>

                    {/* Location & Time */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Location & Time</h3>

                        <div className="mb-6">
                            <LocationSelector
                                value={eventData.location}
                                coordinates={{
                                    lat: (eventData.lat ?? userLocation?.lat ?? 0),
                                    lng: (eventData.long ?? userLocation?.lng ?? 0)
                                }}
                                onChange={(location, lat, lng) => {
                                    setEventData(prev => ({ ...prev, location, lat, long: lng, coordinates: [lng, lat] }));
                                }}
                                isValid={validation.isLocationValid}
                            />
                        </div>

                        {/* Mantine DateTime pickers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <DateTimePicker
                                    label="Start Date & Time"
                                    valueFormat="DD MMM YYYY hh:mm A"
                                    value={parseLocalDateTime(eventData.start)}
                                    onChange={(val) => {
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
                                {(eventData.eventType === 'pickup') &&
                                <DateTimePicker
                                    label="End Date & Time"
                                    valueFormat="DD MMM YYYY hh:mm A"
                                    value={parseLocalDateTime(eventData.end)}
                                    onChange={(val) => {
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
                    </div>

                    {/* legacy date/time inputs removed after migration to Mantine DateTimePicker */}

                    {/* Skills & Settings */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Event Settings</h3>

                        <MantineMultiSelect
                            label="Divisions"
                            placeholder="Select divisions"
                            data={[
                                { value: 'beginner', label: 'Beginner (1.0 - 2.5)' },
                                { value: 'intermediate', label: 'Intermediate (2.5 - 3.5)' },
                                { value: 'advanced', label: 'Advanced (3.5 - 4.5)' },
                                { value: 'expert', label: 'Expert (4.5+)' },
                                { value: 'open', label: 'Open (All Skill Levels)' },
                            ]}
                            value={eventData.divisions}
                            onChange={(vals) => setEventData(prev => ({ ...prev, divisions: vals }))}
                            clearable
                            searchable
                        />

                        {/* Team Settings */}
                        <div className="mt-6 space-y-3">
                            <Switch
                                label="Team Event (teams compete rather than individuals)"
                                checked={eventData.teamSignup}
                                onChange={(e) => {
                                    const checked = e.currentTarget.checked;
                                    setEventData(prev => ({ ...prev, teamSignup: checked }));
                                }}
                            />
                            <Switch
                                label="Single Division (all skill levels play together)"
                                checked={eventData.singleDivision}
                                onChange={(e) => {
                                    const checked = e.currentTarget.checked;
                                    setEventData(prev => ({ ...prev, singleDivision: checked }));
                                }}
                            />
                        </div>
                    </div>

                    {eventData.eventType === 'league' && (
                        <LeagueFields
                            leagueData={leagueData}
                            onLeagueDataChange={(updates) => setLeagueData(prev => ({ ...prev, ...updates }))}
                            slots={leagueSlots}
                            onAddSlot={handleAddSlot}
                            onUpdateSlot={handleUpdateSlot}
                            onRemoveSlot={handleRemoveSlot}
                            fields={fields}
                            fieldsLoading={fieldsLoading}
                            fieldOptions={leagueFieldOptions}
                        />
                    )}

                    {/* Tournament Fields */}
                    {eventData.eventType === 'tournament' && (
                        <TournamentFields
                            tournamentData={tournamentData}
                            setTournamentData={setTournamentData}
                            showFieldCountSelector={!shouldProvisionFields}
                            fieldCountOverride={shouldProvisionFields ? fieldCount : undefined}
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
                    {!isEditMode && !eventData.teamSignup && eventData.eventType !== 'league' && (
                        <Switch
                            label="Join as participant"
                            checked={joinAsParticipant}
                            onChange={(e) => {
                                const checked = e.currentTarget.checked;
                                setJoinAsParticipant(checked);
                            }}
                        />
                    )}
                    {isEditMode && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (!editingEvent) return;
                                if (!confirm('Delete this event? This cannot be undone.')) return;
                                setIsSubmitting(true);
                                try {
                                    const ok = await eventService.deleteEvent(editingEvent.$id);
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
