// components/EventJoinModal.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Event, Team } from '@/types';
import { useApp } from '@/app/providers';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import ModalShell from '@/components/ui/ModalShell';

interface EventJoinModalProps {
    isOpen: boolean;
    onClose: () => void;
    event: Event;
    onJoinSuccess: () => void;
}

export default function EventJoinModal({ isOpen, onClose, event, onJoinSuccess }: EventJoinModalProps) {
    const router = useRouter();
    const { user } = useApp();
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [selectedTeam, setSelectedTeam] = useState('');
    const [joinAsFreeAgent, setJoinAsFreeAgent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && user && event.teamSignup) {
            fetchUserTeams();
        }
    }, [isOpen, user, event.teamSignup]);

    const fetchUserTeams = async () => {
        try {
            const teams = await teamService.getTeamsByUserId(user!.$id);
            const relevantTeams = teams.filter(team =>
                team.sport.toLowerCase() === event.sport.toLowerCase()
            );
            setUserTeams(relevantTeams);
        } catch (error) {
            console.error('Failed to fetch user teams:', error);
        }
    };

    const handleJoin = async () => {
        setLoading(true);
        setError(null);

        try {
            if (event.price > 0) {
                const paymentData = await paymentService.createPaymentIntent(
                    event.$id,
                    user!.$id,
                    !joinAsFreeAgent ? selectedTeam : undefined,
                    event.eventType === 'tournament'
                );
                onJoinSuccess();
            } else {
                await paymentService.joinEvent(
                    event.$id,
                    user!.$id,
                    !joinAsFreeAgent ? selectedTeam : undefined,
                    event.eventType === 'tournament'
                );
                onJoinSuccess();
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to join event');
        } finally {
            setLoading(false);
        }
    };

    // Handle navigation to teams page with event context
    const handleManageTeams = () => {
        router.push(`/teams?event=${event.$id}`);
        onClose(); // Close the modal when navigating
    };

    const canJoin = () => {
        if (!event.teamSignup) return true;
        if (joinAsFreeAgent) return true;
        return selectedTeam !== '';
    };

    if (!isOpen) return null;

    return (
        <ModalShell isOpen={isOpen} onClose={onClose} title="Join Event" maxWidth="md">
            <div className="space-y-4">

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <h4 className="font-medium text-lg">{event.name}</h4>
                            <p className="text-gray-600">{event.location}</p>
                            <p className="text-sm text-gray-500">
                                {event.price === 0 ? 'Free' : `$${event.price}`}
                            </p>
                        </div>

                        {event.teamSignup && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Join Options
                                    </label>

                                    {userTeams.length > 0 ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">
                                                    Select your team:
                                                </label>
                                                <select
                                                    value={selectedTeam}
                                                    onChange={(e) => {
                                                        setSelectedTeam(e.target.value);
                                                        setJoinAsFreeAgent(false);
                                                    }}
                                                    className="w-full p-2 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                                                >
                                                    <option value="">Choose a team...</option>
                                                    {userTeams.map(team => (
                                                        <option key={team.$id} value={team.$id}>
                                                            {team.name} ({team.division})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id="freeAgent"
                                                    checked={joinAsFreeAgent}
                                                    onChange={(e) => {
                                                        setJoinAsFreeAgent(e.target.checked);
                                                        if (e.target.checked) {
                                                            setSelectedTeam('');
                                                        }
                                                    }}
                                                    className="mr-2"
                                                />
                                                <label htmlFor="freeAgent" className="text-sm text-gray-700">
                                                    Join as free agent
                                                </label>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 bg-gray-50 rounded-lg">
                                            <p className="text-gray-600 mb-3">
                                                You don't have any teams for this sport yet.
                                            </p>
                                            <div className="flex items-center justify-center mb-3">
                                                <input
                                                    type="checkbox"
                                                    id="freeAgentOnly"
                                                    checked={joinAsFreeAgent}
                                                    onChange={(e) => setJoinAsFreeAgent(e.target.checked)}
                                                    className="mr-2"
                                                />
                                                <label htmlFor="freeAgentOnly" className="text-sm text-gray-700">
                                                    Join as free agent
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Team Management Button - Always visible for team events */}
                                <div className="text-center pt-2 border-t">
                                    <button
                                        onClick={handleManageTeams}
                                        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Manage Teams
                                    </button>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Create or edit teams, invite free agents from this event
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex space-x-3 pt-4">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleJoin}
                                disabled={loading || !canJoin()}
                                className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                {loading ? 'Joining...' : event.price > 0 ? 'Continue to Payment' : 'Join Event'}
                            </button>
                        </div>
                    </div>
            </div>
        </ModalShell>
    );
}
