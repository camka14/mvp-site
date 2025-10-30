import React, { useState, useEffect } from 'react';
import { Modal, Button, Select as MantineSelect, Paper, Alert, Text } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { Event, UserData, Team, getEventDateTime, getUserAvatarUrl, getTeamAvatarUrl, PaymentIntent, getEventImageUrl, formatPrice } from '@/types';
import { eventService } from '@/lib/eventService';
import { userService } from '@/lib/userService';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import { useApp } from '@/app/providers';
import ParticipantsPreview from '@/components/ui/ParticipantsPreview';
import ParticipantsDropdown from '@/components/ui/ParticipantsDropdown';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';
import EventCreationModal from './EventCreationModal';
// Replaced shadcn Select with Mantine Select

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
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [showPlayersDropdown, setShowPlayersDropdown] = useState(false);
    const [showTeamsDropdown, setShowTeamsDropdown] = useState(false);
    const [showFreeAgentsDropdown, setShowFreeAgentsDropdown] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [confirmingPurchase, setConfirmingPurchase] = useState(false);

    // Team-signup join controls
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [showTeamJoinOptions, setShowTeamJoinOptions] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState('');

    const currentEvent = detailedEvent || event;

    const isEventHost = !!user && currentEvent && user.$id === currentEvent.hostId;
    const isFreeEvent = currentEvent && currentEvent.price === 0;
    const isFreeForUser = isFreeEvent || isEventHost;

    useEffect(() => {
        if (isOpen && event) {
            setDetailedEvent(event);
            loadEventDetails();
        } else {
            setDetailedEvent(null);
            setPlayers([]);
            setTeams([]);
            setIsLoadingEvent(false);
            setIsLoadingTeams(false);
            setJoinError(null); // Reset error when modal closes
        }
    }, [isOpen, event]);

    useEffect(() => {
        if (!isOpen || !user) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const targetEvent = event;
        if (!targetEvent || !targetEvent.teamSignup) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const teamIds = Array.isArray(user.teamIds) ? user.teamIds : [];
        if (teamIds.length === 0) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        setIsLoadingTeams(true);
        let cancelled = false;
        const loadTeams = async () => {
            try {
                const userTeamsAll = await teamService.getTeamsByIds(teamIds, true);
                const targetSport = (targetEvent.sport?.name || '').toLowerCase();
                const relevantTeams = userTeamsAll.filter(
                    (team) => (team.sport || '').toLowerCase() === targetSport
                );
                if (!cancelled) {
                    setUserTeams(relevantTeams);
                }
            } catch (error) {
                console.error('Failed to load user teams:', error);
                if (!cancelled) {
                    setUserTeams([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingTeams(false);
                }
            }
        };

        loadTeams();

        return () => {
            cancelled = true;
            setIsLoadingTeams(false);
        };
    }, [isOpen, event, user]);

    const loadEventDetails = async (eventId?: string) => {
        const targetId = eventId ?? event?.$id;
        if (!targetId) return;

        setIsLoadingEvent(true);
        try {
            // Fetch full event with relationships for accurate editing context
            const latest = await eventService.getEventWithRelations(targetId);
            const baseEvent = latest || event;
            if (!baseEvent) {
                return;
            }

            setDetailedEvent(baseEvent);

            const eventPlayers: UserData[] = Array.isArray(baseEvent.players) ? (baseEvent.players as UserData[]) : [];
            const eventTeams: Team[] = Array.isArray(baseEvent.teams) ? (baseEvent.teams as Team[]) : [];

            setPlayers(eventPlayers);
            setTeams(eventTeams);

            const freeAgentIds = Array.isArray(baseEvent.freeAgentIds) ? baseEvent.freeAgentIds : [];
            const shouldLoadFreeAgents = freeAgentIds.length > 0;

            if (shouldLoadFreeAgents) {
                try {
                    const agents = await userService.getUsersByIds(freeAgentIds);
                    setFreeAgents(agents);
                } catch (error) {
                    console.error('Failed to load free agents:', error);
                    setFreeAgents([]);
                }
            } else {
                setFreeAgents([]);
            }

        } catch (error) {
            console.error('Failed to load event details:', error);
        } finally {
            setIsLoadingEvent(false);
        }
    };

    const handleViewSchedule = (tab?: string) => {
        const schedulePath = `/discover/${currentEvent.$id}/schedule`;
        const target = tab ? `${schedulePath}?tab=${tab}` : schedulePath;
        router.push(target);
        onClose();
    };

    const handleBracketClick = () => {
        if (currentEvent.eventType === 'tournament') {
            handleViewSchedule('bracket');
        }
    };

    // Update the join event handlers
    const handleJoinEvent = async () => {
        if (!user || !currentEvent) return;

        setJoining(true);
        setJoinError(null);

        try {
            if (isFreeForUser) {
                await paymentService.joinEvent(user, currentEvent);
                await loadEventDetails(); // Refresh event data
            } else {
                const paymentIntent = await paymentService.createPaymentIntent(user, currentEvent);

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
            const team = userTeams.find((t) => t.$id === selectedTeamId) || null;
            if (isFreeForUser) {
                await paymentService.joinEvent(undefined, currentEvent, team ?? undefined);
                await loadEventDetails();
            } else {
                const paymentIntent = await paymentService.createPaymentIntent(user, currentEvent, team ?? undefined);
                setPaymentData(paymentIntent);
                setShowPaymentModal(true);
            }
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join as team');
        } finally {
            setJoining(false);
        }
    };

    // After successful payment, poll for up to 30s until the registration is reflected
    const confirmRegistrationAfterPayment = async () => {
        if (!user || !currentEvent) return;
        setConfirmingPurchase(true);
        setJoinError(null);

        const deadline = Date.now() + 30_000; // 30 seconds
        const pollIntervalMs = 2000; // 2 seconds
        const targetTeamId = selectedTeamId || null;

        try {
            while (Date.now() < deadline) {
                const latest = await eventService.getEvent(currentEvent.$id);
                if (latest) {
                    // Check registration status depending on signup type using relations
                    const registered = latest.teamSignup
                        ? (targetTeamId
                            ? Object.values(latest.teams || {}).some(t => t.$id === targetTeamId)
                            : Object.values(latest.teams || {}).some(t => (t.playerIds || []).includes(user.$id)))
                        : (latest.players || []).some(p => p.$id === user.$id);

                    if (registered) {
                        await loadEventDetails();
                        setConfirmingPurchase(false);
                        return;
                    }
                }

                await new Promise(res => setTimeout(res, pollIntervalMs));
            }

            // Timed out
            setJoinError('Timed out');
        } catch (e) {
            setJoinError('Error confirming purchase.');
        } finally {
            setConfirmingPurchase(false);
        }
    };

    if (!isOpen || !currentEvent) return null;

    const { date, time } = getEventDateTime(currentEvent);
    const isTeamSignup = currentEvent.teamSignup;
    const totalParticipants = isTeamSignup ? teams.length : players.length;
    // Use expanded relations for registration state
    const isUserRegistered = !!user && (
        (!isTeamSignup && players.some(p => p.$id === user.$id)) ||
        (isTeamSignup && teams.some(t => (t.playerIds || []).includes(user.$id)))
    );
    const isUserFreeAgent = !!user && (currentEvent.freeAgentIds || []).includes(user.$id);

    return (
        <>
            <Modal opened={isOpen} onClose={onClose} title={currentEvent.name} size="xl" centered>
                {/* Optional hero banner */}
                <div className="relative">
                    <img
                        src={getEventImageUrl({ imageId: currentEvent.imageId, width: 800 })}
                        alt={currentEvent.name}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&h=200&fit=crop';
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                    {/* Event Info Overlay */}
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

                    {/* ✅ Edit Button - Only visible to event host */}
                    {isEventHost && (
                        <button
                            onClick={() => setShowEditModal(true)}
                            className="absolute top-4 left-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit Event</span>
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Content */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Event Info */}
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 mb-4">Event Details</h2>
                                <Paper withBorder p="md" radius="md" className="space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
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
                                                        {typeof division === 'string' ? division : (division?.name || division?.id || 'Division')}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </Paper>
                            </div>

                            {/* Description */}
                            <Paper withBorder p="md" radius="md">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                                <p className="text-gray-700 leading-relaxed">{currentEvent.description}</p>
                            </Paper>

                            {/* Tournament Details */}
                            {currentEvent.eventType === 'tournament' && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament Format</h3>
                                    <Paper withBorder p="md" radius="md" className="space-y-2">
                                        {currentEvent.doubleElimination && (
                                            <p><span className="font-medium">Format:</span> Double Elimination</p>
                                        )}
                                        {currentEvent.prize && (
                                            <p><span className="font-medium">Prize:</span> {currentEvent.prize}</p>
                                        )}
                                        {currentEvent.winnerSetCount && (
                                            <p><span className="font-medium">Sets to Win:</span> {currentEvent.winnerSetCount}</p>
                                        )}
                                    </Paper>
                                </div>
                            )}

                            {/* Event Stats */}
                            <Paper withBorder p="md" radius="md">
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
                                </div>
                            </Paper>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            {/* Participants */}
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Participants</h3>

                            {/* Players Section */}
                            {players.length > 0 && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Players"
                                        participants={players}
                                        totalCount={players.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowPlayersDropdown(true)}
                                        getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                        emptyMessage="No players registered yet"
                                    />
                                </div>
                            )}

                            {/* Teams Section */}
                            {teams.length > 0 && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Teams"
                                        participants={teams}
                                        totalCount={teams.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowTeamsDropdown(true)}
                                        getAvatarUrl={(participant) => getTeamAvatarUrl(participant as Team, 32)}
                                        emptyMessage="No teams registered yet"
                                    />
                                </div>
                            )}

                            {/* Free Agents Section */}
                            {(freeAgents.length > 0 || currentEvent.freeAgentIds.length > 0) && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Free Agents"
                                        participants={freeAgents}
                                        totalCount={currentEvent.freeAgentIds.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowFreeAgentsDropdown(true)}
                                        getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                        emptyMessage="No free agents yet"
                                    />
                                </div>
                            )}

                            {/* Join Options (includes total participants) */}
                            <Paper withBorder p="md" radius="md">
                                {joinError && <Alert color="red" variant="light" mb="sm">{joinError}</Alert>}

                                {!user ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <Button fullWidth color="blue" onClick={() => { window.location.href = '/login'; }}>
                                            Sign in to join
                                        </Button>
                                    </div>
                                ) : isUserRegistered ? (
                                    <>
                                        <Text size="sm" c="green" fw={500} ta="center">
                                            ✓ You're registered for this event
                                        </Text>
                                        <div style={{ textAlign: 'center', marginTop: 8 }}>
                                            <Text size="sm" c="dimmed">
                                                {totalParticipants} / {currentEvent.maxParticipants} total participants
                                            </Text>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-3">
                                        {!isTeamSignup ? (
                                            <div>
                                                {totalParticipants >= currentEvent.maxParticipants ? (
                                                    <Button fullWidth color="orange"
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
                                                    >
                                                        {joining ? 'Adding…' : 'Join Waitlist'}
                                                    </Button>
                                                ) : (
                                                    <Button fullWidth color="blue"
                                                        onClick={handleJoinEvent}
                                                        disabled={joining || confirmingPurchase}
                                                    >
                                                        {confirmingPurchase
                                                            ? 'Confirming purchase…'
                                                            : joining
                                                                ? 'Joining…'
                                                                : currentEvent.price > 0
                                                                    ? `Join Event - ${formatPrice(currentEvent.price)}`
                                                                    : 'Join Event'}
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <Button fullWidth onClick={() => setShowTeamJoinOptions(prev => !prev)}>
                                                    {showTeamJoinOptions ? 'Hide Team Options' : 'Join as Team'}
                                                </Button>

                                                {showTeamJoinOptions && (
                                                    <Paper withBorder p="md" radius="md" className="space-y-4">
                                                        {isLoadingTeams ? (
                                                            <div className="text-sm text-gray-600">Loading your teams...</div>
                                                        ) : userTeams.length > 0 ? (
                                                            <div className="space-y-4">
                                                                <div>
                                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                        Select your team
                                                                    </label>
                                                                    <MantineSelect
                                                                        placeholder="Choose a team"
                                                                        data={userTeams.map(t => ({
                                                                            value: t.$id,
                                                                            label: `${t.name || 'Team'} (${typeof t.division === 'string' ? t.division : (t.division as any)?.name || 'Division'})`
                                                                        }))}
                                                                        value={selectedTeamId}
                                                                        onChange={(value) => setSelectedTeamId(value || '')}
                                                                        searchable
                                                                    />
                                                                </div>

                                                                {/* Manage Teams Button Section - Matching Hide/Show button height */}
                                                                <div className="flex justify-center">
                                                                    <Button variant="default"
                                                                        onClick={() => {
                                                                            router.push(`/teams?event=${currentEvent.$id}`);
                                                                            onClose();
                                                                        }}
                                                                    >
                                                                        Manage Teams
                                                                    </Button>
                                                                </div>

                                                                {/* Join/Waitlist Button Section - Matching Hide/Show button height */}
                                                                <div className="flex justify-center pt-2">
                                                                    {totalParticipants >= currentEvent.maxParticipants ? (
                                                                        <Button
                                                                            onClick={async () => {
                                                                                if (!selectedTeamId) return;
                                                                                setJoining(true);
                                                                                setJoinError(null);
                                                                                try {
                                                                                    await eventService.addToWaitlist(currentEvent.$id, selectedTeamId);
                                                                                    await loadEventDetails();
                                                                                } catch (e: any) {
                                                                                    setJoinError(e instanceof Error ? e.message : 'Failed to join waitlist');
                                                                                } finally {
                                                                                    setJoining(false);
                                                                                }
                                                                            }}
                                                                            disabled={joining || !selectedTeamId}
                                                                            color="orange"
                                                                        >
                                                                            {joining ? 'Adding...' : 'Join Waitlist'}
                                                                        </Button>
                                                                    ) : (
                                                                        <Button
                                                                            onClick={handleJoinAsTeam}
                                                                            disabled={joining || !selectedTeamId || confirmingPurchase}
                                                                            color="green"
                                                                        >
                                                                            {confirmingPurchase ? 'Confirming purchase...' : (joining ? 'Joining...' : 'Confirm Join')}
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center space-y-3">
                                                                <p className="text-sm text-gray-600">
                                                                    You have no teams for {currentEvent.sport?.name}.
                                                                </p>
                                                                <Button variant="default"
                                                                    onClick={() => {
                                                                        router.push(`/teams?event=${currentEvent.$id}`);
                                                                        onClose();
                                                                    }}
                                                                >
                                                                    Create Team
                                                                </Button>
                                                                {/* Total participants below actions */}
                                                                <div style={{ textAlign: 'center' }}>
                                                                    <Text size="sm" c="dimmed">
                                                                        {totalParticipants} / {currentEvent.maxParticipants} total participants
                                                                    </Text>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Paper>

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

                                                {/* View Schedule / Bracket Buttons */}
                                                {(currentEvent.eventType === 'league' || currentEvent.eventType === 'tournament') && (
                                                    <Button
                                                        fullWidth
                                                        variant="light"
                                                        mt="sm"
                                                        onClick={() => handleViewSchedule()}
                                                    >
                                                        View Schedule
                                                    </Button>
                                                )}

                                                {currentEvent.eventType === 'tournament' &&
                                                    <button
                                                        onClick={handleBracketClick}
                                                        className="w-full mt-2 py-2 px-4 rounded-lg bg-green-600 text-white hover:bg-green-700"
                                                    >
                                                        View Tournament Bracket
                                                    </button>
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Paper>

                            {/* Refund Options */}
                            <RefundSection
                                event={currentEvent}
                                userRegistered={!!isUserRegistered}
                                onRefundSuccess={loadEventDetails}
                            />
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Players Dropdown */}
            <ParticipantsDropdown
                isOpen={showPlayersDropdown}
                onClose={() => setShowPlayersDropdown(false)}
                title="Event Players"
                participants={players}
                isLoading={isLoadingEvent}
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
                isLoading={isLoadingEvent}
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
                                {(team as Team).currentSize} members • {typeof (team as Team).division === 'string' ? (team as Team).division : ((team as Team).division as any)?.name || 'Division'} Division
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
                isLoading={isLoadingEvent}
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
                onPaymentSuccess={async () => {
                    setShowPaymentModal(false);
                    setPaymentData(null);
                    await confirmRegistrationAfterPayment();
                }}
            />
            {user && (
                <EventCreationModal
                    isOpen={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    onEventCreated={async () => true}
                    onEventSaved={async (updatedEvent) => {
                        setShowEditModal(false);
                        if (updatedEvent?.$id) {
                            setDetailedEvent(updatedEvent);
                            await loadEventDetails(updatedEvent.$id);
                        } else {
                            await loadEventDetails();
                        }
                    }}
                    currentUser={user}
                    editingEvent={currentEvent}
                    organization={
                        currentEvent && typeof currentEvent.organization === 'object' && currentEvent.organization
                            ? currentEvent.organization
                            : null
                    }
                />
            )}
        </>
    );
}
