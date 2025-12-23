import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, Select as MantineSelect, Paper, Alert, Text, ActionIcon, Group, Modal } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { Event, UserData, Team, getEventDateTime, getUserAvatarUrl, getTeamAvatarUrl, PaymentIntent, getEventImageUrl, formatPrice } from '@/types';
import { eventService } from '@/lib/eventService';
import { userService } from '@/lib/userService';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import { billService } from '@/lib/billService';
import { boldsignService, BoldSignLink } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import { useApp } from '@/app/providers';
import ParticipantsPreview from '@/components/ui/ParticipantsPreview';
import ParticipantsDropdown from '@/components/ui/ParticipantsDropdown';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';
// Replaced shadcn Select with Mantine Select

interface EventDetailSheetProps {
    event: Event;
    isOpen: boolean;
    onClose: () => void;
    renderInline?: boolean;
}

const SHEET_POPOVER_Z_INDEX = 1800;
const SHEET_CONTENT_MAX_WIDTH = 'var(--mantine-container-size-lg, 1200px)';
const SHEET_CONTENT_WIDTH = `min(${SHEET_CONTENT_MAX_WIDTH}, calc(100vw - 2rem))`; // Match main grid width on large screens
const SIGN_MODAL_Z_INDEX = SHEET_POPOVER_Z_INDEX + 200;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };

type JoinIntent = {
    mode: 'user' | 'team';
    team?: Team | null;
};

export default function EventDetailSheet({ event, isOpen, onClose, renderInline = false }: EventDetailSheetProps) {
    const { user, authUser } = useApp();
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
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
    const [confirmingPurchase, setConfirmingPurchase] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [signLinks, setSignLinks] = useState<BoldSignLink[]>([]);
    const [currentSignIndex, setCurrentSignIndex] = useState(0);
    const [pendingJoin, setPendingJoin] = useState<JoinIntent | null>(null);
    const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<string | null>(null);

    // Team-signup join controls
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [showTeamJoinOptions, setShowTeamJoinOptions] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState('');

    const currentEvent = detailedEvent || event;

    const isEventHost = !!user && currentEvent && user.$id === currentEvent.hostId;
    const isFreeEvent = currentEvent && currentEvent.price === 0;
    const isFreeForUser = isFreeEvent || isEventHost;

    const isActive = renderInline ? Boolean(isOpen) : isOpen;

    useEffect(() => {
        if (isActive && event) {
            setDetailedEvent(event);
            if (event.state !== 'DRAFT') {
                loadEventDetails();
            }
        } else {
            setDetailedEvent(null);
            setPlayers([]);
            setTeams([]);
            setIsLoadingEvent(false);
            setIsLoadingTeams(false);
            setJoinError(null); // Reset error when modal closes
            setJoinNotice(null);
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setPendingSignedDocumentId(null);
        }
    }, [isActive, event]);

    useEffect(() => {
        if (!isActive || !user) {
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
    }, [isActive, event, user]);

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
        const schedulePath = `/events/${currentEvent.$id}/schedule`;
        const target = tab ? `${schedulePath}?tab=${tab}` : schedulePath;
        router.push(target);
        onClose();
    };

    const handleBracketClick = () => {
        if (currentEvent.eventType === 'TOURNAMENT') {
            handleViewSchedule('bracket');
        }
    };

    const createBillForOwner = useCallback(async (ownerType: 'USER' | 'TEAM', ownerId: string) => {
        if (!currentEvent) {
            throw new Error('Event is not loaded.');
        }

        const priceCents = Math.round(Number(currentEvent.price) || 0);
        if (priceCents <= 0) {
            throw new Error('This event does not have a price set for a payment plan.');
        }

        const installmentAmounts = Array.isArray(currentEvent.installmentAmounts)
            ? currentEvent.installmentAmounts.map((amt) => Math.round(Number(amt) || 0))
            : [];
        const installmentDueDates = Array.isArray(currentEvent.installmentDueDates)
            ? currentEvent.installmentDueDates as string[]
            : [];

        return billService.createBill({
            ownerType,
            ownerId,
            totalAmountCents: priceCents,
            eventId: currentEvent.$id,
            organizationId: currentEvent.organizationId ?? null,
            installmentAmounts,
            installmentDueDates,
            allowSplit: ownerType === 'TEAM' ? Boolean(currentEvent.allowTeamSplitDefault) : false,
            paymentPlanEnabled: true,
            event: {
                $id: currentEvent.$id,
                start: currentEvent.start,
                price: priceCents,
                installmentAmounts,
                installmentDueDates,
            },
            user,
        });
    }, [currentEvent, user]);

    const beginSigningFlow = useCallback(async (intent: JoinIntent) => {
        if (!currentEvent || !user) {
            return false;
        }
        const requiredTemplateIds = Array.isArray(currentEvent.requiredTemplateIds)
            ? currentEvent.requiredTemplateIds
            : [];
        if (!requiredTemplateIds.length) {
            return false;
        }
        if (!authUser?.email) {
            throw new Error('Sign-in email is required to sign documents.');
        }

        const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
        const links = await boldsignService.createSignLinks({
            eventId: currentEvent.$id,
            user,
            userEmail: authUser.email,
            redirectUrl,
        });
        if (!links.length) {
            return false;
        }
        setSignLinks(links);
        setCurrentSignIndex(0);
        setPendingJoin(intent);
        setPendingSignedDocumentId(null);
        setShowSignModal(true);
        return true;
    }, [authUser?.email, currentEvent, user]);

    const finalizeJoin = useCallback(async (intent: JoinIntent) => {
        if (!user || !currentEvent) return;

        const resolvedTeam = (() => {
            if (intent.mode !== 'team') {
                return undefined;
            }
            if (intent.team) {
                return intent.team;
            }
            if (selectedTeamId) {
                return userTeams.find((team) => team.$id === selectedTeamId) ?? ({ $id: selectedTeamId } as Team);
            }
            return undefined;
        })();

        if (currentEvent.allowPaymentPlans) {
            if (intent.mode === 'team') {
                if (!resolvedTeam?.$id) {
                    throw new Error('Team is required to start a payment plan.');
                }
                await createBillForOwner('TEAM', resolvedTeam.$id);
                setJoinNotice('Payment plan started for your team. A bill was created—you can manage payments from your Profile.');
            } else {
                await createBillForOwner('USER', user.$id);
                setJoinNotice('Payment plan started. A bill was created for you—pay installments from your Profile.');
            }
            await loadEventDetails();
            return;
        }

        if (isFreeForUser) {
            await paymentService.joinEvent(user, currentEvent, resolvedTeam);
            await loadEventDetails();
        } else {
            const paymentIntent = await paymentService.createPaymentIntent(user, currentEvent, resolvedTeam);
            setPaymentData(paymentIntent);
            setShowPaymentModal(true);
        }
    }, [createBillForOwner, currentEvent, isFreeForUser, loadEventDetails, selectedTeamId, user, userTeams]);

    const handleSignedDocument = useCallback((messageDocumentId?: string) => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink) {
            return;
        }
        if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
            return;
        }
        if (pendingSignedDocumentId) {
            return;
        }

        setJoinNotice('Confirming signature...');
        setShowSignModal(false);
        setPendingSignedDocumentId(currentLink.documentId);
    }, [currentSignIndex, pendingSignedDocumentId, signLinks]);

    useEffect(() => {
        if (!showSignModal) {
            return;
        }

        const handleMessage = (event: MessageEvent) => {
            if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
                return;
            }
            const payload = event.data;
            let eventName = '';
            if (typeof payload === 'string') {
                eventName = payload;
            } else if (payload && typeof payload === 'object') {
                eventName = payload.event || payload.eventName || payload.type || payload.name || '';
            }
            const eventLabel = eventName.toString();
            if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
                return;
            }

            const documentId =
                (payload && typeof payload === 'object' && (payload.documentId || payload.documentID)) || undefined;
            handleSignedDocument(
                typeof documentId === 'string' ? documentId : undefined
            );
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleSignedDocument, showSignModal]);

    useEffect(() => {
        if (!pendingSignedDocumentId || !currentEvent || !user) {
            return;
        }

        let cancelled = false;
        const poll = async () => {
            try {
                const signed = await signedDocumentService.isDocumentSigned(pendingSignedDocumentId);
                if (!signed || cancelled) {
                    return;
                }

                const nextIndex = currentSignIndex + 1;
                if (nextIndex < signLinks.length) {
                    setCurrentSignIndex(nextIndex);
                    setPendingSignedDocumentId(null);
                    setShowSignModal(true);
                    setJoinNotice(null);
                    return;
                }

                setPendingSignedDocumentId(null);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setShowSignModal(false);
                setJoinNotice(null);
                const intent = pendingJoin;
                setPendingJoin(null);
                if (intent) {
                    await finalizeJoin(intent);
                }
                setJoining(false);
            } catch (error) {
                if (cancelled) {
                    return;
                }
                setJoinError('Failed to confirm signature.');
                setPendingSignedDocumentId(null);
                setShowSignModal(false);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setPendingJoin(null);
                setJoining(false);
            }
        };

        const interval = window.setInterval(poll, 1000);
        poll();
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [currentEvent, currentSignIndex, finalizeJoin, pendingJoin, pendingSignedDocumentId, signLinks, user]);

    // Update the join event handlers
    const handleJoinEvent = async () => {
        if (!user || !currentEvent) return;

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow({ mode: 'user' });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'user' });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join event');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    // Team-signup: join as team or free agent
    const handleJoinAsTeam = async () => {
        if (!user || !currentEvent || !selectedTeamId) return;
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        const team = userTeams.find((t) => t.$id === selectedTeamId) || ({ $id: selectedTeamId } as Team);
        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow({ mode: 'team', team });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'team', team });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join as team');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const cancelSigning = useCallback(() => {
        setShowSignModal(false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingJoin(null);
        setPendingSignedDocumentId(null);
        setJoining(false);
        setJoinError('Signature process canceled.');
    }, []);

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
                const latest = await eventService.getEventWithRelations(currentEvent.$id);
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

    if (!currentEvent) return null;
    // Inline render (schedule page) should only mount when active tab is selected
    if (renderInline && !isActive) return null;

    const { date, time } = getEventDateTime(currentEvent);
    const isTeamSignup = currentEvent.teamSignup;
    const totalParticipants = isTeamSignup ? teams.length : players.length;
    // Use expanded relations for registration state
    const isUserRegistered = !!user && (
        (!isTeamSignup && players.some(p => p.$id === user.$id)) ||
        (isTeamSignup && teams.some(t => (t.playerIds || []).includes(user.$id)))
    );
    const isUserFreeAgent = !!user && (currentEvent.freeAgentIds || []).includes(user.$id);
    const hasCoordinates = Array.isArray(currentEvent.coordinates) && currentEvent.coordinates.length >= 2;
    const mapLat = hasCoordinates ? Number(currentEvent.coordinates[1]) : undefined;
    const mapLng = hasCoordinates ? Number(currentEvent.coordinates[0]) : undefined;
    const hasValidCoords = typeof mapLat === 'number' && typeof mapLng === 'number' && !Number.isNaN(mapLat) && !Number.isNaN(mapLng);
    const mapQuery = hasValidCoords
        ? `${mapLat},${mapLng}`
        : (currentEvent.location || '').trim();
    const encodedMapQuery = encodeURIComponent(mapQuery);
    const googleMapsLink = mapQuery
        ? `https://www.google.com/maps/search/?api=1&query=${encodedMapQuery}`
        : null;
    const mapEmbedSrc = mapQuery
        ? `https://maps.google.com/maps?q=${encodedMapQuery}&z=14&output=embed`
        : null;
    const canShowScheduleButton = isEventHost && !renderInline;
    const scheduleButtonLabel = isEventHost ? 'Manage Event' : 'View Schedule';

    const content = (
        <div className="space-y-6">
            {!renderInline && (
                <div
                    style={{
                        position: 'sticky',
                        top: 12,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        zIndex: SHEET_POPOVER_Z_INDEX + 20,
                    }}
                >
                    <ActionIcon
                        variant="filled"
                        color="gray"
                        radius="xl"
                        aria-label="Close"
                        onClick={onClose}
                        style={{
                            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                        }}
                    >
                        ×
                    </ActionIcon>
                </div>
            )}
            
            <div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
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

                            {googleMapsLink && mapEmbedSrc && (
                                <Paper withBorder p="md" radius="md" className="space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <Text size="sm" c="dimmed">Location</Text>
                                            <Text fw={600}>{currentEvent.location || 'Location coming soon'}</Text>
                                            {hasValidCoords && (
                                                <Text size="xs" c="dimmed">
                                                    {mapLat.toFixed(4)}, {mapLng.toFixed(4)}
                                                </Text>
                                            )}
                                        </div>
                                        <Button
                                            component="a"
                                            href={googleMapsLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            variant="light"
                                            size="sm"
                                        >
                                            Open in Google Maps
                                        </Button>
                                    </div>
                                    <div className="overflow-hidden rounded-md border border-gray-200" style={{ aspectRatio: '16 / 9' }}>
                                        <iframe
                                            title="Event location preview"
                                            src={mapEmbedSrc}
                                            className="w-full h-full"
                                            loading="lazy"
                                            allowFullScreen
                                        />
                                    </div>
                                </Paper>
                            )}

                            {/* Tournament Details */}
                            {currentEvent.eventType === 'TOURNAMENT' && (
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

                            {/* League Playoff Details */}
                            {currentEvent.eventType === 'LEAGUE' && currentEvent.includePlayoffs && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Playoff Format</h3>
                                    <Paper withBorder p="md" radius="md" className="space-y-2">
                                        <p>
                                            <span className="font-medium">Teams Included:</span>{' '}
                                            {currentEvent.playoffTeamCount ?? 'Configured'}
                                        </p>
                                        {typeof currentEvent.doubleElimination === 'boolean' && (
                                            <p>
                                                <span className="font-medium">Format:</span>{' '}
                                                {currentEvent.doubleElimination ? 'Double Elimination' : 'Single Elimination'}
                                            </p>
                                        )}
                                        {typeof currentEvent.winnerSetCount === 'number' && currentEvent.winnerSetCount > 0 && (
                                            <p>
                                                <span className="font-medium">Sets to Win:</span> {currentEvent.winnerSetCount}
                                            </p>
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

                            {/* Teams Section */}
                            {event.teamSignup && (
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
                            <div className="mb-4">
                                <ParticipantsPreview
                                    title="Free Agents"
                                    participants={freeAgents}
                                    totalCount={currentEvent.freeAgentIds?.length ?? 0}
                                    isLoading={isLoadingEvent}
                                    onClick={() => setShowFreeAgentsDropdown(true)}
                                    getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                    emptyMessage="No free agents yet"
                                />
                            </div>

                            {/* Join Options (includes total participants) */}
                            <Paper withBorder p="md" radius="md">
                                {joinError && <Alert color="red" variant="light" mb="sm">{joinError}</Alert>}
                                {joinNotice && <Alert color="green" variant="light" mb="sm">{joinNotice}</Alert>}

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
                                        {canShowScheduleButton && (
                                            <div className="mt-4 space-y-2">
                                                <Button
                                                    fullWidth
                                                    variant="light"
                                                    onClick={() => handleViewSchedule()}
                                                >
                                                    {scheduleButtonLabel}
                                                </Button>
                                                {currentEvent.eventType === 'TOURNAMENT' && (
                                                    <Button
                                                        fullWidth
                                                        color="green"
                                                        onClick={handleBracketClick}
                                                    >
                                                        View Tournament Bracket
                                                    </Button>
                                                )}
                                            </div>
                                        )}
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

                                                {/* View Schedule / Bracket Buttons */}
                                                {canShowScheduleButton && (
                                                    <Button
                                                        fullWidth
                                                        variant="light"
                                                        mt="sm"
                                                        onClick={() => handleViewSchedule()}
                                                    >
                                                        {scheduleButtonLabel}
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
                                                                        comboboxProps={sharedComboboxProps}
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
                                                                            {confirmingPurchase
                                                                                ? 'Confirming purchase...'
                                                                                : joining
                                                                                    ? 'Joining...'
                                                                                    : (!isFreeForUser && currentEvent.price > 0)
                                                                                        ? `Join for ${formatPrice(currentEvent.price)}`
                                                                                        : 'Join Event'}
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
                                                {canShowScheduleButton && (
                                                    <Button
                                                        fullWidth
                                                        variant="light"
                                                        mt="sm"
                                                        onClick={() => handleViewSchedule()}
                                                    >
                                                        {scheduleButtonLabel}
                                                    </Button>
                                                )}

                                                {!renderInline && currentEvent.eventType === 'TOURNAMENT' &&
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
            </div>
        </div>
    );

    const nonInlineContent = (
        <div
            style={{
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: '1.5rem',
                marginRight: '-1.5rem', // push scrollbar to sheet edge while keeping inner padding
                scrollbarGutter: 'stable',
            }}
        >
            {content}
        </div>
    );

    return (
        <>
            {renderInline ? (
                content
            ) : (
                <Drawer
                    opened={isOpen}
                    onClose={onClose}
                    position="bottom"
                    size="100%"
                    withCloseButton={false}
                    keepMounted
                    zIndex={1200}
                    styles={{
                        content: {
                            padding: 0,
                            borderTopLeftRadius: '1rem',
                            borderTopRightRadius: '1rem',
                            height: 'calc(100vh - 80px)',
                            overflow: 'hidden', // keep rounded corners clipped
                            maxWidth: SHEET_CONTENT_WIDTH,
                            width: '100%',
                            margin: '0 auto',
                            boxSizing: 'border-box',
                        },
                        inner: {
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                        },
                        body: {
                            maxWidth: SHEET_CONTENT_WIDTH,
                            width: '100%',
                            margin: '0 auto',
                            padding: '1.5rem',
                            paddingBottom: '2rem',
                            boxSizing: 'border-box',
                            height: '100%',
                        },
                    }}
                    overlayProps={{ opacity: 0.45, blur: 3 }}
                >
                    {nonInlineContent}
                </Drawer>
            )}

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

            <Modal
                opened={showSignModal}
                onClose={cancelSigning}
                centered
                size="xl"
                title="Sign required documents"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                {signLinks.length > 0 ? (
                    <div>
                        <Text size="sm" c="dimmed" mb="xs">
                            Document {currentSignIndex + 1} of {signLinks.length}
                            {signLinks[currentSignIndex]?.title ? ` • ${signLinks[currentSignIndex]?.title}` : ''}
                        </Text>
                        <div style={{ height: 600 }}>
                            <iframe
                                src={signLinks[currentSignIndex]?.url}
                                title="BoldSign Signing"
                                style={{ width: '100%', height: '100%', border: 'none' }}
                            />
                        </div>
                    </div>
                ) : (
                    <Text size="sm" c="dimmed">Preparing documents...</Text>
                )}
            </Modal>

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                    setPaymentData(null); // Clear payment data
                }}
                event={currentEvent}
                paymentData={paymentData} // Pass the already-created payment intent
                onPaymentSuccess={async () => {
                    setPaymentData(null);
                    await confirmRegistrationAfterPayment();
                }}
            />
        </>
    );
}
