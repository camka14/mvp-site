import React, { useState, useEffect } from 'react';
import ModalShell from '@/components/ui/ModalShell';
import { useRouter } from 'next/navigation';
import { Event, UserData, Team, getEventDateTime, getCategoryFromEvent, getUserAvatarUrl, getTeamAvatarUrl, PaymentIntent, getEventImageUrl, formatPrice } from '@/types';
import { eventService } from '@/lib/eventService';
import { userService } from '@/lib/userService';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import { useApp } from '@/app/providers';
import ParticipantsPreview from '@/components/ui/ParticipantsPreview';
import ParticipantsDropdown from '@/components/ui/ParticipantsDropdown';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';

interface EventDetailModalProps {
    event: Event;
    isOpen: boolean;
    onClose: () => void;
}

export default function EventDetailModal({ event, isOpen, onClose }: EventDetailModalProps) {
    const { user } = useApp();
    const router = useRouter();
    const [detailedEvent, setDetailedEvent] = useState<Event | null>(null);
    const [players, setPlayers] = useState<UserData[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [freeAgents, setFreeAgents] = useState<UserData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showPlayersDropdown, setShowPlayersDropdown] = useState(false);
    const [showTeamsDropdown, setShowTeamsDropdown] = useState(false);
    const [showFreeAgentsDropdown, setShowFreeAgentsDropdown] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);

    // Team-signup join controls
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [showTeamJoinOptions, setShowTeamJoinOptions] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState('');

    const currentEvent = detailedEvent || event;

    useEffect(() => {
        if (isOpen && event) {
            setDetailedEvent(event);
            loadEventDetails();
        } else {
            setDetailedEvent(null);
            setPlayers([]);
            setTeams([]);
            setIsLoading(false);
            setJoinError(null); // Reset error when modal closes
        }
    }, [isOpen, event]);

    const loadEventDetails = async () => {
        if (!event) return;

        setIsLoading(true);
        try {
            // Always fetch the latest event snapshot first
            const latest = await eventService.getEventById(event.$id);
            const baseEvent = latest || event;
            setDetailedEvent(baseEvent);

            // Load participants from the latest snapshot
            const [eventPlayers, eventTeams] = await Promise.all([
                baseEvent.playerIds.length > 0 ? userService.getUsersByIds(baseEvent.playerIds) : Promise.resolve([]),
                baseEvent.teamIds.length > 0 ? Promise.all(baseEvent.teamIds.map(id => teamService.getTeamById(id, true))) : Promise.resolve([])
            ]);

            setPlayers(eventPlayers);
            setTeams(eventTeams.filter(team => team !== undefined) as Team[]);

            // Load free agents from the latest snapshot
            if (baseEvent.freeAgents && baseEvent.freeAgents.length > 0) {
                const agents = await userService.getUsersByIds(baseEvent.freeAgents);
                setFreeAgents(agents);
            } else {
                setFreeAgents([]);
            }

            // If team signup and user is present, load user's relevant teams
            if (user && baseEvent.teamSignup) {
                const teamsByUser = await teamService.getTeamsByUserId(user.$id);
                const relevant = teamsByUser.filter(t => t.sport.toLowerCase() === baseEvent.sport.toLowerCase());
                setUserTeams(relevant);
            } else {
                setUserTeams([]);
            }
        } catch (error) {
            console.error('Failed to load event details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Update the join event handlers
    const handleJoinEvent = async () => {
        if (!user || !currentEvent) return;

        setJoining(true);
        setJoinError(null);

        try {
            const isTournament = currentEvent.eventType === 'tournament';

            if (currentEvent.price === 0) {
                await paymentService.joinEvent(currentEvent.$id, user.$id, undefined, isTournament);
                await loadEventDetails(); // Refresh event data
            } else {
                const paymentIntent = await paymentService.createPaymentIntent(
                    currentEvent.$id,
                    user.$id,
                    undefined, // teamId if needed
                    isTournament
                );

                setPaymentData(paymentIntent); // Store payment data
                setShowPaymentModal(true);     // Show payment modal
            }
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join event');
        } finally {
            setJoining(false);
        }
    };

    // Team-signup: join as team or free agent
    const handleJoinAsTeam = async () => {
        if (!user || !currentEvent || !selectedTeamId) return;
        setJoining(true);
        setJoinError(null);
        try {
            const isTournament = currentEvent.eventType === 'tournament';
            if (currentEvent.price === 0) {
                await paymentService.joinEvent(currentEvent.$id, user.$id, selectedTeamId, isTournament);
                await loadEventDetails();
            } else {
                const paymentIntent = await paymentService.createPaymentIntent(
                    currentEvent.$id,
                    user.$id,
                    selectedTeamId,
                    isTournament
                );
                setPaymentData(paymentIntent);
                setShowPaymentModal(true);
            }
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join as team');
        } finally {
            setJoining(false);
        }
    };

    if (!isOpen || !currentEvent) return null;

    const { date, time } = getEventDateTime(currentEvent);
    const category = getCategoryFromEvent(currentEvent);
    const isTeamSignup = currentEvent.teamSignup;
    // Only consider real registrations (not free-agent listings) for refund logic
    const isUserRegistered = !!user && (
        (!currentEvent.teamSignup && currentEvent.playerIds.includes(user.$id)) ||
        (currentEvent.teamSignup && (user.teamIds || []).some(tid => currentEvent.teamIds.includes(tid)))
    );
    const isUserFreeAgent = !!user && (currentEvent.freeAgents || []).includes(user.$id);

    return (
        <>
            <ModalShell isOpen={isOpen} onClose={onClose} title={currentEvent.name} maxWidth="4xl" contentClassName="!p-0">
                {/* Optional hero banner */}
                <div className="relative">
                    <img
                        src={getEventImageUrl({ imageId: event.imageId, width: 800 })}
                        alt={currentEvent.name}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&h=200&fit=crop';
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-6 text-white">
                        <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {date} at {time}
                            </div>
                            <div className="flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {currentEvent.location}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Content */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Event Info */}
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 mb-4">Event Details</h2>
                                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-sm text-gray-600">Category</span>
                                            <p className="font-medium">{category}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-600">Type</span>
                                            <p className="font-medium capitalize">{currentEvent.eventType}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-600">Price</span>
                                            <p className="font-medium">{currentEvent.price === 0 ? 'Free' : `${formatPrice(currentEvent.price)}`}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-600">Field Type</span>
                                            <p className="font-medium">{currentEvent.fieldType}</p>
                                        </div>
                                    </div>

                                    {currentEvent.divisions && currentEvent.divisions.length > 0 && (
                                        <div>
                                            <span className="text-sm text-gray-600">Divisions</span>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {currentEvent.divisions.map((division, index) => (
                                                    <span key={index} className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                                        {division}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                                <p className="text-gray-700 leading-relaxed">{currentEvent.description}</p>
                            </div>

                            {/* Tournament Details */}
                            {currentEvent.eventType === 'tournament' && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament Format</h3>
                                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                        {currentEvent.doubleElimination && (
                                            <p><span className="font-medium">Format:</span> Double Elimination</p>
                                        )}
                                        {currentEvent.prize && (
                                            <p><span className="font-medium">Prize:</span> {currentEvent.prize}</p>
                                        )}
                                        {currentEvent.winnerSetCount && (
                                            <p><span className="font-medium">Sets to Win:</span> {currentEvent.winnerSetCount}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            {/* Participants */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Participants</h3>

                                {/* Players Section */}
                                {(players.length > 0 || currentEvent.playerIds.length > 0) && (
                                    <div className="mb-4">
                                        <ParticipantsPreview
                                            title="Players"
                                            participants={players}
                                            totalCount={currentEvent.playerIds.length}
                                            isLoading={isLoading}
                                            onClick={() => setShowPlayersDropdown(true)}
                                            getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                            emptyMessage="No players registered yet"
                                        />
                                    </div>
                                )}

                                {/* Teams Section */}
                                {(teams.length > 0 || currentEvent.teamIds.length > 0) && (
                                    <div className="mb-4">
                                        <ParticipantsPreview
                                            title="Teams"
                                            participants={teams}
                                            totalCount={currentEvent.teamIds.length}
                                            isLoading={isLoading}
                                            onClick={() => setShowTeamsDropdown(true)}
                                            getAvatarUrl={(participant) => getTeamAvatarUrl(participant as Team, 32)}
                                            emptyMessage="No teams registered yet"
                                        />
                                    </div>
                                )}

                                {/* Free Agents Section */}
                                {(freeAgents.length > 0 || currentEvent.freeAgents.length > 0) && (
                                    <div className="mb-4">
                                        <ParticipantsPreview
                                            title="Free Agents"
                                            participants={freeAgents}
                                            totalCount={currentEvent.freeAgents.length}
                                            isLoading={isLoading}
                                            onClick={() => setShowFreeAgentsDropdown(true)}
                                            getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                            emptyMessage="No free agents yet"
                                        />
                                    </div>
                                )}

                                {/* Registration Status and Join Options */}
                                <div className="bg-blue-50 rounded-lg p-4">
                                    <div className="text-center">
                                        <div className="text-lg font-semibold text-blue-900 mb-1">
                                            {currentEvent.attendees} / {currentEvent.maxParticipants}
                                        </div>
                                        <div className="text-sm text-blue-700 mb-3">Total Participants</div>
                                    </div>

                                    {joinError && (
                                        <div className="mb-3 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
                                            {joinError}
                                        </div>
                                    )}

                                    {!user ? (
                                        <div className="text-sm text-gray-600 text-center">
                                            Please log in to join this event
                                        </div>
                                    ) : isUserRegistered ? (
                                        <div className="text-sm text-green-600 font-medium text-center">
                                            ✓ You're registered for this event
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {!isTeamSignup ? (
                                                <div>
                                                    {currentEvent.attendees >= currentEvent.maxParticipants ? (
                                                        <button
                                                            onClick={async () => {
                                                                if (!user) return;
                                                                setJoining(true);
                                                                setJoinError(null);
                                                                try {
                                                                    await eventService.addToWaitlist(currentEvent.$id, user.$id);
                                                                    await loadEventDetails();
                                                                } catch (e) {
                                                                    setJoinError(e instanceof Error ? e.message : 'Failed to join waitlist');
                                                                } finally {
                                                                    setJoining(false);
                                                                }
                                                            }}
                                                            disabled={joining}
                                                            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${joining ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}
                                                        >
                                                            {joining ? 'Adding…' : 'Join Waitlist'}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={handleJoinEvent}
                                                            disabled={joining}
                                                            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${joining ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                                        >
                                                            {joining ? 'Joining…' : currentEvent.price > 0 ? `Join Event - ${formatPrice(currentEvent.price)}` : 'Join Event'}
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <button
                                                        onClick={() => setShowTeamJoinOptions(prev => !prev)}
                                                        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                                    >
                                                        {showTeamJoinOptions ? 'Hide Team Options' : 'Join as Team'}
                                                    </button>

                                                    {showTeamJoinOptions && (
                                                        <div className="bg-white rounded-lg p-3 space-y-3">
                                                            {userTeams.length > 0 ? (
                                                                <div>
                                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Select your team</label>
                                                                    <select
                                                                        value={selectedTeamId}
                                                                        onChange={(e) => setSelectedTeamId(e.target.value)}
                                                                        className="w-full p-2 border border-gray-300 rounded-md"
                                                                    >
                                                                        <option value="">Choose a team…</option>
                                                                        {userTeams.map(t => (
                                                                            <option key={t.$id} value={t.$id}>{t.name} ({t.division})</option>
                                                                        ))}
                                                                    </select>
                                                                    <div className="flex items-center space-x-2 mt-3">
                                                                        <button
                                                                            onClick={() => {
                                                                                router.push(`/teams?event=${currentEvent.$id}`);
                                                                                onClose();
                                                                            }}
                                                                            className="flex-1 py-2 px-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                                                                        >
                                                                            Manage Teams
                                                                        </button>
                                                                        {currentEvent.attendees >= currentEvent.maxParticipants ? (
                                                                            <button
                                                                                onClick={async () => {
                                                                                    if (!selectedTeamId) return;
                                                                                    setJoining(true);
                                                                                    setJoinError(null);
                                                                                    try {
                                                                                        await eventService.addToWaitlist(currentEvent.$id, selectedTeamId);
                                                                                        await loadEventDetails();
                                                                                    } catch (e) {
                                                                                        setJoinError(e instanceof Error ? e.message : 'Failed to join waitlist');
                                                                                    } finally {
                                                                                        setJoining(false);
                                                                                    }
                                                                                }}
                                                                                disabled={joining || !selectedTeamId}
                                                                                className={`flex-1 py-2 px-3 rounded-lg text-white ${joining || !selectedTeamId ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'}`}
                                                                            >
                                                                                {joining ? 'Adding…' : 'Join Waitlist'}
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                onClick={handleJoinAsTeam}
                                                                                disabled={joining || !selectedTeamId}
                                                                                className={`flex-1 py-2 px-3 rounded-lg text-white ${joining || !selectedTeamId ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                                                                            >
                                                                                {joining ? 'Joining…' : 'Confirm Join'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center">
                                                                    <p className="text-sm text-gray-600 mb-2">You have no teams for {currentEvent.sport}.</p>
                                                                    <button
                                                                        onClick={() => {
                                                                            router.push(`/teams?event=${currentEvent.$id}`);
                                                                            onClose();
                                                                        }}
                                                                        className="w-full py-2 px-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                                                                    >
                                                                        Manage Teams
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {isUserFreeAgent ? (
                                                        <div className="space-y-2">
                                                            <div className="w-full py-2 px-4 rounded-lg bg-purple-50 text-purple-700 text-center font-medium">
                                                                You are listed as a free agent
                                                            </div>
                                                            <button
                                                                onClick={async () => {
                                                                    if (!user) return;
                                                                    setJoining(true);
                                                                    setJoinError(null);
                                                                    try {
                                                                        await eventService.removeFreeAgent(currentEvent.$id, user.$id);
                                                                        await loadEventDetails();
                                                                    } catch (e) {
                                                                        setJoinError(e instanceof Error ? e.message : 'Failed to leave free agents');
                                                                    } finally {
                                                                        setJoining(false);
                                                                    }
                                                                }}
                                                                disabled={joining}
                                                                className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${joining ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                                                            >
                                                                {joining ? 'Updating…' : 'Leave Free Agent List'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={async () => {
                                                                if (!user) return;
                                                                setJoining(true);
                                                                setJoinError(null);
                                                                try {
                                                                    // Free Agent listing is free; no payment
                                                                    await eventService.addFreeAgent(currentEvent.$id, user.$id);
                                                                    await loadEventDetails();
                                                                } catch (e) {
                                                                    setJoinError(e instanceof Error ? e.message : 'Failed to join as free agent');
                                                                } finally {
                                                                    setJoining(false);
                                                                }
                                                            }}
                                                            disabled={joining}
                                                            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${joining ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                                                        >
                                                            {joining ? 'Adding…' : 'Join as Free Agent (Free)'}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Refund Options */}
                                <RefundSection
                                    event={currentEvent}
                                    userRegistered={!!isUserRegistered}
                                    onRefundSuccess={loadEventDetails}
                                />
                            </div>

                            {/* Event Stats */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Event Stats</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Max Participants:</span>
                                        <span className="font-medium">{currentEvent.maxParticipants}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Team Size Limit:</span>
                                        <span className="font-medium">{currentEvent.teamSizeLimit}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Registration Cutoff:</span>
                                        <span className="font-medium">{currentEvent.registrationCutoffHours}h before</span>
                                    </div>
                                    {currentEvent.rating && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Rating:</span>
                                            <span className="font-medium flex items-center">
                                                {currentEvent.rating}/5
                                                <svg className="w-4 h-4 text-yellow-400 ml-1" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ModalShell>

            {/* Players Dropdown */}
            <ParticipantsDropdown
                isOpen={showPlayersDropdown}
                onClose={() => setShowPlayersDropdown(false)}
                title="Event Players"
                participants={players}
                isLoading={isLoading}
                renderParticipant={(player) => (
                    <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                        <img
                            src={getUserAvatarUrl(player as UserData, 40)}
                            alt={(player as UserData).fullName}
                            className="w-10 h-10 rounded-full object-cover"
                        />
                        <div>
                            <div className="font-medium text-gray-900">{(player as UserData).fullName}</div>
                            <div className="text-sm text-gray-500">@{(player as UserData).userName}</div>
                        </div>
                    </div>
                )}
                emptyMessage="No players have joined this event yet."
            />

            {/* Teams Dropdown */}
            <ParticipantsDropdown
                isOpen={showTeamsDropdown}
                onClose={() => setShowTeamsDropdown(false)}
                title="Event Teams"
                participants={teams}
                isLoading={isLoading}
                renderParticipant={(team) => (
                    <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                        <img
                            src={getTeamAvatarUrl(team as Team, 40)}
                            alt={(team as Team).name || 'Team'}
                            className="w-10 h-10 rounded-full object-cover"
                        />
                        <div className="flex-1">
                            <div className="font-medium text-gray-900">{(team as Team).name || 'Unnamed Team'}</div>
                            <div className="text-sm text-gray-500">
                                {(team as Team).currentSize} members • {(team as Team).division} Division
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">
                            {(team as Team).winRate}% win rate
                        </div>
                    </div>
                )}
                emptyMessage="No teams have registered for this event yet."
            />

            {/* Free Agents Dropdown */}
            <ParticipantsDropdown
                isOpen={showFreeAgentsDropdown}
                onClose={() => setShowFreeAgentsDropdown(false)}
                title="Free Agents"
                participants={freeAgents}
                isLoading={isLoading}
                renderParticipant={(agent) => (
                    <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                        <img
                            src={getUserAvatarUrl(agent as UserData, 40)}
                            alt={(agent as UserData).fullName}
                            className="w-10 h-10 rounded-full object-cover"
                        />
                        <div>
                            <div className="font-medium text-gray-900">{(agent as UserData).fullName}</div>
                            <div className="text-sm text-gray-500">@{(agent as UserData).userName}</div>
                        </div>
                    </div>
                )}
                emptyMessage="No free agents have listed for this event yet."
            />

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                    setPaymentData(null); // Clear payment data
                }}
                event={currentEvent}
                paymentData={paymentData} // Pass the already-created payment intent
                onPaymentSuccess={() => {
                    setShowPaymentModal(false);
                    setPaymentData(null);
                    loadEventDetails();
                }}
            />
        </>
    );
}
