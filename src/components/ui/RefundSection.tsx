// components/RefundSection.tsx
import React, { useState } from 'react';
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
        <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold mb-3 text-gray-900">{isFreeForUser ? 'Registration' : 'Refund Options'}</h4>

            {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
                    {error}
                </div>
            )}

            {isFreeForUser ? (
                <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                        You can leave this event at any time before it starts.
                    </p>
                    <button
                        onClick={handleLeaveEvent}
                        disabled={loading}
                        className="w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Leaving…' : 'Leave Event'}
                    </button>
                </div>
            ) : canAutoRefund ? (
                <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                        You can get a full refund until {refundDeadline.toLocaleString()}
                    </p>
                    <button
                        onClick={handleRefund}
                        disabled={loading}
                        className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Processing...' : 'Get Refund'}
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                        {!isBeforeEventStart
                            ? 'Event has already started. You can request a refund from the host.'
                            : 'Automatic refund period has expired. You can request a refund from the host.'
                        }
                    </p>

                    {!showReasonInput ? (
                        <button
                            onClick={handleRequestRefund}
                            className="w-full py-2 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                        >
                            Request Refund
                        </button>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason for refund request *
                                </label>
                                <textarea
                                    value={refundReason}
                                    onChange={(e) => setRefundReason(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    rows={3}
                                    placeholder="Please explain why you need a refund..."
                                />
                            </div>
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => setShowReasonInput(false)}
                                    className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRefund}
                                    disabled={loading || !refundReason.trim()}
                                    className="flex-1 py-2 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                                >
                                    {loading ? 'Sending...' : 'Send Request'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
