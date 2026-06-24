'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

import { TournamentBracket, Match, UserData, Team } from '@/types';

import MatchCard from './MatchCard';

import ScoreUpdateModal from './ScoreUpdateModal';
import { Paper, Group, Button, ActionIcon, Text, SegmentedControl, Badge } from '@mantine/core';
import BracketCanvas from '@/components/bracket/BracketCanvas';
import { buildBracketCanvasLayout } from '@/lib/bracketCanvasLayout';
import { getBracketMatchDivisionId, toBracketDivisionKey } from '@/lib/bracketViewCore';
import { buildLeaguePlayoffPlaceholderAssignmentsForMatches } from '@/lib/bracketEntrantPlaceholders';

type CurrentUserMatchHighlight = 'participant' | 'official';

const extractEntityId = (value: unknown): string => {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (!value || typeof value !== 'object') {
        return '';
    }
    const row = value as Record<string, unknown>;
    const candidates = [row.$id, row.id];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return '';
};

const normalizeMatchRefId = (value: unknown): string => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

interface TournamentBracketViewProps {
    bracket: TournamentBracket;
    onScoreUpdate?: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
    currentUser?: UserData;
    childUserIds?: string[];
    viewerTeamIds?: Iterable<string>;
    highlightDivisionKeys?: Iterable<string>;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    isPreview?: boolean;
    onMatchClick?: (match: Match) => void;
    canEditMatches?: boolean;
    showDateOnMatches?: boolean;
    conflictMatchIdsById?: Record<string, string[]>;
    showEventOfficialNames?: boolean;
    eventTimeZone?: string;
}

export default function TournamentBracketView({
    bracket,
    onScoreUpdate,
    currentUser,
    childUserIds = [],
    viewerTeamIds,
    highlightDivisionKeys,
    isExpanded,
    onToggleExpand,
    isPreview = false,
    onMatchClick,
    canEditMatches = false,
    showDateOnMatches = false,
    conflictMatchIdsById = {},
    showEventOfficialNames = true,
    eventTimeZone,
}: TournamentBracketViewProps) {
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [showScoreModal, setShowScoreModal] = useState(false);
    // Zoom state - using CSS zoom instead of transform
    const [zoomLevel, setZoomLevel] = useState(1);
    const rootRef = useRef<HTMLDivElement>(null);
    const [viewportHeight, setViewportHeight] = useState<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isLosersBracket, setIsLosersBracket] = useState(false);
    const [isUnplacedDockCollapsed, setIsUnplacedDockCollapsed] = useState(false);
    const matchesById = useMemo<Record<string, Match>>(
        () => Object.fromEntries(Object.values(bracket.matches).map((match) => [match.$id, match])),
        [bracket.matches],
    );
    const conflictMatchIdSet = useMemo(
        () => new Set(Object.keys(conflictMatchIdsById).filter((matchId) => conflictMatchIdsById[matchId]?.length)),
        [conflictMatchIdsById],
    );
    const resolveLinkFromAll = useCallback((idValue: unknown, relationValue: unknown): Match | undefined => {
        const id = normalizeMatchRefId(idValue);
        if (id && matchesById[id]) {
            return matchesById[id];
        }
        // Explicitly blank/null IDs mean "no link"; ignore stale relation objects in draft edit mode.
        if (idValue === null || (typeof idValue === 'string' && idValue.trim().length === 0)) {
            return undefined;
        }
        const relationId = extractEntityId(relationValue);
        if (relationId && matchesById[relationId]) {
            return matchesById[relationId];
        }
        return undefined;
    }, [matchesById]);
    const teamsById = useMemo<Map<string, Team>>(() => {
        const map = new Map<string, Team>();
        const teams = Array.isArray(bracket.teams) ? bracket.teams : [];
        teams.forEach((team) => {
            const id = extractEntityId(team);
            if (!id) {
                return;
            }
            map.set(id, team as Team);
        });
        return map;
    }, [bracket.teams]);
    const officialsById = useMemo<Map<string, UserData>>(() => {
        const map = new Map<string, UserData>();
        const refs = Array.isArray((bracket.tournament as any)?.officials)
            ? ((bracket.tournament as any).officials as UserData[])
            : [];
        refs.forEach((ref) => {
            const id = extractEntityId(ref);
            if (!id) {
                return;
            }
            map.set(id, ref);
        });
        return map;
    }, [bracket.tournament]);
    const officialLookupById = useMemo<Record<string, UserData>>(
        () => Object.fromEntries(Array.from(officialsById.entries())),
        [officialsById],
    );
    const leaguePlayoffPlaceholderAssignments = useMemo<Record<string, string>>(() => {
        return buildLeaguePlayoffPlaceholderAssignmentsForMatches({
            tournament: bracket.tournament,
            matchesById,
        });
    }, [bracket.matches, bracket.tournament, matchesById]);

    const hasLoserMatches = useMemo(
        () => Object.values(bracket.matches).some(match => match.losersBracket),
        [bracket.matches],
    );

    useEffect(() => {
        if (isLosersBracket && !hasLoserMatches) {
            setIsLosersBracket(false);
        }
    }, [hasLoserMatches, isLosersBracket]);

    const bracketLayout = useMemo(
        () => buildBracketCanvasLayout(matchesById, { isLosersBracket }),
        [matchesById, isLosersBracket],
    );
    const treeById = bracketLayout.treeById;
    const unplacedMatches = useMemo(
        () => bracketLayout.unplacedMatchIds
            .map((matchId) => bracketLayout.viewById[matchId])
            .filter((match): match is Match => Boolean(match)),
        [bracketLayout.unplacedMatchIds, bracketLayout.viewById],
    );

    useEffect(() => {
        if (unplacedMatches.length === 0 && isUnplacedDockCollapsed) {
            setIsUnplacedDockCollapsed(false);
        }
    }, [isUnplacedDockCollapsed, unplacedMatches.length]);
    const canvasMatchIds = useMemo(
        () => Object.keys(bracketLayout.positionById),
        [bracketLayout.positionById],
    );

    // Simple zoom control functions using CSS zoom
    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(prev + 0.2, 3)); // Max zoom 3x
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(prev - 0.2, 0.5)); // Min zoom 0.5x
    };

    const handleZoomReset = () => {
        setZoomLevel(1);
        // Reset scroll position to top-left
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo(0, 0);
        }
    };

    // Keyboard shortcuts for zoom
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    handleZoomIn();
                } else if (e.key === '-') {
                    e.preventDefault();
                    handleZoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    handleZoomReset();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Mouse wheel zoom (with passive: false to prevent browser zoom)
    useEffect(() => {
        const onWheel = (e: WheelEvent) => {
            const container = scrollContainerRef.current;
            if (!container) return;
            const target = e.target as Node | null;
            const within = !!target && container.contains(target);
            if (within && (e.ctrlKey || (e as any).metaKey)) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                setZoomLevel(prev => Math.max(0.5, Math.min(3, prev + delta)));
            }
        };
        window.addEventListener('wheel', onWheel, { passive: false });
        return () => window.removeEventListener('wheel', onWheel as EventListener);
    }, []);

    // Fix the overall bracket view height to the visible viewport so panning happens inside the bracket canvas.
    // We compute the remaining space from this component's top edge to the bottom of the window.
    const measureViewportHeight = useCallback(() => {
        const el = rootRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        const next = Math.max(0, Math.floor(window.innerHeight - top));
        setViewportHeight((prev) => (prev === next ? prev : next));
    }, []);

    useEffect(() => {
        measureViewportHeight();
        window.addEventListener('resize', measureViewportHeight);
        window.addEventListener('orientationchange', measureViewportHeight);
        return () => {
            window.removeEventListener('resize', measureViewportHeight);
            window.removeEventListener('orientationchange', measureViewportHeight);
        };
    }, [measureViewportHeight]);

    const hasExternalMatchClick = typeof onMatchClick === 'function';
    const allowEditing = Boolean(canEditMatches && hasExternalMatchClick);
    // Only use the internal score modal when no parent click handler is provided.
    const allowScoreUpdates = !!onScoreUpdate && !isPreview && !hasExternalMatchClick;
    const currentUserId = typeof currentUser?.$id === 'string' ? currentUser.$id.trim() : '';
    const trackedUserIds = useMemo(() => {
        const ids = new Set<string>();
        if (currentUserId) {
            ids.add(currentUserId);
        }
        childUserIds.forEach((childUserId) => {
            if (typeof childUserId !== 'string') {
                return;
            }
            const normalizedChildUserId = childUserId.trim();
            if (normalizedChildUserId.length > 0) {
                ids.add(normalizedChildUserId);
            }
        });
        return ids;
    }, [childUserIds, currentUserId]);
    const hasTrackedUsers = trackedUserIds.size > 0;
    const userTeamIds = useMemo(() => {
        const ids = new Set<string>();
        (currentUser?.teamIds ?? []).forEach((teamId) => {
            if (typeof teamId !== 'string') {
                return;
            }
            const normalizedTeamId = teamId.trim();
            if (normalizedTeamId.length > 0) {
                ids.add(normalizedTeamId);
            }
        });
        if (viewerTeamIds) {
            for (const teamId of viewerTeamIds) {
                if (typeof teamId !== 'string') {
                    continue;
                }
                const normalizedTeamId = teamId.trim();
                if (normalizedTeamId.length > 0) {
                    ids.add(normalizedTeamId);
                }
            }
        }
        return ids;
    }, [currentUser?.teamIds, viewerTeamIds]);
    const highlightedDivisionKeySet = useMemo(() => {
        const keys = new Set<string>();
        if (highlightDivisionKeys) {
            for (const divisionKey of highlightDivisionKeys) {
                const normalizedDivisionKey = toBracketDivisionKey(divisionKey);
                if (normalizedDivisionKey) {
                    keys.add(normalizedDivisionKey);
                }
            }
        }
        return keys;
    }, [highlightDivisionKeys]);

    const teamHasCurrentUser = useCallback(
        (team: Match['team1'], fallbackTeamId?: string | null): boolean => {
            if (!hasTrackedUsers && userTeamIds.size === 0) {
                return false;
            }

            const resolvedTeamId = extractEntityId(team)
                || (typeof fallbackTeamId === 'string' ? fallbackTeamId.trim() : '');
            if (resolvedTeamId && userTeamIds.has(resolvedTeamId)) {
                return true;
            }
            if (!hasTrackedUsers) {
                return false;
            }

            const players = Array.isArray((team as any)?.players) ? (team as any).players : [];
            if (players.some((player: unknown) => {
                const playerId = extractEntityId(player);
                return Boolean(playerId && trackedUserIds.has(playerId));
            })) {
                return true;
            }

            const playerIds = Array.isArray((team as any)?.playerIds) ? (team as any).playerIds : [];
            if (playerIds.some((playerId: unknown) => {
                const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
                return normalizedPlayerId.length > 0 && trackedUserIds.has(normalizedPlayerId);
            })) {
                return true;
            }

            const captainId = extractEntityId((team as any)?.captain) || (typeof (team as any)?.captainId === 'string' ? (team as any).captainId.trim() : '');
            return captainId.length > 0 && trackedUserIds.has(captainId);
        },
        [hasTrackedUsers, trackedUserIds, userTeamIds],
    );

    const getCurrentUserMatchHighlight = useCallback((match: Match): CurrentUserMatchHighlight | undefined => {
        if (!hasTrackedUsers && userTeamIds.size === 0) {
            return undefined;
        }

        const matchOfficialId = extractEntityId(match.official)
            || (typeof match.officialId === 'string' ? match.officialId.trim() : '');
        const hasAssignedOfficialSlot = Array.isArray(match.officialIds)
            && match.officialIds.some((assignment) => {
                const userId = typeof assignment?.userId === 'string' ? assignment.userId.trim() : '';
                return userId.length > 0 && trackedUserIds.has(userId);
            });
        if ((matchOfficialId && trackedUserIds.has(matchOfficialId)) || hasAssignedOfficialSlot) {
            return 'official';
        }

        if (teamHasCurrentUser(match.teamOfficial, match.teamOfficialId)) {
            return 'official';
        }

        if (teamHasCurrentUser(match.team1, match.team1Id)
            || teamHasCurrentUser(match.team2, match.team2Id)) {
            return 'participant';
        }

        return undefined;
    }, [hasTrackedUsers, teamHasCurrentUser, trackedUserIds, userTeamIds]);

    const matchInvolvesCurrentUser = useCallback((match: Match): boolean => (
        Boolean(getCurrentUserMatchHighlight(match))
    ), [getCurrentUserMatchHighlight]);

    const matchHasHighlightedDivision = useCallback((match: Match): boolean => {
        const divisionKey = toBracketDivisionKey(getBracketMatchDivisionId(match));
        return Boolean(divisionKey && highlightedDivisionKeySet.has(divisionKey));
    }, [highlightedDivisionKeySet]);

    const canManageMatch = (match: Match) => {
        if (allowEditing) return true;
        if (!allowScoreUpdates) return false;
        if (!currentUser) return false;
        if (!bracket.canManage && !bracket.isHost) return false;
        if (bracket.isHost) return true;
        if (match.officialId && match.officialId === currentUser.$id) {
            return true;
        }
        const teamOfficialPlayers = match.teamOfficial?.playerIds || [];
        return teamOfficialPlayers.includes(currentUser.$id);
    };

    useEffect(() => {
        if (!allowScoreUpdates) {
            setShowScoreModal(false);
            setSelectedMatch(null);
        }
    }, [allowScoreUpdates]);

    const handleMatchClick = (match: Match) => {
        if (hasExternalMatchClick) {
            onMatchClick?.(match);
            return;
        }
        if (!canManageMatch(match)) return;
        setSelectedMatch(match);
        setShowScoreModal(true);
    };

    const handleScoreSubmit = async (
        matchId: string,
        team1Points: number[],
        team2Points: number[],
        setResults: number[]
    ) => {
        if (!onScoreUpdate) {
            setShowScoreModal(false);
            setSelectedMatch(null);
            return;
        }
        await onScoreUpdate(matchId, team1Points, team2Points, setResults);
        setShowScoreModal(false);
        setSelectedMatch(null);
    };

    const renderResolvedMatchCard = useCallback((match: Match, className: string) => {
        const team1Id = extractEntityId((match as any).team1)
            || (typeof match.team1Id === 'string' ? match.team1Id.trim() : '');
        const team2Id = extractEntityId((match as any).team2)
            || (typeof match.team2Id === 'string' ? match.team2Id.trim() : '');
        const teamOfficialId = extractEntityId((match as any).teamOfficial)
            || (typeof match.teamOfficialId === 'string' ? match.teamOfficialId.trim() : '');
        const officialId = extractEntityId((match as any).official)
            || (typeof match.officialId === 'string' ? match.officialId.trim() : '');
        const resolvedTeam1 = (match.team1 && typeof match.team1 === 'object')
            ? match.team1
            : (team1Id ? teamsById.get(team1Id) ?? null : null);
        const resolvedTeam2 = (match.team2 && typeof match.team2 === 'object')
            ? match.team2
            : (team2Id ? teamsById.get(team2Id) ?? null : null);
        const resolvedTeamOfficial = (match.teamOfficial && typeof match.teamOfficial === 'object')
            ? match.teamOfficial
            : (teamOfficialId ? teamsById.get(teamOfficialId) ?? null : null);
        const resolvedOfficial = (match.official && typeof match.official === 'object')
            ? match.official
            : (officialId ? officialsById.get(officialId) ?? null : null);
        const resolvedMatch: Match = {
            ...match,
            team1: resolvedTeam1 as Match['team1'],
            team2: resolvedTeam2 as Match['team2'],
            teamOfficial: resolvedTeamOfficial as Match['teamOfficial'],
            official: resolvedOfficial as Match['official'],
            team1Id: team1Id || match.team1Id || undefined,
            team2Id: team2Id || match.team2Id || undefined,
            teamOfficialId: teamOfficialId || match.teamOfficialId || undefined,
            officialId: officialId || match.officialId || undefined,
            previousLeftMatch: resolveLinkFromAll(match.previousLeftId, match.previousLeftMatch),
            previousRightMatch: resolveLinkFromAll(match.previousRightId, match.previousRightMatch),
        };
        const canInternalManage = canManageMatch(resolvedMatch);
        const matchHighlight = getCurrentUserMatchHighlight(resolvedMatch);
        const clickable = hasExternalMatchClick || canInternalManage;
        const hasConflict = conflictMatchIdSet.has(resolvedMatch.$id);
        const team1Placeholder = leaguePlayoffPlaceholderAssignments[`${resolvedMatch.$id}:team1`];
        const team2Placeholder = leaguePlayoffPlaceholderAssignments[`${resolvedMatch.$id}:team2`];

        return (
            <MatchCard
                match={resolvedMatch}
                onClick={clickable ? () => handleMatchClick(resolvedMatch) : undefined}
                canManage={false}
                className={className}
                matchHighlight={matchHighlight}
                showDate={showDateOnMatches}
                team1Placeholder={team1Placeholder}
                team2Placeholder={team2Placeholder}
                hasConflict={hasConflict}
                officialUsersById={officialLookupById}
                showEventOfficialNames={showEventOfficialNames}
                timeZone={eventTimeZone}
                highlightDivisionBadge={matchHasHighlightedDivision(resolvedMatch)}
            />
        );
    }, [
        canManageMatch,
        conflictMatchIdSet,
        eventTimeZone,
        handleMatchClick,
        hasExternalMatchClick,
        leaguePlayoffPlaceholderAssignments,
        matchHasHighlightedDivision,
        getCurrentUserMatchHighlight,
        officialLookupById,
        officialsById,
        resolveLinkFromAll,
        showDateOnMatches,
        showEventOfficialNames,
        teamsById,
    ]);

    return (
        <div
            ref={rootRef}
            className="flex flex-col min-h-0"
            style={viewportHeight === null ? undefined : { height: viewportHeight }}
        >
            {/* Controls Bar */}
            <Paper withBorder p="sm">
                <Group justify="space-between" align="center" wrap="nowrap" w="100%">
                    <Group gap="xs">
                        <ActionIcon variant="default" onClick={handleZoomOut} disabled={zoomLevel <= 0.5} aria-label="Zoom out">-</ActionIcon>
                        <Badge variant="light">{Math.round(zoomLevel * 100)}%</Badge>
                        <ActionIcon variant="default" onClick={handleZoomIn} disabled={zoomLevel >= 3} aria-label="Zoom in">+</ActionIcon>
                        <Button variant="default" size="xs" onClick={handleZoomReset}>Reset</Button>
                        {isPreview && (
                            <Badge color="yellow" variant="light">Preview</Badge>
                        )}
                        <Text size="xs" c="dimmed" className="hidden md:inline">Ctrl + scroll to zoom | Ctrl + 0 to reset</Text>
                    </Group>

                    <Group gap="sm">
                        {hasLoserMatches && (
                            <SegmentedControl
                                value={isLosersBracket ? 'losers' : 'winners'}
                                onChange={(v: string) => setIsLosersBracket(v === 'losers')}
                                data={[
                                    { label: 'Winners Bracket', value: 'winners' },
                                    { label: 'Losers Bracket', value: 'losers' },
                                ]}
                            />
                        )}
                        {typeof onToggleExpand === 'function' && (
                            <Button variant="default" size="xs" onClick={onToggleExpand} aria-pressed={!!isExpanded} title={isExpanded ? 'Collapse view' : 'Expand view'}>
                                {isExpanded ? 'Collapse' : 'Expand'}
                            </Button>
                        )}
                    </Group>
                </Group>
            </Paper>

            {/* Bracket Container with CSS Zoom */}
            <div className="flex-1 min-h-0 flex overflow-hidden bg-white">
                <div
                    ref={scrollContainerRef}
                    className="flex-1 min-h-0 min-w-0 overflow-auto"
                >
                    <div
                        style={{
                            zoom: zoomLevel, // CSS zoom property
                        }}
                    >
                        <BracketCanvas
                            layout={bracketLayout}
                            matchIds={canvasMatchIds}
                            markerId={`schedule-arrowhead-${isLosersBracket ? 'losers' : 'winners'}`}
                            className="relative inline-block"
                            svgClassName="pointer-events-none absolute inset-0 z-10"
                            connectionStroke="var(--mvp-neutral-400)"
                            arrowFill="var(--mvp-neutral-400)"
                            emptyState={<Text c="dimmed">No matches</Text>}
                            renderCard={(matchId) => {
                                const match = treeById[matchId];
                                return match ? renderResolvedMatchCard(match, 'w-full h-full') : null;
                            }}
                        />
                    </div>
                </div>

                {unplacedMatches.length > 0 && (
                    <Paper
                        withBorder
                        className="h-full border-l border-t-0 border-r-0 border-b-0"
                        style={{ width: isUnplacedDockCollapsed ? 44 : 332, minWidth: isUnplacedDockCollapsed ? 44 : 332 }}
                    >
                        <div className="flex h-full flex-col">
                            <Group justify="space-between" align="center" p="xs" wrap="nowrap">
                                {!isUnplacedDockCollapsed && (
                                    <Text size="sm" fw={600}>
                                        Unplaced Matches ({unplacedMatches.length})
                                    </Text>
                                )}
                                <ActionIcon
                                    variant="subtle"
                                    size="sm"
                                    aria-label={isUnplacedDockCollapsed ? 'Expand unplaced matches' : 'Collapse unplaced matches'}
                                    onClick={() => setIsUnplacedDockCollapsed((prev) => !prev)}
                                >
                                    {isUnplacedDockCollapsed ? '<<' : '>>'}
                                </ActionIcon>
                            </Group>
                            {!isUnplacedDockCollapsed && (
                                <div className="flex-1 overflow-y-auto px-2 pb-2">
                                    <div className="space-y-3">
                                        {unplacedMatches.map((match) => {
                                            return (
                                                <div key={`unplaced-${match.$id}`}>
                                                    {renderResolvedMatchCard(match, 'w-full')}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Paper>
                )}
            </div>

            {/* Score Update Modal */}
            {allowScoreUpdates && showScoreModal && selectedMatch && (
                <ScoreUpdateModal
                    match={selectedMatch}
                    tournament={bracket.tournament}
                    canManage={canManageMatch(selectedMatch)}
                    onSubmit={handleScoreSubmit}
                    onScoreChange={
                        onScoreUpdate
                            ? ({ matchId, team1Points, team2Points, setResults }) =>
                                  onScoreUpdate(matchId, team1Points, team2Points, setResults)
                            : undefined
                    }
                    onSetComplete={
                        onScoreUpdate
                            ? async ({ matchId, team1Points, team2Points, setResults }) =>
                                  onScoreUpdate(matchId, team1Points, team2Points, setResults)
                            : undefined
                    }
                    onMatchComplete={
                        onScoreUpdate
                            ? async ({ matchId, team1Points, team2Points, setResults }) =>
                                  onScoreUpdate(matchId, team1Points, team2Points, setResults)
                            : undefined
                    }
                    onClose={() => {
                        setShowScoreModal(false);
                        setSelectedMatch(null);
                    }}
                    isOpen={showScoreModal && selectedMatch !== null}
                    team1Placeholder={leaguePlayoffPlaceholderAssignments[`${selectedMatch.$id}:team1`]}
                    team2Placeholder={leaguePlayoffPlaceholderAssignments[`${selectedMatch.$id}:team2`]}
                />
            )}
        </div>
    );
}

