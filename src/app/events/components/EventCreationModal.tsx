

import React, { useState, useEffect, useRef } from 'react';
import ModalShell from '@/components/ui/ModalShell';
import { CreateEventData, eventService } from '@/lib/eventService';
import LocationSelector from '@/components/location/LocationSelector';
import DivisionSelector from './DivisionSelector';
import TournamentFields from './TournamentFields';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { useLocation } from '@/app/hooks/useLocation';
import { getEventImageUrl } from '@/types';

interface EventCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEventCreated: (event: CreateEventData) => void;
    currentUser?: any;
}

const EventCreationModal: React.FC<EventCreationModalProps> = ({
    isOpen,
    onClose,
    onEventCreated,
    currentUser
}) => {
    const location = useLocation();
    const modalRef = useRef<HTMLDivElement>(null);
    const backgroundRef = useRef<HTMLDivElement>(null);
    const mouseDownTargetRef = useRef<EventTarget | null>(null);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string>('');

    const [eventData, setEventData] = useState<Partial<CreateEventData>>({
        name: '',
        description: '',
        location: '',
        lat: 0,
        long: 0,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        eventType: 'pickup' as const,
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
    });

    const [tournamentData, setTournamentData] = useState({
        doubleElimination: false,
        winnerSetCount: 1,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [21],
        loserBracketPointsToVictory: [21],
        prize: '',
        fieldCount: 1
    });

    const [validation, setValidation] = useState({
        isNameValid: false,
        isPriceValid: true,
        isMaxParticipantsValid: true,
        isTeamSizeValid: true,
        isLocationValid: false,
        isSkillLevelValid: false
    });


    const [joinAsParticipant, setJoinAsParticipant] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Prevent background scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            const originalStyle = window.getComputedStyle(document.body).overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalStyle;
            };
        }
    }, [isOpen]);

    // Validation effect
    useEffect(() => {
        setValidation({
            isNameValid: eventData.name ? eventData.name?.trim().length > 0 : false,
            isPriceValid: eventData.price !== undefined ? eventData.price >= 0 : false,
            isMaxParticipantsValid: eventData.maxParticipants ? eventData.maxParticipants > 1 : false,
            isTeamSizeValid: eventData.teamSizeLimit ? eventData.teamSizeLimit >= 2 : false,
            isLocationValid: eventData.location ? eventData.location?.trim().length > 0 && eventData.lat !== 0 && eventData.long !== 0 : false,
            isSkillLevelValid: eventData.divisions ? eventData.divisions?.length > 0 : false
        });
    }, [eventData]);

    const isValid = Object.values(validation).every(v => v);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || isSubmitting) return;

        setIsSubmitting(true);
        try {
            let newEvent: Partial<CreateEventData> = {
                ...eventData,
                imageId: selectedImageUrl,
                hostId: currentUser?.$id,
                playerIds: joinAsParticipant && !eventData.teamSignup ? [currentUser?.$id] : [],
                teamIds: [],
                waitList: [],
                freeAgents: [],
            };

            if (eventData.eventType === 'tournament') {
                newEvent = {
                    ...newEvent,
                    ...tournamentData
                };
            }

            const createdEvent = await eventService.createEvent(newEvent);
            onEventCreated(createdEvent);
            onClose();
        } catch (error) {
            console.error('Failed to create event:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleImageChange = (url: string) => {
        setSelectedImageUrl(url);
        setEventData(prev => ({ ...prev, imageId: url }));
    };

    // Handle proper backdrop click
    const handleBackdropMouseDown = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            mouseDownTargetRef.current = e.target;
        } else {
            mouseDownTargetRef.current = null;
        }
    };

    const handleBackdropMouseUp = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && mouseDownTargetRef.current === e.target) {
            onClose();
        }
        mouseDownTargetRef.current = null;
    };

    if (!isOpen) return null;

    return (
        <div
            ref={backgroundRef}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
            onMouseDown={handleBackdropMouseDown}
            onMouseUp={handleBackdropMouseUp}
            style={{ scrollBehavior: 'smooth' }}
        >
            <div
                ref={modalRef}
                className="bg-white rounded-lg max-w-4xl w-full my-8 shadow-2xl relative overflow-hidden"
                style={{
                    maxHeight: 'calc(100vh - 4rem)',
                    minHeight: 'auto'
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
            >
                {/* Hero Image Section */}
                <div className="relative h-48 bg-gradient-to-br from-blue-500 to-purple-600">
                    {eventData.imageId ? (
                        <img
                            src={getEventImageUrl({ imageId: eventData.imageId, height: 48 })}
                            alt={eventData.name}
                            className="w-full h-48 object-cover"
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&h=200&fit=crop';
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white">
                            <div className="text-center">
                                <div className="text-6xl mb-4">🏐</div>
                                <p className="text-lg">Add an image for your event</p>
                            </div>
                        </div>
                    )}

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-white hover:text-gray-300 text-2xl font-bold bg-black/20 rounded-full w-10 h-10 flex items-center justify-center transition-colors duration-200"
                    >
                        ×
                    </button>
                </div>

                {/* Scrollable Content */}
                <div
                    className="overflow-y-auto"
                    style={{ maxHeight: 'calc(100vh - 16rem)' }}
                >
                    <div className="p-6">
                        {/* Event Title Section */}
                        <div className="mb-6">
                            <h2 className="text-3xl font-bold mb-4 text-gray-900">Create New Event</h2>

                            {/* Image Upload */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Event Image
                                </label>
                                <ImageUploader
                                    currentImageUrl={selectedImageUrl}
                                    currentUser={currentUser}
                                    bucketId={process.env.NEXT_PUBLIC_EVENTS_BUCKET_ID!}
                                    className="w-full max-w-md"
                                    placeholder="Select event image"
                                    onChange={handleImageChange}
                                />
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            {/* Basic Information Card */}
                            <div className="bg-gray-50 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-gray-900">Basic Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Event Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={eventData.name || ''}
                                            onChange={(e) => setEventData(prev => ({ ...prev, name: e.target.value }))}
                                            className={`w-full p-3 border rounded-md transition-colors duration-200 ${validation.isNameValid ? 'border-gray-300 focus:border-blue-500' : 'border-red-300 focus:border-red-500'
                                                } focus:outline-none focus:ring-2 focus:ring-blue-200`}
                                            placeholder="Enter event name"
                                        />
                                        {!validation.isNameValid && eventData.name && eventData.name?.length > 0 && (
                                            <p className="text-red-500 text-sm mt-1">Event name is required</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Sport *
                                        </label>
                                        <input
                                            type="text"
                                            value={eventData.sport || ''}
                                            onChange={(e) => setEventData(prev => ({ ...prev, sport: e.target.value }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                            placeholder="e.g., Volleyball, Basketball"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Event Details Card */}
                            <div className="bg-gray-50 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-gray-900">Event Details</h3>

                                {/* Event Type and Field Type */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Event Type *
                                        </label>
                                        <select
                                            value={eventData.eventType}
                                            onChange={(e) => setEventData(prev => ({
                                                ...prev,
                                                eventType: e.target.value as 'pickup' | 'tournament'
                                            }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        >
                                            <option value="pickup">Pickup Game</option>
                                            <option value="tournament">Tournament</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Field Type *
                                        </label>
                                        <select
                                            value={eventData.fieldType}
                                            onChange={(e) => setEventData(prev => ({ ...prev, fieldType: e.target.value }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        >
                                            <option value="indoor">Indoor</option>
                                            <option value="outdoor">Outdoor</option>
                                            <option value="sand">Sand</option>
                                            <option value="grass">Grass</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={eventData.description || ''}
                                        onChange={(e) => setEventData(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        rows={3}
                                        placeholder="Describe your event..."
                                    />
                                </div>

                                {/* Price and Participants */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Price ($)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={eventData.price}
                                            onChange={(e) => setEventData(prev => ({
                                                ...prev,
                                                price: parseFloat(e.target.value) || 0
                                            }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">
                                            {eventData.price === 0 ? 'Free' : `$${eventData.price?.toFixed(2)}`}
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Max Participants *
                                        </label>
                                        <input
                                            type="number"
                                            min="2"
                                            value={eventData.maxParticipants}
                                            onChange={(e) => setEventData(prev => ({
                                                ...prev,
                                                maxParticipants: parseInt(e.target.value) || 10
                                            }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Team Size Limit
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={eventData.teamSizeLimit}
                                            onChange={(e) => setEventData(prev => ({
                                                ...prev,
                                                teamSizeLimit: parseInt(e.target.value) || 2
                                            }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Location Card */}
                            <div className="bg-gray-50 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-gray-900">Location & Time</h3>

                                {/* Location */}
                                <div className="mb-4">
                                    <LocationSelector
                                        value={eventData.location || ''}
                                        coordinates={{
                                            lat: eventData.lat || location.location !== null ? location.location!.lat : 0,
                                            lng: eventData.long || location.location !== null ? location.location!.lng : 0
                                        }}
                                        onChange={(location, lat, lng) => {
                                            setEventData(prev => ({ ...prev, location, lat, long: lng }));
                                        }}
                                        isValid={validation.isLocationValid}
                                    />
                                </div>

                                {/* Date and Time */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Start Date & Time *
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={eventData.start ? new Date(eventData.start).toISOString().slice(0, 16) : ''}
                                            onChange={(e) => setEventData(prev => ({
                                                ...prev,
                                                start: new Date(e.target.value).toISOString()
                                            }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            End Date & Time *
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={eventData.end ? new Date(eventData.end).toISOString().slice(0, 16) : ''}
                                            onChange={(e) => setEventData(prev => ({
                                                ...prev,
                                                end: new Date(e.target.value).toISOString()
                                            }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Skill Levels & Settings Card */}
                            <div className="bg-gray-50 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-gray-900">Event Settings</h3>

                                {/* Divisions */}
                                <div className="mb-4">
                                    <DivisionSelector
                                        selectedDivisions={eventData.divisions || []}
                                        onChange={(divisions) => setEventData(prev => ({ ...prev, divisions }))}
                                        isValid={validation.isSkillLevelValid}
                                    />
                                </div>

                                {/* Checkboxes */}
                                <div className="space-y-3">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            id="teamSignup"
                                            checked={eventData.teamSignup}
                                            onChange={(e) => setEventData(prev => ({ ...prev, teamSignup: e.target.checked }))}
                                            className="mr-3 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="teamSignup" className="text-sm font-medium text-gray-700">
                                            Team Event (teams compete rather than individuals)
                                        </label>
                                    </div>

                                    {!eventData.teamSignup && (
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                id="joinEvent"
                                                checked={joinAsParticipant}
                                                onChange={(e) => setJoinAsParticipant(e.target.checked)}
                                                className="mr-3 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <label htmlFor="joinEvent" className="text-sm font-medium text-gray-700">
                                                Join as participant
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tournament-specific fields */}
                            {eventData.eventType === 'tournament' && (
                                <TournamentFields
                                    tournamentData={tournamentData}
                                    onChange={setTournamentData}
                                />
                            )}
                        </form>
                    </div>
                </div>

                {/* Action Buttons - Fixed at bottom */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6">
                    <div className="flex justify-end space-x-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors duration-200 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            onClick={handleSubmit}
                            disabled={!isValid || isSubmitting}
                            className={`px-6 py-3 rounded-md text-white font-medium transition-colors duration-200 ${isValid && !isSubmitting
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : 'bg-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Creating...
                                </span>
                            ) : (
                                'Create Event'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventCreationModal;
