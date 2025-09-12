'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/app/providers';
import { tournamentService } from '@/lib/tournamentService';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import TournamentBracketView from '../../components/TournamentBracketView';
import { Match, TournamentBracket } from '../../types/tournament';

export default function TournamentBracketPage() {
    return (
        <Suspense fallback={<Loading />}>
            <TournamentBracketContent />
        </Suspense>
    );
}

function TournamentBracketContent() {
    const { user, loading: authLoading, isAuthenticated } = useApp();
    const { id } = useParams();
    const router = useRouter();
    const [bracket, setBracket] = useState<TournamentBracket | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading) {
            if (!isAuthenticated) {
                router.push('/login');
                return;
            }
            loadTournamentBracket();
        }
    }, [isAuthenticated, authLoading, id]);

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

    if (authLoading || loading) {
        return <Loading />;
    }

    if (!isAuthenticated) {
        return <Loading />;
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
                        <button
                            onClick={loadTournamentBracket}
                            className="btn-primary"
                        >
                            Try Again
                        </button>
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
                        <button
                            onClick={() => router.push('/events')}
                            className="btn-primary"
                        >
                            Back to Events
                        </button>
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
                    <div className="bg-white border-b border-gray-200">
                        <div className="container-responsive py-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <button
                                        onClick={() => router.push(`/events`)}
                                        className="text-blue-600 hover:text-blue-700 mb-2 flex items-center gap-2"
                                    >
                                        ← Back to Events
                                    </button>
                                    <h1 className="text-3xl font-bold text-gray-900">{bracket.tournament.name}</h1>
                                    <p className="text-gray-600 mt-1">Tournament Bracket</p>
                                </div>

                                {bracket.canManage && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => router.push(`/tournaments/${id}/manage`)}
                                            className="btn-secondary"
                                        >
                                            Manage Tournament
                                        </button>
                                        <button
                                            onClick={loadTournamentBracket}
                                            className="btn-primary"
                                        >
                                            Refresh
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

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
                                    <span className="font-medium">Matches:</span> {bracket.matches.length}
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
