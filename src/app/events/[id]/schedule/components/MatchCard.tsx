'use client';

import { memo } from 'react';
import { getTeamAvatarUrl, getUserAvatarUrl, Match } from '@/types';

interface MatchCardProps {
    match: Match;
    onClick?: () => void;
    canManage?: boolean;
    className?: string;
    showDate?: boolean;
    layout?: 'vertical' | 'horizontal';
    hideTimeBadge?: boolean;
    showRefereeInHeader?: boolean;
}

function MatchCard({
    match,
    onClick,
    canManage = false,
    className = '',
    showDate = false,
    layout = 'vertical',
    hideTimeBadge = false,
    showRefereeInHeader = false,
}: MatchCardProps) {
    const toTitleCase = (value: string) =>
        value
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');

    const getTeamName = (teamData: any) => {
        if (teamData?.name) return teamData.name;
        if (teamData?.players?.length > 0) {
            return teamData.players.map((p: any) => `${p.firstName}.${p.lastName.charAt(0)}`).join(' & ');
        }
        return 'TBD';
    };

    const getUserName = (userData: any) => {
        if (!userData) return 'Referee';
        const name = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim();
        if (name) return toTitleCase(name);
        if (userData.userName) return toTitleCase(userData.userName);
        return 'Referee';
    };

    const getMatchResult = () => {
        const team1Wins = match.setResults.filter((r) => r === 1).length;
        const team2Wins = match.setResults.filter((r) => r === 2).length;
        if (team1Wins === 0 && team2Wins === 0) return null;
        return { team1Wins, team2Wins, winner: team1Wins > team2Wins ? 1 : team2Wins > team1Wins ? 2 : null };
    };

    const result = getMatchResult();
    const isCompleted = result && result.winner !== null;
    const isInProgress = match.setResults.some((r) => r === 0) && match.setResults.some((r) => r !== 0);

    const formatTime = (timeString: string) => {
        const date = new Date(timeString);
        if (Number.isNaN(date.getTime())) return '';
        return showDate
            ? date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            })
            : date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });
    };

    const clickable = typeof onClick === 'function';

    const TeamRow = ({
        team,
        points,
        winner,
        reverseScore = false,
    }: {
        team: Match['team1'];
        points: number[];
        winner: boolean;
        reverseScore?: boolean;
    }) => (
        <div className={`flex items-center justify-between p-2 rounded ${winner ? 'bg-green-50 border border-green-200' : 'bg-gray-100'}`}>
            {reverseScore ? (
                <>
                    <div className="flex items-center gap-1 text-sm font-mono mr-2">
                        {points.length > 0 ? (
                            points.map((value, idx) => (
                                <span key={idx} className={`px-1 ${match.setResults[idx] === (winner ? 2 : 1) ? 'font-bold text-green-600' : ''}`}>
                                    {value}
                                </span>
                            ))
                        ) : (
                            <span className="text-gray-400">-</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        {team && (
                            <img
                                src={getTeamAvatarUrl(team, 24)}
                                alt={getTeamName(team)}
                                className="w-6 h-6 rounded-full"
                            />
                        )}
                        <span className="text-sm font-medium truncate text-right">{getTeamName(team)}</span>
                    </div>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {team && (
                            <img
                                src={getTeamAvatarUrl(team, 24)}
                                alt={getTeamName(team)}
                                className="w-6 h-6 rounded-full"
                            />
                        )}
                        <span className="text-sm font-medium truncate">{getTeamName(team)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-mono ml-2">
                        {points.length > 0 ? (
                            points.map((value, idx) => (
                                <span key={idx} className={`px-1 ${match.setResults[idx] === (winner ? 1 : 2) ? 'font-bold text-green-600' : ''}`}>
                                    {value}
                                </span>
                            ))
                        ) : (
                            <span className="text-gray-400">-</span>
                        )}
                    </div>
                </>
            )}
        </div>
    );

    const VerticalLayout = () => (
        <>
            <div className="space-y-2">
                <TeamRow team={match.team1} points={match.team1Points} winner={result?.winner === 1} />
                <TeamRow team={match.team2} points={match.team2Points} winner={result?.winner === 2} />
            </div>
            <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isCompleted ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Completed</span>
                    ) : isInProgress ? (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">In Progress</span>
                    ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">Scheduled</span>
                    )}
                </div>
                {canManage && <div className="text-xs text-blue-600 font-medium">Click to manage</div>}
            </div>
        </>
    );

    const HorizontalLayout = () => (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 items-stretch">
                <div className="h-full">
                    <TeamRow
                        team={match.team1}
                        points={match.team1Points}
                        winner={result?.winner === 1}
                    />
                </div>
                <div className="h-full">
                    <TeamRow
                        team={match.team2}
                        points={match.team2Points}
                        winner={result?.winner === 2}
                        reverseScore
                    />
                </div>
            </div>
            <div className="flex items-center justify-between gap-3">
                <div className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full shrink-0">
                    {isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Scheduled'}
                </div>
                {canManage && <div className="text-xs text-blue-600 font-medium">Click to manage</div>}
            </div>
        </div>
    );

    return (
        <div
            className={`relative bg-white rounded-lg shadow-sm border-2 transition-all duration-200 ${clickable ? 'cursor-pointer hover:shadow-md' : ''} ${match.losersBracket ? 'border-orange-200 hover:border-orange-300' : 'border-blue-200 hover:border-blue-300'
                } ${isCompleted ? 'opacity-75' : ''} ${className}`}
            onClick={clickable ? onClick : undefined}
        >
            {!hideTimeBadge && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <div className={`px-3 py-1 rounded-full text-xs font-medium text-white ${match.losersBracket ? 'bg-orange-500' : 'bg-blue-500'}`}>
                        {formatTime(match.start)}
                    </div>
                </div>
            )}

            <div className="p-4 pv-6 space-y-3">
                <div className="flex items-start justify-between mb-2 gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                        <div className="text-sm text-gray-600">Match #{match.matchId}</div>
                        {showRefereeInHeader && (match.referee || match.teamReferee) && (
                            <div className="flex items-center gap-2 text-xs text-gray-700 flex-wrap">
                                {match.referee && (
                                    <span className="flex items-center gap-1">
                                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Official Referee:</span>
                                        <img
                                            src={getUserAvatarUrl(match.referee, 16)}
                                            alt={getUserName(match.referee)}
                                            className="w-4 h-4 rounded-full"
                                        />
                                        <span className="truncate max-w-[120px]">{getUserName(match.referee)}</span>
                                    </span>
                                )}
                                {match.teamReferee && (
                                    <span className="flex items-center gap-1">
                                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Team Referee:</span>
                                        <span className="truncate max-w-[120px]">{match.teamReferee.name || 'Team'}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    {match.field && <div className="text-sm text-gray-600 shrink-0">Field {match.field.fieldNumber}</div>}
                </div>
                {layout === 'horizontal' ? <HorizontalLayout /> : <VerticalLayout />}
            </div>

            {!showRefereeInHeader && (
                <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
            <div className="bg-white rounded-full px-3 py-1 text-xs text-gray-700 border shadow-sm flex items-center gap-3">
                {match.referee && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Official Referee:</span>
                        <img
                            src={getUserAvatarUrl(match.referee, 18)}
                            alt={getUserName(match.referee)}
                            className="w-4 h-4 rounded-full"
                        />
                                <span className="font-medium truncate max-w-[120px]">{getUserName(match.referee)}</span>
                            </div>
                        )}
                {match.teamReferee && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Team Referee:</span>
                        <img
                            src={getTeamAvatarUrl(match.teamReferee, 18)}
                            alt={match.teamReferee.name || 'Ref Team'}
                            className="w-4 h-4 rounded-full"
                        />
                                <span className="font-medium truncate max-w-[120px]">{match.teamReferee.name || 'Ref Team'}</span>
                            </div>
                        )}
                        {!match.referee && !match.teamReferee && <span>Ref: TBD</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(MatchCard);
