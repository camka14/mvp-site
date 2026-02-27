'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

import { TournamentBracket, Match, UserData, Division, Team } from '@/types';

import MatchCard from './MatchCard';

import ScoreUpdateModal from './ScoreUpdateModal';
import { xor } from '@/app/utils';
import { Paper, Group, Button, ActionIcon, Text, SegmentedControl, Badge } from '@mantine/core';

type BracketTeamSlot = 'team1' | 'team2';

type PlayoffBracketSlot = {
    matchId: string;
    slot: BracketTeamSlot;
    seed: number | null;
    playoffDivisionId: string;
};

const normalizeDivisionIdentifier = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const divisionsEquivalent = (left: unknown, right: unknown): boolean => {
    const normalizedLeft = normalizeDivisionIdentifier(left);
    const normalizedRight = normalizeDivisionIdentifier(right);
    return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
};

const extractDivisionIdentifier = (value: unknown): string => {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (!value || typeof value !== 'object') {
        return '';
    }
    const row = value as Record<string, unknown>;
    const candidates = [row.id, row.$id, row.key];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return '';
};

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

const normalizeDivisionDetailsList = (input: unknown): Division[] => {
    if (!Array.isArray(input)) {
        return [];
    }
    return input
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const row = entry as Record<string, unknown>;
            const id = extractDivisionIdentifier(row.id ?? row.$id ?? row.key);
            const key = typeof row.key === 'string' ? row.key.trim() : undefined;
            const name = typeof row.name === 'string' ? row.name.trim() : '';
            const playoffPlacementDivisionIds = Array.isArray(row.playoffPlacementDivisionIds)
                ? row.playoffPlacementDivisionIds
                      .map((divisionId) => (typeof divisionId === 'string' ? divisionId.trim() : ''))
                      .filter((divisionId) => divisionId.length > 0)
                : [];
            const playoffTeamCount = typeof row.playoffTeamCount === 'number' && Number.isFinite(row.playoffTeamCount)
                ? Math.max(0, Math.trunc(row.playoffTeamCount))
                : undefined;
            return {
                ...(row as Partial<Division>),
                id: id || key || '',
                key,
                name,
                playoffPlacementDivisionIds,
                playoffTeamCount,
            } as Division;
        })
        .filter((entry): entry is Division => entry !== null);
};

const extractEventDivisionOrder = (divisions: TournamentBracket['tournament']['divisions'] | undefined): string[] => {
    if (!Array.isArray(divisions)) {
        return [];
    }
    return divisions
        .map((division) => extractDivisionIdentifier(division))
        .filter((divisionId) => divisionId.length > 0);
};

const collectAllDivisionDetails = (tournament: TournamentBracket['tournament']): Division[] => {
    const primary = normalizeDivisionDetailsList(tournament.divisionDetails);
    const playoff = normalizeDivisionDetailsList(tournament.playoffDivisionDetails);
    const divisionsFromEvent = normalizeDivisionDetailsList(
        Array.isArray(tournament.divisions)
            ? tournament.divisions.filter((entry) => entry && typeof entry === 'object')
            : [],
    );
    return [...primary, ...playoff, ...divisionsFromEvent];
};

const resolveDivisionDisplayName = (detail: Division, allDivisionDetails: Division[]): string => {
    const explicitName = String(detail.name ?? '').trim();
    if (explicitName.length > 0) {
        return explicitName;
    }

    const fallbackIdentifier = extractDivisionIdentifier(detail);
    if (fallbackIdentifier.length > 0) {
        const matched = allDivisionDetails.find((candidate) =>
            divisionsEquivalent(candidate.id, fallbackIdentifier) ||
            divisionsEquivalent(candidate.key, fallbackIdentifier),
        );
        const matchedName = String(matched?.name ?? '').trim();
        if (matchedName.length > 0) {
            return matchedName;
        }
        return fallbackIdentifier;
    }

    return 'TBD';
};

const orderDivisionDetailsForMappings = (eventDivisionIds: string[], divisionDetails: Division[]): Division[] => {
    if (divisionDetails.length === 0) {
        return [];
    }
    const remaining = [...divisionDetails];
    const ordered: Division[] = [];

    eventDivisionIds.forEach((divisionId) => {
        const matchedIndex = remaining.findIndex((detail) =>
            divisionsEquivalent(detail.id, divisionId) ||
            divisionsEquivalent(detail.key, divisionId),
        );
        if (matchedIndex >= 0) {
            ordered.push(remaining.splice(matchedIndex, 1)[0]);
        }
    });

    return [...ordered, ...remaining];
};

const formatOrdinalPlacement = (position: number): string => {
    const value = Math.max(1, Math.trunc(position || 1));
    const modHundred = value % 100;
    if (modHundred >= 11 && modHundred <= 13) {
        return `${value}th`;
    }
    switch (value % 10) {
        case 1:
            return `${value}st`;
        case 2:
            return `${value}nd`;
        case 3:
            return `${value}rd`;
        default:
            return `${value}th`;
    }
};

const buildMappedPlacementLabelsForPlayoffDivision = (
    playoffDivisionId: string,
    mappingDivisionDetails: Division[],
    allDivisionDetails: Division[],
    eventPlayoffTeamCount?: number,
): string[] => {
    const labels: string[] = [];
    const maxPlacementIndex = mappingDivisionDetails.reduce((maxValue, detail) => {
        const mappedLength = Array.isArray(detail.playoffPlacementDivisionIds)
            ? detail.playoffPlacementDivisionIds.length
            : 0;
        const detailTeamCount = typeof detail.playoffTeamCount === 'number'
            ? Math.max(0, Math.trunc(detail.playoffTeamCount))
            : undefined;
        return Math.max(maxValue, Math.max(mappedLength, detailTeamCount ?? eventPlayoffTeamCount ?? 0));
    }, 0);

    for (let placementIndex = 0; placementIndex < maxPlacementIndex; placementIndex += 1) {
        for (const detail of mappingDivisionDetails) {
            const mappedDivisionIds = Array.isArray(detail.playoffPlacementDivisionIds)
                ? detail.playoffPlacementDivisionIds
                : [];
            const detailTeamCount = typeof detail.playoffTeamCount === 'number'
                ? Math.max(0, Math.trunc(detail.playoffTeamCount))
                : undefined;
            const placementLimit = detailTeamCount ?? eventPlayoffTeamCount ?? mappedDivisionIds.length;
            if (placementIndex >= placementLimit) {
                continue;
            }
            const mappedPlayoffDivisionId = mappedDivisionIds[placementIndex] ?? '';
            if (!divisionsEquivalent(mappedPlayoffDivisionId, playoffDivisionId)) {
                continue;
            }
            labels.push(
                `${formatOrdinalPlacement(placementIndex + 1)} place (${resolveDivisionDisplayName(detail, allDivisionDetails)})`,
            );
        }
    }

    return labels;
};

const buildLeaguePlayoffPlaceholderAssignments = ({
    eventDivisionIds,
    divisionDetails,
    allDivisionDetails,
    eventPlayoffTeamCount,
    slots,
}: {
    eventDivisionIds: string[];
    divisionDetails: Division[];
    allDivisionDetails: Division[];
    eventPlayoffTeamCount?: number;
    slots: PlayoffBracketSlot[];
}): Record<string, string> => {
    if (divisionDetails.length === 0 || slots.length === 0) {
        return {};
    }

    const orderedDetails = orderDivisionDetailsForMappings(eventDivisionIds, divisionDetails).filter((detail) =>
        Array.isArray(detail.playoffPlacementDivisionIds) &&
        detail.playoffPlacementDivisionIds.some((divisionId) => normalizeDivisionIdentifier(divisionId).length > 0),
    );

    if (orderedDetails.length === 0) {
        return {};
    }

    const slotsByPlayoffDivision = new Map<string, PlayoffBracketSlot[]>();
    slots.forEach((slot) => {
        const normalizedPlayoffDivisionId = normalizeDivisionIdentifier(slot.playoffDivisionId);
        if (normalizedPlayoffDivisionId.length === 0) {
            return;
        }
        const existing = slotsByPlayoffDivision.get(normalizedPlayoffDivisionId) ?? [];
        existing.push(slot);
        slotsByPlayoffDivision.set(normalizedPlayoffDivisionId, existing);
    });
    if (slotsByPlayoffDivision.size === 0) {
        return {};
    }

    const result: Record<string, string> = {};
    slotsByPlayoffDivision.forEach((divisionSlots, playoffDivisionId) => {
        const labels = buildMappedPlacementLabelsForPlayoffDivision(
            playoffDivisionId,
            orderedDetails,
            allDivisionDetails,
            eventPlayoffTeamCount,
        );
        if (labels.length === 0) {
            return;
        }
        divisionSlots.forEach((slot) => {
            if (typeof slot.seed !== 'number' || !Number.isFinite(slot.seed) || slot.seed < 1) {
                return;
            }
            const label = labels[slot.seed - 1];
            if (!label) {
                return;
            }
            result[`${slot.matchId}:${slot.slot}`] = label;
        });
    });

    return result;
};


interface TournamentBracketViewProps {
    bracket: TournamentBracket;
    onScoreUpdate?: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
    currentUser?: UserData;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    isPreview?: boolean;
    onMatchClick?: (match: Match) => void;
    canEditMatches?: boolean;
    showDateOnMatches?: boolean;
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
    showDateOnMatches = false,
}: TournamentBracketViewProps) {
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [showScoreModal, setShowScoreModal] = useState(false);
    // Zoom state - using CSS zoom instead of transform
    const [zoomLevel, setZoomLevel] = useState(1);
    const rootRef = useRef<HTMLDivElement>(null);
    const [viewportHeight, setViewportHeight] = useState<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isLosersBracket, setIsLosersBracket] = useState(false);
    const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const contentRef = useRef<HTMLDivElement>(null);
    const [connections, setConnections] = useState<{ fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
    const matchesById = useMemo<Record<string, Match>>(
        () => Object.fromEntries(Object.values(bracket.matches).map((match) => [match.$id, match])),
        [bracket.matches],
    );
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
    const refereesById = useMemo<Map<string, UserData>>(() => {
        const map = new Map<string, UserData>();
        const refs = Array.isArray((bracket.tournament as any)?.referees)
            ? ((bracket.tournament as any).referees as UserData[])
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
    const leaguePlayoffPlaceholderAssignments = useMemo<Record<string, string>>(() => {
        const eventDivisionIds = extractEventDivisionOrder(bracket.tournament.divisions);
        const allDivisionDetails = collectAllDivisionDetails(bracket.tournament);
        const divisionDetails = (() => {
            const explicit = normalizeDivisionDetailsList(bracket.tournament.divisionDetails);
            if (explicit.length > 0) {
                return explicit;
            }
            return allDivisionDetails;
        })();
        if (divisionDetails.length === 0) {
            return {};
        }

        const slots: PlayoffBracketSlot[] = [];
        Object.values(bracket.matches).forEach((match) => {
            if (match.losersBracket) {
                return;
            }
            const playoffDivisionId = extractDivisionIdentifier(match.division);
            if (playoffDivisionId.length === 0) {
                return;
            }
            const leftEntrantSlot = !(
                match.previousLeftMatch ||
                match.previousLeftId
            );
            const rightEntrantSlot = !(
                match.previousRightMatch ||
                match.previousRightId
            );
            if (!leftEntrantSlot && !rightEntrantSlot) {
                return;
            }
            const team1Seed = typeof match.team1Seed === 'number'
                ? match.team1Seed
                : null;
            const team2Seed = typeof match.team2Seed === 'number'
                ? match.team2Seed
                : null;
            if (leftEntrantSlot) {
                slots.push({ matchId: match.$id, slot: 'team1', seed: team1Seed, playoffDivisionId });
            }
            if (rightEntrantSlot) {
                slots.push({ matchId: match.$id, slot: 'team2', seed: team2Seed, playoffDivisionId });
            }
        });
        if (slots.length === 0) {
            return {};
        }

        const eventPlayoffTeamCount = typeof bracket.tournament.playoffTeamCount === 'number' &&
            Number.isFinite(bracket.tournament.playoffTeamCount)
            ? Math.max(0, Math.trunc(bracket.tournament.playoffTeamCount))
            : undefined;

        return buildLeaguePlayoffPlaceholderAssignments({
            eventDivisionIds,
            divisionDetails,
            allDivisionDetails,
            eventPlayoffTeamCount,
            slots,
        });
    }, [bracket.matches, bracket.tournament]);

    // Compute positions based on rounds (x) and yCenterById (y)
    const CARD_W = 288; // w-72
    const CARD_H = 200; // standard height (h-50)
    const GAP_X = 48;
    const GAP_Y = 12;   // per-level extra spacing
    const LEVEL_STEP = Math.round(CARD_H / 2 + GAP_Y);
    // Padding inside the scroll canvas. Top padding prevents the time badge (-top-3)
    // from being clipped, and bottom padding keeps the last match card from touching the edge.
    const PAD_LEFT = 0;
    const PAD_RIGHT = 0;
    const PAD_TOP = 16;
    const PAD_BOTTOM = 48;

    // Map if needed in future: const matchesById = useMemo(() => Object.fromEntries(bracket.matches.map(m => [m.$id, m])), [bracket.matches]);

    // Subset of matches for current view, plus one-hop children from the opposite bracket
    const viewById = useMemo(() => {
        const map: Record<string, Match> = {};

        // include all matches in current bracket
        Object.values(bracket.matches).forEach(m => {
            if (m.losersBracket === isLosersBracket) {
                map[m.$id] = m;
            }
        });

        // include one-hop children even if from opposite bracket
        Object.values(map).forEach(parent => {
            const left = parent.previousLeftMatch ?? (parent.previousLeftId ? matchesById[parent.previousLeftId] : undefined);
            const right = parent.previousRightMatch ?? (parent.previousRightId ? matchesById[parent.previousRightId] : undefined);
            if (left) map[left.$id] = left;
            if (right) map[right.$id] = right;
        });

        const filteredEntries = Object.entries(map).filter(([, match]) => {
            const hasPrevious =
                Boolean(match.previousLeftMatch) ||
                Boolean(match.previousRightMatch) ||
                Boolean(match.previousLeftId && matchesById[match.previousLeftId]) ||
                Boolean(match.previousRightId && matchesById[match.previousRightId]);

            const hasNext =
                Boolean(match.winnerNextMatch) ||
                Boolean(match.winnerNextMatchId && matchesById[match.winnerNextMatchId]) ||
                Boolean(match.loserNextMatch) ||
                Boolean(match.loserNextMatchId && matchesById[match.loserNextMatchId]);

            return hasPrevious || hasNext;
        });

        return Object.fromEntries(filteredEntries);
    }, [bracket.matches, isLosersBracket, matchesById]);

    const hasLoserMatches = useMemo(
        () => Object.values(bracket.matches).some(match => match.losersBracket),
        [bracket.matches],
    );

    useEffect(() => {
        if (isLosersBracket && !hasLoserMatches) {
            setIsLosersBracket(false);
        }
    }, [hasLoserMatches, isLosersBracket]);

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
    }, [rootId, viewById, getChildrenLimited, pairDepthById, LEVEL_STEP]);

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
        return {
            width: Math.max(0, maxX) + PAD_LEFT + PAD_RIGHT,
            height: Math.max(0, maxY) + PAD_TOP + PAD_BOTTOM,
        };
    }, [positionById]);

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
                x1: PAD_LEFT + fromPos.x + CARD_W,
                y1: PAD_TOP + fromPos.y + CARD_H / 2,
                x2: PAD_LEFT + toPos.x,
                y2: PAD_TOP + toPos.y + CARD_H / 2,
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

    const canManageMatch = (match: Match) => {
        if (allowEditing) return true;
        if (!allowScoreUpdates) return false;
        if (!currentUser) return false;
        if (!bracket.canManage && !bracket.isHost) return false;
        if (bracket.isHost) return true;
        if (match.refereeId && match.refereeId === currentUser.$id) {
            return true;
        }
        const teamRefPlayers = match.teamReferee?.playerIds || [];
        return teamRefPlayers.includes(currentUser.$id);
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
            <div
                ref={scrollContainerRef}
                className="flex-1 min-h-0 overflow-auto bg-white"
            >
                <div
                    ref={contentRef}
                    className="relative inline-block"
                    style={{
                        zoom: zoomLevel, // CSS zoom property
                        width: contentSize.width,
                        height: contentSize.height,
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
                                    const team1Id = extractEntityId((m as any).team1)
                                        || (typeof m.team1Id === 'string' ? m.team1Id.trim() : '');
                                    const team2Id = extractEntityId((m as any).team2)
                                        || (typeof m.team2Id === 'string' ? m.team2Id.trim() : '');
                                    const teamRefereeId = extractEntityId((m as any).teamReferee)
                                        || (typeof m.teamRefereeId === 'string' ? m.teamRefereeId.trim() : '');
                                    const refereeId = extractEntityId((m as any).referee)
                                        || (typeof m.refereeId === 'string' ? m.refereeId.trim() : '');
                                    const resolvedTeam1 = (m.team1 && typeof m.team1 === 'object')
                                        ? m.team1
                                        : (team1Id ? teamsById.get(team1Id) ?? null : null);
                                    const resolvedTeam2 = (m.team2 && typeof m.team2 === 'object')
                                        ? m.team2
                                        : (team2Id ? teamsById.get(team2Id) ?? null : null);
                                    const resolvedTeamReferee = (m.teamReferee && typeof m.teamReferee === 'object')
                                        ? m.teamReferee
                                        : (teamRefereeId ? teamsById.get(teamRefereeId) ?? null : null);
                                    const resolvedReferee = (m.referee && typeof m.referee === 'object')
                                        ? m.referee
                                        : (refereeId ? refereesById.get(refereeId) ?? null : null);
	                                    const resolvedMatch: Match = {
	                                        ...m,
                                        team1: resolvedTeam1 as Match['team1'],
                                        team2: resolvedTeam2 as Match['team2'],
                                        teamReferee: resolvedTeamReferee as Match['teamReferee'],
                                        referee: resolvedReferee as Match['referee'],
                                        team1Id: team1Id || m.team1Id || undefined,
                                        team2Id: team2Id || m.team2Id || undefined,
                                        teamRefereeId: teamRefereeId || m.teamRefereeId || undefined,
                                        refereeId: refereeId || m.refereeId || undefined,
	                                        previousLeftMatch:
	                                            m.previousLeftMatch ??
	                                            (m.previousLeftId ? matchesById[m.previousLeftId] : undefined),
	                                        previousRightMatch:
	                                            m.previousRightMatch ??
                                            (m.previousRightId ? matchesById[m.previousRightId] : undefined),
                                    };
	                                const canInternalManage = canManageMatch(resolvedMatch);
	                                const clickable = hasExternalMatchClick || canInternalManage;
	                                const manageHint = allowEditing || (!hasExternalMatchClick && canInternalManage);
                                    const team1Placeholder = leaguePlayoffPlaceholderAssignments[`${resolvedMatch.$id}:team1`];
                                    const team2Placeholder = leaguePlayoffPlaceholderAssignments[`${resolvedMatch.$id}:team2`];
	                                return (
	                                    <div
	                                        key={m.$id}
                                        ref={(el) => { matchRefs.current[m.$id] = el; }}
                                        className="absolute w-72 h-50"
                                        style={{ left: PAD_LEFT + pos.x, top: PAD_TOP + pos.y }}
                                    >
	                                        <MatchCard
	                                            match={resolvedMatch}
	                                            onClick={clickable ? () => handleMatchClick(resolvedMatch) : undefined}
	                                            canManage={manageHint}
	                                            className="w-full h-full"
	                                            showDate={showDateOnMatches}
                                                team1Placeholder={team1Placeholder}
                                                team2Placeholder={team2Placeholder}
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
                />
            )}
        </div>
    );
}
