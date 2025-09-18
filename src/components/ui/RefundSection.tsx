// components/RefundSection.tsx
import React, { useState } from 'react';
import { Paper, Text, Button, Alert, Textarea, Group } from '@mantine/core';
import { Event } from '@/types';
import { eventService } from '@/lib/eventService';
import { paymentService } from '@/lib/paymentService';
import { useApp } from '@/app/providers';

interface RefundSectionProps {
    event: Event;
    userRegistered: boolean;
    onRefundSuccess: () => void;
}

export default function RefundSection({ event, userRegistered, onRefundSuccess }: RefundSectionProps) {
    const [loading, setLoading] = useState(false);
    const [showReasonInput, setShowReasonInput] = useState(false);
    const [refundReason, setRefundReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const { user } = useApp();

    if (!userRegistered) return null;

    const isHost = !!user && user.$id === event.hostId;
    const isFreeForUser = event.price === 0 || isHost;

    // Calculate refund eligibility
    const now = new Date();
    const eventStart = new Date(event.start);
    const refundDeadline = new Date(eventStart.getTime() - (event.cancellationRefundHours * 60 * 60 * 1000));

    const isBeforeRefundDeadline = now < refundDeadline;
    const isBeforeEventStart = now < eventStart;
    const canAutoRefund = isBeforeRefundDeadline && event.cancellationRefundHours > 0;

    const handleRefund = async () => {
        if (!canAutoRefund && !refundReason.trim()) {
            setError('Please provide a reason for the refund request');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await paymentService.requestRefund(
                event.$id,
                user!.$id,
                canAutoRefund ? undefined : refundReason
            );

            if (result.success) {
                onRefundSuccess();
            } else {
                setError(result.message || 'Refund request failed');
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Refund request failed');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestRefund = () => {
        if (canAutoRefund) {
            handleRefund();
        } else {
            setShowReasonInput(true);
        }
    };

    const handleLeaveEvent = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const latest = await eventService.getEventById(event.$id);
            if (!latest) throw new Error('Event not found');

            let newPlayerIds = latest.playerIds || [];
            let newTeamIds = latest.teamIds || [];

            if (latest.teamSignup) {
                // Try to remove the user's team registration first
                const userTeamId = (user.teamIds || []).find(tid => newTeamIds.includes(tid));
                if (userTeamId) {
                    newTeamIds = newTeamIds.filter(id => id !== userTeamId);
                } else {
                    // Fallback: if user somehow joined individually, remove their playerId
                    newPlayerIds = newPlayerIds.filter(id => id !== user.$id);
                }
            } else {
                newPlayerIds = newPlayerIds.filter(id => id !== user.$id);
            }

            await eventService.updateEventParticipants(event.$id, { playerIds: newPlayerIds, teamIds: newTeamIds });
            onRefundSuccess();
        } catch (e: any) {
            setError(e?.message || 'Failed to leave event');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Paper withBorder p="md" radius="md">
            <Text fw={600} mb={8}>{isFreeForUser ? 'Registration' : 'Refund Options'}</Text>

            {error && (
                <Alert color="red" variant="light" mb="sm">{error}</Alert>
            )}

            {isFreeForUser ? (
                <div className="space-y-2">
                    <Text size="sm" c="dimmed">You can leave this event at any time before it starts.</Text>
                    <Button fullWidth color="red" onClick={handleLeaveEvent} loading={loading}>
                        Leave Event
                    </Button>
                </div>
            ) : canAutoRefund ? (
                <div className="space-y-2">
                    <Text size="sm" c="dimmed">You can get a full refund until {refundDeadline.toLocaleString()}</Text>
                    <Button fullWidth color="green" onClick={handleRefund} loading={loading}>
                        Get Refund
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    <Text size="sm" c="dimmed">
                        {!isBeforeEventStart
                            ? 'Event has already started. You can request a refund from the host.'
                            : 'Automatic refund period has expired. You can request a refund from the host.'}
                    </Text>

                    {!showReasonInput ? (
                        <Button fullWidth color="orange" onClick={handleRequestRefund}>Request Refund</Button>
                    ) : (
                        <div className="space-y-3">
                            <Textarea
                                label="Reason for refund request *"
                                value={refundReason}
                                onChange={(e) => setRefundReason(e.currentTarget.value)}
                                placeholder="Please explain why you need a refund..."
                                minRows={3}
                            />
                            <Group grow>
                                <Button variant="default" onClick={() => setShowReasonInput(false)}>Cancel</Button>
                                <Button color="orange" onClick={handleRefund} disabled={!refundReason.trim()} loading={loading}>
                                    Send Request
                                </Button>
                            </Group>
                        </div>
                    )}
                </div>
            )}
        </Paper>
    );
}
