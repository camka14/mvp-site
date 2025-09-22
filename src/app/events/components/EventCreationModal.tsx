import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ClockIcon } from 'lucide-react';

import { CreateEventData, eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import TournamentFields from './TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { useLocation } from '@/app/hooks/useLocation';
import { getEventImageUrl, SPORTS_LIST, Event } from '@/types';

import { Modal, TextInput, Textarea, NumberInput, Select as MantineSelect, MultiSelect as MantineMultiSelect, Switch, Group, Button } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
import { locationService } from '@/lib/locationService';

// Define Division interface locally
interface Division {
    id: string;
    name: string;
    skillLevel: string;
    minRating?: number;
    maxRating?: number;
}

interface EventCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEventCreated: (updatedEvent?: Event) => void;
    currentUser?: any;
    editingEvent?: Event;
    organizationId?: string;
}

const EventCreationModal: React.FC<EventCreationModalProps> = ({
    isOpen,
    onClose,
    onEventCreated,
    currentUser,
    editingEvent,
    organizationId
}) => {
    const { location: userLocation } = useLocation();
    const modalRef = useRef<HTMLDivElement>(null);
    const [selectedImageId, setSelectedImageId] = useState<string>(editingEvent?.imageId || '');


    const [selectedImageUrl, setSelectedImageUrl] = useState(
        editingEvent ? getEventImageUrl({ imageId: editingEvent.imageId, width: 800 }) : ''
    );
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
        eventType: 'pickup' | 'tournament';
        sport: string;
        fieldType: string;
        price: number;
        maxParticipants: number;
        teamSizeLimit: number;
        teamSignup: boolean;
        singleDivision: boolean;
        divisions: Division[];
        cancellationRefundHours: number;
        registrationCutoffHours: number;
        imageId: string;
        seedColor: number;
        waitList: string[];
        freeAgents: string[];
        playerIds: string[];
        teamIds: string[];
    }>(() => {
        if (editingEvent) {
            return {
                name: editingEvent.name,
                description: editingEvent.description,
                location: editingEvent.location,
                coordinates: editingEvent.coordinates,
                lat: Array.isArray(editingEvent.coordinates) ? editingEvent.coordinates[1] : (editingEvent as any).coordinates?.lat,
                long: Array.isArray(editingEvent.coordinates) ? editingEvent.coordinates[0] : (editingEvent as any).coordinates?.lng,
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
                divisions: editingEvent.divisions.map(skillLevel => ({
                    id: `${skillLevel}-${Date.now()}`,
                    name: skillLevel,
                    skillLevel
                })),
                cancellationRefundHours: editingEvent.cancellationRefundHours,
                registrationCutoffHours: editingEvent.registrationCutoffHours,
                imageId: editingEvent.imageId,
                seedColor: editingEvent.seedColor || 0,
                waitList: editingEvent.waitListIds || [],
                freeAgents: editingEvent.freeAgentIds || [],
                playerIds: editingEvent.playerIds || [],
                teamIds: editingEvent.teamIds || []
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
                playerIds: [],
                teamIds: []
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
                fieldCount: editingEvent.fieldCount

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

    const todaysDate = new Date(new Date().setHours(0, 0, 0, 0));
    const modalTitle = isEditMode ? 'Edit Event' : 'Create New Event';
    const submitButtonText = isEditMode ? 'Update Event' : 'Create Event';
    const submittingText = isEditMode ? 'Updating...' : 'Creating...';

    // Validation state
    const [validation, setValidation] = useState({
        isNameValid: false,
        isPriceValid: true,
        isMaxParticipantsValid: true,
        isTeamSizeValid: true,
        isLocationValid: false,
        isSkillLevelValid: false,
        isImageValid: false,
    });

    // Validation effect
    useEffect(() => {
        setValidation({
            isNameValid: eventData.name ? eventData.name?.trim().length > 0 : false,
            isPriceValid: eventData.price !== undefined ? eventData.price >= 0 : false,
            isMaxParticipantsValid: eventData.maxParticipants ? eventData.maxParticipants > 1 : false,
            isTeamSizeValid: eventData.teamSizeLimit ? eventData.teamSizeLimit >= 1 : false,
            isLocationValid: eventData.location ? eventData.location?.trim().length > 0 && (eventData.lat !== 0 && eventData.long !== 0) : false,
            isSkillLevelValid: eventData.divisions ? eventData.divisions?.length > 0 : false,
            isImageValid: Boolean(selectedImageId || eventData.imageId || selectedImageUrl),
        });
    }, [eventData, selectedImageId, selectedImageUrl]);

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

    const isValid = Object.values(validation).every(v => v);

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



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || isSubmitting) return;

        setIsSubmitting(true);
        try {
            // Convert Division[] to string[] for backend compatibility
            const finalImageId = selectedImageId || eventData.imageId;
            if (!finalImageId) {
                // Safety net: image is required
                setIsSubmitting(false);
                return;
            }
            let submitData: any = {
                ...eventData,
                divisions: eventData.divisions.map(div => div.skillLevel),
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
            }

            if (eventData.eventType === 'tournament') {
                submitData = { ...submitData, ...tournamentData };
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
                                ]}
                                value={eventData.eventType}
                                onChange={(value) => setEventData(prev => ({ ...prev, eventType: (value as 'pickup' | 'tournament') || prev.eventType }))}
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
                            value={eventData.divisions.map(d => d.skillLevel)}
                            onChange={(vals) => {
                                const toLabel = (v: string) => {
                                    switch (v) {
                                        case 'beginner': return 'Beginner (1.0 - 2.5) Division';
                                        case 'intermediate': return 'Intermediate (2.5 - 3.5) Division';
                                        case 'advanced': return 'Advanced (3.5 - 4.5) Division';
                                        case 'expert': return 'Expert (4.5+) Division';
                                        case 'open': return 'Open (All Skill Levels) Division';
                                        default: return v;
                                    }
                                };
                                setEventData(prev => ({
                                    ...prev,
                                    divisions: vals.map(v => ({ id: `${v}-${Date.now()}`, name: toLabel(v), skillLevel: v } as Division))
                                }));
                            }}
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

                    {/* Tournament Fields */}
                    {eventData.eventType === 'tournament' && (
                        <TournamentFields
                            tournamentData={tournamentData}
                            setTournamentData={setTournamentData}
                        />
                    )}
                </form>
            </div>

            {/* Footer */}
            <div className="border-t p-6 flex justify-between items-center">
                <div>
                    {!isEditMode && !eventData.teamSignup && (
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
