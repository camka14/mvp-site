'use client';

import { useState, useRef, useEffect } from 'react';
import { TournamentBracket, MatchWithRelations } from '../types/tournament';
import { UserData } from '@/types';
import MatchCard from './MatchCard';
import ScoreUpdateModal from '../[id]/bracket/components/ScoreUpdateModal';

interface TournamentBracketViewProps {
    bracket: TournamentBracket;
    onScoreUpdate: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
    onMatchUpdate: (matchId: string, updates: Partial<MatchWithRelations>) => Promise<void>;
    currentUser?: UserData;
}

export default function TournamentBracketView({
    bracket,
    onScoreUpdate,
    onMatchUpdate,
    currentUser,
}: TournamentBracketViewProps) {
    const [selectedMatch, setSelectedMatch] = useState<MatchWithRelations | null>(null);
    const [showScoreModal, setShowScoreModal] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<'winners' | 'losers'>('winners');
    const [rounds, setRounds] = useState<(MatchWithRelations | null)[][]>([]);

    useEffect(() => {
        setRounds(generateRounds());
    }, [bracket, view]);

    const createMatchesMap = () => {
        const matchesMap: { [key: string]: MatchWithRelations } = {};
        bracket.matches.forEach(match => {
            matchesMap[match.$id] = match;
        });
        return matchesMap;
    };

    const matchesMap = createMatchesMap();

    const validMatch = (match: MatchWithRelations | null, isLosersBracket: boolean): boolean => {
        if (!match) return false;
        if (isLosersBracket) {
            const finalsMatch = match.previousLeftMatch === match.previousRightMatch && match.previousLeftMatch !== null;
            const mergeMatch = match.previousLeftMatch !== null &&
                match.previousLeftMatch?.losersBracket !== match.previousRightMatch?.losersBracket;
            const opposite = match.losersBracket !== isLosersBracket;
            const firstRound = match.previousLeftMatch === null && match.previousRightMatch === null;

            return finalsMatch || mergeMatch || !opposite || firstRound;
        } else {
            return match.losersBracket === isLosersBracket;
        }
    };

    const generateRounds = (): (MatchWithRelations | null)[][] => {
        if (Object.keys(matchesMap).length === 0) {
            return [];
        }

        const rounds: (MatchWithRelations | null)[][] = [];
        const visited = new Set<string>();
        const isLosersBracket = view === 'losers';

        // Find final round matches (no winnerNextMatch and loserNextMatch)
        const finalRound = Object.values(matchesMap).filter(match =>
            !match.winnerNextMatchId && !match.loserNextMatchId
        );

        if (finalRound.length > 0) {
            rounds.push(finalRound);
            finalRound.forEach(match => visited.add(match.$id));
        }

        // Generate subsequent rounds by traversing backwards
        let currentRound: (MatchWithRelations | null)[] = finalRound;

        while (currentRound.length > 0) {
            const nextRound: (MatchWithRelations | null)[] = [];

            for (const match of currentRound) {
                if (!validMatch(match, isLosersBracket)) {
                    // Add two nulls for invalid matches
                    nextRound.push(null, null);
                    continue;
                }

                // Add left match
                if (!match!.previousLeftMatch) {
                    nextRound.push(null);
                } else if (!visited.has(match!.previousLeftMatch.$id)) {
                    const leftMatch = match!.previousLeftMatch;
                    if (leftMatch) {
                        nextRound.push(leftMatch);
                        visited.add(match!.previousLeftMatch.$id);
                    } else {
                        nextRound.push(null);
                    }
                }

                // Add right match
                if (!match!.previousRightMatch) {
                    nextRound.push(null);
                } else if (!visited.has(match!.previousRightMatch.$id)) {
                    const rightMatch = match!.previousRightMatch;
                    if (rightMatch) {
                        nextRound.push(rightMatch);
                        visited.add(match!.previousRightMatch.$id);
                    } else {
                        nextRound.push(null);
                    }
                }
            }

            // Only add round if it has actual matches
            if (nextRound.some(match => match !== null)) {
                rounds.push(nextRound);
                currentRound = nextRound;
            } else {
                break;
            }
        }

        return rounds.reverse();
    };

    const handleMatchClick = (match: MatchWithRelations) => {
        setSelectedMatch(match);
        setShowScoreModal(true);
    };

    const handleScoreSubmit = async (
        matchId: string,
        team1Points: number[],
        team2Points: number[],
        setResults: number[]
    ) => {
        await onScoreUpdate(matchId, team1Points, team2Points, setResults);
        setShowScoreModal(false);
        setSelectedMatch(null);
    };

    const canManageMatch = (match: MatchWithRelations) => {
        if (!currentUser) return false;
        if (bracket.isHost) return true;

        // Check if user is the referee
        return match.refId === currentUser.$id;
    };

    return (
        <div className="h-full">
            {/* Bracket Container */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-auto p-6"
                style={{
                    minHeight: 'calc(100vh - 300px)',
                }}
            >
                {/* Bracket Switcher */}
                {bracket.tournament.doubleElimination && (
                    <div className="flex justify-center mb-6 gap-2">
                        <button
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${view === 'winners'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                            onClick={() => setView('winners')}
                            aria-pressed={view === 'winners'}
                        >
                            Winners Bracket
                        </button>
                        <button
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${view === 'losers'
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                            onClick={() => setView('losers')}
                            aria-pressed={view === 'losers'}
                        >
                            Losers Bracket
                        </button>
                    </div>
                )}

                <div className="flex gap-8 min-w-full">
                    {rounds.map((round, roundIndex) => (
                        <div
                            key={roundIndex}
                            className="flex flex-col justify-center gap-4 min-w-80"
                            style={{
                                minHeight: `${round.length * 120 + (round.length - 1) * 16}px`,
                            }}
                        >
                            {/* Round Header */}
                            <div className="text-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    {view === 'winners'
                                        ? (roundIndex === rounds.length - 1
                                            ? 'Final'
                                            : roundIndex === rounds.length - 2
                                                ? 'Semi-Final'
                                                : `Round ${roundIndex + 1}`)
                                        : (roundIndex === rounds.length - 1 ? 'Loser Final' : `Loser Round ${roundIndex + 1}`)
                                    }
                                </h3>
                                {view === 'losers' && (
                                    <span className="text-sm text-orange-600 font-medium">Loser Bracket</span>
                                )}
                            </div>

                            {/* Matches in this round */}
                            <div className="flex-1 flex flex-col justify-around gap-4">
                                {round.map((match, matchIndex) => (
                                    <div key={matchIndex} className="flex justify-center">
                                        {match ? (
                                            <MatchCard
                                                match={match}
                                                onClick={() => handleMatchClick(match)}
                                                canManage={canManageMatch(match)}
                                                className="w-72 h-50"
                                            />
                                        ) : (
                                            <div className="w-72 h-50">
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Score Update Modal */}
            {showScoreModal && selectedMatch && (
                <ScoreUpdateModal
                    match={selectedMatch}
                    tournament={bracket.tournament}
                    canManage={canManageMatch(selectedMatch)}
                    onSubmit={handleScoreSubmit}
                    onClose={() => {
                        setShowScoreModal(false);
                        setSelectedMatch(null);
                    }}
                    isOpen={showScoreModal && selectedMatch !== null}
                />
            )}
        </div>
    );
}
