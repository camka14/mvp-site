'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

import { TournamentBracket, MatchWithRelations } from '../types/tournament';

import { UserData } from '@/types';

import MatchCard from './MatchCard';

import ScoreUpdateModal from '../[id]/bracket/components/ScoreUpdateModal';
import { xor } from '@/app/uitl';


interface TournamentBracketViewProps {
    bracket: TournamentBracket;
    onScoreUpdate: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
    onMatchUpdate: (matchId: string, updates: Partial<MatchWithRelations>) => Promise<void>;
    currentUser?: UserData;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
}

export default function TournamentBracketView({
    bracket,
    onScoreUpdate,
    onMatchUpdate,
    currentUser,
    isExpanded,
    onToggleExpand,
}: TournamentBracketViewProps) {
    const [selectedMatch, setSelectedMatch] = useState<MatchWithRelations | null>(null);
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
    const GAP_Y = 8;   // per-level extra spacing
    const LEVEL_STEP = Math.round(CARD_H / 2 + GAP_Y);
    const START_OFFSET = 16; // initial x/y offset from top-left

    // Map if needed in future: const matchesById = useMemo(() => Object.fromEntries(bracket.matches.map(m => [m.$id, m])), [bracket.matches]);

    // Subset of matches for current view, plus one-hop children from the opposite bracket
    const viewById = useMemo(() => {
        const map: Record<string, MatchWithRelations> = {};
        // include all matches in current bracket
        bracket.matches.forEach(m => { if (m.losersBracket === isLosersBracket) map[m.$id] = m; });
        // include one-hop children even if from opposite bracket
        const idToMatch: Record<string, MatchWithRelations> = Object.fromEntries(bracket.matches.map(m => [m.$id, m]));
        Object.values(map).forEach(parent => {
            const left = parent.previousLeftMatch ?? (parent.previousLeftId ? idToMatch[parent.previousLeftId] : undefined);
            const right = parent.previousRightMatch ?? (parent.previousRightId ? idToMatch[parent.previousRightId] : undefined);
            if (left) map[left.$id] = left;
            if (right) map[right.$id] = right;
        });
        return map;
    }, [bracket.matches, isLosersBracket]);

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
    const getChildrenLimited = useCallback((m: MatchWithRelations): MatchWithRelations[] => {
        const left = m.previousLeftMatch ?? (m.previousLeftId ? viewById[m.previousLeftId] : undefined);
        const right = m.previousRightMatch ?? (m.previousRightId ? viewById[m.previousRightId] : undefined);
        const children: MatchWithRelations[] = [];
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

        const getNextTarget = (m: MatchWithRelations): MatchWithRelations | undefined => {
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
        <div className="h-full flex flex-col min-h-0">
            {/* Controls Bar */}
            <div className="flex justify-between items-center p-4 bg-gray-50 border-b">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleZoomOut}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-sm font-medium"
                        disabled={zoomLevel <= 0.5}
                    >
                        -
                    </button>
                    <span className="min-w-[60px] text-center text-sm font-mono bg-white px-2 py-1.5 border border-gray-300 rounded-md">
                        {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                        onClick={handleZoomIn}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-sm font-medium"
                        disabled={zoomLevel >= 3}
                    >
                        +
                    </button>
                    <button
                        onClick={handleZoomReset}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-sm"
                    >
                        Reset
                    </button>
                    <span className="text-xs text-gray-500 ml-2">
                        Ctrl + scroll to zoom • Ctrl + 0 to reset
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {bracket.tournament.doubleElimination && (
                        <div className="flex gap-2">
                            <button
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${!isLosersBracket
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                                    }`}
                                onClick={() => setIsLosersBracket(false)}
                                aria-pressed={!isLosersBracket}
                            >
                                Winners Bracket
                            </button>
                            <button
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${isLosersBracket
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                                    }`}
                                onClick={() => setIsLosersBracket(true)}
                                aria-pressed={isLosersBracket}
                            >
                                Losers Bracket
                            </button>
                        </div>
                    )}
                    <button
                        onClick={onToggleExpand}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-sm"
                        aria-pressed={!!isExpanded}
                        title={isExpanded ? 'Collapse view' : 'Expand view'}
                    >
                        {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                </div>
            </div>

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
                        <div className="text-gray-500">No matches</div>
                    ) : (
                        <>
                            {Object.values(viewById).map((m) => {
                                const pos = positionById.get(m.$id);
                                if (!pos) return null;
                                return (
                                    <div
                                        key={m.$id}
                                        ref={el => { matchRefs.current[m.$id] = el; }}
                                        className="absolute w-72 h-50"
                                        style={{ left: START_OFFSET + pos.x, top: START_OFFSET + pos.y }}
                                    >
                                        <MatchCard
                                            match={m}
                                            onClick={() => handleMatchClick(m)}
                                            canManage={canManageMatch(m)}
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
