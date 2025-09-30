import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ClockIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { CreateEventData, eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import TournamentFields from './TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { useLocation } from '@/app/hooks/useLocation';
import { getEventImageUrl, SPORTS_LIST, Event, Division as CoreDivision, UserData, Team, LeagueConfig, Field } from '@/types';

import { Modal, TextInput, Textarea, NumberInput, Select as MantineSelect, MultiSelect as MantineMultiSelect, Switch, Group, Button, Alert } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
import { locationService } from '@/lib/locationService';
import { leagueService, WeeklySlotInput, LeagueFieldTemplateInput, LeagueSlotCreationInput } from '@/lib/leagueService';
import { fieldService } from '@/lib/fieldService';
import LeagueFields, { LeagueSlotForm } from './LeagueFields';

// UI state will track divisions as string[] of skill keys (e.g., 'beginner')

interface EventCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEventCreated: (updatedEvent?: Event) => void;
    currentUser?: any;
    editingEvent?: Event;
    organizationId?: string;
}

interface FieldTemplate {
    key: string;
    name: string;
    fieldNumber: number;
}

const EventCreationModal: React.FC<EventCreationModalProps> = ({
    isOpen,
    onClose,
    onEventCreated,
    currentUser,
    editingEvent,
    organizationId
}) => {
    const router = useRouter();
    const { location: userLocation } = useLocation();
    const modalRef = useRef<HTMLDivElement>(null);
    const [selectedImageId, setSelectedImageId] = useState<string>(editingEvent?.imageId || '');


    const [selectedImageUrl, setSelectedImageUrl] = useState(
        editingEvent ? getEventImageUrl({ imageId: editingEvent.imageId, width: 800 }) : ''
    );
    const timezoneDefault = typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'UTC';
    const createSlotForm = useCallback((slot?: Partial<WeeklySlotInput> & { fieldId?: string }): LeagueSlotForm => ({
        key: slot?.$id ?? `slot-${Math.random().toString(36).slice(2, 9)}`,
        $id: slot?.$id,
        fieldId: slot?.fieldId,
        dayOfWeek: slot?.dayOfWeek,
        startTime: slot?.startTime,
        endTime: slot?.endTime,
        timezone: slot?.timezone || timezoneDefault,
        conflicts: [],
        checking: false,
    }), [timezoneDefault]);
    const syncFieldTemplates = useCallback((count: number, current: FieldTemplate[]): FieldTemplate[] => {
        const normalizedCount = Math.max(1, count);
        const trimmed = current.slice(0, normalizedCount);
        const next: FieldTemplate[] = [];
        for (let index = 0; index < normalizedCount; index += 1) {
            const existing = trimmed[index];
            if (existing) {
                next.push({
                    ...existing,
                    fieldNumber: index + 1,
                });
            } else {
                next.push({
                    key: `field-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
                    name: `Field ${index + 1}`,
                    fieldNumber: index + 1,
                });
            }
        }
        return next;
    }, []);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [connectingStripe, setConnectingStripe] = useState(false);
    const [joinAsParticipant, setJoinAsParticipant] = useState(false);
    const [hasStripeAccount, setHasStripeAccount] = useState(currentUser?.hasStripeAccount || false);

    const isEditMode = !!editingEvent;

    // Complete event data state with ALL fields
    const [eventData, setEventData] = useState<{
        name: string;
        description: string;
        location: string;
        // Keep tuple for UI but also track explicit lat/long
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
    }>(() => {
        const toDivisionKey = (d: string | CoreDivision): string => {
            if (typeof d === 'string') {
                const s = d.toLowerCase();
                if (s.includes('beginner')) return 'beginner';
                if (s.includes('intermediate')) return 'intermediate';
                if (s.includes('advanced')) return 'advanced';
                if (s.includes('expert')) return 'expert';
                if (s.includes('open')) return 'open';
                return d; // assume key already
            }
            const v = (d.skillLevel || d.name || d.id || '').toString();
            return v.toLowerCase() || 'open';
        };
        if (editingEvent) {
            return {
                name: editingEvent.name,
                description: editingEvent.description,
                location: editingEvent.location,
                coordinates: editingEvent.coordinates,
                lat: Array.isArray(editingEvent.coordinates) ? Number(editingEvent.coordinates[1]) : Number((editingEvent as any).coordinates?.lat || 0),
                long: Array.isArray(editingEvent.coordinates) ? Number(editingEvent.coordinates[0]) : Number((editingEvent as any).coordinates?.lng || 0),
                start: editingEvent.start,
                end: editingEvent.end,
                eventType: editingEvent.eventType,
                sport: editingEvent.sport,
                fieldType: editingEvent.fieldType,
                price: editingEvent.price,
                maxParticipants: editingEvent.maxParticipants,
                teamSizeLimit: editingEvent.teamSizeLimit,
                teamSignup: editingEvent.teamSignup,
                singleDivision: editingEvent.singleDivision,
                divisions: Array.isArray(editingEvent.divisions)
                    ? (editingEvent.divisions as (string | CoreDivision)[]).map(toDivisionKey)
                    : [],
                cancellationRefundHours: editingEvent.cancellationRefundHours,
                registrationCutoffHours: editingEvent.registrationCutoffHours,
                imageId: editingEvent.imageId,
                seedColor: editingEvent.seedColor || 0,
                waitList: editingEvent.waitListIds || [],
                freeAgents: editingEvent.freeAgentIds || [],
                players: editingEvent.players || [],
                teams: editingEvent.teams || []
            };
        } else {
            // Default values for new event
            return {
                name: '',
                description: '',
                location: '',
                coordinates: [0, 0],
                lat: 0,
                long: 0,
                start: new Date().toISOString(),
                end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
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
                teams: []
            };
        }
    });

    const [tournamentData, setTournamentData] = useState(() => {
        if (editingEvent && editingEvent.eventType === 'tournament') {
            return {
                doubleElimination: editingEvent.doubleElimination || false,
                winnerSetCount: editingEvent.winnerSetCount || 1,
                loserSetCount: editingEvent.loserSetCount || 1,
                winnerBracketPointsToVictory: editingEvent.winnerBracketPointsToVictory || [21],
                loserBracketPointsToVictory: editingEvent.loserBracketPointsToVictory || [21],
                prize: editingEvent.prize || '',
                fieldCount: editingEvent.fieldCount ?? editingEvent.fields?.length ?? 1

            };
        } else {
            return {
                doubleElimination: false,
                winnerSetCount: 1,
                loserSetCount: 1,
                winnerBracketPointsToVictory: [21],
                loserBracketPointsToVictory: [21],
                prize: '',
                fieldCount: 1
            };
        }
    });

    const [leagueData, setLeagueData] = useState<LeagueConfig>(() => {
        if (editingEvent && editingEvent.eventType === 'league') {
            const source = editingEvent.leagueConfig || editingEvent;
            return {
                gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                includePlayoffs: source?.includePlayoffs ?? false,
                playoffTeamCount: source?.playoffTeamCount ?? undefined,
                usesSets: source?.usesSets ?? false,
                matchDurationMinutes: source?.matchDurationMinutes ?? 60,
                setDurationMinutes: source?.setDurationMinutes ?? undefined,
                setsPerMatch: source?.setsPerMatch ?? undefined,
            };
        }
        return {
            gamesPerOpponent: 1,
            includePlayoffs: false,
            playoffTeamCount: undefined,
            usesSets: false,
            matchDurationMinutes: 60,
            setDurationMinutes: undefined,
            setsPerMatch: undefined,
        };
    });

    const [leagueSlots, setLeagueSlots] = useState<LeagueSlotForm[]>(() => {
        if (editingEvent && editingEvent.eventType === 'league' && editingEvent.timeSlots?.length) {
            return (editingEvent.timeSlots || []).map((slot) => createSlotForm({
                $id: slot.$id,
                fieldId: typeof slot.field === 'string'
                    ? slot.field
                    : slot.field?.$id,
                dayOfWeek: slot.dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
                timezone: slot.timezone,
            }));
        }
        return [createSlotForm()];
    });

    const [leagueError, setLeagueError] = useState<string | null>(null);
    const [fields, setFields] = useState<Field[]>(() => editingEvent?.fields || []);
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const [fieldCount, setFieldCount] = useState<number>(() => {
        if (editingEvent?.fields?.length) {
            return editingEvent.fields.length;
        }
        if (editingEvent && typeof (editingEvent as any)?.fieldCount === 'number') {
            return Number((editingEvent as any).fieldCount) || 1;
        }
        return 1;
    });
    const [fieldTemplates, setFieldTemplates] = useState<FieldTemplate[]>(() => {
        if (editingEvent?.fields?.length) {
            return [...editingEvent.fields]
                .sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0))
                .map((field, index) => ({
                    key: field.$id || `field-${index + 1}`,
                    name: field.name || `Field ${field.fieldNumber ?? index + 1}`,
                    fieldNumber: field.fieldNumber ?? index + 1,
                }));
        }
        return Array.from({ length: Math.max(1, fieldCount) }, (_, idx) => ({
            key: `field-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`,
            name: `Field ${idx + 1}`,
            fieldNumber: idx + 1,
        }));
    });
    const shouldProvisionFields = !organizationId;
    const shouldManageLocalFields = shouldProvisionFields && !isEditMode && eventData.eventType === 'league';
    const leagueSlotsRef = useRef<LeagueSlotForm[]>(leagueSlots);

    useEffect(() => {
        if (!shouldManageLocalFields) {
            return;
        }
        setFieldTemplates(prev => syncFieldTemplates(fieldCount, prev));
    }, [fieldCount, shouldManageLocalFields, syncFieldTemplates]);

    useEffect(() => {
        if (editingEvent?.fields?.length && !shouldManageLocalFields) {
            setFieldTemplates(
                [...editingEvent.fields]
                    .sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0))
                    .map((field, index) => ({
                        key: field.$id || `field-${index + 1}`,
                        name: field.name || `Field ${field.fieldNumber ?? index + 1}`,
                        fieldNumber: field.fieldNumber ?? index + 1,
                    }))
            );
        }
    }, [editingEvent?.fields, shouldManageLocalFields]);

    useEffect(() => {
        if (!shouldManageLocalFields) return;
        const validKeys = new Set(fieldTemplates.map(template => template.key));
        setLeagueSlots(prev => prev.map(slot => {
            if (!slot.fieldId || validKeys.has(slot.fieldId)) {
                return slot;
            }
            return { ...slot, fieldId: undefined };
        }));
    }, [fieldTemplates, shouldManageLocalFields]);

    const checkSlotConflicts = useCallback(async (slot: LeagueSlotForm, index: number) => {
        if (eventData.eventType !== 'league') return;

        if (shouldManageLocalFields) {
            setLeagueSlots(prev => {
                const next = [...prev];
                if (next[index]) {
                    next[index] = { ...next[index], conflicts: [], error: undefined, checking: false };
                }
                return next;
            });
            return;
        }

        if (
            !slot.fieldId ||
            typeof slot.dayOfWeek !== 'number' ||
            typeof slot.startTime !== 'number' ||
            typeof slot.endTime !== 'number'
        ) {
            setLeagueSlots(prev => {
                const next = [...prev];
                if (next[index]) {
                    next[index] = { ...next[index], conflicts: [], error: undefined, checking: false };
                }
                return next;
            });
            return;
        }

        if (!eventData.start || !eventData.end) {
            return;
        }

        const payload: WeeklySlotInput = {
            fieldId: slot.fieldId,
            dayOfWeek: slot.dayOfWeek as WeeklySlotInput['dayOfWeek'],
            startTime: slot.startTime,
            endTime: slot.endTime,
            timezone: slot.timezone || timezoneDefault,
            $id: slot.$id,
        };

        setLeagueSlots(prev => {
            const next = [...prev];
            if (next[index]) {
                next[index] = { ...next[index], checking: true, error: undefined };
            }
            return next;
        });

        try {
            const conflicts = await leagueService.checkConflictsForSlot(
                payload,
                eventData.start,
                eventData.end,
                { ignoreEventId: editingEvent?.$id }
            );

            setLeagueSlots(prev => {
                const next = [...prev];
                if (next[index]) {
                    next[index] = { ...next[index], conflicts, checking: false, error: undefined };
                }
                return next;
            });
        } catch (error) {
            setLeagueSlots(prev => {
                const next = [...prev];
                if (next[index]) {
                    next[index] = {
                        ...next[index],
                        checking: false,
                        error: error instanceof Error ? error.message : 'Failed to check availability',
                    };
                }
                return next;
            });
        }
    }, [editingEvent?.$id, eventData.end, eventData.eventType, eventData.start, timezoneDefault]);

    const handleAddSlot = () => {
        setLeagueError(null);
        setLeagueSlots(prev => [...prev, createSlotForm()]);
    };

    const handleRemoveSlot = (index: number) => {
        setLeagueSlots(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const handleUpdateSlot = (index: number, updates: Partial<LeagueSlotForm>) => {
        const current = leagueSlots[index];
        if (!current) return;

        const updated: LeagueSlotForm = {
            ...current,
            ...updates,
            timezone: updates.timezone !== undefined ? updates.timezone : current.timezone,
        };

        if (!updated.timezone) {
            updated.timezone = timezoneDefault;
        }

        setLeagueSlots(prev => {
            const next = [...prev];
            next[index] = updated;
            return next;
        });

        setLeagueError(null);
        checkSlotConflicts(updated, index);
    };

    const handleFieldTemplateNameChange = (index: number, name: string) => {
        setFieldTemplates(prev => {
            const next = [...prev];
            if (next[index]) {
                next[index] = { ...next[index], name };
            }
            return next;
        });
    };

    useEffect(() => {
        leagueSlotsRef.current = leagueSlots;
    }, [leagueSlots]);

    useEffect(() => {
        if (editingEvent && editingEvent.eventType === 'league') {
            const source = editingEvent.leagueConfig || editingEvent;
            setLeagueData({
                gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                includePlayoffs: source?.includePlayoffs ?? false,
                playoffTeamCount: source?.playoffTeamCount ?? undefined,
                usesSets: source?.usesSets ?? false,
                matchDurationMinutes: source?.matchDurationMinutes ?? 60,
                setDurationMinutes: source?.setDurationMinutes ?? undefined,
                setsPerMatch: source?.setsPerMatch ?? undefined,
            });

            const slots = (editingEvent.timeSlots || []).map(slot => createSlotForm({
                $id: slot.$id,
                fieldId: typeof slot.field === 'string'
                    ? slot.field
                    : slot.field?.$id,
                dayOfWeek: slot.dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
                timezone: slot.timezone,
            }));

            setLeagueSlots(slots.length > 0 ? slots : [createSlotForm()]);

            slots.forEach((slot, index) => {
                if (
                    slot.fieldId &&
                    typeof slot.dayOfWeek === 'number' &&
                    typeof slot.startTime === 'number' &&
                    typeof slot.endTime === 'number'
                ) {
                    checkSlotConflicts(slot, index);
                }
            });
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
            setLeagueSlots([createSlotForm()]);
        }
    }, [checkSlotConflicts, createSlotForm, editingEvent]);

    useEffect(() => {
        let isMounted = true;
        if (!organizationId) {
            return;
        }

        const loadFields = async () => {
            try {
                setFieldsLoading(true);
                const result = await fieldService.listFields(organizationId);
                if (!isMounted) return;

                setFields(prev => {
                    const map = new Map<string, Field>();
                    [...prev, ...(Array.isArray(result) ? result : [])].forEach(field => {
                        if (field?.$id) {
                            map.set(field.$id, field);
                        }
                    });
                    return Array.from(map.values());
                });
            } catch (error) {
                console.error('Failed to load fields:', error);
            } finally {
                if (isMounted) setFieldsLoading(false);
            }
        };

        loadFields();
        return () => {
            isMounted = false;
        };
    }, [organizationId]);

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

    useEffect(() => {
        if (eventData.eventType !== 'league' || shouldManageLocalFields) return;
        leagueSlotsRef.current.forEach((slot, index) => {
            if (
                slot.fieldId &&
                typeof slot.dayOfWeek === 'number' &&
                typeof slot.startTime === 'number' &&
                typeof slot.endTime === 'number'
            ) {
                checkSlotConflicts(slot, index);
            }
        });
    }, [eventData.start, eventData.end, eventData.eventType, checkSlotConflicts]);

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
        if (shouldManageLocalFields) {
            return fieldTemplates.map(template => ({
                value: template.key,
                label: template.name || `Field ${template.fieldNumber}`,
            }));
        }
        if (fields.length > 0) {
            return fields.map(field => ({
                value: field.$id,
                label: field.name || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Field'),
            }));
        }
        return [] as { value: string; label: string }[];
    }, [fields, fieldTemplates, shouldManageLocalFields]);

    // Validation state
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
    useEffect(() => {
        setValidation({
            isNameValid: eventData.name ? eventData.name?.trim().length > 0 : false,
            isPriceValid: eventData.price !== undefined ? eventData.price >= 0 : false,
            isMaxParticipantsValid: eventData.maxParticipants ? eventData.maxParticipants > 1 : false,
            isTeamSizeValid: eventData.teamSizeLimit ? eventData.teamSizeLimit >= 1 : false,
            isLocationValid: eventData.location ? eventData.location?.trim().length > 0 && (eventData.lat !== 0 && eventData.long !== 0) : false,
            isSkillLevelValid: eventData.eventType === 'league' ? true : (eventData.divisions ? eventData.divisions?.length > 0 : false),
            isImageValid: Boolean(selectedImageId || eventData.imageId || selectedImageUrl),
            isFieldCountValid: shouldManageLocalFields ? fieldCount >= 1 : true,
        });
    }, [eventData, fieldCount, fieldTemplates, selectedImageId, selectedImageUrl, shouldManageLocalFields]);

    useEffect(() => {
        if (eventData.teamSignup) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup]);

    // Initialize coordinates from user's current location for new events
    useEffect(() => {
        if (!isEditMode && userLocation) {
            if ((eventData.lat === 0 && eventData.long === 0)) {
                setEventData(prev => ({
                    ...prev,
                    lat: userLocation.lat,
                    long: userLocation.lng,
                    coordinates: [userLocation.lng, userLocation.lat],
                }));
            }
        }
    }, [isEditMode, userLocation]);

    // Populate human-readable location if empty
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

    const hasSlotConflicts = eventData.eventType === 'league' && !shouldManageLocalFields && leagueSlots.some(slot => slot.conflicts.length > 0);
    const hasPendingSlotChecks = eventData.eventType === 'league' && !shouldManageLocalFields && leagueSlots.some(slot => slot.checking);
    const hasIncompleteSlot = eventData.eventType === 'league' && leagueSlots.some(slot =>
        !slot.fieldId ||
        typeof slot.dayOfWeek !== 'number' ||
        typeof slot.startTime !== 'number' ||
        typeof slot.endTime !== 'number' ||
        !slot.timezone
    );

    const leagueFormValid = eventData.eventType !== 'league'
        ? true
        : (
            leagueData.gamesPerOpponent >= 1 &&
            leagueData.matchDurationMinutes > 0 &&
            (!leagueData.includePlayoffs || (leagueData.playoffTeamCount && leagueData.playoffTeamCount > 1)) &&
            (!leagueData.usesSets || (leagueData.setsPerMatch && leagueData.setDurationMinutes)) &&
            !hasSlotConflicts &&
            !hasPendingSlotChecks &&
            !hasIncompleteSlot &&
            (!shouldManageLocalFields || fieldTemplates.length === Math.max(1, fieldCount)) &&
            (!shouldManageLocalFields || fieldTemplates.every(template => template.name?.trim().length > 0))
        );

    const isValid = Object.values(validation).every(v => v) && leagueFormValid;

    // Helper functions for date/time management
    const updateDateTime = (dateISO: string, timeString: string) => {
        const date = new Date(dateISO);
        const [hours, minutes] = timeString.split(':');
        date.setHours(parseInt(hours, 10));
        date.setMinutes(parseInt(minutes, 10));
        return date.toISOString();
    };

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



    const handleLeaguePreview = async () => {
        if (eventData.eventType !== 'league' || isEditMode) return;
        if (isSubmitting || !isValid) return;

        const startDate = new Date(eventData.start);
        const endDate = new Date(eventData.end);
        if (!(startDate instanceof Date) || !(endDate instanceof Date) || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            setLeagueError('Provide a valid start and end date for the league.');
            return;
        }

        if (startDate >= endDate) {
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

        const slotPayloads: LeagueSlotCreationInput[] = leagueSlots
            .filter(slot =>
                slot.fieldId &&
                typeof slot.dayOfWeek === 'number' &&
                typeof slot.startTime === 'number' &&
                typeof slot.endTime === 'number'
            )
            .map(slot => ({
                fieldId: shouldManageLocalFields ? undefined : slot.fieldId,
                fieldKey: shouldManageLocalFields ? slot.fieldId : undefined,
                dayOfWeek: slot.dayOfWeek as LeagueSlotCreationInput['dayOfWeek'],
                startTime: slot.startTime as number,
                endTime: slot.endTime as number,
                timezone: slot.timezone || timezoneDefault,
            }));

        if (slotPayloads.length === 0) {
            setLeagueError('Add at least one complete weekly timeslot to continue.');
            return;
        }

        setIsSubmitting(true);
        setLeagueError(null);

        let createdEvent: Event | null = null;

        try {
            const payload: Partial<CreateEventData> = {
                ...eventData,
                divisions: eventData.divisions as any,
                imageId: finalImageId,
                status: 'draft',
                eventType: 'league',
                gamesPerOpponent: leagueData.gamesPerOpponent,
                includePlayoffs: leagueData.includePlayoffs,
                playoffTeamCount: leagueData.includePlayoffs ? leagueData.playoffTeamCount ?? undefined : undefined,
                usesSets: leagueData.usesSets,
                matchDurationMinutes: leagueData.matchDurationMinutes,
                setDurationMinutes: leagueData.usesSets ? leagueData.setDurationMinutes ?? undefined : undefined,
                setsPerMatch: leagueData.usesSets ? leagueData.setsPerMatch ?? undefined : undefined,
            };
            payload.playerIds = [];
            payload.teamIds = [];
            payload.waitList = [];
            payload.freeAgents = [];
            payload.hostId = currentUser?.$id;
            if (organizationId) payload.organization = organizationId;

            const draft = await leagueService.createLeagueDraft({
                eventData: payload,
                fieldTemplates: shouldManageLocalFields
                    ? fieldTemplates.map<LeagueFieldTemplateInput>((template) => ({
                        key: template.key,
                        name: template.name?.trim() || `Field ${template.fieldNumber}`,
                        fieldNumber: template.fieldNumber,
                        fieldType: eventData.fieldType,
                    }))
                    : [],
                slots: slotPayloads,
            });

            createdEvent = draft.event;

            const schedule = await leagueService.generateSchedule(createdEvent.$id, false);

            if (typeof window !== 'undefined') {
                sessionStorage.setItem(`league-preview:${createdEvent.$id}`, JSON.stringify(schedule));
            }

            const refreshed = await eventService.getEventWithRelations(createdEvent.$id);
            onEventCreated(refreshed || createdEvent);
            onClose();
            router.push(`/events/${createdEvent.$id}/schedule?preview=1`);
        } catch (error) {
            setLeagueError(error instanceof Error ? error.message : 'Failed to generate preview schedule.');
            if (createdEvent) {
                try {
                    await leagueService.deleteWeeklySchedulesForEvent(createdEvent.$id);
                } catch (scheduleError) {
                    console.error('Failed to rollback weekly schedules:', scheduleError);
                }
                try {
                    await eventService.deleteEvent(createdEvent.$id);
                } catch (cleanupError) {
                    console.error('Failed to rollback league event:', cleanupError);
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting || !isValid) return;

        if (!isEditMode && eventData.eventType === 'league') {
            await handleLeaguePreview();
            return;
        }

        setIsSubmitting(true);
        try {
            // Divisions already tracked as string[] keys
            const finalImageId = selectedImageId || eventData.imageId;
            if (!finalImageId) {
                // Safety net: image is required
                setIsSubmitting(false);
                return;
            }
            let submitData: any = {
                ...eventData,
                divisions: eventData.divisions,
                imageId: finalImageId,
            };

            // Only set hostId and participant data for new events
            if (!isEditMode) {
                submitData.hostId = currentUser?.$id;
                if (organizationId) submitData.organization = organizationId;
                submitData.playerIds = joinAsParticipant && !eventData.teamSignup ? [currentUser?.$id] : [];
                submitData.teamIds = [];
                submitData.waitList = [];
                submitData.freeAgents = [];
                if (shouldProvisionFields) {
                    submitData.fieldCount = fieldCount;
                }
            }

            if (eventData.eventType === 'tournament') {
                submitData = { ...submitData, ...tournamentData };
                if (!isEditMode && shouldProvisionFields) {
                    submitData.fieldCount = fieldCount;
                }
            }

            if (eventData.eventType === 'league') {
                submitData = {
                    ...submitData,
                    ...(isEditMode ? {} : { status: 'draft' }),
                    gamesPerOpponent: leagueData.gamesPerOpponent,
                    includePlayoffs: leagueData.includePlayoffs,
                    playoffTeamCount: leagueData.includePlayoffs ? leagueData.playoffTeamCount ?? undefined : undefined,
                    usesSets: leagueData.usesSets,
                    matchDurationMinutes: leagueData.matchDurationMinutes,
                    setDurationMinutes: leagueData.usesSets ? leagueData.setDurationMinutes ?? undefined : undefined,
                    setsPerMatch: leagueData.usesSets ? leagueData.setsPerMatch ?? undefined : undefined,
                };
                if (!isEditMode && shouldProvisionFields && !shouldManageLocalFields) {
                    submitData.fieldCount = fieldCount;
                }
            }

            let resultEvent;
            if (isEditMode) {
                // ✅ Update existing event
                resultEvent = await eventService.updateEvent(editingEvent!.$id, submitData);
            } else {
                // Create new event
                resultEvent = await eventService.createEvent(submitData);
            }

            onEventCreated(resultEvent);
            onClose();
        } catch (error) {
            console.error(`Failed to ${isEditMode ? 'update' : 'create'} event:`, error);
        } finally {
            setIsSubmitting(false);
        }
    };

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
                                        Fields will be created for this league using the names you provide below.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {fieldTemplates.map((template, index) => (
                                        <TextInput
                                            key={template.key}
                                            label={`Field ${template.fieldNumber} Name`}
                                            value={template.name}
                                            onChange={(event) => handleFieldTemplateNameChange(index, event.currentTarget.value)}
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
                                    value={new Date(eventData.start)}
                                    onChange={(val) => {
                                        if (!val) return;
                                        const d = typeof val === 'string' ? new Date(val) : (val as Date);
                                        setEventData(prev => ({ ...prev, start: d.toISOString() }));
                                    }}
                                    minDate={todaysDate}
                                    timePickerProps={{
                                        withDropdown: true,
                                        format: '12h',

                                    }}
                                />
                            </div>
                            <div>
                                <DateTimePicker
                                    label="End Date & Time"
                                    valueFormat="DD MMM YYYY hh:mm A"
                                    value={new Date(eventData.end)}
                                    onChange={(val) => {
                                        if (!val) return;
                                        const d = typeof val === 'string' ? new Date(val) : (val as Date);
                                        setEventData(prev => ({ ...prev, end: d.toISOString() }));
                                    }}
                                    minDate={new Date(eventData.start)}
                                    timePickerProps={{
                                        withDropdown: true,
                                        format: '12h',

                                    }}
                                />
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
