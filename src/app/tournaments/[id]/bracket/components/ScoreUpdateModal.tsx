'use client';

import { useState, useEffect } from 'react';
import { MatchWithRelations } from '../../../types/tournament';
import { Event, getTeamAvatarUrl } from '@/types';
import ModalShell from '@/components/ui/ModalShell';

interface ScoreUpdateModalProps {
    match: MatchWithRelations;
    tournament: Event & { eventType: 'tournament' };
    canManage: boolean;
    onSubmit: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
    onClose: () => void;
    isOpen: boolean;
}

export default function ScoreUpdateModal({
    match,
    tournament,
    canManage,
    onSubmit,
    onClose,
    isOpen,
}: ScoreUpdateModalProps) {
    const [team1Points, setTeam1Points] = useState<number[]>(match.team1Points || []);
    const [team2Points, setTeam2Points] = useState<number[]>(match.team2Points || []);
    const [setResults, setSetResults] = useState<number[]>(match.setResults || []);
    const [currentSet, setCurrentSet] = useState(0);
    const [loading, setLoading] = useState(false);

    // Initialize points and sets based on tournament settings
    useEffect(() => {
        const maxSets = match.losersBracket ? tournament.loserSetCount || 1 : tournament.winnerSetCount || 1;
        const pointsToWin = match.losersBracket
            ? tournament.loserBracketPointsToVictory || [21]
            : tournament.winnerBracketPointsToVictory || [21];

        // Initialize arrays if they're empty
        if (team1Points.length === 0) {
            setTeam1Points(new Array(maxSets).fill(0));
        }
        if (team2Points.length === 0) {
            setTeam2Points(new Array(maxSets).fill(0));
        }
        if (setResults.length === 0) {
            setSetResults(new Array(maxSets).fill(0));
        }

        // Find current set
        const currentSetIndex = setResults.findIndex(result => result === 0);
        setCurrentSet(currentSetIndex >= 0 ? currentSetIndex : 0);
    }, [match, tournament]);

    const getTeamName = (teamData: any) => {
        if (teamData?.name) return teamData.name;
        if (teamData?.players?.length > 0) {
            return teamData.players.map((p: any) => `${p.firstName} ${p.lastName}`).join(' & ');
        }
        return 'TBD';
    };

    const updateScore = (team: 1 | 2, increment: boolean) => {
        if (!canManage) return;

        if (team === 1) {
            const newPoints = [...team1Points];
            if (increment) {
                newPoints[currentSet] += 1;
            } else if (newPoints[currentSet] > 0) {
                newPoints[currentSet] -= 1;
            }
            setTeam1Points(newPoints);
        } else {
            const newPoints = [...team2Points];
            if (increment) {
                newPoints[currentSet] += 1;
            } else if (newPoints[currentSet] > 0) {
                newPoints[currentSet] -= 1;
            }
            setTeam2Points(newPoints);
        }
    };

    const confirmSet = () => {
        const team1Score = team1Points[currentSet];
        const team2Score = team2Points[currentSet];

        if (team1Score === team2Score) {
            alert('Set cannot end in a tie');
            return;
        }

        const newSetResults = [...setResults];
        newSetResults[currentSet] = team1Score > team2Score ? 1 : 2;
        setSetResults(newSetResults);

        // Move to next set if available
        if (currentSet + 1 < setResults.length) {
            setCurrentSet(currentSet + 1);
        }
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            await onSubmit(match.$id, team1Points, team2Points, setResults);
        } catch (error) {
            console.error('Failed to update score:', error);
            alert('Failed to update score. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const isMatchComplete = () => {
        const team1Wins = setResults.filter(r => r === 1).length;
        const team2Wins = setResults.filter(r => r === 2).length;
        const setsNeeded = Math.ceil((match.losersBracket ? tournament.loserSetCount! : tournament.winnerSetCount || 1) / 2);

        return team1Wins >= setsNeeded || team2Wins >= setsNeeded;
    };

    const canIncrementScore = () => {
        if (!canManage) return false;
        if (isMatchComplete()) return false;
        return setResults[currentSet] === 0; // Current set is still ongoing
    };

    return (
        <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="2xl">
            <div className="p-6">
                {/* Header */}
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">
                        Match #{match.matchId}
                    </h2>
                    <p className="text-gray-600">
                        Set {currentSet + 1} of {setResults.length}
                        {match.losersBracket && <span className="ml-2 text-orange-600">(Loser Bracket)</span>}
                    </p>
                </div>

                {/* Score Display */}
                <div className="grid grid-cols-1 gap-6 mb-8">
                    {/* Team 1 */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                {match.team1Data && (
                                    <img
                                        src={getTeamAvatarUrl(match.team1Data, 40)}
                                        alt={getTeamName(match.team1Data)}
                                        className="w-10 h-10 rounded-full"
                                    />
                                )}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        {getTeamName(match.team1Data)}
                                    </h3>
                                </div>
                            </div>

                            {canIncrementScore() && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateScore(1, false)}
                                        className="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center"
                                        disabled={team1Points[currentSet] === 0}
                                    >
                                        -
                                    </button>
                                    <button
                                        onClick={() => updateScore(1, true)}
                                        className="w-8 h-8 rounded-full bg-green-100 text-green-600 hover:bg-green-200 flex items-center justify-center"
                                    >
                                        +
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="text-center">
                            <div className="text-4xl font-bold text-gray-900 mb-2">
                                {team1Points[currentSet] || 0}
                            </div>
                            <div className="flex justify-center gap-2">
                                {team1Points.map((points, index) => (
                                    <span
                                        key={index}
                                        className={`px-2 py-1 text-sm rounded ${index === currentSet
                                            ? 'bg-blue-100 text-blue-800 font-semibold'
                                            : setResults[index] === 1
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}
                                    >
                                        {points}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Team 2 */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                {match.team2Data && (
                                    <img
                                        src={getTeamAvatarUrl(match.team2Data, 40)}
                                        alt={getTeamName(match.team2Data)}
                                        className="w-10 h-10 rounded-full"
                                    />
                                )}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        {getTeamName(match.team2Data)}
                                    </h3>
                                </div>
                            </div>

                            {canIncrementScore() && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateScore(2, false)}
                                        className="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center"
                                        disabled={team2Points[currentSet] === 0}
                                    >
                                        -
                                    </button>
                                    <button
                                        onClick={() => updateScore(2, true)}
                                        className="w-8 h-8 rounded-full bg-green-100 text-green-600 hover:bg-green-200 flex items-center justify-center"
                                    >
                                        +
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="text-center">
                            <div className="text-4xl font-bold text-gray-900 mb-2">
                                {team2Points[currentSet] || 0}
                            </div>
                            <div className="flex justify-center gap-2">
                                {team2Points.map((points, index) => (
                                    <span
                                        key={index}
                                        className={`px-2 py-1 text-sm rounded ${index === currentSet
                                            ? 'bg-blue-100 text-blue-800 font-semibold'
                                            : setResults[index] === 2
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}
                                    >
                                        {points}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="btn-secondary"
                    >
                        Close
                    </button>

                    <div className="flex gap-2">
                        {canManage && setResults[currentSet] === 0 && (
                            <button
                                onClick={confirmSet}
                                className="btn-primary"
                                disabled={team1Points[currentSet] === team2Points[currentSet]}
                            >
                                Confirm Set {currentSet + 1}
                            </button>
                        )}

                        {canManage && (
                            <button
                                onClick={handleSubmit}
                                className="btn-primary"
                                disabled={loading}
                            >
                                {loading ? 'Saving...' : 'Save Match'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </ModalShell>
    );
}