'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/app/providers';
import { tournamentService } from '@/lib/tournamentService';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { Button, Group, Paper, Text } from '@mantine/core';
import TournamentBracketView from '../../components/TournamentBracketView';
import { TournamentBracket } from '../../types/tournament';
import { Match } from '@/types';

export default function TournamentBracketPage() {
    return (
        <Suspense fallback={<Loading text="Loading tournament..." />}> 
            <TournamentBracketContent />
        </Suspense>
    );
}

function TournamentBracketContent() {
    const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
    const { id } = useParams();
    const router = useRouter();
    const [bracket, setBracket] = useState<TournamentBracket | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading) {
            if (!isAuthenticated && !isGuest) {
                router.push('/login');
                return;
            }
            loadTournamentBracket();
        }
    }, [isAuthenticated, isGuest, authLoading, id]);

    const loadTournamentBracket = async () => {
        try {
            setLoading(true);
            setError(null);

            const bracketData = await tournamentService.getTournamentBracket(id as string);
            setBracket(bracketData);
        } catch (error) {
            console.error('Failed to load tournament bracket:', error);
            setError('Failed to load tournament bracket. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleMatchUpdate = async (matchId: string, updates: Partial<Match>) => {
        if (!bracket) return;

        try {
            await tournamentService.updateMatch(matchId, updates);
            // Refresh bracket data
            await loadTournamentBracket();
        } catch (error) {
            console.error('Failed to update match:', error);
            setError('Failed to update match. Please try again.');
        }
    };

    const handleScoreUpdate = async (
        matchId: string,
        team1Points: number[],
        team2Points: number[],
        setResults: number[]
    ) => {
        await handleMatchUpdate(matchId, {
            team1Points,
            team2Points,
            setResults,
        });
    };

    if (authLoading) {
        return <Loading fullScreen text="Loading tournament..." />;
    }

    if (!isAuthenticated && !isGuest) {
        return <Loading fullScreen text="Redirecting to login..." />;
    }

    if (loading) {
        return <Loading fullScreen text="Loading tournament..." />;
    }

    if (error) {
        return (
            <>
                <Navigation />
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-red-600 mb-4">⚠️</div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Bracket</h2>
                        <p className="text-gray-600 mb-4">{error}</p>
                        <Button onClick={loadTournamentBracket}>Try Again</Button>
                    </div>
                </div>
            </>
        );
    }

    if (!bracket) {
        return (
            <>
                <Navigation />
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Tournament Not Found</h2>
                        <p className="text-gray-600 mb-4">The tournament you're looking for doesn't exist.</p>
                        <Button onClick={() => router.push('/events')}>Back to Events</Button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Navigation />

            {!expanded && (
                <>
                    {/* Header */}
                    <Paper withBorder radius={0} className="border-b">
                        <div className="container-responsive py-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Button variant="subtle" onClick={() => router.push('/events')} mb={8}>
                                        ← Back to Events
                                    </Button>
                                    <h1 className="text-3xl font-bold text-gray-900">{bracket.tournament.name}</h1>
                                    <Text c="dimmed" mt={4}>Tournament Bracket</Text>
                                </div>

                                {bracket.canManage && (
                                    <Group gap="sm">
                                        <Button variant="default" onClick={() => router.push(`/tournaments/${id}/manage`)}>
                                            Manage Tournament
                                        </Button>
                                        <Button onClick={loadTournamentBracket}>Refresh</Button>
                                    </Group>
                                )}
                            </div>
                        </div>
                    </Paper>

                    {/* Tournament Info */}
                    <div className="bg-gray-50 border-b border-gray-200">
                        <div className="container-responsive py-4">
                            <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                                <div>
                                    <span className="font-medium">Format:</span>{' '}
                                    {bracket.tournament.doubleElimination ? 'Double Elimination' : 'Single Elimination'}
                                </div>
                                <div>
                                    <span className="font-medium">Teams:</span> {bracket.teams.length}
                                </div>
                                <div>
                                    <span className="font-medium">Matches:</span> {Object.values(bracket.matches).length}
                                </div>
                                {bracket.tournament.prize && (
                                    <div>
                                        <span className="font-medium">Prize:</span> {bracket.tournament.prize}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Bracket (fills remaining space) */}
            <div className="flex-1 bg-gray-50 min-h-0">
                <TournamentBracketView
                    bracket={bracket}
                    onScoreUpdate={handleScoreUpdate}
                    onMatchUpdate={handleMatchUpdate}
                    currentUser={user!}
                    isExpanded={expanded}
                    onToggleExpand={() => setExpanded((v) => !v)}
                />
            </div>
        </div>
    );
}
