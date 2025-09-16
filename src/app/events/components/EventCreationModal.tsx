import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ClockIcon } from 'lucide-react';

import { CreateEventData, eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import TournamentFields from './TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { useLocation } from '@/app/hooks/useLocation';
import { getEventImageUrl, SPORTS_LIST, Event } from '@/types';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MUITimePicker } from '@/components/ui/MUITimePicker';
import MultiSelect from '@/components/ui/MultiSelect';
import ModalShell from '@/components/ui/ModalShell';
import { paymentService } from '@/lib/paymentService';

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
}

const EventCreationModal: React.FC<EventCreationModalProps> = ({
    isOpen,
    onClose,
    onEventCreated,
    currentUser,
    editingEvent
}) => {
    const { location: userLocation } = useLocation();
    const modalRef = useRef<HTMLDivElement>(null);
    const [selectedImageId, setSelectedImageId] = useState<string>('');


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
                lat: editingEvent.lat,
                long: editingEvent.long,
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
                waitList: editingEvent.waitList || [],
                freeAgents: editingEvent.freeAgents || [],
                playerIds: editingEvent.playerIds || [],
                teamIds: editingEvent.teamIds || []
            };
        } else {
            // Default values for new event
            return {
                name: '',
                description: '',
                location: '',
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
        isSkillLevelValid: false
    });

    // Validation effect
    useEffect(() => {
        setValidation({
            isNameValid: eventData.name ? eventData.name?.trim().length > 0 : false,
            isPriceValid: eventData.price !== undefined ? eventData.price >= 0 : false,
            isMaxParticipantsValid: eventData.maxParticipants ? eventData.maxParticipants > 1 : false,
            isTeamSizeValid: eventData.teamSizeLimit ? eventData.teamSizeLimit >= 1 : false,
            isLocationValid: eventData.location ? eventData.location?.trim().length > 0 && eventData.lat !== 0 && eventData.long !== 0 : false,
            isSkillLevelValid: eventData.divisions ? eventData.divisions?.length > 0 : false
        });
    }, [eventData]);

    useEffect(() => {
        if (eventData.teamSignup) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup]);

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
            let submitData: any = {
                ...eventData,
                divisions: eventData.divisions.map(div => div.skillLevel),
                imageId: selectedImageId,
            };

            // Only set hostId and participant data for new events
            if (!isEditMode) {
                submitData.hostId = currentUser?.$id;
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
        <ModalShell isOpen={isOpen} onClose={onClose} title={modalTitle} maxWidth="4xl" contentClassName="!p-0">
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
                        <Label className="block text-sm font-medium mb-2">Event Image</Label>
                        <ImageUploader
                            currentImageUrl={selectedImageUrl}
                            bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!}
                            className="w-full max-w-md"
                            placeholder="Select event image"
                            onChange={handleImageChange}
                        />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Basic Information */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Event Name *</Label>
                                <Input
                                    value={eventData.name}
                                    onChange={(e) => setEventData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Enter event name"
                                    className={!validation.isNameValid && eventData.name ? 'border-red-300' : ''}
                                />
                                {!validation.isNameValid && eventData.name && (
                                    <p className="text-red-500 text-sm">Event name is required</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>Sport *</Label>
                                <Select
                                    value={eventData.sport}
                                    onValueChange={(value) => setEventData(prev => ({ ...prev, sport: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a sport" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SPORTS_LIST.map(sport => (
                                            <SelectItem key={sport} value={sport}>
                                                {sport.charAt(0).toUpperCase() + sport.slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-2 mt-4">
                            <Label htmlFor="description">Description</Label>
                            <textarea
                                id="description"
                                value={eventData.description}
                                onChange={(e) => setEventData(prev => ({ ...prev, description: e.target.value }))}
                                className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                rows={3}
                                placeholder="Describe your event..."
                            />
                        </div>
                    </div>

                    {/* Event Details */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Event Details</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="space-y-2">
                                <Label>Event Type *</Label>
                                <Select
                                    value={eventData.eventType}
                                    onValueChange={(value) => setEventData(prev => ({
                                        ...prev,
                                        eventType: value as 'pickup' | 'tournament'
                                    }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pickup">Pickup Game</SelectItem>
                                        <SelectItem value="tournament">Tournament</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Field Type *</Label>
                                <Select
                                    value={eventData.fieldType}
                                    onValueChange={(value) => setEventData(prev => ({ ...prev, fieldType: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="indoor">Indoor</SelectItem>
                                        <SelectItem value="outdoor">Outdoor</SelectItem>
                                        <SelectItem value="sand">Sand</SelectItem>
                                        <SelectItem value="grass">Grass</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Pricing and Participant Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="price">Price ($)</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={eventData.price}
                                    onChange={(e) => setEventData(prev => ({
                                        ...prev,
                                        price: parseFloat(e.target.value) || 0
                                    }))}
                                    className={!validation.isPriceValid ? 'border-red-300' : ''}
                                    disabled={!hasStripeAccount} // Always disable if no Stripe account
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

                            <div className="space-y-2">
                                <Label htmlFor="maxParticipants">Max Participants *</Label>
                                <Input
                                    id="maxParticipants"
                                    type="number"
                                    min="2"
                                    value={eventData.maxParticipants}
                                    onChange={(e) => setEventData(prev => ({
                                        ...prev,
                                        maxParticipants: parseInt(e.target.value) || 10
                                    }))}
                                    className={!validation.isMaxParticipantsValid ? 'border-red-300' : ''}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="teamSizeLimit">Team Size Limit</Label>
                                <Input
                                    id="teamSizeLimit"
                                    type="number"
                                    min="1"
                                    value={eventData.teamSizeLimit}
                                    onChange={(e) => setEventData(prev => ({
                                        ...prev,
                                        teamSizeLimit: parseInt(e.target.value) || 2
                                    }))}
                                    className={!validation.isTeamSizeValid ? 'border-red-300' : ''}
                                />
                            </div>
                        </div>

                        {/* Policy Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div className="space-y-2">
                                <Label htmlFor="cancellationRefundHours">Cancellation Refund (Hours)</Label>
                                <Input
                                    id="cancellationRefundHours"
                                    type="number"
                                    min="0"
                                    value={eventData.cancellationRefundHours}
                                    onChange={(e) => setEventData(prev => ({
                                        ...prev,
                                        cancellationRefundHours: parseInt(e.target.value) || 24
                                    }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="registrationCutoffHours">Registration Cutoff (Hours)</Label>
                                <Input
                                    id="registrationCutoffHours"
                                    type="number"
                                    min="0"
                                    value={eventData.registrationCutoffHours}
                                    onChange={(e) => setEventData(prev => ({
                                        ...prev,
                                        registrationCutoffHours: parseInt(e.target.value) || 2
                                    }))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Location & Time */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Location & Time</h3>

                        <div className="mb-6">
                            <LocationSelector
                                value={eventData.location}
                                coordinates={{
                                    lat: eventData.lat || userLocation?.lat || 0,
                                    lng: eventData.long || userLocation?.lng || 0
                                }}
                                onChange={(location, lat, lng) => {
                                    setEventData(prev => ({ ...prev, location, lat, long: lng }));
                                }}
                                isValid={validation.isLocationValid}
                            />
                        </div>

                        {/* Separate Date and Time Pickers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <Label className="text-sm font-medium text-gray-700">Start Date & Time *</Label>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Date Picker */}
                                    <div>
                                        <Label className="text-xs text-gray-600 mb-1 block">Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button className="w-full px-3 py-2 text-left border border-gray-300 rounded-md hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200 flex items-center justify-between">
                                                    {format(new Date(eventData.start), "MMM dd")}
                                                    <CalendarIcon className="h-4 w-4 text-gray-400" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={new Date(eventData.start)}
                                                    onSelect={(date) => {
                                                        if (date) {
                                                            const currentTime = format(new Date(eventData.start), 'HH:mm');
                                                            const newDateTime = updateDateTime(date.toISOString(), currentTime);
                                                            setEventData(prev => ({ ...prev, start: newDateTime }));
                                                        }
                                                    }}
                                                    disabled={(date) => (date < todaysDate)}
                                                    autoFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Time Picker - Direct MUITimePicker */}
                                    <div>
                                        <MUITimePicker
                                            label="Time"
                                            value={format(new Date(eventData.start), 'h:mm a')}
                                            onChange={(timeValue) => {
                                                // Parse the 12-hour format and convert to 24-hour for updateDateTime
                                                const [timePart, meridiem] = timeValue.split(' ');
                                                const [hours, minutes] = timePart.split(':');
                                                let hour24 = parseInt(hours, 10);

                                                if (meridiem === 'PM' && hour24 !== 12) {
                                                    hour24 += 12;
                                                } else if (meridiem === 'AM' && hour24 === 12) {
                                                    hour24 = 0;
                                                }

                                                const time24Format = `${hour24.toString().padStart(2, '0')}:${minutes}`;
                                                const newDateTime = updateDateTime(eventData.start, time24Format);
                                                setEventData(prev => ({ ...prev, start: newDateTime }));
                                            }}
                                            ampm={true}
                                            format="h:mm a"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* End Date & Time */}
                            <div className="space-y-4">
                                <Label className="text-sm font-medium text-gray-700">End Date & Time</Label>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Date Picker */}
                                    <div>
                                        <Label className="text-xs text-gray-600 mb-1 block">Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button className="w-full px-3 py-2 text-left border border-gray-300 rounded-md hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200 flex items-center justify-between">
                                                    {format(new Date(eventData.end), "MMM dd")}
                                                    <CalendarIcon className="h-4 w-4 text-gray-400" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={new Date(eventData.end)}
                                                    onSelect={(date) => {
                                                        if (date) {
                                                            const currentTime = format(new Date(eventData.end), 'HH:mm');
                                                            const newDateTime = updateDateTime(date.toISOString(), currentTime);
                                                            setEventData(prev => ({ ...prev, end: newDateTime }));
                                                        }
                                                    }}
                                                    disabled={(date) => date <= new Date(new Date(eventData.start).setHours(0, 0, 0, 0))}
                                                    autoFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Time Picker - Direct MUITimePicker */}
                                    <div>
                                        <MUITimePicker
                                            label="Time"
                                            value={format(new Date(eventData.end), 'h:mm a')}
                                            onChange={(timeValue) => {
                                                // Parse the 12-hour format and convert to 24-hour for updateDateTime
                                                const [timePart, meridiem] = timeValue.split(' ');
                                                const [hours, minutes] = timePart.split(':');
                                                let hour24 = parseInt(hours, 10);

                                                if (meridiem === 'PM' && hour24 !== 12) {
                                                    hour24 += 12;
                                                } else if (meridiem === 'AM' && hour24 === 12) {
                                                    hour24 = 0;
                                                }

                                                const time24Format = `${hour24.toString().padStart(2, '0')}:${minutes}`;
                                                const newDateTime = updateDateTime(eventData.end, time24Format);
                                                setEventData(prev => ({ ...prev, end: newDateTime }));
                                            }}
                                            ampm={true}
                                            format="h:mm a"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Skills & Settings */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Event Settings</h3>

                        {/* Division Selector */}
                        <MultiSelect
                            value={eventData.divisions.map(d => d.skillLevel)}
                            placeholder='Select Divisions'
                            options={[
                                { value: 'beginner', label: 'Beginner (1.0 - 2.5)' },
                                { value: 'intermediate', label: 'Intermediate (2.5 - 3.5)' },
                                { value: 'advanced', label: 'Advanced (3.5 - 4.5)' },
                                { value: 'expert', label: 'Expert (4.5+)' },
                                { value: 'open', label: 'Open (All Skill Levels)' },
                            ]}
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
                        />

                        {/* Team Settings */}
                        <div className="mt-6 space-y-4">
                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    id="teamSignup"
                                    checked={eventData.teamSignup}
                                    onChange={(e) => setEventData(prev => ({ ...prev, teamSignup: e.target.checked }))}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <Label htmlFor="teamSignup" className="text-sm">
                                    Team Event (teams compete rather than individuals)
                                </Label>
                            </div>

                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    id="singleDivision"
                                    checked={eventData.singleDivision}
                                    onChange={(e) => setEventData(prev => ({ ...prev, singleDivision: e.target.checked }))}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <Label htmlFor="singleDivision" className="text-sm">
                                    Single Division (all skill levels play together)
                                </Label>
                            </div>
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
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                id="joinAsParticipant"
                                checked={joinAsParticipant}
                                onChange={(e) => setJoinAsParticipant(e.target.checked)}
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <Label htmlFor="joinAsParticipant" className="text-sm">
                                Join as participant
                            </Label>
                        </div>
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

                <div className="flex space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid || isSubmitting}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? submittingText : submitButtonText}
                    </button>
                </div>
            </div>
        </ModalShell>
    );
};

export default EventCreationModal;
