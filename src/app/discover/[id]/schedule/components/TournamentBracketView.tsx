'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

import { TournamentBracket, Match, UserData } from '@/types';

import MatchCard from './MatchCard';

import ScoreUpdateModal from './ScoreUpdateModal';
import { xor } from '@/app/utils';
import { Paper, Group, Button, ActionIcon, Text, SegmentedControl, Badge } from '@mantine/core';


interface TournamentBracketViewProps {
    bracket: TournamentBracket;
    onScoreUpdate?: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
    currentUser?: UserData;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    isPreview?: boolean;
    onMatchClick?: (match: Match) => void;
    canEditMatches?: boolean;
}

export default function TournamentBracketView({
    bracket,
    onScoreUpdate,
    currentUser,
    isExpanded,
    onToggleExpand,
    isPreview = false,
    onMatchClick,
    canEditMatches = false,
}: TournamentBracketViewProps) {
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [showScoreModal, setShowScoreModal] = useState(false);
    // Zoom state - using CSS zoom instead of transform
    const [zoomLevel, setZoomLevel] = useState(1);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isLosersBracket, setIsLosersBracket] = useState(false);
    const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const contentRef = useRef<HTMLDivElement>(null);
    const [connections, setConnections] = useState<{ fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number }[]>([]);

    // Compute positions based on rounds (x) and yCenterById (y)
    const CARD_W = 288; // w-72
    const CARD_H = 200; // standard height (h-50)
    const GAP_X = 48;
    const GAP_Y = 12;   // per-level extra spacing
    const LEVEL_STEP = Math.round(CARD_H / 2 + GAP_Y);
    const START_OFFSET = 16; // initial x/y offset from top-left

    // Map if needed in future: const matchesById = useMemo(() => Object.fromEntries(bracket.matches.map(m => [m.$id, m])), [bracket.matches]);

    // Subset of matches for current view, plus one-hop children from the opposite bracket
    const viewById = useMemo(() => {
        const map: Record<string, Match> = {};
        const idToMatch: Record<string, Match> = Object.fromEntries(Object.values(bracket.matches).map(m => [m.$id, m]));

        // include all matches in current bracket
        Object.values(bracket.matches).forEach(m => {
            if (m.losersBracket === isLosersBracket) {
                map[m.$id] = m;
            }
        });

        // include one-hop children even if from opposite bracket
        Object.values(map).forEach(parent => {
            const left = parent.previousLeftMatch ?? (parent.previousLeftId ? idToMatch[parent.previousLeftId] : undefined);
            const right = parent.previousRightMatch ?? (parent.previousRightId ? idToMatch[parent.previousRightId] : undefined);
            if (left) map[left.$id] = left;
            if (right) map[right.$id] = right;
        });

        const filteredEntries = Object.entries(map).filter(([, match]) => {
            const hasPrevious =
                Boolean(match.previousLeftMatch) ||
                Boolean(match.previousRightMatch) ||
                Boolean(match.previousLeftId && idToMatch[match.previousLeftId]) ||
                Boolean(match.previousRightId && idToMatch[match.previousRightId]);

            const hasNext =
                Boolean(match.winnerNextMatch) ||
                Boolean(match.winnerNextMatchId && idToMatch[match.winnerNextMatchId]) ||
                Boolean(match.loserNextMatch) ||
                Boolean(match.loserNextMatchId && idToMatch[match.loserNextMatchId]);

            return hasPrevious || hasNext;
        });

        return Object.fromEntries(filteredEntries);
    }, [bracket.matches, isLosersBracket]);

    const hasLoserMatches = useMemo(
        () => Object.values(bracket.matches).some(match => match.losersBracket),
        [bracket.matches],
    );

    // Terminals: no winnerNext within current view's bracket
    const terminalIds = useMemo(() => Object.values(viewById)
        .filter(m => m.losersBracket === isLosersBracket)
        .filter(m => !m.winnerNextMatch || m.winnerNextMatch.losersBracket !== isLosersBracket)
        .map(m => m.$id), [viewById, isLosersBracket]);

    // Choose a root terminal (prefer highest matchId)
    const rootId = useMemo(() => {
        let best: string | null = null;
        let bestMatchId = -Infinity;
        for (const id of terminalIds) {
            const m = viewById[id];
            const key = m?.matchId ?? 0;
            if (key > bestMatchId || (key === bestMatchId && (!best || id.localeCompare(best) < 0))) { best = id; bestMatchId = key; }
        }
        return best;
    }, [terminalIds, viewById]);

    // Helper: children of a node with at most one-hop cross-bracket inclusion
    const getChildrenLimited = useCallback((m: Match): Match[] => {
        const left = m.previousLeftMatch ?? (m.previousLeftId ? viewById[m.previousLeftId] : undefined);
        const right = m.previousRightMatch ?? (m.previousRightId ? viewById[m.previousRightId] : undefined);
        const children: Match[] = [];
        if (left) children.push(left);
        if (right && (!left || right.$id !== left.$id)) children.push(right);
        // Do not traverse beyond one hop across brackets
        if (m.losersBracket !== isLosersBracket) return [];
        return children;
    }, [viewById, isLosersBracket]);

    // Compute round indices from root with one-hop cross-bracket rule, then invert so leaves are round 0
    const roundIndexById = useMemo(() => {
        const depth = new Map<string, number>();
        if (!rootId) return depth;
        const visit = (id: string, d: number) => {
            const cur = depth.get(id);
            if (cur !== undefined && cur <= d) return;
            depth.set(id, d);
            const m = viewById[id];
            if (!m) return;
            const children = getChildrenLimited(m);
            for (const c of children) visit(c.$id, d + 1);
        };
        visit(rootId, 0);
        let maxD = 0;
        depth.forEach(v => { if (v > maxD) maxD = v; });
        const rounds = new Map<string, number>();
        depth.forEach((d, id) => { rounds.set(id, maxD - d); });
        // For nodes not connected to root (edge case), place at round 0
        Object.keys(viewById).forEach(id => { if (!rounds.has(id)) rounds.set(id, 0); });
        return rounds;
    }, [rootId, viewById, getChildrenLimited]);

    // Pair-depth per node: counts two-child splits along deepest path; single-child chains don't increment
    const pairDepthById = useMemo(() => {
        const memo = new Map<string, number>();
        const dfs = (id: string): number => {
            if (memo.has(id)) return memo.get(id)!;
            const m = viewById[id];
            if (!m) { memo.set(id, 0); return 0; }
            const kids = getChildrenLimited(m);

            if (kids.length === 0) { memo.set(id, 0); return 0; }
            if (kids.length === 1) { const v = dfs(kids[0].$id); memo.set(id, v); return v; }
            
            const leftHasKids = getChildrenLimited(kids[0]).length > 0
            const rightHasKids = getChildrenLimited(kids[1]).length > 0

            const v = 1 + Math.max(dfs(kids[0].$id), dfs(kids[1].$id)) - (xor(!leftHasKids, !rightHasKids) ? 0.5 : 0);
            memo.set(id, v);
            return v;
        };
        Object.keys(viewById).forEach(id => dfs(id));
        return memo;
    }, [viewById, getChildrenLimited]);

    // Y centers via symmetric offsets: delta = 2 * max(nLeft, nRight) * LEVEL_STEP; single child keeps same center
    const yCenterById = useMemo(() => {
        const centers = new Map<string, number>();
        if (!rootId) return centers;
        const visit = (id: string, center: number) => {
            centers.set(id, center);
            const m = viewById[id];
            if (!m) return;
            const kids = getChildrenLimited(m);
            if (kids.length === 1) {
                const only = kids[0];
                if (!centers.has(only.$id)) visit(only.$id, center);
            } else if (kids.length === 2) {
                const left = kids[0];
                const right = kids[1];
                const nLeft = Math.round(pairDepthById.get(left.$id) ?? 0);
                const nRight = Math.round(pairDepthById.get(right.$id) ?? 0);
                const n = Math.max(nLeft, nRight);
                var delta = (n ? (2 * n) : 1) * LEVEL_STEP;

                if (getChildrenLimited(left).length === 0) {
                    delta = LEVEL_STEP
                }

                if (getChildrenLimited(right).length === 0) {
                    delta = LEVEL_STEP
                }

                if (!centers.has(left.$id)) visit(left.$id, center - delta);
                if (!centers.has(right.$id)) visit(right.$id, center + delta);
            }
        };
        visit(rootId, 0);
        return centers;
    }, [rootId, viewById, getChildrenLimited, pairDepthById]);

    const positionById = useMemo(() => {
        const positions = new Map<string, { x: number; y: number; round: number; level: number }>();
        if (!rootId) return positions;
        let minCenter = Infinity;
        yCenterById.forEach(c => { if (c < minCenter) minCenter = c; });
        if (!isFinite(minCenter)) minCenter = 0;
        for (const id of Object.keys(viewById)) {
            const round = roundIndexById.get(id) ?? 0;
            const center = yCenterById.get(id) ?? 0;
            const y = center - minCenter;
            positions.set(id, { x: round * (CARD_W + GAP_X), y, round, level: 0 });
        }
        return positions;
    }, [rootId, yCenterById, roundIndexById, viewById]);

    const contentSize = useMemo(() => {
        let maxX = 0, maxY = 0;
        positionById.forEach(p => { maxX = Math.max(maxX, p.x + CARD_W); maxY = Math.max(maxY, p.y + CARD_H); });
        return { width: Math.max(0, maxX) + START_OFFSET * 2, height: Math.max(0, maxY) + START_OFFSET * 2 };
    }, [positionById]);

    // Keep the bracket container size fixed (only grows, never shrinks)
    const [fixedSize, setFixedSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    useEffect(() => {
        setFixedSize(prev => ({
            width: Math.max(prev.width, contentSize.width),
            height: Math.max(prev.height, contentSize.height),
        }));
    }, [contentSize.width, contentSize.height]);

    // Reset container sizing when switching between winner/loser views
    useEffect(() => {
        setFixedSize({ width: 0, height: 0 });
    }, [isLosersBracket]);

    // Removed older tree/round generation helpers in favor of absolute layout computation

    // Build connections following view rules for "next" matches
    const calculateConnections = useCallback(() => {
        const conns: { fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number }[] = [];
        if (!positionById.size) { setConnections(conns); return; }

        const getNextTarget = (m: Match): Match | undefined => {
            if (!isLosersBracket) {
                // Winners view: only next winner match
                const t = m.winnerNextMatch ?? (m.winnerNextMatchId ? viewById[m.winnerNextMatchId] : undefined);
                return t && t.losersBracket === false ? t : undefined;
            } else {
                if (m.losersBracket === false) {
                    // Losers view: winners matches point to loserNext
                    return m.loserNextMatch ?? (m.loserNextMatchId ? viewById[m.loserNextMatchId] : undefined);
                } else {
                    // Losers view: losers matches point to next winner (within losers bracket)
                    return m.winnerNextMatch ?? (m.winnerNextMatchId ? viewById[m.winnerNextMatchId] : undefined);
                }
            }
        };

        Object.values(viewById).forEach(m => {
            const fromPos = positionById.get(m.$id);
            if (!fromPos) return;
            const target = getNextTarget(m);
            if (!target) return;
            const toPos = positionById.get(target.$id);
            if (!toPos) return;
            conns.push({
                fromId: m.$id,
                toId: target.$id,
                x1: START_OFFSET + fromPos.x + CARD_W,
                y1: START_OFFSET + fromPos.y + CARD_H / 2,
                x2: START_OFFSET + toPos.x,
                y2: START_OFFSET + toPos.y + CARD_H / 2,
            });
        });

        setConnections(conns);
    }, [positionById, viewById, isLosersBracket]);

    useEffect(() => { calculateConnections(); }, [calculateConnections]);

    useEffect(() => {
        const handleResize = () => {
            calculateConnections();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [calculateConnections]);

    //

    // Removed BracketNode in absolute layout

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

    const allowEditing = Boolean(canEditMatches && typeof onMatchClick === 'function');
    const allowScoreUpdates = !!onScoreUpdate && !isPreview && !allowEditing;

    const canManageMatch = (match: Match) => {
        if (allowEditing) return true;
        if (!allowScoreUpdates) return false;
        if (!currentUser) return false;
        if (!bracket.canManage && !bracket.isHost) return false;
        if (bracket.isHost) return true;
        return match.referee?.$id === currentUser.$id;
    };

    useEffect(() => {
        if (!allowScoreUpdates) {
            setShowScoreModal(false);
            setSelectedMatch(null);
        }
    }, [allowScoreUpdates]);

    const handleMatchClick = (match: Match) => {
        if (allowEditing) {
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

    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Controls Bar */}
            <Paper withBorder p="sm">
                <Group justify="space-between" align="center" wrap="nowrap" w="100%">
                    <Group gap="xs">
                        <ActionIcon variant="default" onClick={handleZoomOut} disabled={zoomLevel <= 0.5} aria-label="Zoom out">−</ActionIcon>
                        <Badge variant="light">{Math.round(zoomLevel * 100)}%</Badge>
                        <ActionIcon variant="default" onClick={handleZoomIn} disabled={zoomLevel >= 3} aria-label="Zoom in">+</ActionIcon>
                        <Button variant="default" size="xs" onClick={handleZoomReset}>Reset</Button>
                        {isPreview && (
                            <Badge color="yellow" variant="light">Preview</Badge>
                        )}
                        <Text size="xs" c="dimmed" className="hidden md:inline">Ctrl + scroll to zoom • Ctrl + 0 to reset</Text>
                    </Group>

                    <Group gap="sm">
                        {(bracket.tournament.doubleElimination || hasLoserMatches) && (
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
            <div
                ref={scrollContainerRef}
                className="flex-1 min-h-0 overflow-auto bg-white"
            >
                <div
                    ref={contentRef}
                    className="relative inline-block"
                    style={{
                        zoom: zoomLevel, // CSS zoom property
                        width: (fixedSize.width || contentSize.width),
                        height: (fixedSize.height || contentSize.height),
                    }}
                >
                    {/* Absolutely positioned matches */}
                    {Object.values(viewById).length === 0 ? (
                        <Text c="dimmed">No matches</Text>
                    ) : (
                        <>
                            {Object.values(viewById).map((m) => {
                                const pos = positionById.get(m.$id);
                                if (!pos) return null;
                                const manageable = allowEditing || canManageMatch(m);
                                return (
                                    <div
                                        key={m.$id}
                                        ref={el => { matchRefs.current[m.$id] = el; }}
                                        className="absolute w-72 h-50"
                                        style={{ left: START_OFFSET + pos.x, top: START_OFFSET + pos.y }}
                                    >
                                        <MatchCard
                                            match={m}
                                            onClick={manageable ? () => handleMatchClick(m) : undefined}
                                            canManage={manageable}
                                            className="w-full h-full"
                                        />
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* SVG overlay for arrows */}
                    <svg className="pointer-events-none absolute inset-0 z-10" width="100%" height="100%">
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                            </marker>
                        </defs>
                        {connections.map((c) => {
                            const midX = (c.x1 + c.x2) / 2;
                            const d = `M ${c.x1} ${c.y1} L ${midX} ${c.y1} L ${midX} ${c.y2} L ${c.x2} ${c.y2}`;
                            return (
                                <path key={`${c.fromId}-${c.toId}`} d={d} stroke="#94a3b8" strokeWidth="2" fill="none" strokeLinecap="square" markerEnd="url(#arrowhead)" />
                            );
                        })}
                    </svg>
                </div>
            </div>

            {/* Score Update Modal */}
            {allowScoreUpdates && showScoreModal && selectedMatch && (
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
