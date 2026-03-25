'use client';

import { memo } from 'react';
import Image from 'next/image';
import { getTeamAvatarUrl, getUserAvatarUrl, Match, UserData } from '@/types';
import { formatDisplayDateTime, formatDisplayTime } from '@/lib/dateUtils';
import { inferDivisionDetails } from '@/lib/divisionTypes';

interface MatchCardProps {
    match: Match;
    onClick?: () => void;
    canManage?: boolean;
    className?: string;
    highlightCurrentUser?: boolean;
    showDate?: boolean;
    layout?: 'vertical' | 'horizontal';
    hideTimeBadge?: boolean;
    showOfficialInHeader?: boolean;
    fieldLabel?: string;
    team1Placeholder?: string;
    team2Placeholder?: string;
    hasConflict?: boolean;
    officialUsersById?: Record<string, UserData>;
    showEventOfficialNames?: boolean;
}

type MatchDivisionInput = Match['division'] | string | null | undefined;

export const resolveDivisionLabel = (rawDivision: MatchDivisionInput): string => {
    if (typeof rawDivision === 'string') {
        const cleaned = rawDivision.trim();
        if (cleaned.length > 0) {
            const inferred = inferDivisionDetails({ identifier: cleaned });
            const inferredName = String(inferred.defaultName ?? '').trim();
            if (inferredName.length > 0) return inferredName;
        }
        return 'TBD';
    }

    if (rawDivision && typeof rawDivision === 'object') {
        const divisionRecord = rawDivision as { name?: unknown; id?: unknown };
        const name = String(divisionRecord.name ?? '').trim();
        if (name.length > 0) return name;
        const id = String(divisionRecord.id ?? '').trim();
        if (id.length > 0) {
            const inferred = inferDivisionDetails({ identifier: id });
            const inferredName = String(inferred.defaultName ?? '').trim();
            if (inferredName.length > 0) return inferredName;
        }
    }

    return 'TBD';
};

function MatchCard({
    match,
    onClick,
    canManage = false,
    className = '',
    highlightCurrentUser = false,
    showDate = false,
    layout = 'vertical',
    hideTimeBadge = false,
    showOfficialInHeader = false,
    fieldLabel,
    team1Placeholder,
    team2Placeholder,
    hasConflict = false,
    officialUsersById,
    showEventOfficialNames = true,
}: MatchCardProps) {
    const isCompactHorizontal = layout === 'horizontal' && hideTimeBadge;

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

    const normalizeMatchRefId = (value: unknown): string => (
        typeof value === 'string' ? value.trim() : ''
    );

    const getBracketPlaceholder = (
        previousMatch?: Match | null,
        slot?: 'team1' | 'team2',
    ) => {
        if (!previousMatch || typeof previousMatch.matchId !== 'number') {
            return 'TBD';
        }
        const currentMatchId = normalizeMatchRefId(match.$id);
        const winnerNextId = normalizeMatchRefId(previousMatch.winnerNextMatchId);
        const loserNextId = normalizeMatchRefId(previousMatch.loserNextMatchId);

        let prefix: 'Winner' | 'Loser';
        if (currentMatchId.length > 0) {
            const winnerFeedsCurrent = winnerNextId === currentMatchId;
            const loserFeedsCurrent = loserNextId === currentMatchId;
            if (winnerFeedsCurrent && loserFeedsCurrent) {
                prefix = slot === 'team2' ? 'Loser' : 'Winner';
            } else if (loserFeedsCurrent) {
                prefix = 'Loser';
            } else if (winnerFeedsCurrent) {
                prefix = 'Winner';
            } else {
                const isCrossBracketLoser = Boolean(match.losersBracket && previousMatch.losersBracket === false);
                prefix = isCrossBracketLoser ? 'Loser' : 'Winner';
            }
        } else {
            const isCrossBracketLoser = Boolean(match.losersBracket && previousMatch.losersBracket === false);
            prefix = isCrossBracketLoser ? 'Loser' : 'Winner';
        }

        return `${prefix} of match #${previousMatch.matchId}`;
    };

    const getTeamLabel = (
        teamData: Match['team1'],
        previousMatch?: Match | null,
        placeholder?: string,
        slot?: 'team1' | 'team2',
    ) => {
        if (teamData) {
            return getTeamName(teamData);
        }
        if (placeholder && placeholder.trim().length > 0) {
            return placeholder.trim();
        }
        if (!previousMatch && slot) {
            const siblingPreviousMatch = slot === 'team1'
                ? match.previousRightMatch
                : match.previousLeftMatch;
            if (siblingPreviousMatch && typeof siblingPreviousMatch.matchId === 'number') {
                const currentMatchId = normalizeMatchRefId(match.$id);
                const siblingWinnerNextId = normalizeMatchRefId(siblingPreviousMatch.winnerNextMatchId);
                const siblingLoserNextId = normalizeMatchRefId(siblingPreviousMatch.loserNextMatchId);
                const siblingFeedsBothOutcomes = currentMatchId.length > 0
                    && siblingWinnerNextId === currentMatchId
                    && siblingLoserNextId === currentMatchId;
                if (siblingFeedsBothOutcomes) {
                    return `${slot === 'team2' ? 'Loser' : 'Winner'} of match #${siblingPreviousMatch.matchId}`;
                }
            }
        }
        return getBracketPlaceholder(previousMatch, slot);
    };

    const getUserName = (userData: any) => {
        if (!userData) return 'Official';
        const name = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim();
        if (name) return toTitleCase(name);
        if (userData.userName) return toTitleCase(userData.userName);
        return 'Official';
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
    const divisionLabel = resolveDivisionLabel(match.division);

    const formatTime = (timeString?: string | null) => {
        if (!timeString || typeof timeString !== 'string') return 'TBD';
        const date = new Date(timeString);
        if (Number.isNaN(date.getTime())) return 'TBD';
        return showDate
            ? formatDisplayDateTime(date)
            : formatDisplayTime(date);
    };
    const resolveOfficialLabel = (userId: string): string | null => {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            return null;
        }
        if (match.official && typeof match.official === 'object' && match.official.$id === normalizedUserId) {
            return getUserName(match.official);
        }
        const mappedOfficial = officialUsersById?.[normalizedUserId];
        if (mappedOfficial) {
            return getUserName(mappedOfficial);
        }
        return null;
    };
    const assignmentSummary = (() => {
        if (!Array.isArray(match.officialIds) || match.officialIds.length === 0) {
            return [] as string[];
        }
        const labels = new Set<string>();
        match.officialIds.forEach((assignment) => {
            const userId = typeof assignment?.userId === 'string' ? assignment.userId.trim() : '';
            if (!userId) {
                return;
            }
            if (assignment.holderType === 'PLAYER') {
                labels.add(`Player ${userId}`);
                return;
            }
            const resolvedLabel = resolveOfficialLabel(userId);
            if (resolvedLabel) {
                labels.add(resolvedLabel);
                return;
            }
            labels.add(`Official ${userId}`);
        });
        return Array.from(labels);
    })();
    const showEventOfficialDetails =
        showEventOfficialNames && (assignmentSummary.length > 0 || Boolean(match.official));
    const showTeamOfficialDetails = Boolean(match.teamOfficial);
    const showAnyOfficialDetails = showEventOfficialDetails || showTeamOfficialDetails;

    const resolvedFieldLabel = (() => {
        const explicitLabel = fieldLabel?.trim();
        if (explicitLabel) {
            return explicitLabel;
        }

        const relationName = match.field?.name?.trim();
        if (relationName) {
            return relationName;
        }

        if (typeof match.field?.fieldNumber === 'number' && match.field.fieldNumber > 0) {
            return `Field ${match.field.fieldNumber}`;
        }

        return 'Field TBD';
    })();

    const clickable = typeof onClick === 'function';
    const borderClass = hasConflict
        ? 'border-red-400 hover:border-red-500'
        : highlightCurrentUser
            ? 'border-green-300 hover:border-green-400'
            : match.losersBracket
                ? 'border-orange-200 hover:border-orange-300'
                : 'border-blue-200 hover:border-blue-300';

    const renderTeamRow = ({
        team,
        points,
        winner,
        previousMatch,
        placeholder,
        reverseScore = false,
        slot,
    }: {
        team: Match['team1'];
        points: number[];
        winner: boolean;
        previousMatch?: Match | null;
        placeholder?: string;
        reverseScore?: boolean;
        slot: 'team1' | 'team2';
    }) => (
        <div className={`flex items-center justify-between ${isCompactHorizontal ? 'p-1.5' : 'p-2'} rounded ${winner ? 'bg-green-50 border border-green-200' : 'bg-gray-100'}`}>
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
                            <Image
                                src={getTeamAvatarUrl(team, 24)}
                                alt={getTeamLabel(team, previousMatch, placeholder, slot)}
                                width={24}
                                height={24}
                                unoptimized
                                className="w-6 h-6 rounded-full"
                            />
                        )}
                        <span className="text-sm font-medium truncate text-right">
                            {getTeamLabel(team, previousMatch, placeholder, slot)}
                        </span>
                    </div>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {team && (
                            <Image
                                src={getTeamAvatarUrl(team, 24)}
                                alt={getTeamLabel(team, previousMatch, placeholder, slot)}
                                width={24}
                                height={24}
                                unoptimized
                                className="w-6 h-6 rounded-full"
                            />
                        )}
                        <span className="text-sm font-medium truncate">
                            {getTeamLabel(team, previousMatch, placeholder, slot)}
                        </span>
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

    const renderVerticalLayout = () => (
        <>
            <div className="space-y-2">
                {renderTeamRow({
                    team: match.team1,
                    points: match.team1Points,
                    winner: result?.winner === 1,
                    previousMatch: match.previousLeftMatch,
                    placeholder: team1Placeholder,
                    slot: 'team1',
                })}
                {renderTeamRow({
                    team: match.team2,
                    points: match.team2Points,
                    winner: result?.winner === 2,
                    previousMatch: match.previousRightMatch,
                    placeholder: team2Placeholder,
                    slot: 'team2',
                })}
            </div>
            <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                        Division: {divisionLabel}
                    </span>
                </div>
                {canManage && <div className="text-xs text-blue-600 font-medium">Click to manage</div>}
            </div>
        </>
    );

    const renderHorizontalLayout = () => (
        <div className={isCompactHorizontal ? 'space-y-2' : 'space-y-3'}>
            <div className={`grid grid-cols-2 items-stretch ${isCompactHorizontal ? 'gap-2' : 'gap-3'}`}>
                <div className="h-full">
                    {renderTeamRow({
                        team: match.team1,
                        points: match.team1Points,
                        winner: result?.winner === 1,
                        previousMatch: match.previousLeftMatch,
                        placeholder: team1Placeholder,
                        slot: 'team1',
                    })}
                </div>
                <div className="h-full">
                    {renderTeamRow({
                        team: match.team2,
                        points: match.team2Points,
                        winner: result?.winner === 2,
                        previousMatch: match.previousRightMatch,
                        placeholder: team2Placeholder,
                        reverseScore: true,
                        slot: 'team2',
                    })}
                </div>
            </div>
            <div className="flex items-center justify-between gap-3">
                <div className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full shrink-0">
                    Division: {divisionLabel}
                </div>
                {canManage && <div className="text-xs text-blue-600 font-medium">Click to manage</div>}
            </div>
        </div>
    );

    return (
        <div
            className={`relative bg-white rounded-lg shadow-sm border-2 transition-all duration-200 ${clickable ? 'cursor-pointer hover:shadow-md' : ''} ${isCompleted ? 'opacity-75' : ''} ${className} ${borderClass}`}
            onClick={clickable ? onClick : undefined}
        >
            {!hideTimeBadge && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <div className={`inline-flex whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium text-white ${match.losersBracket ? 'bg-orange-500' : 'bg-blue-500'}`}>
                        {formatTime(match.start)}
                    </div>
                </div>
            )}

            <div className={`${isCompactHorizontal ? 'p-3 space-y-2' : 'p-4 pv-6 space-y-3'}`}>
                <div className={`flex items-start justify-between gap-3 ${isCompactHorizontal ? 'mb-1' : 'mb-2'}`}>
                    <div className="flex flex-col gap-1 min-w-0">
                        <div className="text-sm text-gray-600">Match #{match.matchId}</div>
                        {showOfficialInHeader && showAnyOfficialDetails && (
                            <div className="flex items-center gap-2 text-xs text-gray-700 flex-wrap">
                                {showEventOfficialDetails && assignmentSummary.length > 0 ? (
                                    <span className="truncate max-w-[220px]">Officials: {assignmentSummary.join(', ')}</span>
                                ) : showEventOfficialDetails && match.official && (
                                    <span className="flex items-center gap-1">
                                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Official Official:</span>
                                        <Image
                                            src={getUserAvatarUrl(match.official, 16)}
                                            alt={getUserName(match.official)}
                                            width={16}
                                            height={16}
                                            unoptimized
                                            className="w-4 h-4 rounded-full"
                                        />
                                        <span className="truncate max-w-[120px]">{getUserName(match.official)}</span>
                                    </span>
                                )}
                                {match.teamOfficial && (
                                    <span className="flex items-center gap-1">
                                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Team Official:</span>
                                        <span className="truncate max-w-[120px]">{match.teamOfficial.name || 'Team'}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="text-sm text-gray-600 shrink-0">{resolvedFieldLabel}</div>
                </div>
                {layout === 'horizontal' ? renderHorizontalLayout() : renderVerticalLayout()}
            </div>

            {!showOfficialInHeader && showAnyOfficialDetails && (
                <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
            <div className="bg-white rounded-full px-3 py-1 text-xs text-gray-700 border shadow-sm flex items-center gap-3">
                {showEventOfficialDetails && assignmentSummary.length > 0 ? (
                    <span className="font-medium truncate max-w-[220px]">Officials: {assignmentSummary.join(', ')}</span>
                ) : showEventOfficialDetails && match.official && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Official Official:</span>
                        <Image
                            src={getUserAvatarUrl(match.official, 18)}
                            alt={getUserName(match.official)}
                            width={16}
                            height={16}
                            unoptimized
                            className="w-4 h-4 rounded-full"
                        />
                                <span className="font-medium truncate max-w-[120px]">{getUserName(match.official)}</span>
                            </div>
                        )}
                {match.teamOfficial && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Team Official:</span>
                        <Image
                            src={getTeamAvatarUrl(match.teamOfficial, 18)}
                            alt={match.teamOfficial.name || 'Ref Team'}
                            width={16}
                            height={16}
                            unoptimized
                            className="w-4 h-4 rounded-full"
                        />
                                <span className="font-medium truncate max-w-[120px]">{match.teamOfficial.name || 'Ref Team'}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(MatchCard);

