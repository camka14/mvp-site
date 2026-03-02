export type BracketNodeId = string;

export type BracketNode = {
  id: BracketNodeId;
  matchId?: number | null;
  winnerNextMatchId?: BracketNodeId | null;
  loserNextMatchId?: BracketNodeId | null;
  previousLeftId?: BracketNodeId | null;
  previousRightId?: BracketNodeId | null;
};

export type BracketValidationErrorCode =
  | 'UNKNOWN_REFERENCE'
  | 'SELF_REFERENCE'
  | 'TARGET_OVER_CAPACITY'
  | 'CYCLE_DETECTED';

export type BracketValidationError = {
  code: BracketValidationErrorCode;
  message: string;
  nodeId?: string;
  referenceId?: string;
};

export type BracketValidationResult = {
  ok: boolean;
  errors: BracketValidationError[];
  normalizedById: Record<
    string,
    {
      previousLeftId: string | null;
      previousRightId: string | null;
      incomingCount: number;
    }
  >;
  incomingCountById: Record<string, number>;
};

type Edge = { sourceId: string; targetId: string };

const normalizeRef = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sortNodeIds = (nodeById: Map<string, BracketNode>, ids: string[]): string[] => {
  const withRank = ids.map((id) => {
    const matchId = nodeById.get(id)?.matchId;
    const rank = typeof matchId === 'number' && Number.isFinite(matchId) ? matchId : Number.MAX_SAFE_INTEGER;
    return { id, rank };
  });

  withRank.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return left.id.localeCompare(right.id);
  });

  return withRank.map((entry) => entry.id);
};

const collectEdges = (
  nodeById: Map<string, BracketNode>,
  errors: BracketValidationError[],
): Edge[] => {
  const edgesByKey = new Map<string, Edge>();

  const addEdge = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      errors.push({
        code: 'SELF_REFERENCE',
        message: `Match ${sourceId} cannot reference itself.`,
        nodeId: sourceId,
        referenceId: targetId,
      });
      return;
    }

    const key = `${sourceId}->${targetId}`;
    if (!edgesByKey.has(key)) {
      edgesByKey.set(key, { sourceId, targetId });
    }
  };

  for (const node of nodeById.values()) {
    const winnerNext = normalizeRef(node.winnerNextMatchId);
    const loserNext = normalizeRef(node.loserNextMatchId);
    const previousLeft = normalizeRef(node.previousLeftId);
    const previousRight = normalizeRef(node.previousRightId);

    const references: Array<{ ref: string | null; label: string }> = [
      { ref: winnerNext, label: 'winnerNextMatchId' },
      { ref: loserNext, label: 'loserNextMatchId' },
      { ref: previousLeft, label: 'previousLeftId' },
      { ref: previousRight, label: 'previousRightId' },
    ];

    for (const { ref, label } of references) {
      if (!ref) continue;
      if (!nodeById.has(ref)) {
        errors.push({
          code: 'UNKNOWN_REFERENCE',
          message: `Match ${node.id} references unknown ${label}: ${ref}.`,
          nodeId: node.id,
          referenceId: ref,
        });
      }
    }

    if (winnerNext && nodeById.has(winnerNext)) {
      addEdge(node.id, winnerNext);
    }
    if (loserNext && nodeById.has(loserNext)) {
      addEdge(node.id, loserNext);
    }
    if (previousLeft && nodeById.has(previousLeft)) {
      addEdge(previousLeft, node.id);
    }
    if (previousRight && nodeById.has(previousRight)) {
      addEdge(previousRight, node.id);
    }
  }

  return Array.from(edgesByKey.values());
};

const detectCycle = (nodeIds: string[], edges: Edge[]): boolean => {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of nodeIds) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.sourceId)?.push(edge.targetId);
    indegree.set(edge.targetId, (indegree.get(edge.targetId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const id of nodeIds) {
    if ((indegree.get(id) ?? 0) === 0) {
      queue.push(id);
    }
  }

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    visited += 1;
    const nextNodes = outgoing.get(current) ?? [];
    for (const nextId of nextNodes) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        queue.push(nextId);
      }
    }
  }

  return visited !== nodeIds.length;
};

export const validateAndNormalizeBracketGraph = (nodes: BracketNode[]): BracketValidationResult => {
  const nodeById = new Map<string, BracketNode>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  const errors: BracketValidationError[] = [];
  const edges = collectEdges(nodeById, errors);
  const incomingByTarget = new Map<string, Set<string>>();

  for (const nodeId of nodeById.keys()) {
    incomingByTarget.set(nodeId, new Set<string>());
  }

  for (const edge of edges) {
    incomingByTarget.get(edge.targetId)?.add(edge.sourceId);
  }

  for (const [targetId, incomingSet] of incomingByTarget.entries()) {
    if (incomingSet.size > 2) {
      errors.push({
        code: 'TARGET_OVER_CAPACITY',
        message: `Match ${targetId} cannot have more than two incoming matches.`,
        nodeId: targetId,
      });
    }
  }

  if (!errors.length && detectCycle(Array.from(nodeById.keys()), edges)) {
    errors.push({
      code: 'CYCLE_DETECTED',
      message: 'Bracket graph contains a cycle.',
    });
  }

  const normalizedById: BracketValidationResult['normalizedById'] = {};
  const incomingCountById: BracketValidationResult['incomingCountById'] = {};

  for (const [nodeId, incomingSet] of incomingByTarget.entries()) {
    const orderedIncoming = sortNodeIds(nodeById, Array.from(incomingSet));
    normalizedById[nodeId] = {
      previousLeftId: orderedIncoming[0] ?? null,
      previousRightId: orderedIncoming[1] ?? null,
      incomingCount: incomingSet.size,
    };
    incomingCountById[nodeId] = incomingSet.size;
  }

  return {
    ok: errors.length === 0,
    errors,
    normalizedById,
    incomingCountById,
  };
};

export type BracketCandidateFilterInput = {
  sourceId: string;
  nodes: BracketNode[];
  lane: 'winner' | 'loser';
};

export const filterValidNextMatchCandidates = ({ sourceId, nodes, lane }: BracketCandidateFilterInput): string[] => {
  const sourceNode = nodes.find((node) => node.id === sourceId);
  if (!sourceNode) {
    return [];
  }

  const allNodeIds = nodes.map((node) => node.id);

  return allNodeIds.filter((candidateId) => {
    if (candidateId === sourceId) {
      return false;
    }

    const mutatedNodes = nodes.map((node) => {
      if (node.id !== sourceId) {
        return node;
      }
      if (lane === 'winner') {
        return { ...node, winnerNextMatchId: candidateId };
      }
      return { ...node, loserNextMatchId: candidateId };
    });

    const result = validateAndNormalizeBracketGraph(mutatedNodes);
    return result.ok && (result.incomingCountById[candidateId] ?? 0) <= 2;
  });
};
