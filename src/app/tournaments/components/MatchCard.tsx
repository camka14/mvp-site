'use client';

import { MatchWithRelations } from '../types/tournament';
import { getUserAvatarUrl, getTeamAvatarUrl } from '@/types';

interface MatchCardProps {
    match: MatchWithRelations;
    onClick: () => void;
    canManage?: boolean;
    className?: string;
}

export default function MatchCard({ match, onClick, canManage = false, className = '' }: MatchCardProps) {
    const getTeamName = (teamData: any) => {
        if (teamData?.name) return teamData.name;
        if (teamData?.players?.length > 0) {
            return teamData.players.map((p: any) => `${p.firstName}.${p.lastName.charAt(0)}`).join(' & ');
        }
        return 'TBD';
    };

    const getMatchResult = () => {
        const team1Wins = match.setResults.filter(r => r === 1).length;
        const team2Wins = match.setResults.filter(r => r === 2).length;

        if (team1Wins === 0 && team2Wins === 0) return null;

        return {
            team1Wins,
            team2Wins,
            winner: team1Wins > team2Wins ? 1 : team2Wins > team1Wins ? 2 : null
        };
    };

    const result = getMatchResult();
    const isCompleted = result && result.winner !== null;
    const isInProgress = match.setResults.some(r => r === 0) && match.setResults.some(r => r !== 0);

    const formatTime = (timeString: string) => {
        const date = new Date(timeString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    return (
        <div
            className={`relative bg-white rounded-lg shadow-sm border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${match.losersBracket
                    ? 'border-orange-200 hover:border-orange-300'
                    : 'border-blue-200 hover:border-blue-300'
                } ${isCompleted ? 'opacity-75' : ''} ${className}`}
            onClick={onClick}
        >
            {/* Match Header */}
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <div
                    className={`px-3 py-1 rounded-full text-xs font-medium text-white ${match.losersBracket ? 'bg-orange-500' : 'bg-blue-500'
                        }`}
                >
                    {formatTime(match.start)}
                </div>
            </div>

            {/* Match Content */}
            <div className="p-4 pt-6">
                {/* Match Info */}
                <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-gray-600">
                        Match #{match.matchId}
                    </div>
                    {match.field && (
                        <div className="text-sm text-gray-600">
                            Field {match.field.fieldNumber}
                        </div>
                    )}
                </div>

                {/* Teams */}
                <div className="space-y-2">
                    {/* Team 1 */}
                    <div className={`flex items-center justify-between p-2 rounded ${result?.winner === 1 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                        }`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            {match.team1Data && (
                                <img
                                    src={getTeamAvatarUrl(match.team1Data, 24)}
                                    alt={getTeamName(match.team1Data)}
                                    className="w-6 h-6 rounded-full"
                                />
                            )}
                            <span className="text-sm font-medium truncate">
                                {getTeamName(match.team1Data)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-mono">
                            {match.team1Points.length > 0 ? (
                                match.team1Points.map((points, setIndex) => (
                                    <span
                                        key={setIndex}
                                        className={`px-1 ${match.setResults[setIndex] === 1 ? 'font-bold text-green-600' : ''
                                            }`}
                                    >
                                        {points}
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-400">-</span>
                            )}
                        </div>
                    </div>

                    {/* Team 2 */}
                    <div className={`flex items-center justify-between p-2 rounded ${result?.winner === 2 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                        }`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            {match.team2Data && (
                                <img
                                    src={getTeamAvatarUrl(match.team2Data, 24)}
                                    alt={getTeamName(match.team2Data)}
                                    className="w-6 h-6 rounded-full"
                                />
                            )}
                            <span className="text-sm font-medium truncate">
                                {getTeamName(match.team2Data)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-mono">
                            {match.team2Points.length > 0 ? (
                                match.team2Points.map((points, setIndex) => (
                                    <span
                                        key={setIndex}
                                        className={`px-1 ${match.setResults[setIndex] === 2 ? 'font-bold text-green-600' : ''
                                            }`}
                                    >
                                        {points}
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-400">-</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Match Status */}
                <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isCompleted ? (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                Completed
                            </span>
                        ) : isInProgress ? (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                                In Progress
                            </span>
                        ) : (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                Scheduled
                            </span>
                        )}
                    </div>

                    {canManage && (
                        <div className="text-xs text-blue-600 font-medium">
                            Click to manage
                        </div>
                    )}
                </div>
            </div>

            {/* Referee Info */}
            {match.referee && (
                <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
                    <div className="bg-white rounded-full px-3 py-1 text-xs text-gray-600 border shadow-sm">
                        Ref: {match.referee.firstName}.{match.referee.lastName.charAt(0)}
                    </div>
                </div>
            )}
        </div>
    );
}