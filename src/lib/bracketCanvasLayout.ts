import { getBracketMatchId, type BracketMatchLike } from '@/lib/bracketViewCore';

export type BracketCanvasMatchLike = BracketMatchLike & {
  losersBracket?: boolean | null;
};

export type BracketCanvasMetrics = {
  cardWidth: number;
  cardHeight: number;
  gapX: number;
  gapY: number;
  levelStep: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
};

export type BracketCanvasPosition = {
  x: number;
  y: number;
  round: number;
  level: number;
};

export type BracketCanvasContentSize = {
  width: number;
  height: number;
};

export type BracketCanvasConnection = {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type BracketCanvasLayoutResult<T extends BracketCanvasMatchLike> = {
  metrics: BracketCanvasMetrics;
  rootId: string | null;
  viewById: Record<string, T>;
  treeById: Record<string, T>;
  connectedMatchIds: string[];
  traversedMatchIds: string[];
  unplacedMatchIds: string[];
  positionById: Record<string, BracketCanvasPosition>;
  contentSize: BracketCanvasContentSize;
  connections: BracketCanvasConnection[];
};

export const DEFAULT_BRACKET_CANVAS_METRICS: BracketCanvasMetrics = {
  cardWidth: 288,
  cardHeight: 200,
  gapX: 48,
  gapY: 12,
  levelStep: Math.round(200 / 2 + 12),
  paddingLeft: 28,
  paddingRight: 28,
  paddingTop: 16,
  paddingBottom: 48,
};

const normalizeMatchRefId = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const extractEntityId = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  return getBracketMatchId(value as BracketMatchLike) ?? '';
};

const resolveMatchRefId = (idValue: unknown, relationValue: unknown): string => {
  const explicit = normalizeMatchRefId(idValue);
  if (explicit) {
    return explicit;
  }
  return extractEntityId(relationValue);
};

type MatchLinkResolver<T extends BracketCanvasMatchLike> = (
  idValue: unknown,
  relationValue: unknown,
) => T | undefined;

const collectUniqueChildren = <T extends BracketCanvasMatchLike>(
  match: T,
  resolveLink: MatchLinkResolver<T>,
): T[] => {
  const left = resolveLink(match.previousLeftId, match.previousLeftMatch);
  const right = resolveLink(match.previousRightId, match.previousRightMatch);
  const children: T[] = [];
  if (left) {
    children.push(left);
  }
  if (right) {
    const rightId = extractEntityId(right);
    const leftId = left ? extractEntityId(left) : '';
    if (!left || !rightId || rightId !== leftId) {
      children.push(right);
    }
  }
  return children;
};

const collectLosersChildrenByNextLinks = <T extends BracketCanvasMatchLike>(
  match: T,
  matchesById: Record<string, T>,
): T[] => (
  Object.values(matchesById)
    .filter((candidate) => {
      const candidateId = extractEntityId(candidate);
      const matchId = extractEntityId(match);
      if (!candidateId || candidateId === matchId) {
        return false;
      }
      const nextId = candidate.losersBracket
        ? resolveMatchRefId(candidate.winnerNextMatchId, candidate.winnerNextMatch)
        : resolveMatchRefId(candidate.loserNextMatchId, candidate.loserNextMatch);
      return nextId === matchId;
    })
    .sort((left, right) => {
      const leftMatchId = typeof left.matchId === 'number' ? left.matchId : Number.NEGATIVE_INFINITY;
      const rightMatchId = typeof right.matchId === 'number' ? right.matchId : Number.NEGATIVE_INFINITY;
      if (leftMatchId !== rightMatchId) {
        return rightMatchId - leftMatchId;
      }
      return extractEntityId(left).localeCompare(extractEntityId(right));
    })
);

const collectLosersChildren = <T extends BracketCanvasMatchLike>(
  match: T,
  resolveLink: MatchLinkResolver<T>,
  matchesById: Record<string, T>,
): T[] => {
  const orderedUnique = new Map<string, T>();
  const nextLinkedChildren = collectLosersChildrenByNextLinks(match, matchesById);

  nextLinkedChildren.forEach((child) => {
    const childId = extractEntityId(child);
    if (childId && !orderedUnique.has(childId)) {
      orderedUnique.set(childId, child);
    }
  });

  collectUniqueChildren(match, resolveLink).forEach((child) => {
    const childId = extractEntityId(child);
    if (!childId || orderedUnique.has(childId)) {
      return;
    }

    const winnerNextId = resolveMatchRefId(child.winnerNextMatchId, child.winnerNextMatch);
    const loserNextId = resolveMatchRefId(child.loserNextMatchId, child.loserNextMatch);
    const losersRouteTargetId = child.losersBracket ? winnerNextId : loserNextId;
    const pointsElsewhereInLosersView = losersRouteTargetId.length > 0 && losersRouteTargetId !== extractEntityId(match);

    if (!pointsElsewhereInLosersView) {
      orderedUnique.set(childId, child);
    }
  });

  return Array.from(orderedUnique.values()).slice(0, 2);
};

const selectLoserTraversalChildren = <T extends BracketCanvasMatchLike>(children: T[]): T[] => {
  if (children.length <= 1) {
    return children;
  }
  const loserChildren = children.filter((child) => child.losersBracket);
  if (loserChildren.length === 0) {
    return children;
  }
  return loserChildren;
};

const toMetrics = (overrides?: Partial<BracketCanvasMetrics>): BracketCanvasMetrics => {
  const cardWidth = overrides?.cardWidth ?? DEFAULT_BRACKET_CANVAS_METRICS.cardWidth;
  const cardHeight = overrides?.cardHeight ?? DEFAULT_BRACKET_CANVAS_METRICS.cardHeight;
  const gapX = overrides?.gapX ?? DEFAULT_BRACKET_CANVAS_METRICS.gapX;
  const gapY = overrides?.gapY ?? DEFAULT_BRACKET_CANVAS_METRICS.gapY;
  return {
    cardWidth,
    cardHeight,
    gapX,
    gapY,
    levelStep: overrides?.levelStep ?? Math.round(cardHeight / 2 + gapY),
    paddingLeft: overrides?.paddingLeft ?? DEFAULT_BRACKET_CANVAS_METRICS.paddingLeft,
    paddingRight: overrides?.paddingRight ?? DEFAULT_BRACKET_CANVAS_METRICS.paddingRight,
    paddingTop: overrides?.paddingTop ?? DEFAULT_BRACKET_CANVAS_METRICS.paddingTop,
    paddingBottom: overrides?.paddingBottom ?? DEFAULT_BRACKET_CANVAS_METRICS.paddingBottom,
  };
};

const buildRecordFromEntries = <T extends BracketCanvasMatchLike>(entries: Array<[string, T]>): Record<string, T> => (
  Object.fromEntries(entries) as Record<string, T>
);

export const buildBracketCanvasLayout = <T extends BracketCanvasMatchLike>(
  matchesById: Record<string, T>,
  options: {
    isLosersBracket: boolean;
    rootMatchId?: string | null;
    metrics?: Partial<BracketCanvasMetrics>;
    allowRelationFallbackWhenIdBlank?: boolean;
  },
): BracketCanvasLayoutResult<T> => {
  const metrics = toMetrics(options.metrics);
  const {
    cardWidth,
    cardHeight,
    gapX,
    levelStep,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
  } = metrics;
  const isLosersBracket = options.isLosersBracket;
  const allowRelationFallbackWhenIdBlank = options.allowRelationFallbackWhenIdBlank ?? false;

  const resolveLinkFromAll: MatchLinkResolver<T> = (idValue, relationValue) => {
    const id = normalizeMatchRefId(idValue);
    if (id && matchesById[id]) {
      return matchesById[id];
    }
    if (
      !allowRelationFallbackWhenIdBlank
      && (idValue === null || (typeof idValue === 'string' && idValue.trim().length === 0))
    ) {
      return undefined;
    }
    const relationId = extractEntityId(relationValue);
    if (relationId && matchesById[relationId]) {
      return matchesById[relationId];
    }
    return undefined;
  };

  const viewById = (() => {
    if (isLosersBracket) {
      const filteredEntries = Object.entries(matchesById).filter(([, match]) => {
        const hasPrevious =
          Boolean(resolveLinkFromAll(match.previousLeftId, match.previousLeftMatch))
          || Boolean(resolveLinkFromAll(match.previousRightId, match.previousRightMatch));
        const hasNext =
          Boolean(resolveLinkFromAll(match.winnerNextMatchId, match.winnerNextMatch))
          || Boolean(resolveLinkFromAll(match.loserNextMatchId, match.loserNextMatch));
        return hasPrevious || hasNext;
      });
      return buildRecordFromEntries(filteredEntries);
    }

    const map: Record<string, T> = {};
    Object.values(matchesById).forEach((match) => {
      if (match.losersBracket === isLosersBracket) {
        const matchId = extractEntityId(match);
        if (matchId) {
          map[matchId] = match;
        }
      }
    });

    Object.values(map).forEach((parent) => {
      const children = collectUniqueChildren(parent, resolveLinkFromAll);
      children.forEach((child) => {
        const childId = extractEntityId(child);
        if (childId) {
          map[childId] = child;
        }
      });
    });

    const filteredEntries = Object.entries(map).filter(([, match]) => {
      const hasPrevious =
        Boolean(resolveLinkFromAll(match.previousLeftId, match.previousLeftMatch))
        || Boolean(resolveLinkFromAll(match.previousRightId, match.previousRightMatch));
      const hasNext =
        Boolean(resolveLinkFromAll(match.winnerNextMatchId, match.winnerNextMatch))
        || Boolean(resolveLinkFromAll(match.loserNextMatchId, match.loserNextMatch));
      return hasPrevious || hasNext;
    });

    return buildRecordFromEntries(filteredEntries);
  })();

  const resolveLinkFromView: MatchLinkResolver<T> = (idValue, relationValue) => {
    const id = normalizeMatchRefId(idValue);
    if (id && viewById[id]) {
      return viewById[id];
    }
    const hasExplicitId = typeof idValue === 'string' && idValue.trim().length > 0;
    if (!hasExplicitId && !allowRelationFallbackWhenIdBlank) {
      return undefined;
    }
    const relationId = extractEntityId(relationValue);
    if (relationId && viewById[relationId]) {
      return viewById[relationId];
    }
    return undefined;
  };

  const terminalIds = Object.values(viewById)
    .filter((match) => match.losersBracket === isLosersBracket)
    .filter((match) => {
      const winnerNext = resolveLinkFromView(match.winnerNextMatchId, match.winnerNextMatch);
      return !winnerNext || winnerNext.losersBracket !== isLosersBracket;
    })
    .map((match) => extractEntityId(match))
    .filter(Boolean);

  const tournamentRootIds = isLosersBracket
    ? Object.values(viewById)
        .filter((match) => {
          const winnerNext = resolveLinkFromView(match.winnerNextMatchId, match.winnerNextMatch);
          const loserNext = resolveLinkFromView(match.loserNextMatchId, match.loserNextMatch);
          return !winnerNext && !loserNext;
        })
        .map((match) => extractEntityId(match))
        .filter(Boolean)
    : [];

  const rootId = (() => {
    const explicitRoot = options.rootMatchId ? options.rootMatchId.trim() : '';
    if (explicitRoot && viewById[explicitRoot]) {
      return explicitRoot;
    }

    const candidateIds = isLosersBracket && tournamentRootIds.length > 0
      ? tournamentRootIds
      : terminalIds;
    let best: string | null = null;
    let bestMatchId = Number.NEGATIVE_INFINITY;
    candidateIds.forEach((candidateId) => {
      const match = viewById[candidateId];
      const key = typeof match?.matchId === 'number' ? match.matchId : 0;
      if (key > bestMatchId || (key === bestMatchId && (!best || candidateId.localeCompare(best) < 0))) {
        best = candidateId;
        bestMatchId = key;
      }
    });
    return best;
  })();

  const treeConnectivity = (() => {
    const connectedIds = new Set<string>();
    const traversedIds = new Set<string>();
    if (!rootId) {
      return { connectedIds, traversedIds };
    }

    const visitWinners = (id: string) => {
      if (traversedIds.has(id)) {
        return;
      }
      traversedIds.add(id);
      connectedIds.add(id);
      const match = viewById[id];
      if (!match || match.losersBracket !== isLosersBracket) {
        return;
      }
      const children = collectUniqueChildren(match, resolveLinkFromView);
      children.forEach((child) => {
        const childId = extractEntityId(child);
        if (childId) {
          visitWinners(childId);
        }
      });
    };

    const visitLosers = (id: string) => {
      if (traversedIds.has(id)) {
        return;
      }
      traversedIds.add(id);
      const match = viewById[id];
      if (!match) {
        return;
      }
      connectedIds.add(id);
      const children = collectLosersChildren(match, resolveLinkFromView, viewById);
      children.forEach((child) => {
        const childId = extractEntityId(child);
        if (childId) {
          connectedIds.add(childId);
        }
      });
      const nextChildren = selectLoserTraversalChildren(children);
      nextChildren.forEach((child) => {
        const childId = extractEntityId(child);
        if (childId) {
          visitLosers(childId);
        }
      });
    };

    if (isLosersBracket) {
      visitLosers(rootId);
    } else {
      visitWinners(rootId);
    }
    return { connectedIds, traversedIds };
  })();

  const connectedMatchIds = Array.from(treeConnectivity.connectedIds);
  const traversedMatchIds = Array.from(treeConnectivity.traversedIds);

  const treeById = treeConnectivity.connectedIds.size
    ? buildRecordFromEntries(
        Object.entries(viewById).filter(([id]) => treeConnectivity.connectedIds.has(id)),
      )
    : {};

  const unplacedMatchIds = Object.values(viewById)
    .filter((match) => {
      const matchId = extractEntityId(match);
      if (!matchId) {
        return false;
      }
      if (treeConnectivity.connectedIds.has(matchId)) {
        return false;
      }
      if (isLosersBracket) {
        return true;
      }
      return match.losersBracket === isLosersBracket;
    })
    .sort((left, right) => {
      const leftMatchId = typeof left.matchId === 'number' ? left.matchId : Number.NEGATIVE_INFINITY;
      const rightMatchId = typeof right.matchId === 'number' ? right.matchId : Number.NEGATIVE_INFINITY;
      if (leftMatchId !== rightMatchId) {
        return rightMatchId - leftMatchId;
      }
      return extractEntityId(left).localeCompare(extractEntityId(right));
    })
    .map((match) => extractEntityId(match))
    .filter(Boolean);

  const resolveLinkFromTree: MatchLinkResolver<T> = (idValue, relationValue) => {
    const id = normalizeMatchRefId(idValue);
    if (id && treeById[id]) {
      return treeById[id];
    }
    const hasExplicitId = typeof idValue === 'string' && idValue.trim().length > 0;
    if (!hasExplicitId && !allowRelationFallbackWhenIdBlank) {
      return undefined;
    }
    const relationId = extractEntityId(relationValue);
    if (relationId && treeById[relationId]) {
      return treeById[relationId];
    }
    return undefined;
  };

  const getChildrenLimited = (match: T): T[] => {
    if (isLosersBracket) {
      const matchId = extractEntityId(match);
      if (!matchId || !treeConnectivity.traversedIds.has(matchId)) {
        return [];
      }
      return collectLosersChildren(match, resolveLinkFromTree, treeById);
    }
    const children = collectUniqueChildren(match, resolveLinkFromTree);
    if (match.losersBracket !== isLosersBracket) {
      return [];
    }
    return children;
  };

  const roundIndexById = (() => {
    const depth = new Map<string, number>();
    if (!rootId) {
      return depth;
    }
    const visit = (id: string, depthValue: number) => {
      const current = depth.get(id);
      if (current !== undefined && current <= depthValue) {
        return;
      }
      depth.set(id, depthValue);
      const match = treeById[id];
      if (!match) {
        return;
      }
      const children = getChildrenLimited(match);
      children.forEach((child) => {
        const childId = extractEntityId(child);
        if (childId) {
          visit(childId, depthValue + 1);
        }
      });
    };
    visit(rootId, 0);
    let maxDepth = 0;
    depth.forEach((value) => {
      if (value > maxDepth) {
        maxDepth = value;
      }
    });
    const rounds = new Map<string, number>();
    depth.forEach((value, id) => {
      rounds.set(id, maxDepth - value);
    });
    Object.keys(treeById).forEach((id) => {
      if (!rounds.has(id)) {
        rounds.set(id, 0);
      }
    });
    return rounds;
  })();

  const pairDepthById = (() => {
    const memo = new Map<string, number>();
    const dfs = (id: string): number => {
      const existing = memo.get(id);
      if (typeof existing === 'number') {
        return existing;
      }
      const match = treeById[id];
      if (!match) {
        memo.set(id, 0);
        return 0;
      }
      const kids = getChildrenLimited(match);
      if (kids.length === 0) {
        memo.set(id, 0);
        return 0;
      }
      if (kids.length === 1) {
        const childId = extractEntityId(kids[0]);
        const value = childId ? dfs(childId) : 0;
        memo.set(id, value);
        return value;
      }

      const leftId = extractEntityId(kids[0]);
      const rightId = extractEntityId(kids[1]);
      const leftHasKids = leftId ? getChildrenLimited(kids[0]).length > 0 : false;
      const rightHasKids = rightId ? getChildrenLimited(kids[1]).length > 0 : false;
      const value = 1 + Math.max(
        leftId ? dfs(leftId) : 0,
        rightId ? dfs(rightId) : 0,
      ) - ((leftHasKids && !rightHasKids) || (!leftHasKids && rightHasKids) ? 0.5 : 0);
      memo.set(id, value);
      return value;
    };

    Object.keys(treeById).forEach((id) => {
      dfs(id);
    });
    return memo;
  })();

  const yCenterById = (() => {
    const centers = new Map<string, number>();
    if (!rootId) {
      return centers;
    }
    const visit = (id: string, center: number) => {
      centers.set(id, center);
      const match = treeById[id];
      if (!match) {
        return;
      }
      const kids = getChildrenLimited(match);
      if (kids.length === 1) {
        const onlyId = extractEntityId(kids[0]);
        if (onlyId && !centers.has(onlyId)) {
          visit(onlyId, center);
        }
        return;
      }
      if (kids.length !== 2) {
        return;
      }

      const left = kids[0];
      const right = kids[1];
      const leftId = extractEntityId(left);
      const rightId = extractEntityId(right);
      if (!leftId || !rightId) {
        return;
      }
      const nLeft = Math.round(pairDepthById.get(leftId) ?? 0);
      const nRight = Math.round(pairDepthById.get(rightId) ?? 0);
      const n = Math.max(nLeft, nRight);
      let delta = (n ? (2 * n) : 1) * levelStep;
      if (getChildrenLimited(left).length === 0) {
        delta = levelStep;
      }
      if (getChildrenLimited(right).length === 0) {
        delta = levelStep;
      }

      if (!centers.has(leftId)) {
        visit(leftId, center - delta);
      }
      if (!centers.has(rightId)) {
        visit(rightId, center + delta);
      }
    };
    visit(rootId, 0);
    return centers;
  })();

  const positionByIdMap = (() => {
    const positions = new Map<string, BracketCanvasPosition>();
    if (!rootId) {
      return positions;
    }
    let minCenter = Number.POSITIVE_INFINITY;
    yCenterById.forEach((center) => {
      if (center < minCenter) {
        minCenter = center;
      }
    });
    if (!Number.isFinite(minCenter)) {
      minCenter = 0;
    }
    Object.keys(treeById).forEach((id) => {
      const round = roundIndexById.get(id) ?? 0;
      const center = yCenterById.get(id) ?? 0;
      const y = center - minCenter;
      positions.set(id, {
        x: round * (cardWidth + gapX),
        y,
        round,
        level: 0,
      });
    });
    return positions;
  })();

  let maxX = 0;
  let maxY = 0;
  positionByIdMap.forEach((position) => {
    maxX = Math.max(maxX, position.x + cardWidth);
    maxY = Math.max(maxY, position.y + cardHeight);
  });
  const contentSize: BracketCanvasContentSize = {
    width: Math.max(0, maxX) + paddingLeft + paddingRight,
    height: Math.max(0, maxY) + paddingTop + paddingBottom,
  };

  const connections: BracketCanvasConnection[] = [];
  if (positionByIdMap.size > 0) {
    const getNextTarget = (match: T): T | undefined => {
      if (!isLosersBracket) {
        const target = resolveLinkFromTree(match.winnerNextMatchId, match.winnerNextMatch);
        return target && target.losersBracket === false ? target : undefined;
      }

      const winnerNextId = resolveMatchRefId(match.winnerNextMatchId, match.winnerNextMatch);
      const loserNextId = resolveMatchRefId(match.loserNextMatchId, match.loserNextMatch);

      if (match.losersBracket) {
        if (winnerNextId) {
          return treeById[winnerNextId];
        }
        if (loserNextId) {
          return treeById[loserNextId];
        }
        return undefined;
      }

      if (loserNextId) {
        return treeById[loserNextId];
      }
      if (winnerNextId) {
        return treeById[winnerNextId];
      }
      return undefined;
    };

    Object.values(treeById).forEach((match) => {
      const matchId = extractEntityId(match);
      if (!matchId) {
        return;
      }
      const fromPos = positionByIdMap.get(matchId);
      if (!fromPos) {
        return;
      }
      const target = getNextTarget(match);
      const targetId = target ? extractEntityId(target) : '';
      if (!target || !targetId) {
        return;
      }
      const toPos = positionByIdMap.get(targetId);
      if (!toPos) {
        return;
      }
      connections.push({
        fromId: matchId,
        toId: targetId,
        x1: paddingLeft + fromPos.x + cardWidth,
        y1: paddingTop + fromPos.y + cardHeight / 2,
        x2: paddingLeft + toPos.x,
        y2: paddingTop + toPos.y + cardHeight / 2,
      });
    });
  }

  return {
    metrics,
    rootId,
    viewById,
    treeById,
    connectedMatchIds,
    traversedMatchIds,
    unplacedMatchIds,
    positionById: Object.fromEntries(positionByIdMap.entries()),
    contentSize,
    connections,
  };
};
